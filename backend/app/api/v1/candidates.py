from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.candidate import (
    Candidate,
    CandidateContact,
    CandidateNote,
    CandidateSkill,
    CandidateStatus,
    CandidateStatusHistory,
)
from app.models.user import User
from app.schemas.candidate import (
    CandidateDetail,
    CandidateListItem,
    CandidateUpdate,
    NoteCreate,
    NoteOut,
    StatusUpdate,
)
from app.utils.helpers import format_experience

router = APIRouter()


def _experience_display(months: int) -> str:
    return format_experience(months)


class RecruiterFieldsUpdate(BaseModel):
    custom_role: Optional[str] = Field(None, max_length=200)
    custom_location: Optional[str] = Field(None, max_length=150)
    custom_specifications: Optional[str] = None


@router.get("", response_model=dict)
async def list_candidates(
    q: Optional[str] = Query(None, description="Keyword search"),
    status: Optional[str] = None,
    location: Optional[str] = None,
    min_experience: Optional[int] = None,
    max_experience: Optional[int] = None,
    skill: Optional[str] = None,
    needs_review: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Candidate).options(
        selectinload(Candidate.contacts),
        selectinload(Candidate.skills),
    )

    if status:
        query = query.where(Candidate.status == status)
    if location:
        query = query.where(
            or_(
                Candidate.location.ilike(f"%{location}%"),
                Candidate.preferred_location.ilike(f"%{location}%"),
                Candidate.custom_location.ilike(f"%{location}%"),
            )
        )
    if min_experience is not None:
        query = query.where(Candidate.total_experience_months >= min_experience)
    if max_experience is not None:
        query = query.where(Candidate.total_experience_months <= max_experience)
    if needs_review is not None:
        query = query.where(Candidate.needs_review == needs_review)
    if skill:
        # subquery instead of JOIN, so a candidate with many matching skills is not counted twice
        query = query.where(
            Candidate.id.in_(
                select(CandidateSkill.candidate_id).where(CandidateSkill.skill.ilike(f"%{skill}%"))
            )
        )
    if q:
        like = f"%{q}%"
        query = query.where(
            or_(
                Candidate.name.ilike(like),
                Candidate.current_role.ilike(like),
                Candidate.custom_role.ilike(like),
                Candidate.current_company.ilike(like),
                Candidate.location.ilike(like),
                Candidate.custom_location.ilike(like),
                Candidate.id.in_(
                    select(CandidateContact.candidate_id).where(
                        or_(CandidateContact.email.ilike(like), CandidateContact.phone.ilike(like))
                    )
                ),
                Candidate.id.in_(
                    select(CandidateSkill.candidate_id).where(CandidateSkill.skill.ilike(like))
                ),
            )
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Candidate.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    candidates = result.scalars().unique().all()

    items = []
    for c in candidates:
        primary_email = None
        primary_phone = None
        if c.contacts:
            primary_email = c.contacts[0].email
            primary_phone = c.contacts[0].phone
        skills = [s.skill for s in (c.skills or [])[:8]]
        items.append(
            CandidateListItem(
                id=c.id,
                candidate_id=c.candidate_id,
                name=c.name,
                # recruiter custom value wins for display (same as the dashboard charts)
                current_role=c.custom_role or c.current_role,
                location=c.custom_location or c.location,
                total_experience_months=c.total_experience_months or 0,
                experience_display=_experience_display(c.total_experience_months or 0),
                notice_period=c.notice_period,
                status=c.status,
                needs_review=c.needs_review,
                skills=skills,
                primary_email=primary_email,
                primary_phone=primary_phone,
            )
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size else 0,
    }


@router.post("/bulk-delete")
async def bulk_delete_candidates(
    candidate_ids: List[int],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.resume import Resume, ProcessingJob

    if not candidate_ids:
        raise HTTPException(status_code=400, detail="No candidate IDs provided")

    resumes = await db.execute(select(Resume).where(Resume.candidate_id.in_(candidate_ids)))
    for resume in resumes.scalars().all():
        resume.current_version_id = None
    await db.flush()

    jobs = await db.execute(select(ProcessingJob).where(ProcessingJob.candidate_id.in_(candidate_ids)))
    for job in jobs.scalars().all():
        job.candidate_id = None
    await db.flush()

    result = await db.execute(delete(Candidate).where(Candidate.id.in_(candidate_ids)))
    await db.commit()
    return {"deleted": result.rowcount}


@router.get("/stats/overview")
async def dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count()).select_from(Candidate))).scalar() or 0
    new = (
        await db.execute(
            select(func.count()).select_from(Candidate).where(Candidate.status == CandidateStatus.NEW.value)
        )
    ).scalar() or 0
    needs_review = (
        await db.execute(select(func.count()).select_from(Candidate).where(Candidate.needs_review == True))
    ).scalar() or 0
    shortlisted = (
        await db.execute(
            select(func.count())
            .select_from(Candidate)
            .where(Candidate.status == CandidateStatus.SHORTLISTED.value)
        )
    ).scalar() or 0
    interviews = (
        await db.execute(
            select(func.count())
            .select_from(Candidate)
            .where(
                Candidate.status.in_(
                    [
                        CandidateStatus.INTERVIEW_SCHEDULED.value,
                        CandidateStatus.INTERVIEWED.value,
                    ]
                )
            )
        )
    ).scalar() or 0
    selected = (
        await db.execute(
            select(func.count())
            .select_from(Candidate)
            .where(Candidate.status == CandidateStatus.SELECTED.value)
        )
    ).scalar() or 0

    from app.models.requirement import Requirement
    from app.models.resume import ProcessingJob

    requirements = (await db.execute(select(func.count()).select_from(Requirement))).scalar() or 0
    processing = (
        await db.execute(
            select(func.count())
            .select_from(ProcessingJob)
            .where(ProcessingJob.status.in_(["uploaded", "processing", "text_extracted", "ai_processing"]))
        )
    ).scalar() or 0

    status_rows = await db.execute(
        select(Candidate.status, func.count()).group_by(Candidate.status)
    )
    by_status = [{"name": (row[0] or "unknown").replace("_", " "), "value": row[1]} for row in status_rows.all()]

    role_rows = await db.execute(
        select(func.coalesce(Candidate.custom_role, Candidate.current_role), func.count())
        .where(or_(Candidate.custom_role.isnot(None), Candidate.current_role.isnot(None)))
        .group_by(func.coalesce(Candidate.custom_role, Candidate.current_role))
        .order_by(func.count().desc())
        .limit(8)
    )
    by_role = [{"name": (row[0] or "Unknown")[:30], "value": row[1]} for row in role_rows.all()]

    loc_rows = await db.execute(
        select(func.coalesce(Candidate.custom_location, Candidate.location), func.count())
        .where(or_(Candidate.custom_location.isnot(None), Candidate.location.isnot(None)))
        .group_by(func.coalesce(Candidate.custom_location, Candidate.location))
        .order_by(func.count().desc())
        .limit(8)
    )
    by_location = [{"name": (row[0] or "Unknown")[:30], "value": row[1]} for row in loc_rows.all()]

    return {
        "total_candidates": total,
        "new_candidates": new,
        "needs_review": needs_review,
        "shortlisted": shortlisted,
        "interviews": interviews,
        "selected": selected,
        "requirements": requirements,
        "resumes_processing": processing,
        "by_status": by_status,
        "by_role": by_role,
        "by_location": by_location,
    }


