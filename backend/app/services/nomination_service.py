import re
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.security import get_password_hash, generate_temporary_password
from app.schemas.nominees import MentorNomineeCreate, TraineeNomineeCreate
from app.services.identity_service import claim_person_identity, release_person_identity

KIND_COLLECTION = {"mentor": "mentors", "trainee": "trainees"}


def _oid_list(ids: List[str]) -> List[ObjectId]:
    out = []
    for raw in ids or []:
        try:
            out.append(ObjectId(str(raw)))
        except Exception:
            continue
    return out


class NominationService:
    # ------------------------------------------------------------------
    # Nominations are independent of cohorts.
    #
    # A nominator submits a mentor/trainee. The record is stored with
    # cohortId = None (the "nomination pool"). Only an admin can later add
    # (allocate) pool records to a cohort, after which all the existing
    # cohort workflows (mentor assignment, progress, batches, sessions...)
    # work unchanged because they key off cohortId.
    # ------------------------------------------------------------------

    @staticmethod
    async def _ensure_not_duplicate(db: AsyncIOMotorDatabase, kind: str, email: str) -> None:
        """A person cannot be nominated twice while they are still in the pool or
        in a cohort that has not been closed."""
        collection = db[KIND_COLLECTION[kind]]
        async for existing in collection.find({"email": email}, {"cohortId": 1, "cohortIds": 1}):
            cohort_refs = existing.get("cohortIds") or ([existing.get("cohortId")] if existing.get("cohortId") else [])
            if not cohort_refs:
                blocked = True
            else:
                blocked = False
                for cohort_ref in cohort_refs:
                    try:
                        cohort = await db.cohorts.find_one({"_id": ObjectId(str(cohort_ref))}, {"status": 1})
                    except Exception:
                        cohort = None
                    if cohort and cohort.get("status") != "closed":
                        blocked = True
                        break
            if blocked:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"This person has already been nominated as a {kind}",
                    headers={"code": "DUPLICATE_NOMINATION"}
                )

    @staticmethod
    async def _create_nominee(
        db: AsyncIOMotorDatabase,
        kind: str,
        data,
        nominated_by_user: dict,
        cohort_id: Optional[str] = None,
    ) -> dict:
        doc = data.model_dump()
        doc["email"] = str(doc["email"]).lower()
        doc["employeeId"] = str(doc.get("employeeId") or "").strip()
        doc["department"] = doc.get("department") or ""
        doc["skills"] = doc.get("skills") or []
        profile_id = ObjectId()
        await claim_person_identity(
            db,
            owner_type=kind,
            owner_id=str(profile_id),
            email=doc["email"],
            employee_id=doc["employeeId"],
        )
        await NominationService._ensure_not_duplicate(db, kind, doc["email"])

        doc["cohortId"] = cohort_id
        if kind == "mentor":
            doc["cohortIds"] = [cohort_id] if cohort_id else []
        if cohort_id:
            doc["cohortAssignmentHistory"] = [{"fromCohortId": None, "toCohortId": cohort_id, "at": datetime.now(timezone.utc)}]
        doc["nominatedBy"] = nominated_by_user["id"]
        doc["createdAt"] = datetime.now(timezone.utc)
        if kind == "mentor":
            doc["userId"] = None
        else:
            doc["mentorId"] = None

        doc["_id"] = profile_id
        try:
            await db[KIND_COLLECTION[kind]].insert_one(doc)
        except Exception:
            await release_person_identity(db, str(profile_id))
            raise
        doc["id"] = str(profile_id)
        doc.pop("_id", None)
        return doc

    # ---- nominator-facing -------------------------------------------------

    @staticmethod
    def _my_view(doc: dict, kind: str) -> dict:
        return {
            "id": str(doc["_id"]) if "_id" in doc else doc["id"],
            "type": kind,
            "name": doc.get("name"),
            "email": doc.get("email"),
            "employeeId": doc.get("employeeId", ""),
            "location": doc.get("location"),
            "timezone": doc.get("timezone"),
            "experience": doc.get("experience"),
            "skills": doc.get("skills", []),
            "createdAt": doc.get("createdAt"),
        }

    @staticmethod
    async def nominate_mentor(db: AsyncIOMotorDatabase, data: MentorNomineeCreate, nominated_by_user: dict) -> dict:
        doc = await NominationService._create_nominee(db, "mentor", data, nominated_by_user)
        return NominationService._my_view(doc, "mentor")

    @staticmethod
    async def nominate_trainee(db: AsyncIOMotorDatabase, data: TraineeNomineeCreate, nominated_by_user: dict) -> dict:
        doc = await NominationService._create_nominee(db, "trainee", data, nominated_by_user)
        return NominationService._my_view(doc, "trainee")

    @staticmethod
    async def list_my_nominees(
        db: AsyncIOMotorDatabase,
        kind: str,
        current_user: dict,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 25,
    ) -> dict:
        query: dict = {"nominatedBy": current_user["id"]}
        if search:
            pattern = {"$regex": re.escape(search.strip()), "$options": "i"}
            query["$or"] = [{"name": pattern}, {"email": pattern}, {"employeeId": pattern}, {"location": pattern}]
        collection = db[KIND_COLLECTION[kind]]
        total = await collection.count_documents(query)
        skip = (page - 1) * limit
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        items = [NominationService._my_view(doc, kind) async for doc in cursor]
        pages = (total + limit - 1) // limit if limit > 0 else 1
        return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}

    # ---- admin-facing -----------------------------------------------------

    @staticmethod
    async def list_pool(
        db: AsyncIOMotorDatabase,
        kind: str,
        allocation: str = "all",
        search: Optional[str] = None,
        nominator_id: Optional[str] = None,
        page: int = 1,
        limit: int = 25,
    ) -> dict:
        """Admin view of every nominated mentor/trainee, with their nominator and
        (if any) the cohort they were added to."""
        query: dict = {}
        filters = []
        if kind == "mentor":
            if allocation == "unallocated":
                filters.append({"$or": [
                    {"cohortIds": {"$size": 0}},
                    {"cohortIds": None},
                    {"cohortIds": {"$exists": False}, "cohortId": None}
                ]})
            elif allocation == "allocated":
                filters.append({"$or": [
                    {"cohortIds.0": {"$exists": True}},
                    {"cohortId": {"$ne": None}}
                ]})
        else:
            if allocation == "unallocated":
                filters.append({"cohortId": None})
            elif allocation == "allocated":
                filters.append({"cohortId": {"$ne": None}})

        if nominator_id:
            if nominator_id in ["admin", "platform_admin", "PLATFORM_ADMIN"]:
                admin_users = await db.users.find({"role": "admin"}, {"_id": 1}).to_list(length=None)
                admin_ids = [str(u["_id"]) for u in admin_users] + [u["_id"] for u in admin_users]
                filters.append({"$or": [
                    {"nominatedBy": {"$in": admin_ids}},
                    {"nominatedBy": None},
                    {"nominatedBy": ""},
                    {"nominatedBy": {"$exists": False}}
                ]})
            else:
                nominator_ids_to_match = [nominator_id]
                try:
                    nominator_ids_to_match.append(ObjectId(nominator_id))
                except Exception:
                    pass
                filters.append({"nominatedBy": {"$in": nominator_ids_to_match}})

        if search:
            pattern = {"$regex": re.escape(search.strip()), "$options": "i"}
            filters.append({"$or": [{"name": pattern}, {"email": pattern}, {"employeeId": pattern}, {"location": pattern}]})

        if filters:
            query["$and"] = filters

        collection = db[KIND_COLLECTION[kind]]
        total = await collection.count_documents(query)
        skip = (page - 1) * limit
        docs = await collection.find(query).sort("createdAt", -1).skip(skip).limit(limit).to_list(length=None)

        nominator_ids = _oid_list([d.get("nominatedBy") for d in docs if d.get("nominatedBy")])

        all_cohort_id_strings = []
        for d in docs:
            c_ids = d.get("cohortIds") or ([str(d["cohortId"])] if d.get("cohortId") else [])
            for cid in c_ids:
                if cid and str(cid) not in all_cohort_id_strings:
                    all_cohort_id_strings.append(str(cid))
        cohort_ids = _oid_list(all_cohort_id_strings)

        user_oids = _oid_list([d.get("userId") for d in docs if d.get("userId")])

        nominator_names = {}
        admin_ids = set()
        if nominator_ids:
            async for u in db.users.find({"_id": {"$in": nominator_ids}}, {"name": 1, "role": 1}):
                nominator_names[str(u["_id"])] = "Platform Administrator" if u.get("role") == "admin" else u.get("name", "")
                if u.get("role") == "admin":
                    admin_ids.add(str(u["_id"]))
        
        cohort_dict = {}
        if cohort_ids:
            async for c in db.cohorts.find({"_id": {"$in": cohort_ids}}, {"name": 1, "status": 1}):
                cohort_dict[str(c["_id"])] = {
                    "id": str(c["_id"]),
                    "name": c.get("name", ""),
                    "status": c.get("status", "active")
                }

        user_active_map = {}
        if user_oids:
            async for u in db.users.find({"_id": {"$in": user_oids}}, {"isActive": 1}):
                user_active_map[str(u["_id"])] = u.get("isActive", True)

        items = []
        for d in docs:
            c_ids = [str(cid) for cid in (d.get("cohortIds") or ([d.get("cohortId")] if d.get("cohortId") else [])) if cid]
            assigned_cohorts = [cohort_dict[cid] for cid in c_ids if cid in cohort_dict]
            cohort_names = [c["name"] for c in assigned_cohorts]
            first_cohort_id = c_ids[0] if c_ids else None
            first_cohort_name = cohort_names[0] if cohort_names else None

            is_active = d.get("isActive", True)
            if d.get("userId") and str(d["userId"]) in user_active_map:
                is_active = user_active_map[str(d["userId"])] and is_active

            item = {
                "id": str(d["_id"]),
                "type": kind,
                "name": d.get("name"),
                "email": d.get("email"),
                "employeeId": d.get("employeeId", ""),
                "department": d.get("department", ""),
                "location": d.get("location"),
                "timezone": d.get("timezone"),
                "experience": d.get("experience"),
                "skills": d.get("skills", []),
                "nominatedBy": str(d["nominatedBy"]) if d.get("nominatedBy") else None,
                "nominatorName": "Platform Administrator" if not d.get("nominatedBy") or str(d.get("nominatedBy")) in admin_ids else nominator_names.get(str(d.get("nominatedBy")), "Unknown nominator"),
                "cohortId": first_cohort_id,
                "cohortName": first_cohort_name,
                "cohortIds": c_ids,
                "cohortNames": cohort_names,
                "assignedCohorts": assigned_cohorts,
                "allocationStatus": "allocated" if c_ids else "unallocated",
                "isActive": bool(is_active),
                "isAccountActive": bool(is_active),
                "createdAt": d.get("createdAt"),
            }
            if kind == "mentor":
                item["isLoginActive"] = bool(d.get("userId"))
            else:
                item["mentorId"] = d.get("mentorId")
                item["traineeStatus"] = d.get("status")
            items.append(item)
        pages = (total + limit - 1) // limit if limit > 0 else 1
        return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}

    @staticmethod
    async def allocate_to_cohort(
        db: AsyncIOMotorDatabase,
        kind: str,
        cohort_id: str,
        ids: List[str],
    ) -> dict:
        """Admin adds nominees from the pool to a cohort."""
        try:
            cohort = await db.cohorts.find_one({"_id": ObjectId(cohort_id)})
        except Exception:
            cohort = None
        if not cohort:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cohort not found",
                headers={"code": "NOT_FOUND"}
            )
        if cohort.get("status") == "closed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This cohort is closed and cannot accept new members",
                headers={"code": "COHORT_CLOSED"}
            )
        if not ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one person to add",
                headers={"code": "NO_SELECTION"}
            )

        collection = db[KIND_COLLECTION[kind]]
        allocated, skipped = 0, []
        for raw_id in ids:
            try:
                object_id = ObjectId(str(raw_id))
            except Exception:
                skipped.append({"id": str(raw_id), "reason": "Invalid ID"})
                continue
            doc = await collection.find_one({"_id": object_id})
            if not doc:
                skipped.append({"id": str(raw_id), "reason": "Not found"})
            elif kind == "mentor":
                existing_cohorts = [str(c) for c in (doc.get("cohortIds") or ([doc.get("cohortId")] if doc.get("cohortId") else []))]
                if cohort_id in existing_cohorts:
                    skipped.append({"id": str(raw_id), "name": doc.get("name"), "reason": "Already assigned to this cohort"})
                else:
                    new_cohorts = list(dict.fromkeys(existing_cohorts + [cohort_id]))
                    await collection.update_one(
                        {"_id": object_id},
                        {"$set": {"cohortIds": new_cohorts, "cohortId": doc.get("cohortId") or cohort_id}, "$push": {"cohortAssignmentHistory": {"action": "assigned", "cohortId": cohort_id, "at": datetime.now(timezone.utc)}}}
                    )
                    allocated += 1
            else:
                if doc.get("cohortId"):
                    skipped.append({"id": str(raw_id), "name": doc.get("name"), "reason": "Already added to a cohort"})
                else:
                    await collection.update_one(
                        {"_id": object_id, "cohortId": None},
                        {"$set": {"cohortId": cohort_id}, "$push": {"cohortAssignmentHistory": {"fromCohortId": None, "toCohortId": cohort_id, "at": datetime.now(timezone.utc)}}}
                    )
                    allocated += 1
        return {"allocated": allocated, "skipped": skipped, "cohortId": cohort_id}

    @staticmethod
    async def add_to_cohort_directly(
        db: AsyncIOMotorDatabase,
        kind: str,
        cohort_id: str,
        data,
        admin_user: dict,
    ) -> dict:
        """Admin creates a mentor/trainee straight into a cohort (skips the pool)."""
        try:
            cohort = await db.cohorts.find_one({"_id": ObjectId(cohort_id)})
        except Exception:
            cohort = None
        if not cohort:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cohort not found",
                headers={"code": "NOT_FOUND"}
            )
        if kind == "mentor":
            existing_mentor = await db.mentors.find_one({"email": str(data.email).lower()})
            if existing_mentor:
                existing_cohorts = [str(c) for c in (existing_mentor.get("cohortIds") or ([existing_mentor.get("cohortId")] if existing_mentor.get("cohortId") else []))]
                if cohort_id in existing_cohorts:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This mentor is already assigned to this cohort",
                        headers={"code": "DUPLICATE_ASSIGNMENT"}
                    )
                new_cohorts = list(dict.fromkeys(existing_cohorts + [cohort_id]))
                await db.mentors.update_one(
                    {"_id": existing_mentor["_id"]},
                    {"$set": {"cohortIds": new_cohorts, "cohortId": existing_mentor.get("cohortId") or cohort_id}, "$push": {"cohortAssignmentHistory": {"action": "assigned", "cohortId": cohort_id, "at": datetime.now(timezone.utc)}}}
                )
                existing_mentor["id"] = str(existing_mentor["_id"])
                existing_mentor["cohortId"] = cohort_id
                existing_mentor["cohortIds"] = new_cohorts
                existing_mentor["nominatorName"] = admin_user.get("name", "Platform Administrator")
                existing_mentor["isLoginActive"] = bool(existing_mentor.get("userId"))
                existing_mentor["assignedTraineesCount"] = 0
                existing_mentor["assignedTrainees"] = []
                existing_mentor.pop("_id", None)
                return existing_mentor

        doc = await NominationService._create_nominee(db, kind, data, admin_user, cohort_id=cohort_id)
        doc["nominatorName"] = admin_user.get("name", "Platform Administrator")
        if kind == "mentor":
            doc["cohortIds"] = [cohort_id]
            doc["isLoginActive"] = False
            doc["assignedTraineesCount"] = 0
            doc["assignedTrainees"] = []
            await db.mentors.update_one({"_id": ObjectId(doc["id"])}, {"$set": {"cohortIds": [cohort_id]}})
        else:
            doc["mentorName"] = None
            doc["percentComplete"] = 0.0
        return doc

    # ---- cohort members (admin / mentor) ----------------------------------

    @staticmethod
    async def get_cohort_mentors(
        db: AsyncIOMotorDatabase,
        cohort_id: str,
        current_user: dict,
        page: int = 1,
        limit: int = 50
    ) -> dict:
        query = {"$or": [{"cohortIds": cohort_id}, {"cohortId": cohort_id}]}

        skip = (page - 1) * limit
        cursor = db.mentors.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        items = []
        async for doc in cursor:
            mentor_id = str(doc["_id"])
            doc["id"] = mentor_id
            doc["isLoginActive"] = bool(doc.get("userId"))
            if doc.get("userId"):
                try:
                    mentor_user = await db.users.find_one(
                        {"_id": ObjectId(doc["userId"])},
                        {"firstLoginPasswordReset": 1, "isActive": 1},
                    )
                    doc["firstLoginPasswordReset"] = bool(mentor_user and mentor_user.get("firstLoginPasswordReset", False))
                    doc["isAccountActive"] = bool(
                        doc.get("isActive", True)
                        and mentor_user
                        and mentor_user.get("isActive", True)
                    )
                except Exception:
                    doc["firstLoginPasswordReset"] = False
                    doc["isAccountActive"] = False
            else:
                doc["firstLoginPasswordReset"] = False
                doc["isAccountActive"] = bool(doc.get("isActive", True))
            
            # Fetch assigned trainees for this mentor
            trainees_cursor = db.trainees.find({"mentorId": mentor_id, "cohortId": cohort_id}).sort("name", 1)
            assigned_trainees = []
            async for t in trainees_cursor:
                t_id = str(t["_id"])
                prog = await db.progress.find_one({"traineeId": t_id})
                pct = prog.get("percentComplete", 0.0) if prog else 0.0
                assigned_trainees.append({
                    "id": t_id,
                    "name": t.get("name"),
                    "email": t.get("email"),
                    "employeeId": t.get("employeeId", ""),
                    "department": t.get("department", ""),
                    "percentComplete": pct,
                    "status": t.get("status"),
                    "location": t.get("location"),
                    "droppedOutAt": t.get("droppedOutAt"),
                    "dropoutReason": t.get("dropoutReason"),
                })
            doc["assignedTrainees"] = assigned_trainees
            doc["assignedTraineesCount"] = sum(1 for trainee in assigned_trainees if trainee.get("status") != "dropped_out")

            # Fetch nominator name (admission info)
            if doc.get("nominatedBy"):
                try:
                    nominator = await db.users.find_one({"_id": ObjectId(doc["nominatedBy"])})
                    doc["nominatorName"] = nominator["name"] if nominator else "Platform Administrator"
                except Exception:
                    doc["nominatorName"] = "Platform Administrator"
            else:
                doc["nominatorName"] = "Platform Administrator"

            doc["employeeId"] = doc.get("employeeId", "")
            doc["cohortId"] = str(cohort_id)
            doc["isCohortAccessActive"] = (doc.get("cohortAccess") or {}).get(str(cohort_id), True)
            c_ids = [str(cid) for cid in (doc.get("cohortIds") or ([doc.get("cohortId")] if doc.get("cohortId") else [])) if cid]
            doc["cohortIds"] = c_ids
            if doc.get("nominatedBy"):
                doc["nominatedBy"] = str(doc["nominatedBy"])
            if doc.get("userId"):
                doc["userId"] = str(doc["userId"])
            doc.pop("_id", None)
            items.append(doc)

        total = await db.mentors.count_documents(query)
        pages = (total + limit - 1) // limit if limit > 0 else 1
        return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}

    @staticmethod
    async def assign_mentor_cohorts(
        db: AsyncIOMotorDatabase,
        mentor_id: str,
        cohort_ids: List[str],
    ) -> dict:
        """Assign mentor to additional cohorts without replacing existing assignments."""
        try:
            mentor = await db.mentors.find_one({"_id": ObjectId(mentor_id)})
        except Exception:
            mentor = None
        if not mentor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found")

        clean_cohort_ids = []
        for raw in cohort_ids:
            try:
                c = await db.cohorts.find_one({"_id": ObjectId(str(raw))})
                if c and c.get("status") != "closed":
                    clean_cohort_ids.append(str(c["_id"]))
            except Exception:
                continue

        existing = [str(c) for c in (mentor.get("cohortIds") or ([mentor.get("cohortId")] if mentor.get("cohortId") else [])) if c]
        combined = list(dict.fromkeys(existing + clean_cohort_ids))

        await db.mentors.update_one(
            {"_id": ObjectId(mentor_id)},
            {"$set": {
                "cohortIds": combined,
                "cohortId": combined[0] if combined else None
            }, "$push": {"cohortAssignmentHistory": {"action": "assigned", "cohortIds": clean_cohort_ids, "at": datetime.now(timezone.utc)}}}
        )
        return {
            "mentorId": mentor_id,
            "cohortIds": combined,
            "allocated": len(clean_cohort_ids),
            "totalCohorts": len(combined)
        }

    @staticmethod
    async def update_mentor_cohorts(
        db: AsyncIOMotorDatabase,
        mentor_id: str,
        cohort_ids: List[str],
    ) -> dict:
        """Edit mentor cohort assignments (add or remove cohorts). Preserves historical data."""
        try:
            mentor = await db.mentors.find_one({"_id": ObjectId(mentor_id)})
        except Exception:
            mentor = None
        if not mentor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found")

        clean_cohort_ids = []
        for raw in cohort_ids:
            try:
                c = await db.cohorts.find_one({"_id": ObjectId(str(raw))})
                if c:
                    clean_cohort_ids.append(str(c["_id"]))
            except Exception:
                continue

        clean_cohort_ids = list(dict.fromkeys(clean_cohort_ids))

        await db.mentors.update_one(
            {"_id": ObjectId(mentor_id)},
            {"$set": {
                "cohortIds": clean_cohort_ids,
                "cohortId": clean_cohort_ids[0] if clean_cohort_ids else None
            }, "$push": {"cohortAssignmentHistory": {"action": "updated", "previousCohortIds": [str(c) for c in (mentor.get("cohortIds") or ([mentor.get("cohortId")] if mentor.get("cohortId") else [])) if c], "cohortIds": clean_cohort_ids, "at": datetime.now(timezone.utc)}}}
        )
        return {
            "mentorId": mentor_id,
            "cohortIds": clean_cohort_ids,
            "success": True
        }

    @staticmethod
    async def update_trainee_cohort(
        db: AsyncIOMotorDatabase,
        trainee_id: str,
        cohort_id: Optional[str] = None,
    ) -> dict:
        """Edit trainee's assigned cohort or remove assignment. Preserves progress and feedback history."""
        try:
            trainee = await db.trainees.find_one({"_id": ObjectId(trainee_id)})
        except Exception:
            trainee = None
        if not trainee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainee not found")

        current_cohort_id = str(trainee.get("cohortId")) if trainee.get("cohortId") else None

        if cohort_id:
            try:
                cohort = await db.cohorts.find_one({"_id": ObjectId(cohort_id)})
            except Exception:
                cohort = None
            if not cohort:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")
            if cohort.get("status") == "closed" and str(cohort_id) != current_cohort_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This cohort is closed and cannot accept trainees")

            update_data = {"cohortId": cohort_id}
            if current_cohort_id and current_cohort_id != cohort_id:
                mentor_id = trainee.get("mentorId")
                if mentor_id:
                    mentor = await db.mentors.find_one({
                        "_id": ObjectId(str(mentor_id)),
                        "$or": [{"cohortIds": cohort_id}, {"cohortId": cohort_id}]
                    })
                    if not mentor:
                        update_data["mentorId"] = None
            await db.trainees.update_one({"_id": ObjectId(trainee_id)}, {"$set": update_data, "$push": {"cohortAssignmentHistory": {"fromCohortId": current_cohort_id, "toCohortId": cohort_id, "at": datetime.now(timezone.utc)}}})
        else:
            await db.trainees.update_one(
                {"_id": ObjectId(trainee_id)},
                {"$set": {"cohortId": None, "mentorId": None}, "$push": {"cohortAssignmentHistory": {"fromCohortId": current_cohort_id, "toCohortId": None, "at": datetime.now(timezone.utc)}}}
            )

        updated = await db.trainees.find_one({"_id": ObjectId(trainee_id)})
        return {
            "id": trainee_id,
            "cohortId": updated.get("cohortId"),
            "mentorId": updated.get("mentorId"),
            "success": True
        }

    @staticmethod
    async def toggle_mentor_status(
        db: AsyncIOMotorDatabase,
        mentor_id: str,
        is_active: bool,
    ) -> dict:
        """Globally activate or deactivate a mentor."""
        try:
            mentor = await db.mentors.find_one({"_id": ObjectId(mentor_id)})
        except Exception:
            mentor = None
        if not mentor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mentor not found")

        await db.mentors.update_one(
            {"_id": ObjectId(mentor_id)},
            {"$set": {"isActive": is_active}}
        )

        user_id = mentor.get("userId")
        if user_id:
            try:
                await db.users.update_one(
                    {"_id": ObjectId(str(user_id))},
                    {"$set": {"isActive": is_active}}
                )
            except Exception:
                pass

        return {
            "mentorId": mentor_id,
            "isActive": is_active,
            "success": True
        }

    @staticmethod
    async def toggle_mentor_cohort_access(db: AsyncIOMotorDatabase, mentor_id: str, cohort_id: str, is_active: bool) -> dict:
        """Toggle cohort-scoped access without changing the mentor's global account."""
        try:
            mentor = await db.mentors.find_one({"_id": ObjectId(mentor_id)})
        except Exception:
            mentor = None
        if not mentor:
            raise HTTPException(status_code=404, detail="Mentor not found")
        assigned = [str(cid) for cid in (mentor.get("cohortIds") or ([mentor.get("cohortId")] if mentor.get("cohortId") else [])) if cid]
        if str(cohort_id) not in assigned:
            raise HTTPException(status_code=404, detail="Mentor is not assigned to this cohort")
        await db.mentors.update_one(
            {"_id": mentor["_id"]},
            {"$set": {f"cohortAccess.{cohort_id}": bool(is_active)}, "$push": {"cohortAccessHistory": {"cohortId": str(cohort_id), "isActive": bool(is_active), "at": datetime.now(timezone.utc)}}},
        )
        return {"mentorId": mentor_id, "cohortId": str(cohort_id), "isActive": bool(is_active), "success": True}

    @staticmethod
    async def get_nominator_nominees_details(
        db: AsyncIOMotorDatabase,
        nominator_id: str,
    ) -> dict:
        """Fetch all mentors and trainees nominated by a specific nominator."""
        try:
            user = await db.users.find_one({"_id": ObjectId(nominator_id)})
        except Exception:
            user = None

        nominator_data = {
            "id": nominator_id,
            "name": user.get("name", "Unknown") if user else "Unknown",
            "email": user.get("email", "") if user else "",
            "employeeId": user.get("employeeId", "") if user else "",
            "isActive": user.get("isActive", True) if user else True,
        }

        nom_ids = [nominator_id]
        try:
            nom_ids.append(ObjectId(nominator_id))
        except Exception:
            pass

        mentors_cursor = db.mentors.find({"nominatedBy": {"$in": nom_ids}}).sort("createdAt", -1)
        mentors_list = []
        async for m in mentors_cursor:
            c_ids = [str(cid) for cid in (m.get("cohortIds") or ([m.get("cohortId")] if m.get("cohortId") else [])) if cid]
            cohort_names = []
            if c_ids:
                async for c in db.cohorts.find({"_id": {"$in": _oid_list(c_ids)}}, {"name": 1}):
                    cohort_names.append(c.get("name", ""))
            mentors_list.append({
                "id": str(m["_id"]),
                "name": m.get("name"),
                "employeeId": m.get("employeeId", ""),
                "email": m.get("email"),
                "location": m.get("location"),
                "createdAt": m.get("createdAt"),
                "status": m.get("status", "approved"),
                "assignedCohorts": cohort_names,
                "cohortCount": len(cohort_names),
            })

        trainees_cursor = db.trainees.find({"nominatedBy": {"$in": nom_ids}}).sort("createdAt", -1)
        trainees_list = []
        async for t in trainees_cursor:
            cohort_name = None
            if t.get("cohortId"):
                try:
                    c = await db.cohorts.find_one({"_id": ObjectId(str(t["cohortId"]))}, {"name": 1})
                    cohort_name = c.get("name") if c else None
                except Exception:
                    cohort_name = None
            trainees_list.append({
                "id": str(t["_id"]),
                "name": t.get("name"),
                "employeeId": t.get("employeeId", ""),
                "email": t.get("email"),
                "location": t.get("location"),
                "createdAt": t.get("createdAt"),
                "status": t.get("status", "approved"),
                "cohortName": cohort_name,
            })

        return {
            "nominator": nominator_data,
            "mentors": mentors_list,
            "trainees": trainees_list,
            "totalMentors": len(mentors_list),
            "totalTrainees": len(trainees_list),
        }

    @staticmethod
    async def activate_mentor_login(
        db: AsyncIOMotorDatabase,
        mentor_id: str
    ) -> dict:
        try:
            mentor = await db.mentors.find_one({"_id": ObjectId(mentor_id)})
        except Exception:
            mentor = None
        if not mentor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mentor nominee not found",
                headers={"code": "NOT_FOUND"}
            )

        temporary_password = generate_temporary_password()

        # Check if a user with this email already exists
        existing_user = await db.users.find_one({"email": mentor["email"]})
        if existing_user:
            user_id = str(existing_user["_id"])
            # Update password and ensure role is mentor
            await db.users.update_one(
                {"_id": existing_user["_id"]},
                {"$set": {
                    "passwordHash": get_password_hash(temporary_password),
                    "role": "mentor",
                    "firstLoginPasswordReset": True,
                    "temporaryPassword": None,
                }}
            )
        else:
            # Create new user
            user_doc = {
                "name": mentor["name"],
                "email": mentor["email"],
                "passwordHash": get_password_hash(temporary_password),
                "role": "mentor",
                "isActive": bool(mentor.get("isActive", True)),
                "firstLoginPasswordReset": True,
                "createdAt": datetime.now(timezone.utc)
            }
            res = await db.users.insert_one(user_doc)
            user_id = str(res.inserted_id)

        # Update mentor nominee record with userId
        await db.mentors.update_one(
            {"_id": ObjectId(mentor_id)},
            {"$set": {"userId": user_id}}
        )

        return {
            "mentorId": mentor_id,
            "userId": user_id,
            "temporaryPassword": temporary_password,
            "firstLoginPasswordReset": True,
        }

    @staticmethod
    async def get_cohort_trainees(
        db: AsyncIOMotorDatabase,
        cohort_id: str,
        current_user: dict,
        page: int = 1,
        limit: int = 50
    ) -> dict:
        query = {"cohortId": cohort_id}

        skip = (page - 1) * limit
        cursor = db.trainees.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        items = []
        async for doc in cursor:
            trainee_id = str(doc["_id"])
            doc["id"] = trainee_id
            
            # Fetch mentor name if assigned
            mentor_id = doc.get("mentorId")
            if mentor_id:
                try:
                    mentor = await db.mentors.find_one({"_id": ObjectId(mentor_id)})
                    doc["mentorName"] = mentor["name"] if mentor else None
                except Exception:
                    doc["mentorName"] = None
            else:
                doc["mentorName"] = None

            # Fetch nominator name
            if doc.get("nominatedBy"):
                try:
                    nominator = await db.users.find_one({"_id": ObjectId(doc["nominatedBy"])})
                    doc["nominatorName"] = nominator["name"] if nominator else "Unknown"
                except Exception:
                    doc["nominatorName"] = "Unknown"
            else:
                doc["nominatorName"] = "Admin"

            # Fetch percentComplete from progress
            prog = await db.progress.find_one({"traineeId": trainee_id})
            doc["percentComplete"] = prog.get("percentComplete", 0.0) if prog else 0.0

            doc.pop("_id", None)
            items.append(doc)

        total = await db.trainees.count_documents(query)
        pages = (total + limit - 1) // limit if limit > 0 else 1
        return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}

    @staticmethod
    async def get_mentor_trainees_in_cohort(
        db: AsyncIOMotorDatabase,
        cohort_id: str,
        mentor_id: str
    ) -> list:
        """Fetch all trainees assigned to a specific mentor within a cohort."""
        cursor = db.trainees.find({
            "cohortId": cohort_id,
            "mentorId": mentor_id
        }).sort("name", 1)

        items = []
        async for doc in cursor:
            trainee_id = str(doc["_id"])
            doc["id"] = trainee_id
            doc.pop("_id", None)

            # Fetch progress
            prog = await db.progress.find_one({"traineeId": trainee_id})
            doc["percentComplete"] = prog.get("percentComplete", 0.0) if prog else 0.0

            items.append(doc)

        return items
