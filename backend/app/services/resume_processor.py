"""
Resume processing pipeline:
Validate → Extract text → OCR if needed → AI structured extraction → Validate → Duplicate check → Save
If a duplicate is found, nothing is saved; the recruiter chooses Update Existing / Create New / Cancel.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.candidate import (
    Candidate,
    CandidateContact,
    CandidateEducation,
    CandidateExperience,
    CandidateNote,
    CandidateProject,
    CandidateSkill,
    CandidateStatus,
    Certification,
    EmploymentStatus,
    Internship,
)
from app.models.resume import ProcessingJob, Resume, ResumeExtractedData, ResumeVersion
from app.services.ai_service import ai_service
from app.services.storage_service import storage_service
from app.services.text_extraction import extract_text
from app.utils.helpers import generate_candidate_id

logger = logging.getLogger(__name__)


ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_CONTENT = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
}


def validate_file(filename: str, content_type: str, size: int, max_size: int) -> Optional[str]:
    lower = (filename or "").lower()
    ext = "." + lower.rsplit(".", 1)[-1] if "." in lower else ""
    if ext not in ALLOWED_EXTENSIONS:
        return f"Unsupported file type: {ext or 'unknown'}"
    if size > max_size:
        return f"File too large (max {max_size // (1024*1024)} MB)"
    return None


def _strip_phone_sql(column):
    """Remove spaces, dashes, brackets and + from a phone column so we compare digits only."""
    expr = column
    for ch in (" ", "-", "(", ")", "+", "."):
        expr = func.replace(expr, ch, "")
    return expr


async def find_possible_duplicates(
    db: AsyncSession,
    email: Optional[str],
    phone: Optional[str],
    name: Optional[str],
) -> List[Candidate]:
    conditions = []
    if email:
        conditions.append(func.lower(CandidateContact.email) == email.lower().strip())
    if phone:
        clean_phone = "".join(c for c in phone if c.isdigit())
        if len(clean_phone) >= 10:
            last10 = clean_phone[-10:]
            conditions.append(_strip_phone_sql(CandidateContact.phone).like(f"%{last10}"))
    if not conditions:
        return []
    q = (
        select(Candidate)
        .join(CandidateContact)
        .where(or_(*conditions))
        .options(selectinload(Candidate.contacts))
    )
    result = await db.execute(q)
    return list(result.scalars().unique().all())


async def create_candidate_from_extraction(
    db: AsyncSession,
    data: Dict[str, Any],
    custom: Optional[Dict[str, Any]] = None,
    source: str = "manual_upload",
    user_id: Optional[int] = None,
) -> Candidate:
    custom = custom or {}
    cand_id = await generate_candidate_id(db)

    employment_status = data.get("employment_status") or EmploymentStatus.UNKNOWN.value
    total_exp = data.get("total_experience_months") or 0
    if total_exp == 0 and employment_status not in (
        EmploymentStatus.FRESHER.value,
        EmploymentStatus.UNKNOWN.value,
    ):
        employment_status = EmploymentStatus.FRESHER.value

    candidate = Candidate(
        candidate_id=cand_id,
        name=(data.get("name") or "Unknown Candidate").strip()[:200],
        location=data.get("location"),
        preferred_location=data.get("preferred_location"),
        current_role=data.get("current_role"),
        current_company=data.get("current_company"),
        employment_status=employment_status,
        total_experience_months=total_exp,
        notice_period=data.get("notice_period"),
        current_salary=data.get("current_salary"),
        expected_salary=data.get("expected_salary"),
        custom_role=custom.get("custom_role"),
        custom_location=custom.get("custom_location"),
        custom_specifications=custom.get("custom_specifications"),
        gender=custom.get("gender") if custom.get("gender") in ("male", "female", "other") else None,
        status=CandidateStatus.NEW.value,
        needs_review=bool(data.get("needs_review")),
        source=source,
    )
    db.add(candidate)
    await db.flush()
    # Recruiter batch note from the Upload form (stored as a normal recruiter note)
    note_text = (custom.get("notes") or "").strip()
    if note_text and user_id:
        db.add(CandidateNote(candidate_id=candidate.id, user_id=user_id, note=note_text))

    # Contact
    email = data.get("email")
    phone = data.get("phone")
    if email or phone:
        db.add(
            CandidateContact(
                candidate_id=candidate.id,
                email=email.lower().strip() if email else None,
                phone=phone,
                alternate_phone=data.get("alternate_phone"),
                is_primary=True,
            )
        )

    # Skills
    for sk in data.get("skills") or []:
        if not sk.get("skill"):
            continue
        db.add(
            CandidateSkill(
                candidate_id=candidate.id,
                skill=sk["skill"][:100],
                category=sk.get("category"),
                source="resume",
                confidence=sk.get("confidence"),
            )
        )

    # Experiences
    for exp in data.get("experiences") or []:
        if not exp.get("company") or not exp.get("role"):
            continue
        db.add(
            CandidateExperience(
                candidate_id=candidate.id,
                company=exp["company"][:200],
                role=exp["role"][:200],
                start_date=_parse_date(exp.get("start_date")),
                end_date=_parse_date(exp.get("end_date")),
                duration_months=exp.get("duration_months"),
                responsibilities=exp.get("responsibilities"),
                technologies=exp.get("technologies"),
            )
        )

    # Internships
    for intern in data.get("internships") or []:
        if not intern.get("organization") or not intern.get("role"):
            continue
        db.add(
            Internship(
                candidate_id=candidate.id,
                organization=intern["organization"][:200],
                role=intern["role"][:200],
                start_date=_parse_date(intern.get("start_date")),
                end_date=_parse_date(intern.get("end_date")),
                duration_months=intern.get("duration_months"),
                responsibilities=intern.get("responsibilities"),
                skills=intern.get("skills"),
            )
        )

    # Education
    for edu in data.get("education") or []:
        db.add(
            CandidateEducation(
                candidate_id=candidate.id,
                qualification=edu.get("qualification"),
                specialization=edu.get("specialization"),
                institution=edu.get("institution"),
                graduation_year=edu.get("graduation_year"),
                is_highest=bool(edu.get("is_highest")),
            )
        )

    # Projects
    for proj in data.get("projects") or []:
        if not proj.get("project_name"):
            continue
        db.add(
            CandidateProject(
                candidate_id=candidate.id,
                project_name=proj["project_name"][:250],
                description=proj.get("description"),
                technologies=proj.get("technologies"),
                role=proj.get("role"),
                project_type=proj.get("project_type"),
                url=proj.get("url"),
                duration=proj.get("duration"),
            )
        )

    # Certifications
    for cert in data.get("certifications") or []:
        if not cert.get("name"):
            continue
        db.add(
            Certification(
                candidate_id=candidate.id,
                name=cert["name"][:250],
                issuer=cert.get("issuer"),
                date=_parse_date(cert.get("date")),
                credential_id=cert.get("credential_id"),
                credential_url=cert.get("credential_url"),
            )
        )

    await db.flush()
    return candidate


def _parse_date(val: Any):
    if not val:
        return None
    try:
        from datetime import date

        if isinstance(val, date):
            return val
        return datetime.strptime(str(val)[:10], "%Y-%m-%d").date()
    except Exception:
        return None


async def process_single_resume(
    db: AsyncSession,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    custom_options: Optional[Dict[str, Any]] = None,
    job: Optional[ProcessingJob] = None,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Full pipeline for one resume. Returns a summary dict.
    status: completed | needs_review | duplicate_found | failed
    """
    custom_options = custom_options or {}
    result: Dict[str, Any] = {
        "filename": filename,
        "status": "failed",
        "candidate_id": None,
        "needs_review": False,
        "duplicates": [],
        "error": None,
    }

    try:
        if job:
            job.status = "processing"
            await db.flush()

        # 1. Text extraction
        text, used_ocr = extract_text(file_bytes, filename, content_type)
        if job:
            job.status = "text_extracted"
            await db.flush()

        if not text or len(text.strip()) < 30:
            raise ValueError("Could not extract enough text from the resume")

        # 2. AI extraction
        if job:
            job.status = "ai_processing"
            await db.flush()

        extraction = await ai_service.extract_candidate(text)

        # 3. Duplicate check — if found, do NOT create; let the recruiter decide
        duplicates = await find_possible_duplicates(
            db,
            extraction.get("email"),
            extraction.get("phone"),
            extraction.get("name"),
        )

        if duplicates:
            temp_key = await storage_service.upload(
                file_bytes,
                filename,
                content_type,
                candidate_id="temp",
                version=1,
            )

            if job:
                job.status = "needs_review"
                job.error_message = "Possible duplicate – waiting for recruiter decision"
                await db.flush()

            result.update(
                {
                    "status": "duplicate_found",
                    "needs_review": True,
                    "duplicates": [
                        {
                            "id": d.id,
                            "candidate_id": d.candidate_id,
                            "name": d.name,
                            "email": d.contacts[0].email if d.contacts else None,
                            "phone": d.contacts[0].phone if d.contacts else None,
                        }
                        for d in duplicates
                    ],
                    "extraction_preview": {
                        "name": extraction.get("name"),
                        "email": extraction.get("email"),
                        "phone": extraction.get("phone"),
                        "current_role": extraction.get("current_role"),
                    },
                    "pending": {
                        "file_key": temp_key,
                        "filename": filename,
                        "content_type": content_type,
                        "file_size": len(file_bytes),
                        "extraction": extraction,
                        "custom_options": custom_options,
                        "text": text[:50000],
                    },
                    "name": extraction.get("name") or filename,
                }
            )
            return result

        # 4. Create candidate (no duplicate)
        candidate = await create_candidate_from_extraction(
            db,
            extraction,
            custom=custom_options,
            source=custom_options.get("source", "manual_upload"),
            user_id=user_id,
        )

        # 5. Store original file
        file_key = await storage_service.upload(
            file_bytes,
            filename,
            content_type,
            candidate_id=candidate.candidate_id,
            version=1,
        )

        resume = Resume(candidate_id=candidate.id)
        db.add(resume)
        await db.flush()

        version = ResumeVersion(
            resume_id=resume.id,
            version_number=1,
            file_reference=file_key,
            original_filename=filename,
            content_type=content_type,
            file_size=len(file_bytes),
            is_current=True,
        )
        db.add(version)
        await db.flush()

        resume.current_version_id = version.id

        db.add(
            ResumeExtractedData(
                resume_version_id=version.id,
                extracted_text=text[:50000],
                extraction_json=json.dumps(extraction, default=str),
                confidence_summary=json.dumps(extraction.get("confidence") or {}),
                processing_status="completed" if not extraction.get("needs_review") else "needs_review",
            )
        )

        if job:
            job.status = "completed" if not extraction.get("needs_review") else "needs_review"
            job.candidate_id = candidate.id
            job.completed_at = datetime.now(timezone.utc)
            job.resume_version_id = version.id

        await db.flush()

        result.update(
            {
                "status": "completed" if not extraction.get("needs_review") else "needs_review",
                "candidate_id": candidate.candidate_id,
                "internal_id": candidate.id,
                "needs_review": bool(extraction.get("needs_review")),
                "name": candidate.name,
            }
        )
        return result

    except Exception as e:
        logger.exception("Resume processing failed for %s: %s", filename, e)
        result["error"] = str(e)
        if job:
            job.status = "failed"
            job.error_message = str(e)[:1000]
            job.retry_count = (job.retry_count or 0) + 1
        return result