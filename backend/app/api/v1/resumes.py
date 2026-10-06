import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.candidate import Candidate, CandidateNote
from app.models.resume import ProcessingJob, Resume, ResumeExtractedData, ResumeVersion
from app.models.user import User
from app.services.resume_processor import (
    create_candidate_from_extraction,
    process_single_resume,
    validate_file,
)
from app.services.storage_service import storage_service

router = APIRouter()
settings = get_settings()

ALLOWED_GENDERS = ("male", "female", "other")


def _clean_gender(value: Optional[str]) -> Optional[str]:
    """Only accept the three dropdown values; anything else is ignored."""
    return value if value in ALLOWED_GENDERS else None


@router.post("/upload")
async def upload_resumes(
    files: List[UploadFile] = File(...),
    custom_role: Optional[str] = Form(None),
    custom_location: Optional[str] = Form(None),
    custom_specifications: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    source: Optional[str] = Form("manual_upload"),
    gender: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Bulk resume upload.
    Creates processing jobs and processes each file.
    Duplicates are NOT saved; they come back as status "duplicate_found"
    with a `pending` payload so the recruiter can choose what to do.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > settings.MAX_BATCH_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum {settings.MAX_BATCH_FILES} per batch",
        )

    custom = {
        "custom_role": custom_role,
        "custom_location": custom_location,
        "custom_specifications": custom_specifications,
        "notes": notes,
        "source": source or "manual_upload",
        "gender": _clean_gender(gender),
    }

    results = []
    summary = {
        "total": len(files),
        "completed": 0,
        "needs_review": 0,
        "failed": 0,
        "duplicates_found": 0,
        "results": results,
    }

    for upload in files:
        filename = upload.filename or "unknown"
        content_type = upload.content_type or "application/octet-stream"
        file_bytes = await upload.read()

        # Validate
        err = validate_file(filename, content_type, len(file_bytes), settings.max_file_size_bytes)
        if err:
            results.append({"filename": filename, "status": "failed", "error": err})
            summary["failed"] += 1
            continue

        # Create processing job
        job = ProcessingJob(
            original_filename=filename,
            status="uploaded",
        )
        db.add(job)
        await db.flush()

        # Process
        outcome = await process_single_resume(
            db,
            file_bytes,
            filename,
            content_type,
            custom_options=custom,
            job=job,
            user_id=current_user.id,
        )
        results.append(outcome)

        st = outcome.get("status")
        if st == "completed":
            summary["completed"] += 1
        elif st == "needs_review":
            summary["needs_review"] += 1
        elif st == "duplicate_found":
            summary["duplicates_found"] += 1
        else:
            summary["failed"] += 1

    await db.commit()
    return summary


class ResolveDuplicateRequest(BaseModel):
    action: str  # update_existing | create_new | cancel
    existing_candidate_id: Optional[int] = None
    pending: Dict[str, Any]
    custom_options: Optional[Dict[str, Any]] = None


