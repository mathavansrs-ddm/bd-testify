from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from auth import get_password_hash, verify_password, create_access_token

router = APIRouter(prefix="/candidate", tags=["candidate"])


@router.post("/register", response_model=schemas.CandidateOut)
def register_external(data: schemas.ExternalCandidateCreate, db: Session = Depends(get_db)):
    """External (student) self-registration — no password required."""
    existing = db.query(models.Candidate).filter(models.Candidate.email == data.email).first()
    if existing:
        return existing
    candidate = models.Candidate(
        candidate_type=models.CandidateType.external,
        name=data.name,
        phone=data.phone,
        email=data.email,
        degree=data.degree,
        year_of_study=data.year_of_study,
        college_name=data.college_name,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


@router.post("/employee/register", response_model=schemas.CandidateOut)
def register_internal(data: schemas.InternalCandidateCreate, db: Session = Depends(get_db)):
    """Internal employee self-registration with password."""
    existing = db.query(models.Candidate).filter(models.Candidate.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    candidate = models.Candidate(
        candidate_type=models.CandidateType.internal,
        name=data.name,
        phone=data.phone,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        department=data.department,
        employee_id=data.employee_id,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


@router.post("/employee/login")
def employee_login(data: schemas.InternalCandidateLogin, db: Session = Depends(get_db)):
    """Internal employee login — returns JWT token."""
    candidate = db.query(models.Candidate).filter(
        models.Candidate.email == data.email,
        models.Candidate.candidate_type == models.CandidateType.internal,
    ).first()
    if not candidate or not candidate.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(data.password, candidate.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if candidate.is_blocked:
        raise HTTPException(status_code=403, detail="Your account has been blocked. Contact admin.")
    token = create_access_token({"sub": candidate.email, "type": "candidate"})
    return {"access_token": token, "token_type": "bearer", "candidate": schemas.CandidateOut.model_validate(candidate)}


@router.get("/open-tests")
def list_open_tests(db: Session = Depends(get_db)):
    """Public: list all open tests any candidate can self-enroll in."""
    sets = db.query(models.TestSet).filter(
        models.TestSet.is_open == True,
        models.TestSet.is_active == True,
    ).all()
    return [
        {
            "id": s.id,
            "set_name": s.set_name,
            "description": s.description,
            "time_limit_minutes": s.time_limit_minutes,
            "questions_per_test": s.questions_per_test,
            "max_attempts": s.max_attempts,
        }
        for s in sets
    ]


@router.post("/open-tests/{test_set_id}/enroll")
def enroll_open_test(test_set_id: int, data: schemas.ExternalCandidateCreate, db: Session = Depends(get_db)):
    """
    Candidate registers + gets an invite token for an open test in one step.
    If already registered, just creates a new invite.
    """
    import uuid
    from datetime import datetime, timedelta

    test_set = db.query(models.TestSet).filter(
        models.TestSet.id == test_set_id,
        models.TestSet.is_open == True,
        models.TestSet.is_active == True,
    ).first()
    if not test_set:
        raise HTTPException(status_code=404, detail="Test not found or not open")

    candidate = db.query(models.Candidate).filter(models.Candidate.email == data.email).first()
    if not candidate:
        candidate = models.Candidate(
            candidate_type=models.CandidateType.external,
            name=data.name, phone=data.phone, email=data.email,
            degree=data.degree, year_of_study=data.year_of_study,
            college_name=data.college_name,
            invited_by=models.InviteSource.open_test,
        )
        db.add(candidate)
        db.flush()

    if candidate.is_blocked:
        raise HTTPException(status_code=403, detail="Your account has been blocked")

    attempts = db.query(models.TestSession).filter(
        models.TestSession.candidate_id == candidate.id,
        models.TestSession.test_set_id == test_set_id,
        models.TestSession.status == models.SessionStatus.submitted,
    ).count()
    if attempts >= test_set.max_attempts and not candidate.reattempt_allowed:
        raise HTTPException(status_code=403, detail="You have already completed the maximum attempts for this test")

    token = str(uuid.uuid4())
    invite = models.TestInvite(
        candidate_email=candidate.email,
        token=token,
        test_set_id=test_set_id,
        expires_at=datetime.utcnow() + timedelta(hours=48),
    )
    db.add(invite)
    db.commit()

    return {"token": token, "test_set_name": test_set.set_name, "time_limit_minutes": test_set.time_limit_minutes}


@router.get("/profile/{email}", response_model=schemas.CandidateOut)
def get_candidate_profile(email: str, db: Session = Depends(get_db)):
    candidate = db.query(models.Candidate).filter(models.Candidate.email == email).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate
