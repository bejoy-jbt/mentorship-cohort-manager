from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.deps import get_current_user
from app.core.db import get_database
from app.schemas.talentnext import (
    TalentNextCourseCreate,
    TalentNextCourseUpdate,
    TalentNextCourseResponse
)
from app.services.talentnext_service import TalentNextService

router = APIRouter(prefix="/talentnext-courses", tags=["talentnext"])


@router.post("", response_model=TalentNextCourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: TalentNextCourseCreate,
    db = Depends(get_database),
    current_user = Depends(get_current_user)
):
    """Create a new TalentNext course (Admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    service = TalentNextService(db)
    course = await service.create(
        payload.name,
        description=payload.description,
        course_url=payload.courseUrl,
        duration_hrs=payload.durationHrs,
    )
    return course


@router.get("", response_model=List[TalentNextCourseResponse])
async def list_courses(db = Depends(get_database)):
    """List all TalentNext courses"""
    service = TalentNextService(db)
    courses = await service.list_all()
    return courses


@router.get("/{course_id}", response_model=TalentNextCourseResponse)
async def get_course(course_id: str, db = Depends(get_database)):
    """Get a specific TalentNext course"""
    service = TalentNextService(db)
    course = await service.get_by_id(course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


@router.put("/{course_id}", response_model=TalentNextCourseResponse)
async def update_course(
    course_id: str,
    payload: TalentNextCourseUpdate,
    db = Depends(get_database),
    current_user = Depends(get_current_user)
):
    """Update a TalentNext course (Admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    service = TalentNextService(db)
    course = await service.update(
        course_id,
        name=payload.name,
        description=payload.description,
        course_url=payload.courseUrl,
        duration_hrs=payload.durationHrs,
    )
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_user)
):
    """Delete a TalentNext course (Admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    service = TalentNextService(db)
    success = await service.delete(course_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return None
