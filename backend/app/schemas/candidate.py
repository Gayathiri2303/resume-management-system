from datetime import date as date_type, datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class ContactOut(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None

    class Config:
        from_attributes = True


class SkillOut(BaseModel):
    skill: str
    category: Optional[str] = None
    confidence: Optional[str] = None

    class Config:
        from_attributes = True


class ExperienceOut(BaseModel):
    company: str
    role: str
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None
    duration_months: Optional[int] = None
    responsibilities: Optional[str] = None
    technologies: Optional[str] = None

    class Config:
        from_attributes = True


class EducationOut(BaseModel):
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    institution: Optional[str] = None
    graduation_year: Optional[int] = None
    is_highest: bool = False

    class Config:
        from_attributes = True


class InternshipOut(BaseModel):
    organization: str
    role: str
    start_date: Optional[date_type] = None
    end_date: Optional[date_type] = None
    duration_months: Optional[int] = None
    responsibilities: Optional[str] = None
    skills: Optional[str] = None

    class Config:
        from_attributes = True


class ProjectOut(BaseModel):
    project_name: str
    description: Optional[str] = None
    technologies: Optional[str] = None
    role: Optional[str] = None
    project_type: Optional[str] = None
    url: Optional[str] = None
    duration: Optional[str] = None

    class Config:
        from_attributes = True


class CertificationOut(BaseModel):
    name: str
    issuer: Optional[str] = None
    date: Optional[date_type] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None

    class Config:
        from_attributes = True


class NoteOut(BaseModel):
    id: int
    note: str
    created_at: datetime
    author_name: Optional[str] = None

    class Config:
        from_attributes = True


class StatusHistoryOut(BaseModel):
    old_status: Optional[str] = None
    new_status: str
    note: Optional[str] = None
    created_at: datetime
    changed_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class CandidateListItem(BaseModel):
    id: int
    candidate_id: str
    name: str
    current_role: Optional[str] = None
    location: Optional[str] = None
    total_experience_months: int = 0
    experience_display: Optional[str] = None
    notice_period: Optional[str] = None
    status: str
    needs_review: bool = False
    skills: List[str] = []
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None

    class Config:
        from_attributes = True


class CandidateDetail(BaseModel):
    id: int
    candidate_id: str
    name: str
    location: Optional[str] = None
    preferred_location: Optional[str] = None
    current_role: Optional[str] = None
    current_company: Optional[str] = None
    employment_status: str
    total_experience_months: int = 0
    relevant_experience_months: Optional[int] = None
    notice_period: Optional[str] = None
    current_salary: Optional[float] = None
    expected_salary: Optional[float] = None
    custom_role: Optional[str] = None
    custom_location: Optional[str] = None
    custom_specifications: Optional[str] = None
    status: str
    needs_review: bool = False
    source: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    contacts: List[ContactOut] = []
    skills: List[SkillOut] = []
    experiences: List[ExperienceOut] = []
    education: List[EducationOut] = []
    internships: List[InternshipOut] = []
    projects: List[ProjectOut] = []
    certifications: List[CertificationOut] = []
    notes: List[NoteOut] = []
    status_history: List[StatusHistoryOut] = []
    tags: List[str] = []

    class Config:
        from_attributes = True


class CandidateUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    preferred_location: Optional[str] = None
    current_role: Optional[str] = None
    current_company: Optional[str] = None
    employment_status: Optional[str] = None
    total_experience_months: Optional[int] = None
    notice_period: Optional[str] = None
    current_salary: Optional[float] = None
    expected_salary: Optional[float] = None
    custom_role: Optional[str] = None
    custom_location: Optional[str] = None
    custom_specifications: Optional[str] = None
    status: Optional[str] = None
    needs_review: Optional[bool] = None


class StatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None


class NoteCreate(BaseModel):
    note: str = Field(..., min_length=1)


class UploadOptions(BaseModel):
    custom_role: Optional[str] = None
    custom_location: Optional[str] = None
    custom_specifications: Optional[str] = None
    notes: Optional[str] = None
    source: Optional[str] = "manual_upload"