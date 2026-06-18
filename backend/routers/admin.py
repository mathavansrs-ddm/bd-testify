from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date
from datetime import datetime, date, timedelta
from typing import List, Optional
import io
import csv
import uuid
import os
import pandas as pd

from database import get_db
import models
import schemas
from auth import get_current_admin, require_superadmin, verify_password, get_password_hash, create_access_token
from routers.invite import _create_invite

router = APIRouter(prefix="/admin", tags=["admin"])

# In-memory rate limiting store
login_attempts: dict = {}


def _log(db: Session, admin_id: int, action: str, detail: str = None):
    try:
        db.add(models.AdminActivityLog(admin_id=admin_id, action=action, detail=detail))
        db.commit()
    except Exception:
        db.rollback()


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
    if admin.is_active is False:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    login_attempts[client_ip] = []
    token = create_access_token({"sub": admin.email})
    _log(db, admin.id, "login", f"Logged in from {client_ip}")
    return {"access_token": token, "token_type": "bearer", "role": admin.role, "name": admin.name or admin.email}


@router.get("/dashboard/stats", response_model=schemas.DashboardStats)
def dashboard_stats(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    is_master = admin.role == models.AdminRole.master
    owned_ids = [ts.id for ts in db.query(models.TestSet.id).filter(models.TestSet.created_by == admin.id).all()] if is_master else None

    if is_master:
        candidate_ids = [s.candidate_id for s in db.query(models.TestSession.candidate_id).filter(models.TestSession.test_set_id.in_(owned_ids)).distinct().all()]
        total_candidates = db.query(models.Candidate).filter(models.Candidate.id.in_(candidate_ids)).count()
    else:
        total_candidates = db.query(models.Candidate).count()

    today = date.today()
    sessions_q = db.query(models.TestSession)
    if is_master:
        sessions_q = sessions_q.filter(models.TestSession.test_set_id.in_(owned_ids))

    tests_today = sessions_q.filter(cast(models.TestSession.started_at, Date) == today).count()

    avg_result = sessions_q.filter(models.TestSession.status == models.SessionStatus.submitted).with_entities(func.avg(models.TestSession.percentage)).scalar()
    average_score = round(float(avg_result or 0), 2)

    pending_reviews = sessions_q.filter(
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
    _log(db, admin.id, "question_created", f"Added question to '{test_set.set_name}'")
    return q


@router.get("/questions", response_model=List[schemas.QuestionOut])
def list_questions(test_set_id: Optional[int] = None, section_id: Optional[int] = None, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    query = db.query(models.Question)
    if test_set_id:
        query = query.filter(models.Question.test_set_id == test_set_id)
    if section_id:
        query = query.filter(models.Question.section_id == section_id)
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
def delete_question(id: int, db: Session = Depends(get_db), admin=Depends(require_superadmin)):
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
    section_id: Optional[int] = None,
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
            'section': ['section', 'section_name', 'section name'],
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

                # Resolve section: CSV section name takes priority over dropdown section_id
                resolved_section_id = section_id
                row_section_name = row.get('section', '').strip()
                if row_section_name:
                    sec = db.query(models.Section).filter(
                        models.Section.test_set_id == ts_id,
                        models.Section.name.ilike(row_section_name),
                    ).first()
                    if sec:
                        resolved_section_id = sec.id
                    else:
                        # Auto-create the section if it doesn't exist
                        sec = models.Section(test_set_id=ts_id, name=row_section_name)
                        db.add(sec)
                        db.flush()
                        resolved_section_id = sec.id

                q = models.Question(
                    question_text=row['question_text'],
                    option_a=row['option_a'],
                    option_b=row['option_b'],
                    option_c=row['option_c'],
                    option_d=row['option_d'],
                    correct_answer=correct,
                    marks=int(float(row.get('marks') or 1)),
                    test_set_id=ts_id,
                    section_id=resolved_section_id,
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
    _log(db, admin.id, "test_set_created", f"Created test set: '{data.set_name}'")
    result = schemas.TestSetOut.model_validate(ts)
    result.question_count = db.query(models.Question).filter(models.Question.test_set_id == ts.id).count()
    return result


@router.get("/test-sets", response_model=List[schemas.TestSetOut])
def list_test_sets(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    query = db.query(models.TestSet)
    if admin.role == models.AdminRole.master:
        query = query.filter(models.TestSet.created_by == admin.id)
    sets = query.all()
    result = []
    for ts in sets:
        out = schemas.TestSetOut.model_validate(ts)
        out.question_count = db.query(models.Question).filter(models.Question.test_set_id == ts.id).count()
        result.append(out)
    return result


@router.get("/test-sets/{id}")
def get_test_set(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    ts = db.query(models.TestSet).filter(models.TestSet.id == id).first()
    if not ts:
        raise HTTPException(status_code=404, detail="Test set not found")
    out = schemas.TestSetOut.model_validate(ts)
    out.question_count = db.query(models.Question).filter(models.Question.test_set_id == ts.id).count()
    sections = db.query(models.Section).filter(models.Section.test_set_id == id).order_by(models.Section.order).all()
    sections_out = []
    for s in sections:
        so = schemas.SectionOut.model_validate(s)
        so.question_count = db.query(models.Question).filter(models.Question.section_id == s.id).count()
        sections_out.append(so)
    return {"test_set": out, "sections": sections_out}


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


# ── Section endpoints ──────────────────────────────────────────────────────

@router.get("/test-sets/{test_set_id}/sections", response_model=List[schemas.SectionOut])
def list_sections(test_set_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    sections = db.query(models.Section).filter(
        models.Section.test_set_id == test_set_id
    ).order_by(models.Section.order).all()
    result = []
    for s in sections:
        so = schemas.SectionOut.model_validate(s)
        so.question_count = db.query(models.Question).filter(models.Question.section_id == s.id).count()
        result.append(so)
    return result


@router.post("/test-sets/{test_set_id}/sections", response_model=schemas.SectionOut)
def create_section(test_set_id: int, data: schemas.SectionCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    ts = db.query(models.TestSet).filter(models.TestSet.id == test_set_id).first()
    if not ts:
        raise HTTPException(status_code=404, detail="Test set not found")
    section = models.Section(test_set_id=test_set_id, **data.model_dump())
    db.add(section)
    db.commit()
    db.refresh(section)
    out = schemas.SectionOut.model_validate(section)
    out.question_count = 0
    return out


@router.put("/test-sets/{test_set_id}/sections/{section_id}", response_model=schemas.SectionOut)
def update_section(test_set_id: int, section_id: int, data: schemas.SectionUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    section = db.query(models.Section).filter(
        models.Section.id == section_id,
        models.Section.test_set_id == test_set_id,
    ).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(section, field, value)
    db.commit()
    db.refresh(section)
    out = schemas.SectionOut.model_validate(section)
    out.question_count = db.query(models.Question).filter(models.Question.section_id == section_id).count()
    return out


@router.delete("/test-sets/{test_set_id}/sections/{section_id}")
def delete_section(test_set_id: int, section_id: int, db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    section = db.query(models.Section).filter(
        models.Section.id == section_id,
        models.Section.test_set_id == test_set_id,
    ).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    # Unlink questions from this section (don't delete them)
    db.query(models.Question).filter(models.Question.section_id == section_id).update({"section_id": None})
    db.delete(section)
    db.commit()
    return {"message": "Section deleted, questions moved to unsectioned"}


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
    if admin.role == models.AdminRole.master:
        owned_test_set_ids = [ts.id for ts in db.query(models.TestSet.id).filter(models.TestSet.created_by == admin.id).all()]
        candidate_ids = [s.candidate_id for s in db.query(models.TestSession.candidate_id).filter(models.TestSession.test_set_id.in_(owned_test_set_ids)).distinct().all()]
        query = query.filter(models.Candidate.id.in_(candidate_ids))
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
    import uuid, os
    from datetime import timedelta
    from services.email_service import send_invite_email
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    candidate = db.query(models.Candidate).filter(models.Candidate.id == id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    candidate.reattempt_allowed = True
    candidate.is_blocked = False
    candidate.block_reason = None

    # Find the last test set this candidate was invited for
    last_invite = db.query(models.TestInvite).filter(
        models.TestInvite.candidate_email == candidate.email
    ).order_by(models.TestInvite.sent_at.desc()).first()

    new_link = None
    if last_invite:
        token = str(uuid.uuid4())
        new_invite = models.TestInvite(
            candidate_email=candidate.email,
            token=token,
            test_set_id=last_invite.test_set_id,
            expires_at=datetime.utcnow() + timedelta(hours=48),
            invited_by_admin=admin.id,
        )
        db.add(new_invite)
        new_link = f"{frontend_url}/register?token={token}"
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
    if admin.role == models.AdminRole.master:
        owned_ids = [ts.id for ts in db.query(models.TestSet.id).filter(models.TestSet.created_by == admin.id).all()]
        query = query.filter(models.TestSession.test_set_id.in_(owned_ids))
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


@router.delete("/sessions/{id}")
def delete_session(id: int, db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    session = db.query(models.TestSession).filter(models.TestSession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.query(models.CheatingLog).filter(models.CheatingLog.session_id == id).delete()
    db.query(models.Answer).filter(models.Answer.session_id == id).delete()
    db.delete(session)
    db.commit()
    return {"message": "Session deleted"}


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


# ── Masters management (superadmin only) ────────────────────────────────

@router.get("/masters", response_model=List[schemas.MasterOut])
def list_masters(db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    return db.query(models.Admin).filter(models.Admin.role == models.AdminRole.master).all()


@router.post("/masters", response_model=schemas.MasterOut)
def create_master(data: schemas.MasterCreate, db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    from services.email_service import send_master_welcome_email
    if db.query(models.Admin).filter(models.Admin.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    master = models.Admin(
        email=data.email,
        name=data.name,
        hashed_password=get_password_hash(data.password),
        role=models.AdminRole.master,
        is_active=True,
        created_by=admin.id,
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    _log(db, admin.id, "master_created", f"Created master account: {data.email}")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    try:
        send_master_welcome_email(data.email, data.name, data.password, f"{frontend_url}/admin/login")
    except Exception:
        pass
    return master


@router.put("/masters/{master_id}", response_model=schemas.MasterOut)
def update_master(master_id: int, data: schemas.MasterUpdate, db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    master = db.query(models.Admin).filter(models.Admin.id == master_id, models.Admin.role == models.AdminRole.master).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(master, field, value)
    db.commit()
    db.refresh(master)
    _log(db, admin.id, "master_updated", f"Updated master: {master.email}")
    return master


@router.delete("/masters/{master_id}")
def delete_master(master_id: int, db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    master = db.query(models.Admin).filter(models.Admin.id == master_id, models.Admin.role == models.AdminRole.master).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    _log(db, admin.id, "master_deleted", f"Deleted master: {master.email}")
    db.delete(master)
    db.commit()
    return {"message": "Master deleted"}


@router.post("/masters/{master_id}/reset-password")
def reset_master_password(master_id: int, db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    from services.email_service import send_password_reset_email
    master = db.query(models.Admin).filter(models.Admin.id == master_id, models.Admin.role == models.AdminRole.master).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    # Invalidate old tokens
    db.query(models.PasswordResetToken).filter(models.PasswordResetToken.admin_id == master_id).delete()
    token = str(uuid.uuid4())
    reset_token = models.PasswordResetToken(
        admin_id=master_id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(reset_token)
    db.commit()
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    reset_link = f"{frontend_url}/admin/reset-password?token={token}"
    try:
        send_password_reset_email(master.email, master.name or master.email, reset_link)
        _log(db, admin.id, "password_reset_sent", f"Password reset sent to: {master.email}")
        return {"message": f"Password reset email sent to {master.email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.post("/reset-password")
def confirm_reset_password(token: str, new_password: str, db: Session = Depends(get_db)):
    reset_token = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == token,
        models.PasswordResetToken.used == False,
    ).first()
    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    if reset_token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset link has expired")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    admin = db.query(models.Admin).filter(models.Admin.id == reset_token.admin_id).first()
    if not admin:
        raise HTTPException(status_code=404, detail="Account not found")
    admin.hashed_password = get_password_hash(new_password)
    reset_token.used = True
    db.commit()
    return {"message": "Password updated successfully. You can now log in."}


@router.get("/masters/{master_id}/activity", response_model=List[schemas.ActivityLogOut])
def get_master_activity(master_id: int, db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    logs = db.query(models.AdminActivityLog).filter(
        models.AdminActivityLog.admin_id == master_id
    ).order_by(models.AdminActivityLog.created_at.desc()).limit(200).all()
    master = db.query(models.Admin).filter(models.Admin.id == master_id).first()
    result = []
    for log in logs:
        out = schemas.ActivityLogOut.model_validate(log)
        out.admin_name = master.name if master else None
        out.admin_email = master.email if master else None
        result.append(out)
    return result


@router.get("/activity-log", response_model=List[schemas.ActivityLogOut])
def get_all_activity(db: Session = Depends(get_db), admin=Depends(require_superadmin)):
    logs = db.query(models.AdminActivityLog).order_by(
        models.AdminActivityLog.created_at.desc()
    ).limit(500).all()
    result = []
    for log in logs:
        a = db.query(models.Admin).filter(models.Admin.id == log.admin_id).first()
        out = schemas.ActivityLogOut.model_validate(log)
        out.admin_name = a.name if a else None
        out.admin_email = a.email if a else None
        result.append(out)
    return result


# ── Own activity log (any logged-in admin sees only their own logs) ──────

@router.get("/my-activity", response_model=List[schemas.ActivityLogOut])
def get_my_activity(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    logs = db.query(models.AdminActivityLog).filter(
        models.AdminActivityLog.admin_id == admin.id
    ).order_by(models.AdminActivityLog.created_at.desc()).limit(200).all()
    result = []
    for log in logs:
        out = schemas.ActivityLogOut.model_validate(log)
        out.admin_name = admin.name
        out.admin_email = admin.email
        result.append(out)
    return result


# ── Password change (self) ───────────────────────────────────────────────

@router.put("/change-password")
def change_password(data: schemas.ChangePassword, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    if not verify_password(data.current_password, admin.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    admin.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
