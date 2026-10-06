from datetime import date, datetime
from enum import Enum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EmploymentStatus(str, Enum):
    FRESHER = "fresher"
    EXPERIENCED = "experienced"
    CURRENTLY_WORKING = "currently_working"
    NOTICE_PERIOD = "notice_period"
    IMMEDIATE = "immediate"
    UNKNOWN = "unknown"


class CandidateStatus(str, Enum):
    NEW = "new"
    UNDER_REVIEW = "under_review"
    CONTACTED = "contacted"
    SHORTLISTED = "shortlisted"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEWED = "interviewed"
    SELECTED = "selected"
    REJECTED = "rejected"
    ON_HOLD = "on_hold"


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)

    # Personal
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, index=True)
    preferred_location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    # Professional
    current_role: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    current_company: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    employment_status: Mapped[str] = mapped_column(
        String(50), default=EmploymentStatus.UNKNOWN.value, nullable=False
    )
    total_experience_months: Mapped[int] = mapped_column(Integer, default=0)
    relevant_experience_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notice_period: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    current_salary: Mapped[Optional[Numeric]] = mapped_column(Numeric(12, 2), nullable=True)
    expected_salary: Mapped[Optional[Numeric]] = mapped_column(Numeric(12, 2), nullable=True)

    # Recruiter custom (never overwrite AI/resume data)
    custom_role: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    custom_location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    custom_specifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Status & quality
    status: Mapped[str] = mapped_column(
        String(50), default=CandidateStatus.NEW.value, index=True, nullable=False
    )
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # WhatsApp, Referral, etc.

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    # Relationships
    contacts = relationship("CandidateContact", back_populates="candidate", cascade="all, delete-orphan")
    experiences = relationship("CandidateExperience", back_populates="candidate", cascade="all, delete-orphan")
    skills = relationship("CandidateSkill", back_populates="candidate", cascade="all, delete-orphan")
    education = relationship("CandidateEducation", back_populates="candidate", cascade="all, delete-orphan")
    internships = relationship("Internship", back_populates="candidate", cascade="all, delete-orphan")
    projects = relationship("CandidateProject", back_populates="candidate", cascade="all, delete-orphan")
    certifications = relationship("Certification", back_populates="candidate", cascade="all, delete-orphan")
    resumes = relationship("Resume", back_populates="candidate", cascade="all, delete-orphan")
    notes = relationship("CandidateNote", back_populates="candidate", cascade="all, delete-orphan")
    status_history = relationship(
        "CandidateStatusHistory", back_populates="candidate", cascade="all, delete-orphan"
    )
    matches = relationship(
        "CandidateRequirementMatch", back_populates="candidate", cascade="all, delete-orphan"
    )
    tags = relationship("CandidateTag", back_populates="candidate", cascade="all, delete-orphan")


class CandidateContact(Base):
    __tablename__ = "candidate_contacts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    alternate_phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)

    candidate = relationship("Candidate", back_populates="contacts")


class CandidateExperience(Base):
    __tablename__ = "candidate_experiences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)  # null = present
    duration_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    responsibilities: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    technologies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # comma or JSON-ish

    candidate = relationship("Candidate", back_populates="experiences")


class CandidateSkill(Base):
    __tablename__ = "candidate_skills"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    skill: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    category: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)  # Programming, Tools...
    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # resume / recruiter
    confidence: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # high/medium/low

    candidate = relationship("Candidate", back_populates="skills")


class CandidateEducation(Base):
    __tablename__ = "candidate_education"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    qualification: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    specialization: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    institution: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    graduation_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_highest: Mapped[bool] = mapped_column(Boolean, default=False)

    candidate = relationship("Candidate", back_populates="education")


class Internship(Base):
    __tablename__ = "internships"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    organization: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    duration_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    responsibilities: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    skills: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    candidate = relationship("Candidate", back_populates="internships")


class CandidateProject(Base):
    __tablename__ = "candidate_projects"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    project_name: Mapped[str] = mapped_column(String(250), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    technologies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    project_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # academic / professional
    url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    duration: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    candidate = relationship("Candidate", back_populates="projects")


class Certification(Base):
    __tablename__ = "certifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(250), nullable=False)
    issuer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    credential_id: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    credential_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    candidate = relationship("Candidate", back_populates="certifications")


class CandidateNote(Base):
    __tablename__ = "candidate_notes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    candidate = relationship("Candidate", back_populates="notes")
    author = relationship("User", back_populates="notes")


class CandidateStatusHistory(Base):
    __tablename__ = "candidate_status_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    old_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_status: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    candidate = relationship("Candidate", back_populates="status_history")
    changed_by_user = relationship("User", back_populates="status_changes")


class CandidateTag(Base):
    __tablename__ = "candidate_tags"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    tag: Mapped[str] = mapped_column(String(80), nullable=False, index=True)

    candidate = relationship("Candidate", back_populates="tags")