@router.get("/{candidate_id}", response_model=CandidateDetail)
async def get_candidate(
    candidate_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Candidate)
        .where(Candidate.id == candidate_id)
        .options(
            selectinload(Candidate.contacts),
            selectinload(Candidate.skills),
            selectinload(Candidate.experiences),
            selectinload(Candidate.education),
            selectinload(Candidate.internships),
            selectinload(Candidate.projects),
            selectinload(Candidate.certifications),
            selectinload(Candidate.notes).selectinload(CandidateNote.author),
            selectinload(Candidate.status_history).selectinload(
                CandidateStatusHistory.changed_by_user
            ),
            selectinload(Candidate.tags),
        )
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # newest first
    notes_out = [
        NoteOut(
            id=n.id,
            note=n.note,
            created_at=n.created_at,
            author_name=n.author.name if n.author else None,
        )
        for n in sorted(candidate.notes or [], key=lambda x: x.id, reverse=True)
    ]

    history_out = [
        {
            "old_status": h.old_status,
            "new_status": h.new_status,
            "note": h.note,
            "created_at": h.created_at,
            "changed_by_name": h.changed_by_user.name if h.changed_by_user else None,
        }
        for h in sorted(candidate.status_history or [], key=lambda x: x.id, reverse=True)
    ]

    return CandidateDetail(
        id=candidate.id,
        candidate_id=candidate.candidate_id,
        name=candidate.name,
        location=candidate.location,
        preferred_location=candidate.preferred_location,
        current_role=candidate.current_role,
        current_company=candidate.current_company,
        employment_status=candidate.employment_status,
        total_experience_months=candidate.total_experience_months or 0,
        relevant_experience_months=candidate.relevant_experience_months,
        notice_period=candidate.notice_period,
        current_salary=float(candidate.current_salary) if candidate.current_salary else None,
        expected_salary=float(candidate.expected_salary) if candidate.expected_salary else None,
        custom_role=candidate.custom_role,
        custom_location=candidate.custom_location,
        custom_specifications=candidate.custom_specifications,
        status=candidate.status,
        needs_review=candidate.needs_review,
        source=candidate.source,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
        contacts=candidate.contacts or [],
        skills=candidate.skills or [],
        experiences=candidate.experiences or [],
        education=candidate.education or [],
        internships=candidate.internships or [],
        projects=candidate.projects or [],
        certifications=candidate.certifications or [],
        notes=notes_out,
        status_history=history_out,
        tags=[t.tag for t in (candidate.tags or [])],
    )


