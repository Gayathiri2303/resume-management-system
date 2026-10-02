from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RequirementStatus(str, Enum):
    OPEN = "open"
    ON_HOLD = "on_hold"
    CLOSED = "closed"
    FILLED = "filled"


class SkillType(str, Enum):
    REQUIRED = "required"
    PREFERRED = "preferred"


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    requirement_id: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(250), nullable=False)
    company_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)  # NEW
    role: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, index=True)
    min_experience_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_experience_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    education: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    salary_min: Mapped[Optional[Numeric]] = mapped_column(Numeric(12, 2), nullable=True)
    salary_max: Mapped[Optional[Numeric]] = mapped_column(Numeric(12, 2), nullable=True)
    notice_period: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    job_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    other_specifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default=RequirementStatus.OPEN.value, index=True, nullable=False
    )
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
    jd_file_reference: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_by_user = relationship("User", back_populates="requirements")
    skills = relationship("RequirementSkill", back_populates="requirement", cascade="all, delete-orphan")
    matches = relationship(
        "CandidateRequirementMatch", back_populates="requirement", cascade="all, delete-orphan"
    )


class RequirementSkill(Base):
    __tablename__ = "requirement_skills"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    requirement_id: Mapped[int] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"), index=True
    )
    skill: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    skill_type: Mapped[str] = mapped_column(String(20), default=SkillType.REQUIRED.value)

    requirement = relationship("Requirement", back_populates="skills")


class CandidateRequirementMatch(Base):
    __tablename__ = "candidate_requirement_matches"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    requirement_id: Mapped[int] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"), index=True
    )
    match_score: Mapped[float] = mapped_column(nullable=False)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    candidate = relationship("Candidate", back_populates="matches")
    requirement = relationship("Requirement", back_populates="matches")