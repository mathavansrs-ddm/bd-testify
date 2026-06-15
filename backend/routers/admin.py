from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date
from datetime import datetime, date
from typing import List, Optional
import io
import csv
import pandas as pd

from database import get_db
import models
import schemas
from auth import get_current_admin, verify_password, get_password_hash, create_access_token
from routers.invite import _create_invite

router = APIRouter(prefix="/admin", tags=["admin"])

# In-memory rate limiting store
login_attempts: dict = {}


@router.post("/login", response_model=schemas.TokenResponse)
def admin_login(data: schemas.AdminLogin, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host
    now = datetime.utcnow()

    attempts = login_attempts.get(client_ip, [])
    attempts = [t for t in attempts if (now - t).seconds < 60]
    if len(attempts) >= 5:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in a minute.")

    admin = db.query(models.Admin).filter(models.Admin.email == data.email).first()
    if not admin or not verify_password(data.password, admin.hashed_password):
        attempts.append(now)
        login_attempts[client_ip] = attempts
        raise HTTPException(status_code=401, detail="Invalid credentials")

    login_attempts[client_ip] = []
    token = create_access_token({"sub": admin.email})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/dashboard/stats", response_model=schemas.DashboardStats)
def dashboard_stats(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    total_candidates = db.query(models.Candidate).count()
    today = date.today()
    tests_today = db.query(models.TestSession).filter(
        cast(models.TestSession.started_at, Date) == today
    ).count()
    avg_result = db.query(func.avg(models.TestSession.percentage)).filter(
        models.TestSession.status == models.SessionStatus.submitted
    ).scalar()
    average_score = round(float(avg_result or 0), 2)
    pending_reviews = db.query(models.TestSession).filter(
        models.TestSession.is_reviewed == False,
        models.TestSession.status == models.SessionStatus.submitted
    ).count()
    return {
        "total_candidates": total_candidates,
        "tests_today": tests_today,
        "average_score": average_score,
        "pending_reviews": pending_reviews
    }


@router.post("/questions", response_model=schemas.QuestionOut)
def create_question(data: schemas.QuestionCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    test_set = db.query(models.TestSet).filter(models.TestSet.id == data.test_set_id).first()
    if not test_set:
        raise HTTPException(status_code=404, detail="Test set not found")
    q = models.Question(**data.model_dump(), created_by=admin.id)
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.get("/questions", response_model=List[schemas.QuestionOut])
def list_questions(test_set_id: Optional[int] = None, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    query = db.query(models.Question)
    if test_set_id:
        query = query.filter(models.Question.test_set_id == test_set_id)
    return query.all()


@router.put("/questions/{id}", response_model=schemas.QuestionOut)
def update_question(id: int, data: schemas.QuestionUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    q = db.query(models.Question).filter(models.Question.id == id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(q, field, value)
    db.commit()
    db.refresh(q)
    return q


@router.delete("/questions/{id}")
def delete_question(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    q = db.query(models.Question).filter(models.Question.id == id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(q)
    db.commit()
    return {"message": "Question deleted"}


@router.post("/questions/bulk-upload")
async def bulk_upload_questions(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
    test_set_id: Optional[int] = None,
):
    """Upload questions via CSV/Excel."""
    import traceback
    try:
        content = await file.read()
        filename = file.filename or ''
        try:
            if filename.lower().endswith('.xlsx') or filename.lower().endswith('.xls'):
                df = pd.read_excel(io.BytesIO(content))
                rows = df.fillna('').astype(str).to_dict('records')
            else:
                try:
                    text = content.decode('utf-8-sig')
                except Exception:
                    text = content.decode('latin-1')
                reader = csv.DictReader(io.StringIO(text))
                rows = list(reader)
            if not rows:
                raise HTTPException(status_code=400, detail="File is empty or has no data rows")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

        # Column name aliases — accept many common variations
        ALIASES = {
            'question_text': ['question_text', 'question', 'q', 'questions', 'question text'],
            'option_a': ['option_a', 'option a', 'a', 'opt_a', 'choice_a', 'choice a'],
            'option_b': ['option_b', 'option b', 'b', 'opt_b', 'choice_b', 'choice b'],
            'option_c': ['option_c', 'option c', 'c', 'opt_c', 'choice_c', 'choice c'],
            'option_d': ['option_d', 'option d', 'd', 'opt_d', 'choice_d', 'choice d'],
            'correct_answer': ['correct_answer', 'correct answer', 'answer', 'ans', 'correct', 'key'],
            'marks': ['marks', 'mark', 'score', 'points'],
            'test_set_id': ['test_set_id', 'test set id', 'testset', 'set_id', 'set id'],
        }

        def normalize_row(raw):
            # Normalize keys
            normalized = {
                k.strip().lower().replace(' ', '_'): str(v).strip() if v is not None and str(v).strip() not in ('nan', 'None', '') else ''
                for k, v in raw.items()
            }
            result = {}
            for field, aliases in ALIASES.items():
                for alias in aliases:
                    alias_key = alias.replace(' ', '_')
                    if alias_key in normalized:
                        result[field] = normalized[alias_key]
                        break
                else:
                    result[field] = normalized.get(field, '')
            return result

        created, errors = [], []
        for i, row in enumerate(rows, 1):
            try:
                row = normalize_row(row)
                # Validate required fields
                missing = [f for f in ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'] if not row.get(f)]
                if missing:
                    raise ValueError(f"Missing fields: {', '.join(missing)}")

                correct = row['correct_answer'].strip().lower()
                # Accept "Option A", "A", "a", "1","2","3","4"
                correct_map = {'1': 'a', '2': 'b', '3': 'c', '4': 'd',
                               'option a': 'a', 'option b': 'b', 'option c': 'c', 'option d': 'd'}
                correct = correct_map.get(correct, correct)
                if correct not in ('a', 'b', 'c', 'd'):
                    raise ValueError(f"correct_answer must be a/b/c/d, got '{row['correct_answer']}'")

                raw_ts = row.get('test_set_id', '').split('.')[0]
                ts_id = test_set_id or (int(raw_ts) if raw_ts.isdigit() else None)
                if not ts_id:
                    raise ValueError("test_set_id is required. Select a test set before uploading or include it in the CSV.")

                q = models.Question(
                    question_text=row['question_text'],
                    option_a=row['option_a'],
                    option_b=row['option_b'],
                    option_c=row['option_c'],
                    option_d=row['option_d'],
                    correct_answer=correct,
                    marks=int(float(row.get('marks') or 1)),
                    test_set_id=ts_id,
                    created_by=admin.id,
                )
                db.add(q)
                created.append(i)
            except Exception as e:
                errors.append({"row": i, "error": str(e)})

        try:
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

        return {"created": len(created), "errors": errors}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {traceback.format_exc()}")


@router.post("/test-sets", response_model=schemas.TestSetOut)
def create_test_set(data: schemas.TestSetCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    ts = models.TestSet(**data.model_dump(), created_by=admin.id)
    db.add(ts)
    db.commit()
    db.refresh(ts)
    result = schemas.TestSetOut.model_validate(ts)
    result.question_count = db.query(models.Question).filter(models.Question.test_set_id == ts.id).count()
    return result


@router.get("/test-sets", response_model=List[schemas.TestSetOut])
def list_test_sets(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    sets = db.query(models.TestSet).all()
    result = []
    for ts in sets:
        out = schemas.TestSetOut.model_validate(ts)
        out.question_count = db.query(models.Question).filter(models.Question.test_set_id == ts.id).count()
        result.append(out)
    return result


@router.put("/test-sets/{id}", response_model=schemas.TestSetOut)
def update_test_set(id: int, data: schemas.TestSetUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    ts = db.query(models.TestSet).filter(models.TestSet.id == id).first()
    if not ts:
        raise HTTPException(status_code=404, detail="Test set not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ts, field, value)
    db.commit()
    db.refresh(ts)
    out = schemas.TestSetOut.model_validate(ts)
    out.question_count = db.query(models.Question).filter(models.Question.test_set_id == ts.id).count()
    return out


@router.post("/candidates", response_model=schemas.CandidateOut)
def add_candidate(data: schemas.AdminAddCandidate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """Admin manually adds a single candidate (external or internal)."""
    existing = db.query(models.Candidate).filter(models.Candidate.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = get_password_hash(data.password) if data.password else None
    candidate = models.Candidate(
        candidate_type=models.CandidateType(data.candidate_type),
        name=data.name, phone=data.phone, email=data.email,
        hashed_password=hashed,
        department=data.department, employee_id=data.employee_id,
        degree=data.degree, year_of_study=data.year_of_study,
        college_name=data.college_name,
        max_attempts=data.max_attempts,
        invited_by=models.InviteSource.admin_added,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


@router.post("/candidates/bulk-upload")
async def bulk_upload_candidates(file: UploadFile = File(...), db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """
    Upload a CSV to add multiple candidates at once.
    CSV columns: name, phone, email, candidate_type (external/internal),
                 degree, year_of_study, college_name, department, employee_id, password, max_attempts
    Only name/phone/email are required. Other fields depend on candidate_type.
    """
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    added, skipped, errors = [], [], []
    for i, row in enumerate(reader, start=2):
        email = (row.get("email") or "").strip().lower()
        name  = (row.get("name") or "").strip()
        phone = (row.get("phone") or "").strip()
        if not email or not name or not phone:
            errors.append({"row": i, "reason": "Missing name, phone or email"})
            continue

        existing = db.query(models.Candidate).filter(models.Candidate.email == email).first()
        if existing:
            skipped.append(email)
            continue

        ctype_raw = (row.get("candidate_type") or "external").strip().lower()
        ctype = models.CandidateType.internal if ctype_raw == "internal" else models.CandidateType.external
        pwd = (row.get("password") or "").strip()
        hashed = get_password_hash(pwd) if (ctype == models.CandidateType.internal and pwd) else None

        try:
            max_att = int(row.get("max_attempts") or 1)
        except ValueError:
            max_att = 1

        candidate = models.Candidate(
            candidate_type=ctype,
            name=name, phone=phone, email=email,
            hashed_password=hashed,
            department=(row.get("department") or "").strip() or None,
            employee_id=(row.get("employee_id") or "").strip() or None,
            degree=(row.get("degree") or "").strip() or None,
            year_of_study=(row.get("year_of_study") or "").strip() or None,
            college_name=(row.get("college_name") or "").strip() or None,
            max_attempts=max_att,
            invited_by=models.InviteSource.admin_added,
        )
        db.add(candidate)
        added.append(email)

    db.commit()
    return {"added": len(added), "skipped": len(skipped), "errors": errors,
            "added_emails": added, "skipped_emails": skipped}


@router.get("/candidates/template")
def download_candidate_template():
    """Download a CSV template for bulk upload."""
    headers = ["name", "phone", "email", "candidate_type", "degree", "year_of_study",
               "college_name", "department", "employee_id", "password", "max_attempts"]
    sample_rows = [
        ["Arjun Kumar", "9876543210", "arjun@college.com", "external", "B.Tech", "3rd Year", "ABC College", "", "", "", "1"],
        ["Priya Sharma", "9123456780", "priya@company.com", "internal", "", "", "", "Engineering", "EMP001", "Pass@123", "2"],
    ]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(sample_rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=candidate_template.csv"}
    )


@router.get("/candidates", response_model=List[schemas.CandidateOut])
def list_candidates(
    search: Optional[str] = None,
    college: Optional[str] = None,
    candidate_type: Optional[str] = None,
    is_blocked: Optional[bool] = None,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin)
):
    query = db.query(models.Candidate)
    if search:
        query = query.filter(
            models.Candidate.name.ilike(f"%{search}%") |
            models.Candidate.email.ilike(f"%{search}%")
        )
    if college:
        query = query.filter(models.Candidate.college_name.ilike(f"%{college}%"))
    if candidate_type:
        query = query.filter(models.Candidate.candidate_type == candidate_type)
    if is_blocked is not None:
        query = query.filter(models.Candidate.is_blocked == is_blocked)
    return query.order_by(models.Candidate.registered_at.desc()).all()


@router.get("/candidates/{id}")
def get_candidate(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    candidate = db.query(models.Candidate).filter(models.Candidate.id == id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    try:
        sessions = db.query(models.TestSession).filter(models.TestSession.candidate_id == id).all()
        sessions_out = [schemas.SessionOut.model_validate(s) for s in sessions]
    except Exception:
        sessions_out = []
    return {
        "candidate": schemas.CandidateOut.model_validate(candidate),
        "sessions": sessions_out
    }


@router.put("/candidates/{id}/reattempt")
def allow_reattempt(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    import uuid
    from datetime import timedelta
    from routers.invite import FRONTEND_URL
    from services.email_service import send_invite_email

    candidate = db.query(models.Candidate).filter(models.Candidate.id == id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    candidate.reattempt_allowed = True
    candidate.is_blocked = False
    candidate.block_reason = None

    # Find the last test set this candidate was invited for
    last_invite = db.query(models.TestInvite).filter(
        models.TestInvite.candidate_email == candidate.email
    ).order_by(models.TestInvite.created_at.desc()).first()

    new_link = None
    if last_invite:
        token = str(uuid.uuid4())
        new_invite = models.TestInvite(
            candidate_email=candidate.email,
            token=token,
            test_set_id=last_invite.test_set_id,
            expires_at=datetime.utcnow() + timedelta(hours=48),
            created_by=admin.id,
        )
        db.add(new_invite)
        new_link = f"{FRONTEND_URL}/register?token={token}"
        try:
            send_invite_email(candidate.email, candidate.name, new_link, "48 hours")
        except Exception:
            pass

    db.commit()
    return {"message": "Reattempt allowed and new invite sent", "test_link": new_link}


@router.put("/candidates/{id}/unblock")
def unblock_candidate(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    candidate = db.query(models.Candidate).filter(models.Candidate.id == id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate.is_blocked = False
    candidate.block_reason = None
    # also re-open any suspended session so they can resume if admin wishes
    suspended = (
        db.query(models.TestSession)
        .filter(
            models.TestSession.candidate_id == id,
            models.TestSession.status == models.SessionStatus.suspended,
        )
        .order_by(models.TestSession.id.desc())
        .first()
    )
    if suspended:
        suspended.status = models.SessionStatus.started
    db.commit()
    return {"message": "Candidate unblocked", "session_reopened": suspended is not None}


@router.get("/sessions")
def list_sessions(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin)
):
    query = db.query(models.TestSession)
    if status:
        query = query.filter(models.TestSession.status == status)
    sessions = query.order_by(models.TestSession.started_at.desc()).all()
    result = []
    for s in sessions:
        candidate = db.query(models.Candidate).filter(models.Candidate.id == s.candidate_id).first()
        test_set = db.query(models.TestSet).filter(models.TestSet.id == s.test_set_id).first()
        result.append({
            **schemas.SessionOut.model_validate(s).model_dump(),
            "candidate_name": candidate.name if candidate else None,
            "candidate_email": candidate.email if candidate else None,
            "test_set_name": test_set.set_name if test_set else None,
        })
    return result


@router.get("/sessions/{id}")
def get_session(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    session = db.query(models.TestSession).filter(models.TestSession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    candidate = db.query(models.Candidate).filter(models.Candidate.id == session.candidate_id).first()
    cheating_logs = db.query(models.CheatingLog).filter(models.CheatingLog.session_id == id).all()
    answers = db.query(models.Answer).filter(models.Answer.session_id == id).all()

    answers_detail = []
    for ans in answers:
        q = db.query(models.Question).filter(models.Question.id == ans.question_id).first()
        answers_detail.append({
            "question_text": q.question_text if q else None,
            "selected_option": ans.selected_option,
            "correct_answer": q.correct_answer if q else None,
            "is_correct": ans.is_correct,
            "marks": q.marks if q else 0,
        })

    return {
        "session": schemas.SessionOut.model_validate(session),
        "candidate": schemas.CandidateOut.model_validate(candidate) if candidate else None,
        "cheating_logs": [schemas.CheatingLogOut.model_validate(log) for log in cheating_logs],
        "answers": answers_detail,
    }


@router.put("/sessions/{id}/review")
def mark_reviewed(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    session = db.query(models.TestSession).filter(models.TestSession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_reviewed = True
    db.commit()
    return {"message": "Session marked as reviewed"}


@router.get("/export/candidates")
def export_candidates(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    candidates = db.query(models.Candidate).all()
    rows = []
    for c in candidates:
        latest_session = db.query(models.TestSession).filter(
            models.TestSession.candidate_id == c.id
        ).order_by(models.TestSession.started_at.desc()).first()
        test_set_name = None
        if latest_session:
            ts = db.query(models.TestSet).filter(models.TestSet.id == latest_session.test_set_id).first()
            test_set_name = ts.set_name if ts else None
        rows.append({
            "Name": c.name,
            "Email": c.email,
            "Phone": c.phone,
            "Degree": c.degree,
            "Year": c.year_of_study,
            "College": c.college_name,
            "Invited By": c.invited_by,
            "Registered At": c.registered_at,
            "Attempt Status": "Attempted" if c.attempt_count > 0 else "Not Attempted",
            "Score": latest_session.score if latest_session else None,
            "Percentage": latest_session.percentage if latest_session else None,
            "Test Set": test_set_name,
            "Session Status": latest_session.status if latest_session else None,
            "Warning Count": latest_session.warning_count if latest_session else None,
            "Reviewed": latest_session.is_reviewed if latest_session else None,
        })
    df = pd.DataFrame(rows)
    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=candidates.csv"}
    )


@router.get("/export/results")
def export_results(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    sessions = db.query(models.TestSession).filter(
        models.TestSession.status == models.SessionStatus.submitted
    ).all()
    rows = []
    for s in sessions:
        candidate = db.query(models.Candidate).filter(models.Candidate.id == s.candidate_id).first()
        test_set = db.query(models.TestSet).filter(models.TestSet.id == s.test_set_id).first()
        face_warnings = db.query(models.CheatingLog).filter(
            models.CheatingLog.session_id == s.id,
            models.CheatingLog.event_type == models.CheatEventType.face_not_detected
        ).count()
        duration = None
        if s.submitted_at and s.started_at:
            duration = round((s.submitted_at - s.started_at).seconds / 60, 1)
        rows.append({
            "Candidate Name": candidate.name if candidate else None,
            "Email": candidate.email if candidate else None,
            "Test Set": test_set.set_name if test_set else None,
            "Score": s.score,
            "Total Marks": s.total_marks,
            "Percentage": s.percentage,
            "Pass/Fail": "Pass" if s.percentage >= 60 else "Fail",
            "Started At": s.started_at,
            "Submitted At": s.submitted_at,
            "Duration (mins)": duration,
            "Tab Switches": s.tab_switch_count,
            "Face Warnings": face_warnings,
            "Final Status": s.status,
        })
    df = pd.DataFrame(rows)
    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=results.csv"}
    )


@router.get("/settings")
def get_settings(admin=Depends(get_current_admin)):
    """Global settings are now managed per test-set. This endpoint returns info."""
    return {"message": "Settings are configured per test set. Edit each test set individually."}