@router.patch("/{candidate_id}", response_model=CandidateDetail)
async def update_candidate(
    candidate_id: int,
    payload: CandidateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(candidate, key, value)

    await db.commit()
    return await get_candidate(candidate_id, current_user, db)


@router.post("/{candidate_id}/recruiter-fields", response_model=CandidateDetail)
async def update_recruiter_fields(
    candidate_id: int,
    payload: RecruiterFieldsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit ONLY the recruiter custom fields. AI-extracted fields are never touched here."""
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        cleaned = (value or "").strip() or None  # empty text clears the field
        setattr(candidate, key, cleaned)

    await db.commit()
    return await get_candidate(candidate_id, current_user, db)


@router.delete("/{candidate_id}")
async def delete_candidate(
    candidate_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.resume import Resume, ProcessingJob

    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    resumes = await db.execute(select(Resume).where(Resume.candidate_id == candidate_id))
    for resume in resumes.scalars().all():
        resume.current_version_id = None
    await db.flush()

    jobs = await db.execute(select(ProcessingJob).where(ProcessingJob.candidate_id == candidate_id))
    for job in jobs.scalars().all():
        job.candidate_id = None
    await db.flush()

    await db.delete(candidate)
    await db.commit()
    return {"message": "Candidate deleted", "id": candidate_id}


@router.post("/{candidate_id}/status")
async def update_status(
    candidate_id: int,
    payload: StatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    old = candidate.status
    new = payload.status
    if new not in [s.value for s in CandidateStatus]:
        raise HTTPException(status_code=400, detail="Invalid status")

    candidate.status = new
    history = CandidateStatusHistory(
        candidate_id=candidate.id,
        old_status=old,
        new_status=new,
        changed_by=current_user.id,
        note=payload.note,
    )
    db.add(history)
    await db.commit()
    return {"message": "Status updated", "old_status": old, "new_status": new}


@router.post("/{candidate_id}/notes", response_model=NoteOut)
async def add_note(
    candidate_id: int,
    payload: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Candidate not found")

    note = CandidateNote(
        candidate_id=candidate_id,
        user_id=current_user.id,
        note=payload.note,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return NoteOut(id=note.id, note=note.note, created_at=note.created_at, author_name=current_user.name)


@router.get("/{candidate_id}/resume-url")
async def get_candidate_resume_url(
    candidate_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.resume import Resume, ResumeVersion
    from app.services.storage_service import storage_service

    result = await db.execute(select(Resume).where(Resume.candidate_id == candidate_id))
    resume = result.scalars().first()
    if not resume or not resume.current_version_id:
        raise HTTPException(status_code=404, detail="No resume found for this candidate")

    version_result = await db.execute(
        select(ResumeVersion).where(ResumeVersion.id == resume.current_version_id)
    )
    version = version_result.scalar_one_or_none()
    if not version or not version.file_reference:
        raise HTTPException(status_code=404, detail="Resume version not found")

    url = storage_service.generate_presigned_url(version.file_reference, expires_seconds=300)
    if not url:
        raise HTTPException(
            status_code=503,
            detail=f"Could not generate download link. File key: {version.file_reference}",
        )

    return {
        "url": url,
        "filename": version.original_filename or "resume.pdf",
        "expires_in_seconds": 300,
    }


@router.get("/{candidate_id}/resume-download")
async def download_candidate_resume(
    candidate_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.resume import Resume, ResumeVersion
    from app.services.storage_service import storage_service

    result = await db.execute(select(Resume).where(Resume.candidate_id == candidate_id))
    resume = result.scalars().first()
    if not resume or not resume.current_version_id:
        raise HTTPException(status_code=404, detail="No resume found")

    version_result = await db.execute(
        select(ResumeVersion).where(ResumeVersion.id == resume.current_version_id)
    )
    version = version_result.scalar_one_or_none()
    if not version or not version.file_reference:
        raise HTTPException(status_code=404, detail="Resume file not found")

    file_bytes = storage_service.download_bytes(version.file_reference)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="Could not read resume file from storage")

    filename = version.original_filename or "resume.pdf"
    content_type = getattr(version, "content_type", None) or "application/pdf"

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(file_bytes)),
        },
    )