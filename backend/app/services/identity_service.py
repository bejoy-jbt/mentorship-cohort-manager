"""Global identity uniqueness for mentor, trainee, and nominator records."""
import re
from typing import Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError


def _normalize_email(value: str) -> str:
    return value.strip().casefold()


def _normalize_employee_id(value: str) -> str:
    return value.strip().casefold()


async def backfill_existing_person_identity_claims(db: AsyncIOMotorDatabase) -> None:
    """Claim existing identities once, retaining legacy records unchanged.

    Mentor login users linked to a mentor profile are not treated as a second
    person; the profile is the identity owner. Legacy collisions are left in
    place, but their first claim blocks creating another duplicate.
    """
    linked_user_ids = set()
    async for mentor in db.mentors.find({"userId": {"$exists": True, "$ne": None}}, {"userId": 1}):
        linked_user_ids.add(str(mentor.get("userId")))

    records = []
    for collection_name, owner_type, query in (
        ("mentors", "mentor", {}),
        ("trainees", "trainee", {}),
        ("users", "nominator", {"role": "nominator"}),
        ("users", "user", {"role": {"$in": ["mentor", "trainee"]}}),
    ):
        async for record in db[collection_name].find(query, {"email": 1, "employeeId": 1}):
            owner_id = str(record["_id"])
            if collection_name == "users" and owner_id in linked_user_ids:
                continue
            records.append((owner_type, owner_id, record))

    for owner_type, owner_id, record in records:
        for field, normalizer in (("email", _normalize_email), ("employeeId", _normalize_employee_id)):
            value = record.get(field)
            if not isinstance(value, str) or not value.strip():
                continue
            await db.personIdentityClaims.update_one(
                {"claim": f"{field}:{normalizer(value)}"},
                {"$setOnInsert": {"claim": f"{field}:{normalizer(value)}", "ownerType": owner_type, "ownerId": owner_id}},
                upsert=True,
            )


def _duplicate_error(field: str, employee_id: str = "") -> HTTPException:
    if field == "email":
        detail, code = "This email is already used by another person", "EMAIL_EXISTS"
    else:
        trimmed = (employee_id or "").strip()
        detail = (
            f"Employee ID {trimmed} already exists. Please use a unique Employee ID."
            if trimmed
            else "This employee ID is already used by another person"
        )
        code = "EMPLOYEE_ID_EXISTS"
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail, headers={"code": code})


def _case_insensitive_exact_regex(value: str) -> dict:
    return {"$regex": rf"^\s*{re.escape(value.strip())}\s*$", "$options": "i"}


async def is_employee_id_taken(db: AsyncIOMotorDatabase, employee_id: str) -> bool:
    """Check globally across identity claims and person collections (case-insensitive, trimmed)."""
    trimmed = (employee_id or "").strip()
    if not trimmed:
        return False
    employee_key = _normalize_employee_id(trimmed)
    if await db.personIdentityClaims.find_one({"claim": f"employeeId:{employee_key}"}, {"_id": 1}):
        return True
    pattern = _case_insensitive_exact_regex(trimmed)
    for collection_name in ("trainees", "mentors", "users"):
        if await db[collection_name].find_one({"employeeId": pattern}, {"_id": 1}):
            return True
    return False


async def claim_person_identity(
    db: AsyncIOMotorDatabase,
    *,
    owner_type: str,
    owner_id: str,
    email: str,
    employee_id: str,
    ignore_owner: Optional[tuple[str, str]] = None,
) -> list[str]:
    """Atomically reserve normalized email and employee ID claims.

    Existing documents are checked as a compatibility guard before the unique
    claim writes, so old databases are protected even before migration has
    populated all claims.
    """
    email_key = _normalize_email(email)
    employee_key = _normalize_employee_id(employee_id)
    if not email_key or not employee_key:
        raise HTTPException(status_code=422, detail="Email and employee ID are required")

    await backfill_existing_person_identity_claims(db)

    linked_mentor_user_ids = set()
    async for mentor in db.mentors.find({"userId": {"$exists": True, "$ne": None}}, {"userId": 1}):
        linked_mentor_user_ids.add(str(mentor.get("userId")))

    email_match = _case_insensitive_exact_regex(email_key)
    employee_match = _case_insensitive_exact_regex(employee_id)
    searches = (
        ("mentors", "mentor", "email", email_match),
        ("mentors", "mentor", "employeeId", employee_match),
        ("trainees", "trainee", "email", email_match),
        ("trainees", "trainee", "employeeId", employee_match),
        ("users", "nominator", "email", email_match),
        ("users", "nominator", "employeeId", employee_match),
        ("users", "user", "email", email_match),
        ("users", "user", "employeeId", employee_match),
        ("users", "admin", "email", email_match),
    )
    for collection_name, record_type, field, value in searches:
        if collection_name == "users" and record_type == "user":
            query = {"role": {"$in": ["mentor", "trainee"]}, field: value}
        elif collection_name == "users" and record_type == "admin":
            query = {"role": "admin", field: value}
        elif collection_name == "users":
            query = {"role": "nominator", field: value}
        else:
            query = {field: value}
        async for record in db[collection_name].find(query, {"_id": 1, "userId": 1}):
            record_id = str(record["_id"])
            if collection_name == "users" and record_id in linked_mentor_user_ids:
                continue
            if ignore_owner == (record_type, record_id):
                continue
            raise _duplicate_error(field, employee_id)

    claims = [f"email:{email_key}", f"employeeId:{employee_key}"]
    inserted = []
    try:
        for claim in claims:
            await db.personIdentityClaims.insert_one({
                "claim": claim,
                "ownerType": owner_type,
                "ownerId": str(owner_id),
            })
            inserted.append(claim)
    except DuplicateKeyError as exc:
        if inserted:
            await db.personIdentityClaims.delete_many({"claim": {"$in": inserted}, "ownerId": str(owner_id)})
        duplicate_claim = (exc.details or {}).get("keyValue", {}).get("claim", "")
        if not duplicate_claim:
            for claim in claims:
                if await db.personIdentityClaims.find_one({"claim": claim}, {"_id": 1}):
                    duplicate_claim = claim
                    break
        field = "employeeId" if duplicate_claim.startswith("employeeId:") else "email"
        raise _duplicate_error(field, employee_id)
    except Exception:
        if inserted:
            await db.personIdentityClaims.delete_many({"claim": {"$in": inserted}, "ownerId": str(owner_id)})
        raise
    return claims


async def release_person_identity(db: AsyncIOMotorDatabase, owner_id: str) -> None:
    await db.personIdentityClaims.delete_many({"ownerId": str(owner_id)})
