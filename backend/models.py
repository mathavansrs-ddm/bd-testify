from sqlalchemy import (
    Column, Integer, String, Boolean, Float, DateTime, ForeignKey,
    Enum, Text, func
)
from sqlalchemy.orm import relationship
from database import Base
import enum


class InviteSource(str, enum.Enum):
    email_invite = "email_invite"
    qr_scan = "qr_scan"
    open_test = "open_test"
    admin_added = "admin_added"


class CandidateType(str, enum.Enum):
    external = "external"   # student — college/degree/year required
    internal = "internal"   # employee — email+password login, no college fields


class SessionStatus(str, enum.Enum):
    invited = "invited"
    started = "started"
    submitted = "submitted"
    suspended = "suspended"
    flagged = "flagged"


class CorrectAnswer(str, enum.Enum):
    a = "a"
    b = "b"
    c = "c"
    d = "d"


class CheatEventType(str, enum.Enum):
    tab_switch = "tab_switch"
    face_not_detected = "face_not_detected"
    multiple_faces = "multiple_faces"
    fullscreen_exit = "fullscreen_exit"
    copy_attempt = "copy_attempt"
    suspicious_audio = "suspicious_audio"


class AutoAction(str, enum.Enum):
    warn = "warn"
    suspend = "suspend"
    block = "block"


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    candidate_type = Column(Enum(CandidateType), default=CandidateType.external, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)       # internal employees only
    department = Column(String, nullable=True)            # internal employees
    employee_id = Column(String, nullable=True)           # internal employees
    degree = Column(String, nullable=True)                # external students
    year_of_study = Column(String, nullable=True)         # external students
    college_name = Column(String, nullable=True)          # external students
    registered_at = Column(DateTime, server_default=func.now())
    attempt_count = Column(Integer, default=0)
    max_attempts = Column(Integer, default=1)
    is_blocked = Column(Boolean, default=False)
    block_reason = Column(String, nullable=True)
    reattempt_allowed = Column(Boolean, default=False)
    invited_by = Column(Enum(InviteSource), nullable=True)

    sessions = relationship("TestSession", back_populates="candidate")
    invites = relationship("TestInvite", back_populates="candidate_ref",
                           foreign_keys="TestInvite.candidate_email",
                           primaryjoin="Candidate.email == TestInvite.candidate_email")


class TestSet(Base):
    __tablename__ = "test_sets"

    id = Column(Integer, primary_key=True, index=True)
    set_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    questions_per_test = Column(Integer, default=30)
    time_limit_minutes = Column(Integer, default=60)
    max_attempts = Column(Integer, default=1)             # per-set attempt limit
    is_active = Column(Boolean, default=True)
    is_open = Column(Boolean, default=False)             # open = self-enroll without invite
    created_by = Column(Integer, ForeignKey("admins.id"))
    created_at = Column(DateTime, server_default=func.now())

    questions = relationship("Question", back_populates="test_set")
    sections = relationship("Section", back_populates="test_set", order_by="Section.order")
    sessions = relationship("TestSession", back_populates="test_set")
    invites = relationship("TestInvite", back_populates="test_set")


class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    test_set_id = Column(Integer, ForeignKey("test_sets.id"), nullable=False)
    name = Column(String, nullable=False)
    order = Column(Integer, default=0)
    time_limit_minutes = Column(Integer, nullable=True)      # None = use test set limit
    questions_per_section = Column(Integer, nullable=True)   # None = use all questions
    created_at = Column(DateTime, server_default=func.now())

    test_set = relationship("TestSet", back_populates="sections")
    questions = relationship("Question", back_populates="section")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    test_set_id = Column(Integer, ForeignKey("test_sets.id"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=True)
    question_text = Column(Text, nullable=False)
    option_a = Column(String, nullable=False)
    option_b = Column(String, nullable=False)
    option_c = Column(String, nullable=False)
    option_d = Column(String, nullable=False)
    correct_answer = Column(Enum(CorrectAnswer), nullable=False)
    marks = Column(Integer, default=1)
    created_by = Column(Integer, ForeignKey("admins.id"))
    created_at = Column(DateTime, server_default=func.now())

    test_set = relationship("TestSet", back_populates="questions")
    section = relationship("Section", back_populates="questions")
    answers = relationship("Answer", back_populates="question")


class TestInvite(Base):
    __tablename__ = "test_invites"

    id = Column(Integer, primary_key=True, index=True)
    candidate_email = Column(String, ForeignKey("candidates.email"), nullable=False)
    token = Column(String, unique=True, nullable=False)
    test_set_id = Column(Integer, ForeignKey("test_sets.id"), nullable=False)
    sent_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    used_at = Column(DateTime, nullable=True)
    invited_by_admin = Column(Integer, ForeignKey("admins.id"), nullable=True)

    candidate_ref = relationship("Candidate", back_populates="invites",
                                  foreign_keys=[candidate_email])
    test_set = relationship("TestSet", back_populates="invites")


class TestSession(Base):
    __tablename__ = "test_sessions"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    test_set_id = Column(Integer, ForeignKey("test_sets.id"), nullable=False)
    token = Column(String, ForeignKey("test_invites.token"), nullable=False)
    started_at = Column(DateTime, server_default=func.now())
    submitted_at = Column(DateTime, nullable=True)
    time_limit_minutes = Column(Integer, default=60)
    status = Column(Enum(SessionStatus), default=SessionStatus.started)
    score = Column(Integer, default=0)
    total_marks = Column(Integer, default=0)
    percentage = Column(Float, default=0.0)
    tab_switch_count = Column(Integer, default=0)
    warning_count = Column(Integer, default=0)
    video_recording_path = Column(String, nullable=True)
    is_reviewed = Column(Boolean, default=False)
    ip_address = Column(String, nullable=True)
    browser_info = Column(String, nullable=True)
    photo_data = Column(Text, nullable=True)       # pre-test captured photo (base64)
    latest_snapshot = Column(Text, nullable=True)  # latest CCTV frame (base64)
    snapshot_at = Column(DateTime, nullable=True)

    candidate = relationship("Candidate", back_populates="sessions")
    test_set = relationship("TestSet", back_populates="sessions")
    answers = relationship("Answer", back_populates="session")
    cheating_logs = relationship("CheatingLog", back_populates="session")


class CheatingLog(Base):
    __tablename__ = "cheating_logs"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("test_sessions.id"), nullable=False)
    event_type = Column(Enum(CheatEventType), nullable=False)
    detected_at = Column(DateTime, server_default=func.now())
    auto_action_taken = Column(Enum(AutoAction), nullable=True)
    block_reason = Column(String, nullable=True)

    session = relationship("TestSession", back_populates="cheating_logs")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("test_sessions.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    selected_option = Column(String, nullable=True)
    is_correct = Column(Boolean, default=False)
    answered_at = Column(DateTime, server_default=func.now())

    session = relationship("TestSession", back_populates="answers")
    question = relationship("Question", back_populates="answers")
