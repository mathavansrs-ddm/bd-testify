from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import uuid
import os

from database import get_db
import models
import schemas
from auth import get_current_admin, get_password_hash
from services.email_service import send_invite_email
from services.qr_service import generate_qr

router = APIRouter(prefix="/invite", tags=["invite"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _create_invite(candidate_email: str, test_set_id: int, admin_id: int, db: Session) -> models.TestInvite:
    """
    Create an invite for any email — the candidate does NOT need to be pre-registered.
    If they aren't registered yet, they will register via the invite link.
    """
    test_set = db.query(models.TestSet).filter(models.TestSet.id == test_set_id).first()
    if not test_set:
        raise HTTPException(status_code=404, detail="Test set not found")

    candidate = db.query(models.Candidate).filter(models.Candidate.email == candidate_email).first()
    if candidate:
        if candidate.is_blocked:
            raise HTTPException(status_code=403, detail=f"{candidate_email} is blocked")
        # Use per-set max_attempts
        attempts = db.query(models.TestSession).filter(
            models.TestSession.candidate_id == candidate.id,
            models.TestSession.test_set_id == test_set_id,
            models.TestSession.status == models.SessionStatus.submitted,
        ).count()
        if attempts >= test_set.max_attempts and not candidate.reattempt_allowed:
            raise HTTPException(status_code=403, detail=f"{candidate_email} has exhausted attempts for this test")

    token = str(uuid.uuid4())
    invite = models.TestInvite(
        candidate_email=candidate_email,
        token=token,
        test_set_id=test_set_id,
        expires_at=datetime.utcnow() + timedelta(hours=48),
        invited_by_admin=admin_id,
    )
    db.add(invite)
    if candidate:
        candidate.invited_by = models.InviteSource.email_invite
    return invite


@router.post("/send", response_model=schemas.InviteOut)
def send_invite(data: schemas.InviteSend, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """Send invite to a single email. Candidate does NOT need to be pre-registered."""
    invite = _create_invite(data.candidate_email, data.test_set_id, admin.id, db)
    db.commit()
    db.refresh(invite)

    candidate = db.query(models.Candidate).filter(models.Candidate.email == data.candidate_email).first()
    name = candidate.name if candidate else data.candidate_email
    link = f"{FRONTEND_URL}/register?token={invite.token}"
    try:
        send_invite_email(to_email=data.candidate_email, candidate_name=name, test_link=link, expires_in="48 hours")
    except Exception:
        pass

    return invite


@router.post("/bulk-send")
def bulk_send_invites(data: schemas.BulkInviteSend, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """Send invites to multiple emails at once."""
    results = {"sent": [], "failed": []}

    for email in data.emails:
        email = email.strip().lower()
        if not email:
            continue
        try:
            invite = _create_invite(email, data.test_set_id, admin.id, db)
            db.flush()
            candidate = db.query(models.Candidate).filter(models.Candidate.email == email).first()
            name = candidate.name if candidate else email
            link = f"{FRONTEND_URL}/register?token={invite.token}"
            try:
                send_invite_email(to_email=email, candidate_name=name, test_link=link, expires_in="48 hours")
            except Exception:
                pass
            results["sent"].append(email)
        except HTTPException as e:
            results["failed"].append({"email": email, "reason": e.detail})
        except Exception as e:
            results["failed"].append({"email": email, "reason": str(e)})

    db.commit()
    return results


@router.post("/qr/generate")
def generate_qr_code(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    qr_url = f"{FRONTEND_URL}/qr-landing"
    qr_base64 = generate_qr(qr_url)
    return {"qr_image": qr_base64, "url": qr_url}


@router.post("/qr/submit-email")
def qr_submit_email(data: schemas.QREmailSubmit, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    candidate = db.query(models.Candidate).filter(models.Candidate.email == email).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="This email is not registered. Please register first or use your invite link.")

    if candidate.is_blocked:
        raise HTTPException(status_code=403, detail="Your account has been blocked. Contact admin.")

    active_set = db.query(models.TestSet).filter(models.TestSet.is_active == True).first()
    if not active_set:
        raise HTTPException(status_code=404, detail="No active test available right now")

    token = str(uuid.uuid4())
    invite = models.TestInvite(
        candidate_email=email,
        token=token,
        test_set_id=active_set.id,
        expires_at=datetime.utcnow() + timedelta(hours=48),
    )
    db.add(invite)
    candidate.invited_by = models.InviteSource.qr_scan
    db.commit()

    link = f"{FRONTEND_URL}/register?token={token}"
    try:
        send_invite_email(to_email=email, candidate_name=candidate.name, test_link=link, expires_in="48 hours")
    except Exception:
        pass

    return {"message": "Test link sent to your email.", "token": token}


@router.get("/validate/{token}")
def validate_token(token: str, db: Session = Depends(get_db)):
    invite = db.query(models.TestInvite).filter(models.TestInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid invite link")
    if invite.is_used:
        raise HTTPException(status_code=400, detail="This invite link has already been used")
    if invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This invite link has expired")

    candidate = db.query(models.Candidate).filter(models.Candidate.email == invite.candidate_email).first()
    test_set = db.query(models.TestSet).filter(models.TestSet.id == invite.test_set_id).first()

    return {
        "valid": True,
        "test_set_id": invite.test_set_id,
        "test_set_name": test_set.set_name if test_set else None,
        "candidate_email": invite.candidate_email,
        "candidate_registered": candidate is not None,
        "candidate_type": candidate.candidate_type if candidate else None,
        "expires_at": invite.expires_at,
    }


@router.get("/history")
def invite_history(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    invites = db.query(models.TestInvite).order_by(models.TestInvite.sent_at.desc()).all()
    result = []
    for inv in invites:
        status = "used" if inv.is_used else ("expired" if inv.expires_at < datetime.utcnow() else "pending")
        candidate = db.query(models.Candidate).filter(models.Candidate.email == inv.candidate_email).first()
        result.append({
            "id": inv.id,
            "email": inv.candidate_email,
            "candidate_name": candidate.name if candidate else "(not registered yet)",
            "sent_at": inv.sent_at,
            "expires_at": inv.expires_at,
            "status": status,
            "test_set_id": inv.test_set_id,
            "token": inv.token,
        })
    return result
