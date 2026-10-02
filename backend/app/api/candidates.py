from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.candidate import (
    Candidate,
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
        query = query.join(CandidateSkill).where(CandidateSkill.skill.ilike(f"%{skill}%"))
    if q:
        like = f"%{q}%"
        query = query.where(
            or_(
                Candidate.name.ilike(like),
                Candidate.current_role.ilike(like),
                Candidate.custom_role.ilike(like),
                Candidate.current_company.ilike(like),
                Candidate.location.ilike(like),
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
                current_role=c.current_role or c.custom_role,
                location=c.location or c.custom_location,
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


@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_candidates(
    candidate_ids: List[int],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not candidate_ids:
        raise HTTPException(status_code=400, detail="No candidate IDs provided")

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
                    [CandidateStatus.INTERVIEW_SCHEDULED.value, CandidateStatus.INTERVIEWED.value]
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

    return {
        "total_candidates": total,
        "new_candidates": new,
        "needs_review": needs_review,
        "shortlisted": shortlisted,
        "interviews": interviews,
        "selected": selected,
        "requirements": requirements,
        "resumes_processing": processing,
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
            selectinload(Candidate.notes),
            selectinload(Candidate.status_history),
            selectinload(Candidate.tags),
        )
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    notes_out = [
        NoteOut(id=n.id, note=n.note, created_at=n.created_at, author_name=None)
        for n in (candidate.notes or [])
    ]

    history_out = [
        {
            "old_status": h.old_status,
            "new_status": h.new_status,
            "note": h.note,
            "created_at": h.created_at,
            "changed_by_name": None,
        }
        for h in (candidate.status_history or [])
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


@router.delete("/{candidate_id}", status_code=status.HTTP_200_OK)
async def delete_candidate(
    candidate_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    await db.delete(candidate)
    await db.commit()
    return {"message": "Candidate deleted successfully", "id": candidate_id}


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

    