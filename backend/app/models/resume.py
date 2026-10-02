from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    current_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("resume_versions.id", use_alter=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    candidate = relationship("Candidate", back_populates="resumes")
    versions = relationship(
        "ResumeVersion",
        back_populates="resume",
        foreign_keys="ResumeVersion.resume_id",
        cascade="all, delete-orphan",
    )


class ResumeVersion(Base):
    __tablename__ = "resume_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    file_reference: Mapped[str] = mapped_column(String(500), nullable=False)  # storage key
    original_filename: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)

    resume = relationship("Resume", back_populates="versions", foreign_keys=[resume_id])
    extracted_data = relationship(
        "ResumeExtractedData", back_populates="version", uselist=False, cascade="all, delete-orphan"
    )


class ResumeExtractedData(Base):
    __tablename__ = "resume_extracted_data"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    resume_version_id: Mapped[int] = mapped_column(
        ForeignKey("resume_versions.id", ondelete="CASCADE"), unique=True, index=True
    )
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extraction_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # full structured JSON
    confidence_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processing_status: Mapped[str] = mapped_column(String(50), default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    version = relationship("ResumeVersion", back_populates="extracted_data")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    resume_version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("resume_versions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="uploaded", index=True
    )  # uploaded → processing → text_extracted → ai_processing → completed / needs_review / failed
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    candidate_id: Mapped[Optional[int]] = mapped_column(ForeignKey("candidates.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
