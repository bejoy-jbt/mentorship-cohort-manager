from typing import Optional
from pydantic import BaseModel, Field, field_validator
from datetime import datetime


class TalentNextCourseBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = ""
    courseUrl: Optional[str] = ""
    durationHrs: Optional[float] = Field(default=None, ge=0)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        if value is None:
            raise ValueError("Course name is required")
        trimmed = str(value).strip()
        if not trimmed:
            raise ValueError("Course name is required")
        return trimmed

    @field_validator("description", "courseUrl", mode="before")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> str:
        return (str(value) if value is not None else "").strip()


class TalentNextCourseCreate(TalentNextCourseBase):
    pass


class TalentNextCourseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    courseUrl: Optional[str] = None
    durationHrs: Optional[float] = Field(default=None, ge=0)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = str(value).strip()
        if not trimmed:
            raise ValueError("Course name cannot be empty")
        return trimmed

    @field_validator("description", "courseUrl", mode="before")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return str(value).strip() if value is not None else None


class TalentNextCourseResponse(TalentNextCourseBase):
    id: str
    createdAt: datetime

    class Config:
        from_attributes = True
