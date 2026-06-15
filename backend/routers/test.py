from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime
import random

from database import get_db
import models
import schemas
from services.score_service import calculate_score
from services.email_service import send_result_email

router = APIRouter(prefix="/test", tags=["test"])


@router.post("/start/{token}", response_model=schemas.TestStartResponse)
def start_test(token: str, request: Request, db: Session = Depends(get_db)):
    invite = db.query(models.TestInvite).filter(models.TestInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid token")
    if invite.is_used:
        raise HTTPException(status_code=400, detail="Token already used")
    if invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token expired")

    candidate = db.query(models.Candidate).filter(
        models.Candidate.email == invite.candidate_email
    ).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not registered")

    if candidate.is_blocked:
        raise HTTPException(status_code=403, detail="Candidate is blocked")

    if candidate.attempt_count >= candidate.max_attempts and not candidate.reattempt_allowed:
        raise HTTPException(status_code=403, detail="No remaining attempts")

    test_set = db.query(models.TestSet).filter(models.TestSet.id == invite.test_set_id).first()
    if not test_set:
        raise HTTPException(status_code=404, detail="Test set not found")

    sections = db.query(models.Section).filter(
        models.Section.test_set_id == invite.test_set_id
    ).order_by(models.Section.order).all()

    def make_q_out(q):
        return schemas.QuestionForCandidate(
            id=q.id, question_text=q.question_text,
            option_a=q.option_a, option_b=q.option_b,
            option_c=q.option_c, option_d=q.option_d,
            marks=q.marks,
        )

    sections_out = None
    selected = []

    if sections:
        # Section mode: draw questions per section, total time = sum of section times
        sections_out = []
        total_time = 0
        for sec in sections:
            pool = db.query(models.Question).filter(models.Question.section_id == sec.id).all()
            n = sec.questions_per_section or len(pool)
            n = min(n, len(pool))
            drawn = random.sample(pool, n) if len(pool) > n else pool
            selected.extend(drawn)
            sec_time = sec.time_limit_minutes or test_set.time_limit_minutes
            total_time += sec_time
            sections_out.append(schemas.SectionForCandidate(
                id=sec.id, name=sec.name,
                time_limit_minutes=sec.time_limit_minutes,
                questions=[make_q_out(q) for q in drawn],
            ))
        time_limit = total_time
    else:
        # Flat mode (no sections): original behaviour
        all_questions = db.query(models.Question).filter(
            models.Question.test_set_id == invite.test_set_id
        ).all()
        if not all_questions:
            raise HTTPException(status_code=400, detail="This test has no questions yet. Please contact the administrator.")
        n = min(test_set.questions_per_test, len(all_questions))
        selected = random.sample(all_questions, n) if len(all_questions) > n else all_questions
        time_limit = test_set.time_limit_minutes

    if not selected:
        raise HTTPException(status_code=400, detail="This test has no questions yet. Please contact the administrator.")

    invite.is_used = True
    invite.used_at = datetime.utcnow()
    candidate.attempt_count += 1
    candidate.reattempt_allowed = False

    ip_address = request.client.host
    browser_info = request.headers.get("user-agent", "unknown")

    session = models.TestSession(
        candidate_id=candidate.id,
        test_set_id=invite.test_set_id,
        token=token,
        time_limit_minutes=time_limit,
        ip_address=ip_address,
        browser_info=browser_info,
        status=models.SessionStatus.started,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "questions": [make_q_out(q) for q in selected],
        "sections": sections_out,
        "time_limit_minutes": time_limit,
        "test_set_name": test_set.set_name,
    }


@router.post("/answer")
def save_answer(data: schemas.AnswerSubmit, db: Session = Depends(get_db)):
    session = db.query(models.TestSession).filter(models.TestSession.id == data.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status not in [models.SessionStatus.started]:
        raise HTTPException(status_code=400, detail="Test is not active")

    question = db.query(models.Question).filter(models.Question.id == data.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    is_correct = data.selected_option.lower() == question.correct_answer.value.lower()

    existing = db.query(models.Answer).filter(
        models.Answer.session_id == data.session_id,
        models.Answer.question_id == data.question_id
    ).first()

    if existing:
        existing.selected_option = data.selected_option
        existing.is_correct = is_correct
        existing.answered_at = datetime.utcnow()
    else:
        answer = models.Answer(
            session_id=data.session_id,
            question_id=data.question_id,
            selected_option=data.selected_option,
            is_correct=is_correct,
        )
        db.add(answer)

    db.commit()
    return {"message": "Answer saved", "is_correct": is_correct}


@router.post("/submit/{session_id}")
def submit_test(session_id: int, db: Session = Depends(get_db)):
    session = db.query(models.TestSession).filter(models.TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == models.SessionStatus.submitted:
        raise HTTPException(status_code=400, detail="Test already submitted")
    if session.status == models.SessionStatus.suspended:
        raise HTTPException(status_code=403, detail="Test has been suspended and cannot be submitted")

    score, total, percentage = calculate_score(session_id, db)
    session.score = score
    session.total_marks = total
    session.percentage = percentage
    session.status = models.SessionStatus.submitted
    session.submitted_at = datetime.utcnow()
    db.commit()

    candidate = db.query(models.Candidate).filter(models.Candidate.id == session.candidate_id).first()
    test_set = db.query(models.TestSet).filter(models.TestSet.id == session.test_set_id).first()
    if candidate and test_set:
        try:
            send_result_email(
                to_email=candidate.email,
                candidate_name=candidate.name,
                score=score,
                total=total,
                percentage=percentage,
                test_set_name=test_set.set_name,
            )
        except Exception:
            pass

    return {
        "message": "Test submitted successfully",
        "score": score,
        "total": total,
        "percentage": percentage,
        "pass_fail": "Pass" if percentage >= 60 else "Fail"
    }


@router.post("/suspend/{session_id}")
def suspend_test(session_id: int, db: Session = Depends(get_db)):
    session = db.query(models.TestSession).filter(models.TestSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = models.SessionStatus.suspended
    db.commit()
    return {"message": "Test suspended"}
