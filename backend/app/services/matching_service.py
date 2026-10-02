"""
Matching engine – transparent scoring + explanations.
Never treats score as final hiring decision.
"""
from typing import Any, Dict, List, Optional, Tuple


def _normalize(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def _skill_set(skills: List[str]) -> set:
    return {_normalize(s) for s in skills if s}


def calculate_match(
    candidate: Dict[str, Any],
    requirement: Dict[str, Any],
) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Returns (score 0-100, list of explanation items).
    Each explanation item:
    {
      "status": "match" | "partial" | "missing" | "info",
      "label": "...",
      "detail": "...",
      "source": "..."
    }
    """
    explanations: List[Dict[str, Any]] = []
    score = 0.0
    max_score = 0.0

    # ----- Required skills (highest weight) -----
    required = _skill_set(requirement.get("required_skills") or [])
    cand_skills = _skill_set(candidate.get("skills") or [])
    if required:
        weight = 40.0
        max_score += weight
        matched = required & cand_skills
        ratio = len(matched) / len(required)
        score += weight * ratio
        for sk in required:
            if sk in matched:
                explanations.append({
                    "status": "match",
                    "label": sk.title() if sk.islower() else sk,
                    "detail": "Required skill",
                    "source": "Skills",
                })
            else:
                explanations.append({
                    "status": "missing",
                    "label": sk.title() if sk.islower() else sk,
                    "detail": "Required skill not found",
                    "source": "Skills",
                })

    # ----- Preferred skills -----
    preferred = _skill_set(requirement.get("preferred_skills") or [])
    if preferred:
        weight = 15.0
        max_score += weight
        matched = preferred & cand_skills
        ratio = len(matched) / len(preferred) if preferred else 0
        score += weight * ratio
        for sk in preferred:
            if sk in matched:
                explanations.append({
                    "status": "match",
                    "label": sk.title() if sk.islower() else sk,
                    "detail": "Preferred skill",
                    "source": "Skills",
                })
            else:
                explanations.append({
                    "status": "partial",
                    "label": sk.title() if sk.islower() else sk,
                    "detail": "Preferred skill not found",
                    "source": "Skills",
                })

    # ----- Experience -----
    min_exp = requirement.get("min_experience_months")
    max_exp = requirement.get("max_experience_months")
    cand_exp = candidate.get("total_experience_months") or 0
    if min_exp is not None or max_exp is not None:
        weight = 20.0
        max_score += weight
        ok = True
        if min_exp is not None and cand_exp < min_exp:
            ok = False
        if max_exp is not None and cand_exp > max_exp:
            ok = False
        if ok:
            score += weight
            explanations.append({
                "status": "match",
                "label": f"{cand_exp / 12:.1f} years" if cand_exp >= 12 else f"{cand_exp} months",
                "detail": "Meets experience requirement",
                "source": "Employment history",
            })
        else:
            explanations.append({
                "status": "missing",
                "label": f"{cand_exp / 12:.1f} years" if cand_exp >= 12 else f"{cand_exp} months",
                "detail": f"Experience outside required range ({min_exp or 0}–{max_exp or '∞'} months)",
                "source": "Employment history",
            })

    # ----- Location -----
    req_loc = _normalize(requirement.get("location"))
    cand_loc = _normalize(candidate.get("location") or candidate.get("preferred_location"))
    if req_loc:
        weight = 15.0
        max_score += weight
        if cand_loc and (req_loc in cand_loc or cand_loc in req_loc):
            score += weight
            explanations.append({
                "status": "match",
                "label": candidate.get("location") or candidate.get("preferred_location"),
                "detail": "Location match",
                "source": "Candidate location",
            })
        elif not cand_loc:
            explanations.append({
                "status": "info",
                "label": "Location not specified",
                "detail": "Candidate location missing – recruiter to verify",
                "source": "Candidate location",
            })
            # Do not heavily penalize missing info
            score += weight * 0.4
        else:
            explanations.append({
                "status": "missing",
                "label": candidate.get("location") or "Other location",
                "detail": f"Required location: {requirement.get('location')}",
                "source": "Candidate location",
            })

    # ----- Role relevance -----
    req_role = _normalize(requirement.get("role"))
    cand_role = _normalize(candidate.get("current_role") or candidate.get("custom_role"))
    if req_role:
        weight = 10.0
        max_score += weight
        if cand_role and (req_role in cand_role or cand_role in req_role):
            score += weight
            explanations.append({
                "status": "match",
                "label": candidate.get("current_role") or candidate.get("custom_role"),
                "detail": "Role match",
                "source": "Current / custom role",
            })
        else:
            # Check previous roles if available
            prev = candidate.get("previous_roles") or []
            found = any(req_role in _normalize(r) or _normalize(r) in req_role for r in prev)
            if found:
                score += weight * 0.7
                explanations.append({
                    "status": "partial",
                    "label": "Previous role match",
                    "detail": "Role found in previous experience",
                    "source": "Experience history",
                })
            else:
                explanations.append({
                    "status": "info",
                    "label": candidate.get("current_role") or "Role not specified",
                    "detail": f"Looking for: {requirement.get('role')}",
                    "source": "Role",
                })
                score += weight * 0.3

    # ----- Notice period -----
    req_notice = _normalize(requirement.get("notice_period"))
    cand_notice = _normalize(candidate.get("notice_period"))
    if req_notice:
        weight = 5.0  # lower weight
        max_score += weight
        if cand_notice and (req_notice in cand_notice or "immediate" in cand_notice):
            score += weight
            explanations.append({
                "status": "match",
                "label": candidate.get("notice_period"),
                "detail": "Notice period matches",
                "source": "Candidate profile",
            })
        elif not cand_notice:
            explanations.append({
                "status": "info",
                "label": "Notice period not specified",
                "detail": "Recruiter to confirm availability",
                "source": "Candidate profile",
            })
            score += weight * 0.5
        else:
            explanations.append({
                "status": "partial",
                "label": candidate.get("notice_period"),
                "detail": f"Required: {requirement.get('notice_period')}",
                "source": "Candidate profile",
            })

    final_score = round((score / max_score * 100) if max_score > 0 else 0, 1)
    # Cap at 100
    final_score = min(final_score, 100.0)
    return final_score, explanations
