from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum


class InviteSource(str, Enum):
    email_invite = "email_invite"
    qr_scan = "qr_scan"
    open_test = "open_test"
    admin_added = "admin_added"


class CandidateType(str, Enum):
    external = "external"
    internal = "internal"


class SessionStatus(str, Enum):
    invited = "invited"
    started = "started"
    submitted = "submitted"
    suspended = "suspended"
    flagged = "flagged"


class CorrectAnswer(str, Enum):
    a = "a"
    b = "b"
    c = "c"
    d = "d"


class CheatEventType(str, Enum):
    tab_switch = "tab_switch"
    face_not_detected = "face_not_detected"
    multiple_faces = "multiple_faces"
    fullscreen_exit = "fullscreen_exit"
    copy_attempt = "copy_attempt"
    suspicious_audio = "suspicious_audio"


# ── Admin ──────────────────────────────────────────────────────────────────
class AdminLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "superadmin"
    name: Optional[str] = None


# ── Masters ────────────────────────────────────────────────────────────────
class MasterCreate(BaseModel):
    name: str
    email: str
    password: str


class MasterUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class MasterOut(BaseModel):
    id: int
    name: Optional[str] = None
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityLogOut(BaseModel):
    id: int
    admin_id: int
    action: str
    detail: Optional[str] = None
    created_at: datetime
    admin_name: Optional[str] = None
    admin_email: Optional[str] = None

    class Config:
        from_attributes = True


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


# ── Candidate ─────────────────────────────────────────────────────────────
class ExternalCandidateCreate(BaseModel):
    """Public self-registration for external (student) candidates."""
    name: str
    phone: str
    email: str
    degree: str
    year_of_study: str
    college_name: str


class InternalCandidateCreate(BaseModel):
    """Employee login — admin-created or self-registered."""
    name: str
    phone: str
    email: str
    password: str
    department: Optional[str] = None
    employee_id: Optional[str] = None


class InternalCandidateLogin(BaseModel):
    email: str
    password: str


class AdminAddCandidate(BaseModel):
    """Admin manually adding a single candidate (either type)."""
    candidate_type: CandidateType = CandidateType.external
    name: str
    phone: str
    email: str
    password: Optional[str] = None          # required if internal
    department: Optional[str] = None
    employee_id: Optional[str] = None
    degree: Optional[str] = None
    year_of_study: Optional[str] = None
    college_name: Optional[str] = None
    max_attempts: int = 1


class CandidateOut(BaseModel):
    id: int
    candidate_type: str
    name: str
    phone: str
    email: str
    department: Optional[str] = None
    employee_id: Optional[str] = None
    degree: Optional[str] = None
    year_of_study: Optional[str] = None
    college_name: Optional[str] = None
    registered_at: datetime
    attempt_count: int
    max_attempts: int
    is_blocked: bool
    block_reason: Optional[str] = None
    reattempt_allowed: bool
    invited_by: Optional[str] = None

    class Config:
        from_attributes = True


# ── Section ───────────────────────────────────────────────────────────────
class SectionCreate(BaseModel):
    name: str
    order: int = 0
    time_limit_minutes: Optional[int] = None
    questions_per_section: Optional[int] = None


class SectionUpdate(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    time_limit_minutes: Optional[int] = None
    questions_per_section: Optional[int] = None


class SectionOut(BaseModel):
    id: int
    test_set_id: int
    name: str
    order: int
    time_limit_minutes: Optional[int] = None
    questions_per_section: Optional[int] = None
    question_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ── Question ──────────────────────────────────────────────────────────────
class QuestionCreate(BaseModel):
    test_set_id: int
    section_id: Optional[int] = None
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: CorrectAnswer
    marks: int = 1


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct_answer: Optional[CorrectAnswer] = None
    marks: Optional[int] = None
    test_set_id: Optional[int] = None
    section_id: Optional[int] = None


class QuestionOut(BaseModel):
    id: int
    test_set_id: int
    section_id: Optional[int] = None
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: str
    marks: int
    created_at: datetime

    class Config:
        from_attributes = True


class QuestionForCandidate(BaseModel):
    id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    marks: int

    class Config:
        from_attributes = True


class SectionForCandidate(BaseModel):
    id: int
    name: str
    time_limit_minutes: Optional[int] = None
    questions: List[QuestionForCandidate]


# ── TestSet ───────────────────────────────────────────────────────────────
class TestSetCreate(BaseModel):
    set_name: str
    description: Optional[str] = None
    questions_per_test: int = 30
    time_limit_minutes: int = 60
    max_attempts: int = 1
    is_open: bool = False


class TestSetUpdate(BaseModel):
    set_name: Optional[str] = None
    description: Optional[str] = None
    questions_per_test: Optional[int] = None
    time_limit_minutes: Optional[int] = None
    max_attempts: Optional[int] = None
    is_active: Optional[bool] = None
    is_open: Optional[bool] = None


class TestSetOut(BaseModel):
    id: int
    set_name: str
    description: Optional[str] = None
    questions_per_test: int
    time_limit_minutes: int
    max_attempts: int
    is_active: bool
    is_open: bool
    created_at: datetime
    question_count: Optional[int] = 0

    class Config:
        from_attributes = True


# ── Invite ────────────────────────────────────────────────────────────────
class InviteSend(BaseModel):
    candidate_email: str
    test_set_id: int


class BulkInviteSend(BaseModel):
    emails: List[str]
    test_set_id: int


class InviteOut(BaseModel):
    id: int
    candidate_email: str
    token: str
    test_set_id: int
    sent_at: datetime
    expires_at: datetime
    is_used: bool
    used_at: Optional[datetime] = None
    test_link: Optional[str] = None
    email_sent: Optional[bool] = None
    email_error: Optional[str] = None

    class Config:
        from_attributes = True


class QREmailSubmit(BaseModel):
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None
    candidate_type: Optional[str] = "external"
    # Student fields
    college: Optional[str] = None
    course: Optional[str] = None
    year: Optional[str] = None
    # Employee fields
    employee_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    # Test-specific
    test_set_id: Optional[int] = None


# ── Test session ──────────────────────────────────────────────────────────
class AnswerSubmit(BaseModel):
    session_id: int
    question_id: int
    selected_option: str


class TestStartResponse(BaseModel):
    session_id: int
    questions: List[QuestionForCandidate]
    sections: Optional[List[SectionForCandidate]] = None
    time_limit_minutes: int
    test_set_name: str


# ── Monitoring ────────────────────────────────────────────────────────────
class MonitoringEvent(BaseModel):
    session_id: int
    event_type: CheatEventType
    timestamp: Optional[datetime] = None


class CheatingLogOut(BaseModel):
    id: int
    session_id: int
    event_type: str
    detected_at: datetime
    auto_action_taken: Optional[str] = None
    block_reason: Optional[str] = None

    class Config:
        from_attributes = True


# ── Session ───────────────────────────────────────────────────────────────
class SessionOut(BaseModel):
    id: int
    candidate_id: int
    test_set_id: int
    started_at: datetime
    submitted_at: Optional[datetime] = None
    time_limit_minutes: int
    status: str
    score: int
    total_marks: int
    percentage: float
    tab_switch_count: int
    warning_count: int
    is_reviewed: bool
    ip_address: Optional[str] = None
    browser_info: Optional[str] = None
    photo_data: Optional[str] = None

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_candidates: int
    tests_today: int
    average_score: float
    pending_reviews: int
