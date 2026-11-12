from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime


def _strip_required_employee_id(value: str) -> str:
    if value is None:
        raise ValueError("Employee ID is required")
    trimmed = str(value).strip()
    if not trimmed:
        raise ValueError("Employee ID is required")
    return trimmed

class TraineeInMentor(BaseModel):
    id: str
    name: str
    email: EmailStr
    employeeId: Optional[str] = ""
    department: Optional[str] = ""
    percentComplete: Optional[float] = 0.0
    status: Optional[str] = None
    location: Optional[str] = None
    droppedOutAt: Optional[datetime] = None
    dropoutReason: Optional[str] = None

class MentorNomineeCreate(BaseModel):
    name: str
    email: EmailStr
    department: Optional[str] = ""
    employeeId: str = Field(min_length=1, max_length=64)
    location: Optional[str] = None
    timezone: Optional[str] = None
    experience: Optional[str] = None
    skills: Optional[List[str]] = []

    @field_validator("employeeId", mode="before")
    @classmethod
    def validate_employee_id(cls, value: str) -> str:
        return _strip_required_employee_id(value)

class CohortRef(BaseModel):
    id: str
    name: str
    status: Optional[str] = "active"

class MentorNomineeResponse(BaseModel):
    """Mentor as seen by admin / inside a cohort."""
    id: str
    cohortId: Optional[str] = None
    cohortIds: Optional[List[str]] = []
    cohortNames: Optional[List[str]] = []
    assignedCohorts: Optional[List[CohortRef]] = []
    nominatedBy: Optional[str] = "admin"
    nominatorName: Optional[str] = "Admin"
    name: str
    email: EmailStr
    department: Optional[str] = ""
    employeeId: Optional[str] = ""
    location: Optional[str] = None
    timezone: Optional[str] = None
    experience: Optional[str] = None
    skills: Optional[List[str]] = []
    userId: Optional[str] = None
    isLoginActive: bool = False
    isAccountActive: bool = True
    isCohortAccessActive: bool = True
    isActive: bool = True
    status: Optional[str] = "pending"
    assignedTraineesCount: Optional[int] = 0
    assignedTrainees: Optional[List[TraineeInMentor]] = []
    createdAt: datetime

class MentorCohortsUpdateRequest(BaseModel):
    cohortIds: List[str]

class TraineeCohortUpdateRequest(BaseModel):
    cohortId: Optional[str] = None

class MentorAssignCohortsRequest(BaseModel):
    cohortIds: List[str]

class TraineeNomineeCreate(BaseModel):
    name: str
    email: EmailStr
    employeeId: str = Field(min_length=1, max_length=64)
    department: Optional[str] = ""
    location: Optional[str] = None
    timezone: Optional[str] = None
    experience: Optional[str] = None
    skills: Optional[List[str]] = []

    @field_validator("employeeId", mode="before")
    @classmethod
    def validate_employee_id(cls, value: str) -> str:
        return _strip_required_employee_id(value)

class TraineeNomineeResponse(BaseModel):
    """Trainee as seen by admin / inside a cohort."""
    id: str
    cohortId: Optional[str] = None
    nominatedBy: Optional[str] = "admin"
    nominatorName: Optional[str] = "Admin"
    name: str
    email: EmailStr
    employeeId: str
    department: Optional[str] = ""
    location: Optional[str] = None
    timezone: Optional[str] = None
    experience: Optional[str] = None
    skills: Optional[List[str]] = []
    status: Optional[str] = "pending"
    droppedOutAt: Optional[datetime] = None
    droppedOutBy: Optional[str] = None
    dropoutReason: Optional[str] = None
    mentorId: Optional[str] = None
    mentorName: Optional[str] = None
    percentComplete: Optional[float] = 0.0
    createdAt: datetime

class MyNomineeResponse(BaseModel):
    """What a nominator sees about their own nominees. Deliberately has NO
    cohort, mentor or progress information."""
    id: str
    type: str  # "mentor" | "trainee"
    name: str
    email: EmailStr
    employeeId: Optional[str] = ""
    location: Optional[str] = None
    timezone: Optional[str] = None
    experience: Optional[str] = None
    skills: Optional[List[str]] = []
    createdAt: datetime

class AllocateRequest(BaseModel):
    ids: List[str]

class MentorAssignmentRequest(BaseModel):
    mentorId: str
