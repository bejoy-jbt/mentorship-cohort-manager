from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.db import get_database
from app.core.deps import require_admin, require_nominator, require_any_authenticated, ensure_mentor_cohort_access
from app.services.nomination_service import NominationService
from app.services.identity_service import is_employee_id_taken
from app.schemas.nominees import (
    MentorNomineeCreate, MentorNomineeResponse, MyNomineeResponse,
    TraineeNomineeCreate, TraineeNomineeResponse, AllocateRequest,
    MentorCohortsUpdateRequest, TraineeCohortUpdateRequest, MentorAssignCohortsRequest,
)
from app.schemas.common import PaginatedResponse

router = APIRouter(tags=["Nominations"])

ALLOCATION_PATTERN = "^(all|unallocated|allocated)$"

# ---------------------------------------------------------------------------
# Nominator endpoints - independent of cohorts
# ---------------------------------------------------------------------------

@router.post("/nominations/mentors", response_model=MyNomineeResponse)
async def nominate_mentor(
    data: MentorNomineeCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_nominator)
):
    """Nominate a mentor. No cohort is involved; an admin adds nominees to cohorts."""
    return await NominationService.nominate_mentor(db, data, current_user)


@router.post("/nominations/trainees", response_model=MyNomineeResponse)
async def nominate_trainee(
    data: TraineeNomineeCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_nominator)
):
    """Nominate a trainee. No cohort is involved; an admin adds nominees to cohorts."""
    return await NominationService.nominate_trainee(db, data, current_user)


@router.get("/nominations/check-employee-id")
async def check_employee_id_availability(
    employeeId: str = Query(..., min_length=1),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_nominator),
):
    """Check whether an Employee ID is already registered anywhere in the portal."""
    trimmed = employeeId.strip()
    exists = await is_employee_id_taken(db, trimmed) if trimmed else False
    return {"employeeId": trimmed, "exists": exists}


@router.get("/nominations/mine/mentors", response_model=PaginatedResponse[MyNomineeResponse])
async def list_my_mentors(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_nominator)
):
    return await NominationService.list_my_nominees(db, "mentor", current_user, search, page, limit)


@router.get("/nominations/mine/trainees", response_model=PaginatedResponse[MyNomineeResponse])
async def list_my_trainees(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_nominator)
):
    return await NominationService.list_my_nominees(db, "trainee", current_user, search, page, limit)

# ---------------------------------------------------------------------------
# Admin endpoints - full nominee list
# ---------------------------------------------------------------------------