@router.post("/resolve-duplicate")
async def resolve_duplicate(
    payload: ResolveDuplicateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    action = payload.action
    pending = payload.pending or {}
    custom = dict(payload.custom_options or pending.get("custom_options") or {})
    custom["gender"] = _clean_gender(custom.get("gender"))

    if action == "cancel":
        key = pending.get("file_key")
        if key:
            try:
                res = storage_service.delete(key)
                if hasattr(res, "__await__"):
                    await res
            except Exception:
                pass  # temp file cleanup is best-effort
        return {"status": "cancelled"}

    extraction = pending.get("extraction") or {}
    file_key = pending.get("file_key")
    filename = pending.get("filename") or "resume.pdf"
    content_type = pending.get("content_type") or "application/pdf"
    text = pending.get("text") or ""
    file_size = pending.get("file_size") or 0

    def _extracted_row(version_id: int, processing_status: str) -> ResumeExtractedData:
        return ResumeExtractedData(
            resume_version_id=version_id,
            extracted_text=text[:50000],
            extraction_json=json.dumps(extraction, default=str),
            confidence_summary=json.dumps(extraction.get("confidence") or {}),
            processing_status=processing_status,
        )

    if action == "create_new":
        candidate = await create_candidate_from_extraction(
            db,
            extraction,
            custom=custom,
            source=custom.get("source", "manual_upload"),
            user_id=current_user.id,
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
            file_size=file_size,
            is_current=True,
        )
        db.add(version)
        await db.flush()
        resume.current_version_id = version.id
        db.add(_extracted_row(version.id, "completed"))
        await db.commit()
        return {
            "status": "created",
            "candidate_id": candidate.candidate_id,
            "internal_id": candidate.id,
            "name": candidate.name,
        }

    if action == "update_existing":
        if not payload.existing_candidate_id:
            raise HTTPException(status_code=400, detail="existing_candidate_id required")

        candidate = (
            await db.execute(select(Candidate).where(Candidate.id == payload.existing_candidate_id))
        ).scalar_one_or_none()
        if not candidate:
            raise HTTPException(status_code=404, detail="Existing candidate not found")

        # Fill AI fields only where empty
        if extraction.get("name") and (not candidate.name or candidate.name == "Unknown Candidate"):
            candidate.name = extraction["name"]
        for field in (
            "current_role",
            "location",
            "current_company",
            "notice_period",
            "total_experience_months",
        ):
            if extraction.get(field) and not getattr(candidate, field):
                setattr(candidate, field, extraction[field])

        # Recruiter custom fields stay separate (only set if provided)
        if custom.get("custom_role"):
            candidate.custom_role = custom["custom_role"]
        if custom.get("custom_location"):
            candidate.custom_location = custom["custom_location"]
        if custom.get("custom_specifications"):
            candidate.custom_specifications = custom["custom_specifications"]
        if custom.get("gender"):
            candidate.gender = custom["gender"]

        note_text = (custom.get("notes") or "").strip()
        if note_text:
            db.add(CandidateNote(candidate_id=candidate.id, user_id=current_user.id, note=note_text))

        # Attach a new resume version
        resume = (
            await db.execute(select(Resume).where(Resume.candidate_id == candidate.id))
        ).scalars().first()
        if not resume:
            resume = Resume(candidate_id=candidate.id)
            db.add(resume)
            await db.flush()

        existing_versions = list(
            (
                await db.execute(select(ResumeVersion).where(ResumeVersion.resume_id == resume.id))
            )
            .scalars()
            .all()
        )
        next_ver = max([v.version_number for v in existing_versions], default=0) + 1
        for v in existing_versions:
            v.is_current = False

        version = ResumeVersion(
            resume_id=resume.id,
            version_number=next_ver,
            file_reference=file_key,
            original_filename=filename,
            content_type=content_type,
            file_size=file_size,
            is_current=True,
        )
        db.add(version)
        await db.flush()
        resume.current_version_id = version.id
        db.add(_extracted_row(version.id, "completed"))
        await db.commit()
        return {
            "status": "updated",
            "candidate_id": candidate.candidate_id,
            "internal_id": candidate.id,
            "name": candidate.name,
            "version": next_ver,
        }

    raise HTTPException(status_code=400, detail="Invalid action")


@router.get("/jobs")
async def list_processing_jobs(
    status_filter: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(limit)
    if status_filter:
        q = q.where(ProcessingJob.status == status_filter)
    result = await db.execute(q)
    jobs = result.scalars().all()
    return [
        {
            "id": j.id,
            "filename": j.original_filename,
            "status": j.status,
            "error": j.error_message,
            "candidate_id": j.candidate_id,
            "retry_count": j.retry_count,
            "created_at": j.created_at,
            "completed_at": j.completed_at,
        }
        for j in jobs
    ]


@router.post("/jobs/{job_id}/retry")
async def retry_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ProcessingJob).where(ProcessingJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("failed", "needs_review"):
        raise HTTPException(status_code=400, detail="Only failed or needs_review jobs can be retried")

    # For V1 we mark as uploaded again – real re-processing would need the original file
    job.status = "uploaded"
    job.error_message = None
    await db.commit()
    return {"message": "Job marked for retry. Re-upload the file if needed.", "job_id": job.id}


@router.get("/{version_id}/download-url")
async def get_resume_download_url(
    version_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ResumeVersion).where(ResumeVersion.id == version_id))
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Resume not found")

    url = storage_service.generate_presigned_url(version.file_reference, expires_seconds=300)
    if not url:
        raise HTTPException(
            status_code=503,
            detail="Storage not configured or temporary URL could not be generated",
        )
    return {
        "url": url,
        "filename": version.original_filename,
        "expires_in_seconds": 300,
    }