"""
AI extraction service – Groq (free tier).
Strict rule: never invent candidate information.
"""
import json
import logging
import re
from typing import Any, Dict, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

EXTRACTION_PROMPT = """You are a precise resume parser for a recruitment system.
Extract structured information from the resume text below.
Return ONLY valid JSON. No markdown. No explanation.

Rules:
- Never invent missing information. Use null if unknown.
- Do not treat academic projects as professional employment.
- Keep internships separate from professional experience.
- Do not invent phone, email, salary, notice period, or role.
- If role is unclear, set current_role to null.

Return this exact JSON shape:
{{
  "name": string or null,
  "email": string or null,
  "phone": string or null,
  "alternate_phone": string or null,
  "location": string or null,
  "preferred_location": string or null,
  "current_role": string or null,
  "current_company": string or null,
  "employment_status": "fresher" | "experienced" | "unknown",
  "total_experience_months": number or null,
  "notice_period": string or null,
  "current_salary": number or null,
  "expected_salary": number or null,
  "skills": [{{"skill": string, "category": string or null}}],
  "experiences": [{{
    "company": string,
    "role": string,
    "start_date": string or null,
    "end_date": string or null,
    "duration_months": number or null,
    "responsibilities": string or null,
    "technologies": string or null
  }}],
  "education": [{{
    "qualification": string or null,
    "specialization": string or null,
    "institution": string or null,
    "graduation_year": number or null,
    "is_highest": boolean
  }}],
  "internships": [{{
    "organization": string,
    "role": string,
    "start_date": string or null,
    "end_date": string or null,
    "duration_months": number or null,
    "responsibilities": string or null,
    "skills": string or null
  }}],
  "projects": [{{
    "project_name": string,
    "description": string or null,
    "technologies": string or null,
    "role": string or null,
    "project_type": string or null,
    "url": string or null
  }}],
  "certifications": [{{
    "name": string,
    "issuer": string or null,
    "date": string or null,
    "credential_id": string or null,
    "credential_url": string or null
  }}],
  "confidence": "high" | "medium" | "low",
  "needs_review": boolean
}}

RESUME TEXT:
{text}
"""

JD_PROMPT = """You are a recruitment requirement analyzer.
Extract structured hiring requirements from the job description.
Return ONLY valid JSON. No markdown.

Rules:
- Separate required vs preferred skills.
- Do not invent requirements not present in the text.
- Use null for missing fields.

JSON shape:
{{
  "name": string or null,
  "role": string or null,
  "location": string or null,
  "min_experience_months": number or null,
  "max_experience_months": number or null,
  "education": string or null,
  "salary_min": number or null,
  "salary_max": number or null,
  "notice_period": string or null,
  "required_skills": [string],
  "preferred_skills": [string],
  "other_specifications": string or null
}}

JOB DESCRIPTION:
{text}
"""


class AIService:
    def __init__(self):
        self.provider = (settings.AI_PROVIDER or "").lower()
        self.groq_key = getattr(settings, "GROQ_API_KEY", "") or ""
        self.client = None
        self.ready = False

        if self.provider == "groq" and self.groq_key:
            try:
                from groq import Groq

                self.client = Groq(api_key=self.groq_key)
                self.ready = True
                logger.info("AI provider ready: Groq")
            except Exception as e:
                logger.error("Failed to init Groq: %s", e)
                self.ready = False
        else:
            logger.warning(
                "AI provider not fully configured. Extraction will return needs_review."
            )

    async def _call_llm(self, prompt: str) -> Optional[str]:
        if not self.ready or not self.client:
            return None
        try:
            completion = self.client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {
                        "role": "system",
                        "content": "You extract structured JSON only. Never invent data.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=4000,
            )
            return completion.choices[0].message.content
        except Exception as e:
            logger.exception("Groq API call failed: %s", e)
            return None

    def _parse_json(self, text: str) -> Optional[Dict[str, Any]]:
        if not text:
            return None
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{[\s\S]*\}", text)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    return None
            return None

    async def extract_candidate(self, resume_text: str) -> Dict[str, Any]:
        """Extract structured candidate data. Never invent fields."""
        empty: Dict[str, Any] = {
            "name": None,
            "email": None,
            "phone": None,
            "alternate_phone": None,
            "location": None,
            "preferred_location": None,
            "current_role": None,
            "current_company": None,
            "employment_status": "unknown",
            "total_experience_months": None,
            "notice_period": None,
            "current_salary": None,
            "expected_salary": None,
            "skills": [],
            "experiences": [],
            "education": [],
            "internships": [],
            "projects": [],
            "certifications": [],
            "confidence": "low",
            "needs_review": True,
        }

        if not resume_text or len(resume_text.strip()) < 30:
            empty["error"] = "Resume text too short or empty"
            return empty

        if not self.ready:
            empty["error"] = "AI not configured"
            return empty

        prompt = EXTRACTION_PROMPT.format(text=resume_text[:12000])
        raw = await self._call_llm(prompt)
        data = self._parse_json(raw or "")

        if not data:
            empty["error"] = "AI returned invalid JSON"
            return empty

        if not data.get("name"):
            data["needs_review"] = True
            data["confidence"] = data.get("confidence") or "low"

        if data.get("confidence") == "low":
            data["needs_review"] = True

        for key in (
            "skills",
            "experiences",
            "education",
            "internships",
            "projects",
            "certifications",
        ):
            if not isinstance(data.get(key), list):
                data[key] = []

        return data

    async def analyze_requirement(self, jd_text: str) -> Dict[str, Any]:
        empty: Dict[str, Any] = {
            "name": None,
            "role": None,
            "location": None,
            "min_experience_months": None,
            "max_experience_months": None,
            "education": None,
            "salary_min": None,
            "salary_max": None,
            "notice_period": None,
            "required_skills": [],
            "preferred_skills": [],
            "other_specifications": None,
        }

        if not jd_text or len(jd_text.strip()) < 20:
            return empty

        if not self.ready:
            return empty

        prompt = JD_PROMPT.format(text=jd_text[:10000])
        raw = await self._call_llm(prompt)
        data = self._parse_json(raw or "")
        if not data:
            return empty

        if not isinstance(data.get("required_skills"), list):
            data["required_skills"] = []
        if not isinstance(data.get("preferred_skills"), list):
            data["preferred_skills"] = []

        return data

    async def natural_language_to_filters(self, query: str) -> Dict[str, Any]:
        if not self.ready or not query:
            return {"raw_query": query}

        prompt = f"""Convert this recruiter search into JSON filters only.
Query: {query}

Return JSON:
{{
  "role": string or null,
  "location": string or null,
  "min_experience_months": number or null,
  "max_experience_months": number or null,
  "skills": [string],
  "notice_period": string or null,
  "employment_status": string or null
}}
"""
        raw = await self._call_llm(prompt)
        data = self._parse_json(raw or "")
        return data or {"raw_query": query}


ai_service = AIService()