@router.get("/nominations/mentors")
async def admin_list_mentor_nominees(
    allocation: str = Query("all", pattern=ALLOCATION_PATTERN),
    search: Optional[str] = Query(None),
    nominator_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    return await NominationService.list_pool(db, "mentor", allocation, search, nominator_id, page, limit)


@router.get("/nominations/trainees")
async def admin_list_trainee_nominees(
    allocation: str = Query("all", pattern=ALLOCATION_PATTERN),
    search: Optional[str] = Query(None),
    nominator_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    return await NominationService.list_pool(db, "trainee", allocation, search, nominator_id, page, limit)

# ---------------------------------------------------------------------------
# Cohort membership (admin adds nominees to a cohort, then assigns mentors)
# ---------------------------------------------------------------------------

@router.post("/cohorts/{cohort_id}/mentors/allocate")
async def allocate_mentors_to_cohort(
    cohort_id: str,
    data: AllocateRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    return await NominationService.allocate_to_cohort(db, "mentor", cohort_id, data.ids)


@router.post("/cohorts/{cohort_id}/trainees/allocate")
async def allocate_trainees_to_cohort(
    cohort_id: str,
    data: AllocateRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    return await NominationService.allocate_to_cohort(db, "trainee", cohort_id, data.ids)


@router.post("/cohorts/{cohort_id}/mentors", response_model=MentorNomineeResponse)
async def add_mentor_to_cohort(
    cohort_id: str,
    data: MentorNomineeCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    return await NominationService.add_to_cohort_directly(db, "mentor", cohort_id, data, current_user)


@router.post("/cohorts/{cohort_id}/trainees", response_model=TraineeNomineeResponse)
async def add_trainee_to_cohort(
    cohort_id: str,
    data: TraineeNomineeCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    return await NominationService.add_to_cohort_directly(db, "trainee", cohort_id, data, current_user)


@router.get("/cohorts/{cohort_id}/mentors", response_model=PaginatedResponse[MentorNomineeResponse])
async def list_mentors(
    cohort_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_any_authenticated)
):
    await ensure_mentor_cohort_access(db, current_user, cohort_id)
    return await NominationService.get_cohort_mentors(db, cohort_id, current_user, page, limit)


@router.get("/cohorts/{cohort_id}/trainees", response_model=PaginatedResponse[TraineeNomineeResponse])
async def list_trainees(
    cohort_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_any_authenticated)
):
    await ensure_mentor_cohort_access(db, current_user, cohort_id)
    return await NominationService.get_cohort_trainees(db, cohort_id, current_user, page, limit)


@router.get("/cohorts/{cohort_id}/mentors/{mentor_id}/trainees")
async def get_mentor_assigned_trainees(
    cohort_id: str,
    mentor_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_any_authenticated)
):
    await ensure_mentor_cohort_access(db, current_user, cohort_id)
    if current_user.get("role") == "mentor":
        try:
            mentor_object_id = ObjectId(mentor_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Mentor not found")
        own_profile = await db.mentors.find_one({"userId": current_user["id"], "_id": mentor_object_id})
        if not own_profile:
            raise HTTPException(status_code=403, detail="You can only view trainees assigned to you")
    return await NominationService.get_mentor_trainees_in_cohort(db, cohort_id, mentor_id)


# ---------------------------------------------------------------------------
# Mentor multi-cohort assignment and editing
# ---------------------------------------------------------------------------

@router.post("/nominations/mentors/{mentor_id}/cohorts")
async def assign_mentor_cohorts(
    mentor_id: str,
    data: MentorAssignCohortsRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    """Admin assigns a mentor to additional cohorts without replacing existing ones."""
    return await NominationService.assign_mentor_cohorts(db, mentor_id, data.cohortIds)


@router.put("/nominations/mentors/{mentor_id}/cohorts")
async def update_mentor_cohorts(
    mentor_id: str,
    data: MentorCohortsUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    """Admin updates (adds/removes) a mentor's assigned cohorts."""
    return await NominationService.update_mentor_cohorts(db, mentor_id, data.cohortIds)


@router.put("/nominations/trainees/{trainee_id}/cohort")
async def update_trainee_cohort(
    trainee_id: str,
    data: TraineeCohortUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    """Admin corrects or removes a trainee's cohort assignment."""
    return await NominationService.update_trainee_cohort(db, trainee_id, data.cohortId)


@router.put("/nominations/mentors/{mentor_id}/status")
async def toggle_mentor_global_status(
    mentor_id: str,
    payload: dict,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    """Admin globally activates or deactivates a mentor account."""
    is_active = payload.get("isActive", True)
    return await NominationService.toggle_mentor_status(db, mentor_id, is_active)


@router.put("/nominations/mentors/{mentor_id}/cohort-access")
async def toggle_mentor_cohort_access(
    mentor_id: str,
    payload: dict,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin),
):
    return await NominationService.toggle_mentor_cohort_access(
        db, mentor_id, str(payload.get("cohortId", "")), bool(payload.get("isActive", True))
    )


@router.get("/nominations/by-nominator/{nominator_id}")
async def get_nominator_nominations(
    nominator_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: dict = Depends(require_admin)
):
    """Admin views all mentors and trainees nominated by a specific nominator."""
    return await NominationService.get_nominator_nominees_details(db, nominator_id)
