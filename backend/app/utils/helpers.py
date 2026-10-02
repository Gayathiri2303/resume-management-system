from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import Candidate
from app.models.requirement import Requirement


async def generate_candidate_id(db: AsyncSession) -> str:
    """
    Generate next CAN-000001 style ID safely.
    Uses the highest existing number + 1 (avoids duplicates).
    """
    result = await db.execute(
        select(func.max(Candidate.candidate_id))
    )
    max_id = result.scalar()

    if not max_id:
        next_num = 1
    else:
        # Extract number from CAN-000010 → 10
        try:
            next_num = int(max_id.split("-")[1]) + 1
        except (IndexError, ValueError):
            next_num = 1

    return f"CAN-{next_num:06d}"


def format_experience(months: int | None) -> str:
    if not months or months <= 0:
        return "0 months"
    years = months // 12
    rem = months % 12
    if years == 0:
        return f"{rem} month{'s' if rem != 1 else ''}"
    if rem == 0:
        return f"{years} year{'s' if years != 1 else ''}"
    return f"{years} year{'s' if years != 1 else ''} {rem} month{'s' if rem != 1 else ''}"


async def generate_requirement_id(db: AsyncSession) -> str:
    result = await db.execute(select(func.max(Requirement.requirement_id)))
    max_id = result.scalar()

    if not max_id:
        next_num = 1
    else:
        try:
            next_num = int(max_id.split("-")[1]) + 1
        except (IndexError, ValueError):
            next_num = 1

    return f"REQ-{next_num:06d}"