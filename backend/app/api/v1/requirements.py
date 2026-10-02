import json
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.candidate import Candidate
from app.models.requirement import (
    CandidateRequirementMatch,
    Requirement,
    RequirementSkill,
    RequirementStatus,
    SkillType,
)
from app.models.user import User
from app.services.ai_service import ai_service
from app.services.matching_service import calculate_match
from app.services.text_extraction import extract_text
from app.utils.helpers import generate_requirement_id, format_experience

router = APIRouter()


class RequirementStatusUpdate(BaseModel):
    status: str


@router.get("")
async def list_requirements(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Requirement).options(selectinload(Requirement.skills)).order_by(Requirement.created_at.desc())
    if status:
        q = q.where(Requirement.status == status)
    result = await db.execute(q)
    reqs = result.scalars().unique().all()
    return [
        {
            "id": r.id,
            "requirement_id": r.requirement_id,
            "name": r.name,
            "company_name": r.company_name,
            "role": r.role,
            "location": r.location,
            "min_experience_months": r.min_experience_months,
            "max_experience_months": r.max_experience_months,
            "status": r.status,
            "required_skills": [s.skill for s in r.skills if s.skill_type == SkillType.REQUIRED.value],
            "preferred_skills": [s.skill for s in r.skills if s.skill_type == SkillType.PREFERRED.value],
            "created_at": r.created_at,
        }
        for r in reqs
    ]


@router.post("/analyze-jd")
async def analyze_jd_text(
    jd_text: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Paste JD → AI analysis. Recruiter must review before saving."""
    if not jd_text or len(jd_text.strip()) < 20:
        raise HTTPException(status_code=400, detail="Job description too short")
    analysis = await ai_service.analyze_requirement(jd_text)
    return analysis


@router.post("/analyze-jd-file")
async def analyze_jd_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    text, _ = extract_text(content, file.filename or "jd.pdf", file.content_type or "")
    if not text or len(text.strip()) < 20:
        raise HTTPException(status_code=400, detail="Could not extract text from JD file")
    analysis = await ai_service.analyze_requirement(text)
    return {"analysis": analysis, "extracted_text_preview": text[:500]}


@router.post("")
async def create_requirement(
    name: str = Form(...),
    company_name: Optional[str] = Form(None),
    role: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    min_experience_months: Optional[int] = Form(None),
    max_experience_months: Optional[int] = Form(None),
    education: Optional[str] = Form(None),
    salary_min: Optional[float] = Form(None),
    salary_max: Optional[float] = Form(None),
    notice_period: Optional[str] = Form(None),
    job_description: Optional[str] = Form(None),
    other_specifications: Optional[str] = Form(None),
    required_skills: Optional[str] = Form(None),
    preferred_skills: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    req_id = await generate_requirement_id(db)
    req = Requirement(
        requirement_id=req_id,
        name=name,
        company_name=company_name,
        role=role,
        location=location,
        min_experience_months=min_experience_months,
        max_experience_months=max_experience_months,
        education=education,
        salary_min=salary_min,
        salary_max=salary_max,
        notice_period=notice_period,
        job_description=job_description,
        other_specifications=other_specifications,
        status=RequirementStatus.OPEN.value,
        created_by=current_user.id,
    )
    db.add(req)
    await db.flush()

    if required_skills:
        for s in [x.strip() for x in required_skills.split(",") if x.strip()]:
            db.add(RequirementSkill(requirement_id=req.id, skill=s, skill_type=SkillType.REQUIRED.value))
    if preferred_skills:
        for s in [x.strip() for x in preferred_skills.split(",") if x.strip()]:
            db.add(RequirementSkill(requirement_id=req.id, skill=s, skill_type=SkillType.PREFERRED.value))

    await db.commit()
    await db.refresh(req)
    return {"id": req.id, "requirement_id": req.requirement_id, "name": req.name}


@router.post("/{requirement_id}/status")
async def update_requirement_status(
    requirement_id: int,
    payload: RequirementStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.status not in [s.value for s in RequirementStatus]:
        raise HTTPException(status_code=400, detail="Invalid status")
    req = (await db.execute(select(Requirement).where(Requirement.id == requirement_id))).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    req.status = payload.status
    await db.commit()
    return {"id": req.id, "status": req.status}


@router.delete("/{requirement_id}")
async def delete_requirement(
    requirement_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    req = (await db.execute(select(Requirement).where(Requirement.id == requirement_id))).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    await db.delete(req)
    await db.commit()
    return {"message": "Requirement deleted", "id": requirement_id}


@router.post("/{requirement_id}/find-candidates")
async def find_candidates(
    requirement_id: int,
    min_score: float = Query(20, ge=0, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Requirement)
        .where(Requirement.id == requirement_id)
        .options(selectinload(Requirement.skills))
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    req_data = {
        "role": req.role,
        "location": req.location,
        "min_experience_months": req.min_experience_months,
        "max_experience_months": req.max_experience_months,
        "notice_period": req.notice_period,
        "required_skills": [s.skill for s in req.skills if s.skill_type == SkillType.REQUIRED.value],
        "preferred_skills": [s.skill for s in req.skills if s.skill_type == SkillType.PREFERRED.value],
    }

    cand_result = await db.execute(
        select(Candidate)
        .options(selectinload(Candidate.skills), selectinload(Candidate.contacts))
        .limit(500)
    )
    candidates = cand_result.scalars().unique().all()

    existing_rows = (
        await db.execute(
            select(CandidateRequirementMatch).where(CandidateRequirementMatch.requirement_id == req.id)
        )
    ).scalars().all()
    existing_by_candidate = {m.candidate_id: m for m in existing_rows}

    matches = []
    for c in candidates:
        role = c.custom_role or c.current_role
        loc = c.custom_location or c.location
        cand_data = {
            "current_role": role,
            "location": loc,
            "preferred_location": c.preferred_location,
            "total_experience_months": c.total_experience_months or 0,
            "notice_period": c.notice_period,
            "skills": [s.skill for s in (c.skills or [])],
            "previous_roles": [],
        }
        score, explanations = calculate_match(cand_data, req_data)
        if score < min_score:
            continue

        match_row = existing_by_candidate.get(c.id)
        if match_row:
            match_row.match_score = score
            match_row.explanation = json.dumps(explanations, default=str)
        else:
            db.add(
                CandidateRequirementMatch(
                    candidate_id=c.id,
                    requirement_id=req.id,
                    match_score=score,
                    explanation=json.dumps(explanations, default=str),
                )
            )

        matches.append(
            {
                "candidate_id": c.id,
                "candidate_code": c.candidate_id,
                "name": c.name,
                "role": role,
                "location": loc,
                "experience": format_experience(c.total_experience_months or 0),
                "experience_months": c.total_experience_months or 0,
                "skills": [s.skill for s in (c.skills or [])[:10]],
                "notice_period": c.notice_period,
                "status": c.status,
                "match_score": score,
                "explanations": explanations,
            }
        )

    await db.commit()
    matches.sort(key=lambda x: x["match_score"], reverse=True)
    return {
        "requirement_id": req.requirement_id,
        "requirement_name": req.name,
        "total_matches": len(matches),
        "matches": matches,
    }