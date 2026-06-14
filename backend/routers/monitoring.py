from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from database import get_db
import models
import schemas
from auth import get_current_admin

router = APIRouter(prefix="/monitoring", tags=["monitoring"])

# Thresholds — must match frontend constants
WARN_THRESHOLD  = 3   # warnings before auto-block
FRAUD_THRESHOLD = 2   # fraud strikes (multiple faces / impersonation) before block


class FraudBlockRequest(BaseModel):
    session_id: int
    reason: str


@router.post("/event")
async def log_event(data: schemas.MonitoringEvent, db: Session = Depends(get_db)):
    session = db.query(models.TestSession).filter(models.TestSession.id == data.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status in (models.SessionStatus.suspended, models.SessionStatus.submitted):
        return {"message": "Session already closed", "warning_count": session.warning_count,
                "action": None, "blocked": True}

    session.warning_count += 1
    if data.event_type == models.CheatEventType.tab_switch:
        session.tab_switch_count += 1

    auto_action = models.AutoAction.warn
    blocked = False

    if session.warning_count >= WARN_THRESHOLD:
        auto_action = models.AutoAction.block
        session.status = models.SessionStatus.suspended
        # block the candidate
        candidate = db.query(models.Candidate).filter(
            models.Candidate.id == session.candidate_id
        ).first()
        if candidate:
            candidate.is_blocked = True
            candidate.block_reason = f"Auto-blocked after {session.warning_count} proctoring violations"
        blocked = True

    log = models.CheatingLog(
        session_id=data.session_id,
        event_type=data.event_type,
        detected_at=data.timestamp or datetime.utcnow(),
        auto_action_taken=auto_action,
    )
    db.add(log)
    db.commit()

    return {
        "message": "Event logged",
        "warning_count": session.warning_count,
        "action": auto_action,
        "blocked": blocked,
    }


@router.post("/fraud-block")
async def fraud_block(data: FraudBlockRequest, db: Session = Depends(get_db)):
    """
    Called by the frontend AI proctoring system when fraud is confirmed.
    Immediately blocks the candidate and suspends the session.
    """
    session = db.query(models.TestSession).filter(models.TestSession.id == data.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status in (models.SessionStatus.suspended, models.SessionStatus.submitted):
        return {"message": "Already closed", "blocked": True}

    session.status = models.SessionStatus.suspended

    candidate = db.query(models.Candidate).filter(
        models.Candidate.id == session.candidate_id
    ).first()
    if candidate:
        candidate.is_blocked = True
        candidate.block_reason = data.reason

    log = models.CheatingLog(
        session_id=data.session_id,
        event_type=models.CheatEventType.multiple_faces,
        detected_at=datetime.utcnow(),
        auto_action_taken=models.AutoAction.block,
        block_reason=data.reason,
    )
    db.add(log)
    db.commit()

    return {"message": "Candidate blocked", "blocked": True, "reason": data.reason}


@router.get("/fraud-log/{session_id}")
def get_fraud_log(session_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    logs = db.query(models.CheatingLog).filter(
        models.CheatingLog.session_id == session_id
    ).order_by(models.CheatingLog.detected_at.desc()).all()

    return [
        {
            "id": l.id,
            "event_type": l.event_type,
            "detected_at": l.detected_at,
            "auto_action_taken": l.auto_action_taken,
            "block_reason": l.block_reason,
        }
        for l in logs
    ]


@router.get("/active-sessions")
def get_active_sessions(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    sessions = db.query(models.TestSession).filter(
        models.TestSession.status == models.SessionStatus.started
    ).all()
    result = []
    for s in sessions:
        candidate = db.query(models.Candidate).filter(models.Candidate.id == s.candidate_id).first()
        elapsed = (datetime.utcnow() - s.started_at).seconds // 60 if s.started_at else 0
        result.append({
            "session_id": s.id,
            "candidate_name": candidate.name if candidate else "Unknown",
            "candidate_email": candidate.email if candidate else None,
            "started_at": s.started_at,
            "elapsed_minutes": elapsed,
            "warning_count": s.warning_count,
            "tab_switch_count": s.tab_switch_count,
            "status": s.status,
            "is_blocked": candidate.is_blocked if candidate else False,
            "block_reason": candidate.block_reason if candidate else None,
        })
    return result
