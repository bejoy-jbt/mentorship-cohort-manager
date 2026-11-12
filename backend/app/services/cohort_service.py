from datetime import date, datetime, timezone
from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.schemas.cohorts import (
    CohortCreate, CohortUpdate, CohortStatus, CohortConfigureRequest,
    ExtendTimelineRequest, UpdatePlanRequest, UpdateFeedbackFormRequest
)


def _parse_iso_date(value: str, field_label: str) -> date:
    """Parse a strict YYYY-MM-DD date string."""
    raw = (value or "").strip()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_label} is required",
            headers={"code": "INVALID_COHORT_DATES"},
        )
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_label} must be in YYYY-MM-DD format",
            headers={"code": "INVALID_COHORT_DATES"},
        )


def validate_cohort_dates(start_str: str, end_str: str, *, require_future_start: bool) -> tuple[str, str]:
    """Validate cohort start/end dates and return normalized YYYY-MM-DD strings."""
    start_dt = _parse_iso_date(start_str, "Start date")
    end_dt = _parse_iso_date(end_str, "End date")
    if require_future_start and start_dt < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be in the past when creating a new cohort",
            headers={"code": "INVALID_COHORT_DATES"},
        )
    if end_dt <= start_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date must be later than start date",
            headers={"code": "INVALID_COHORT_DATES"},
        )
    return start_dt.isoformat(), end_dt.isoformat()


class CohortService:
    @staticmethod
    async def delete_cohort(db: AsyncIOMotorDatabase, cohort_id: str) -> bool:
        try:
            cohort_oid = ObjectId(cohort_id)
        except Exception:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")

        cohort = await db.cohorts.find_one({"_id": cohort_oid})
        if not cohort:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort not found")

        # Cohort references exist as strings in legacy records and ObjectIds in newer ones.
        cohort_values = [cohort_id, cohort_oid]
        cohort_query = {"cohortId": {"$in": cohort_values}}
        mentors = await db.mentors.find(cohort_query).to_list(None)
        trainees = await db.trainees.find(cohort_query).to_list(None)
        batches = await db.batches.find(cohort_query, {"_id": 1}).to_list(None)

        batch_oids = [batch["_id"] for batch in batches]
        sessions = await db.sessions.find({"batchId": {"$in": batch_oids}}, {"_id": 1}).to_list(None) if batch_oids else []
        session_oids = [session["_id"] for session in sessions]
        if session_oids:
            await db.attendance.delete_many({"sessionId": {"$in": session_oids + [str(item) for item in session_oids]}})
            await db.sessions.delete_many({"_id": {"$in": session_oids}})

        trainee_refs = [value for trainee in trainees for value in (trainee["_id"], str(trainee["_id"]))]
        related_queries = [{"cohortId": {"$in": cohort_values}}]
        if trainee_refs:
            related_queries.append({"traineeId": {"$in": trainee_refs}})
        await db.progress.delete_many({"$or": related_queries})
        await db.feedbackResponses.delete_many({"$or": related_queries})
        if batch_oids:
            await db.batches.delete_many({"_id": {"$in": batch_oids}})

        await db.trainees.delete_many(cohort_query)
        await db.mentors.delete_many(cohort_query)
        await db.cohortTrainingPlans.delete_many(cohort_query)
        await db.cohortFeedbackForms.delete_many(cohort_query)

        # Remove mentor accounts only when they have no remaining mentor profile elsewhere.
        mentor_user_ids = {mentor.get("userId") for mentor in mentors if mentor.get("userId")}
        for user_id in mentor_user_ids:
            try:
                user_oid = ObjectId(str(user_id))
            except Exception:
                continue
            other_profile = await db.mentors.find_one({"userId": str(user_id)})
            if not other_profile:
                other_profile = await db.mentors.find_one({"userId": user_oid})
            if not other_profile:
                await db.users.delete_one({"_id": user_oid, "role": "mentor"})

        await db.cohorts.delete_one({"_id": cohort_oid})
        return True

    @staticmethod
    async def create_cohort(db: AsyncIOMotorDatabase, data: CohortCreate, created_by: str) -> dict:
        normalized_start, normalized_end = validate_cohort_dates(
            data.startDate, data.endDate, require_future_start=True
        )
        raw_data = data.model_dump()
        raw_data["startDate"] = normalized_start
        raw_data["endDate"] = normalized_end
        talentnext_explicitly_set = "talentnextCourses" in data.model_fields_set
        training_tpl_id = raw_data.pop("trainingTemplateId", None)
        feedback_tpl_id = raw_data.pop("feedbackTemplateId", None)
        custom_plan = raw_data.pop("customTrainingPlan", None)
        custom_form = raw_data.pop("customFeedbackForm", None)
        raw_data.pop("totalWeeks", None)
        
        raw_data["status"] = CohortStatus.DRAFT.value
        raw_data["trainingPlanId"] = None
        raw_data["feedbackFormId"] = None
        raw_data["createdBy"] = created_by
        raw_data["createdAt"] = datetime.now(timezone.utc)
        
        result = await db.cohorts.insert_one(raw_data)
        cohort_id = str(result.inserted_id)
        raw_data["id"] = cohort_id

        # 1. Handle training plan creation if provided
        new_plan_id = None
        plan_weeks = []
        if custom_plan:
            raw_data["talentnextCourses"] = custom_plan.get("talentnextCourses", raw_data.get("talentnextCourses", []))
            await db.cohorts.update_one(
                {"_id": ObjectId(cohort_id)},
                {"$set": {"talentnextCourses": raw_data["talentnextCourses"]}}
            )
            for w in custom_plan.get("weeks", []):
                courses = []
                for c in w.get("courses", []):
                    courses.append({
                        "courseId": str(ObjectId()),
                        "title": c.get("title"),
                        "description": c.get("description", ""),
                        "durationHrs": c.get("durationHrs", 1.0)
                    })
                plan_weeks.append({
                    "weekNumber": w.get("weekNumber"),
                    "title": w.get("title"),
                    "courses": courses
                })
            plan_doc = {
                "cohortId": cohort_id,
                "name": custom_plan.get("name", f"{raw_data['name']} Plan"),
                "totalWeeks": custom_plan.get("totalWeeks", len(plan_weeks)),
                "weeks": plan_weeks,
                "talentnextCourses": custom_plan.get("talentnextCourses", raw_data.get("talentnextCourses", [])),
                "createdAt": datetime.now(timezone.utc)
            }
            res_p = await db.cohortTrainingPlans.insert_one(plan_doc)
            new_plan_id = str(res_p.inserted_id)
        elif training_tpl_id:
            tpl = await db.trainingTemplates.find_one({"_id": ObjectId(training_tpl_id)})
            if tpl:
                # Preserve explicitly provided TalentNext selections; otherwise inherit template defaults.
                if not talentnext_explicitly_set:
                    raw_data["talentnextCourses"] = tpl.get("talentnextCourses", [])
                await db.cohorts.update_one(
                    {"_id": ObjectId(cohort_id)},
                    {"$set": {"talentnextCourses": raw_data["talentnextCourses"]}}
                )
                for w in tpl.get("weeks", []):
                    courses = []
                    for c in w.get("courses", []):
                        courses.append({
                            "courseId": str(ObjectId()),
                            "title": c.get("title"),
                            "description": c.get("description", ""),
                            "durationHrs": c.get("durationHrs", 1.0)
                        })
                    plan_weeks.append({
                        "weekNumber": w.get("weekNumber"),
                        "title": w.get("title"),
                        "courses": courses
                    })
                plan_doc = {
                    "cohortId": cohort_id,
                    "name": tpl.get("name"),
                    "totalWeeks": tpl.get("totalWeeks", len(plan_weeks)),
                    "weeks": plan_weeks,
                    "talentnextCourses": tpl.get("talentnextCourses", []),
                    "createdAt": datetime.now(timezone.utc)
                }
                res_p = await db.cohortTrainingPlans.insert_one(plan_doc)
                new_plan_id = str(res_p.inserted_id)

        # 2. Handle feedback form creation if provided
        new_form_id = None
        if custom_form:
            form_doc = {
                "cohortId": cohort_id,
                "name": custom_form.get("name", f"{raw_data['name']} Feedback Form"),
                "fields": custom_form.get("fields", []),
                "createdAt": datetime.now(timezone.utc)
            }
            res_f = await db.cohortFeedbackForms.insert_one(form_doc)
            new_form_id = str(res_f.inserted_id)
        elif feedback_tpl_id:
            fb_tpl = await db.feedbackTemplates.find_one({"_id": ObjectId(feedback_tpl_id)})
            if fb_tpl:
                form_doc = {
                    "cohortId": cohort_id,
                    "name": fb_tpl.get("name"),
                    "fields": fb_tpl.get("fields", []),
                    "createdAt": datetime.now(timezone.utc)
                }
                res_f = await db.cohortFeedbackForms.insert_one(form_doc)
                new_form_id = str(res_f.inserted_id)

        # Update cohort document if plans or forms were generated
        updates = {}
        if new_plan_id:
            updates["trainingPlanId"] = new_plan_id
            raw_data["trainingPlanId"] = new_plan_id
        if new_form_id:
            updates["feedbackFormId"] = new_form_id
            raw_data["feedbackFormId"] = new_form_id
        if updates:
            await db.cohorts.update_one({"_id": ObjectId(cohort_id)}, {"$set": updates})

        raw_data["mentorCount"] = 0
        raw_data["traineeCount"] = 0
        raw_data["assignedTraineeCount"] = 0
        raw_data["activeTraineeCount"] = 0
        raw_data["droppedOutTraineeCount"] = 0
        raw_data["avgProgress"] = 0.0
        return raw_data

    @staticmethod
    async def get_cohorts(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        limit: int = 20,
        allowed_cohort_ids: list[str] | None = None,
    ) -> dict:
        query = {"_id": {"$in": [ObjectId(cid) for cid in allowed_cohort_ids if ObjectId.is_valid(cid)]}} if allowed_cohort_ids is not None else {}

        skip = (page - 1) * limit
        cursor = db.cohorts.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        items = []
        async for doc in cursor:
            cohort_id = str(doc["_id"])
            doc["id"] = cohort_id
            doc.pop("_id", None)
            
            # Aggregate stats
            mentor_count = await db.mentors.count_documents({"$or": [{"cohortIds": cohort_id}, {"cohortId": cohort_id}]})
            trainee_count = await db.trainees.count_documents({"cohortId": cohort_id})
            dropped_out_count = await db.trainees.count_documents({"cohortId": cohort_id, "status": "dropped_out"})
            assigned_trainee_count = await db.trainees.count_documents({
                "cohortId": cohort_id,
                "mentorId": {"$ne": None},
                "status": {"$ne": "dropped_out"}
            })
            
            # Avg progress
            active_trainees = await db.trainees.find({"cohortId": cohort_id, "status": {"$ne": "dropped_out"}}, {"_id": 1}).to_list(None)
            active_trainee_ids = [str(trainee["_id"]) for trainee in active_trainees]
            progress_cursor = db.progress.find({"cohortId": cohort_id, "traineeId": {"$in": active_trainee_ids}})
            progresses = [p.get("percentComplete", 0.0) async for p in progress_cursor]
            avg_progress = round(sum(progresses) / len(progresses), 1) if progresses else 0.0
            
            doc["mentorCount"] = mentor_count
            doc["traineeCount"] = trainee_count
            doc["droppedOutTraineeCount"] = dropped_out_count
            doc["activeTraineeCount"] = trainee_count - dropped_out_count
            doc["assignedTraineeCount"] = assigned_trainee_count
            doc["avgProgress"] = avg_progress
            items.append(doc)

        total = await db.cohorts.count_documents(query)
        pages = (total + limit - 1) // limit if limit > 0 else 1
        return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}

    @staticmethod
    async def get_cohort_by_id(db: AsyncIOMotorDatabase, cohort_id: str) -> dict:
        try:
            doc = await db.cohorts.find_one({"_id": ObjectId(cohort_id)})
        except Exception:
            doc = None
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cohort not found",
                headers={"code": "NOT_FOUND"}
            )
        doc["id"] = str(doc["_id"])
        doc.pop("_id", None)
        
        # Aggregate counts
        doc["mentorCount"] = await db.mentors.count_documents({"$or": [{"cohortIds": cohort_id}, {"cohortId": cohort_id}]})
        doc["traineeCount"] = await db.trainees.count_documents({"cohortId": cohort_id})
        doc["droppedOutTraineeCount"] = await db.trainees.count_documents({"cohortId": cohort_id, "status": "dropped_out"})
        doc["activeTraineeCount"] = doc["traineeCount"] - doc["droppedOutTraineeCount"]
        doc["assignedTraineeCount"] = await db.trainees.count_documents({
            "cohortId": cohort_id,
            "mentorId": {"$ne": None},
            "status": {"$ne": "dropped_out"}
        })
        active_trainees = await db.trainees.find({"cohortId": cohort_id, "status": {"$ne": "dropped_out"}}, {"_id": 1}).to_list(None)
        active_trainee_ids = [str(trainee["_id"]) for trainee in active_trainees]
        progress_cursor = db.progress.find({"cohortId": cohort_id, "traineeId": {"$in": active_trainee_ids}})
        progresses = [p.get("percentComplete", 0.0) async for p in progress_cursor]
        doc["avgProgress"] = round(sum(progresses) / len(progresses), 1) if progresses else 0.0
        
        return doc

    @staticmethod
    async def update_cohort(db: AsyncIOMotorDatabase, cohort_id: str, data: CohortUpdate) -> dict:
        cohort = await CohortService.get_cohort_by_id(db, cohort_id)
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            return cohort

        if "startDate" in update_data or "endDate" in update_data:
            next_start = update_data.get("startDate", cohort.get("startDate", ""))
            next_end = update_data.get("endDate", cohort.get("endDate", ""))
            norm_start, norm_end = validate_cohort_dates(
                next_start, next_end, require_future_start=False
            )
            if "startDate" in update_data:
                update_data["startDate"] = norm_start
            if "endDate" in update_data:
                update_data["endDate"] = norm_end

        await db.cohorts.update_one(
            {"_id": ObjectId(cohort_id)},
            {"$set": update_data}
        )
        return await CohortService.get_cohort_by_id(db, cohort_id)

    @staticmethod
    async def update_status(db: AsyncIOMotorDatabase, cohort_id: str, new_status: CohortStatus) -> dict:
        cohort = await CohortService.get_cohort_by_id(db, cohort_id)
        
        if new_status == CohortStatus.ACTIVE:
            if not cohort.get("trainingPlanId") or not cohort.get("feedbackFormId"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cohort cannot be activated without both a training plan and a feedback form configured",
                    headers={"code": "CONFIGURATION_REQUIRED"}
                )
        
        await db.cohorts.update_one(
            {"_id": ObjectId(cohort_id)},
            {"$set": {"status": new_status.value}}
        )
        cohort["status"] = new_status.value
        return cohort

    @staticmethod
    async def configure_cohort(
        db: AsyncIOMotorDatabase,
        cohort_id: str,
        config_data: CohortConfigureRequest
    ) -> dict:
        cohort = await CohortService.get_cohort_by_id(db, cohort_id)
        
        # Rule: Once a cohort is closed, it cannot be configured
        if cohort.get("status") == CohortStatus.CLOSED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot configure a closed cohort.",
                headers={"code": "COHORT_LOCKED"}
            )
        
        # If active and not forced, maintain locking guard
        if cohort.get("status") == CohortStatus.ACTIVE.value and not config_data.force:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot configure a cohort in {cohort.get('status')} status. Configuration is locked.",
                headers={"code": "COHORT_LOCKED"}
            )
        
        # Read training template
        try:
            training_tpl = await db.trainingTemplates.find_one({"_id": ObjectId(config_data.trainingTemplateId)})
        except Exception:
            training_tpl = None
        if not training_tpl:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Training template not found",
                headers={"code": "NOT_FOUND"}
            )
        
        # Read feedback template
        try:
            feedback_tpl = await db.feedbackTemplates.find_one({"_id": ObjectId(config_data.feedbackTemplateId)})
        except Exception:
            feedback_tpl = None
        if not feedback_tpl:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feedback template not found",
                headers={"code": "NOT_FOUND"}
            )
        
        # Deep copy training template into cohortTrainingPlans
        await db.cohorts.update_one(
            {"_id": ObjectId(cohort_id)},
            {"$set": {"talentnextCourses": training_tpl.get("talentnextCourses", [])}}
        )
        plan_weeks = []
        for week in training_tpl.get("weeks", []):
            plan_courses = []
            for course in week.get("courses", []):
                plan_courses.append({
                    "courseId": str(ObjectId()),  # Fresh ObjectId per course
                    "title": course.get("title"),
                    "description": course.get("description", ""),
                    "durationHrs": course.get("durationHrs", 1.0)
                })
            plan_weeks.append({
                "weekNumber": week.get("weekNumber"),
                "title": week.get("title"),
                "courses": plan_courses
            })
            
        plan_doc = {
            "cohortId": cohort_id,
            "name": training_tpl.get("name"),
            "totalWeeks": training_tpl.get("totalWeeks", len(plan_weeks)),
            "weeks": plan_weeks,
            "talentnextCourses": training_tpl.get("talentnextCourses", []),
            "createdAt": datetime.now(timezone.utc)
        }
        plan_res = await db.cohortTrainingPlans.insert_one(plan_doc)
        new_plan_id = str(plan_res.inserted_id)

        # Deep copy feedback template into cohortFeedbackForms
        form_doc = {
            "cohortId": cohort_id,
            "name": feedback_tpl.get("name"),
            "fields": feedback_tpl.get("fields", []),
            "createdAt": datetime.now(timezone.utc)
        }
        form_res = await db.cohortFeedbackForms.insert_one(form_doc)
        new_form_id = str(form_res.inserted_id)

        # Update cohort with new plan and form IDs
        await db.cohorts.update_one(
            {"_id": ObjectId(cohort_id)},
            {"$set": {
                "trainingPlanId": new_plan_id,
                "feedbackFormId": new_form_id
            }}
        )

        # Sync progress for existing assigned trainees
        await CohortService._sync_progress_with_plan(db, cohort_id, new_plan_id, plan_weeks)

        return await CohortService.get_cohort_by_id(db, cohort_id)

    @staticmethod
    async def update_cohort_plan(db: AsyncIOMotorDatabase, cohort_id: str, plan_data: UpdatePlanRequest) -> dict:
        cohort = await CohortService.get_cohort_by_id(db, cohort_id)
        plan_id = cohort.get("trainingPlanId")
        if not plan_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No training plan exists for this cohort to update",
                headers={"code": "PLAN_NOT_FOUND"}
            )
        
        existing_plan = await db.cohortTrainingPlans.find_one({"_id": ObjectId(plan_id)})
        if not existing_plan:
            raise HTTPException(status_code=404, detail="Plan record not found", headers={"code": "NOT_FOUND"})

        # Build updated weeks, ensuring each course has a valid courseId
        updated_weeks = []
        for w in plan_data.weeks:
            courses = []
            for c in (w.courses or []):
                c_dict = c.model_dump() if hasattr(c, "model_dump") else dict(c)
                if not c_dict.get("courseId"):
                    c_dict["courseId"] = str(ObjectId())
                courses.append(c_dict)
            w_dict = w.model_dump() if hasattr(w, "model_dump") else dict(w)
            w_dict["courses"] = courses
            updated_weeks.append(w_dict)

        total_weeks = len(updated_weeks)
        name = plan_data.name or existing_plan.get("name")
        core_count = sum(1 for w in updated_weeks if not w.get("isBuffer"))
        buffer_count = sum(1 for w in updated_weeks if w.get("isBuffer"))

        await db.cohortTrainingPlans.update_one(
            {"_id": ObjectId(plan_id)},
            {"$set": {
                "name": name,
                "totalWeeks": total_weeks,
                "coreWeeks": core_count,
                "bufferWeeks": buffer_count,
                "weeks": updated_weeks
            }}
        )

        await db.cohorts.update_one(
            {"_id": ObjectId(cohort_id)},
            {"$set": {"totalWeeks": total_weeks}}
        )

        # Synchronize existing progress docs for trainees
        await CohortService._sync_progress_with_plan(db, cohort_id, plan_id, updated_weeks)

        updated_plan = await db.cohortTrainingPlans.find_one({"_id": ObjectId(plan_id)})
        updated_plan["id"] = str(updated_plan["_id"])
        updated_plan.pop("_id", None)
        return updated_plan

    @staticmethod
    async def extend_timeline(db: AsyncIOMotorDatabase, cohort_id: str, req: ExtendTimelineRequest) -> dict:
        cohort = await CohortService.get_cohort_by_id(db, cohort_id)
        
        # 1. Update endDate if provided
        if req.newEndDate:
            _, norm_end = validate_cohort_dates(
                cohort.get("startDate", ""), req.newEndDate, require_future_start=False
            )
            await db.cohorts.update_one(
                {"_id": ObjectId(cohort_id)},
                {"$set": {"endDate": norm_end}}
            )

        # 2. Extend weeks in plan if plan exists
        plan_id = cohort.get("trainingPlanId")
        if plan_id:
            plan = await db.cohortTrainingPlans.find_one({"_id": ObjectId(plan_id)})
            if plan:
                current_weeks = plan.get("weeks", [])
                current_total = len(current_weeks)
                
                if req.newWeeks:
                    for nw in req.newWeeks:
                        w_dict = nw.model_dump() if hasattr(nw, "model_dump") else dict(nw)
                        courses = []
                        for c in w_dict.get("courses", []):
                            c_d = c.model_dump() if hasattr(c, "model_dump") else dict(c)
                            if not c_d.get("courseId"):
                                c_d["courseId"] = str(ObjectId())
                            courses.append(c_d)
                        w_dict["courses"] = courses
                        current_weeks.append(w_dict)
                elif req.additionalWeeks and req.additionalWeeks > 0:
                    for i in range(1, req.additionalWeeks + 1):
                        w_num = current_total + i
                        current_weeks.append({
                            "weekNumber": w_num,
                            "title": f"Week {w_num} (Buffer Week)",
                            "isBuffer": True,
                            "courses": []
                        })
                
                new_total_weeks = len(current_weeks)
                core_count = sum(1 for w in current_weeks if not w.get("isBuffer"))
                buffer_count = sum(1 for w in current_weeks if w.get("isBuffer"))
                await db.cohortTrainingPlans.update_one(
                    {"_id": ObjectId(plan_id)},
                    {"$set": {
                        "totalWeeks": new_total_weeks,
                        "coreWeeks": core_count,
                        "bufferWeeks": buffer_count,
                        "weeks": current_weeks
                    }}
                )

                await db.cohorts.update_one(
                    {"_id": ObjectId(cohort_id)},
                    {"$set": {"totalWeeks": new_total_weeks}}
                )

                # Sync progress documents
                await CohortService._sync_progress_with_plan(db, cohort_id, plan_id, current_weeks)

        return await CohortService.get_cohort_by_id(db, cohort_id)

    @staticmethod
    async def update_cohort_feedback_form(db: AsyncIOMotorDatabase, cohort_id: str, form_data: UpdateFeedbackFormRequest) -> dict:
        cohort = await CohortService.get_cohort_by_id(db, cohort_id)
        form_id = cohort.get("feedbackFormId")
        if not form_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No feedback form exists for this cohort to update",
                headers={"code": "FORM_NOT_FOUND"}
            )
        
        existing_form = await db.cohortFeedbackForms.find_one({"_id": ObjectId(form_id)})
        if not existing_form:
            raise HTTPException(status_code=404, detail="Form record not found", headers={"code": "NOT_FOUND"})

        fields = [f.model_dump() if hasattr(f, "model_dump") else dict(f) for f in form_data.fields]
        name = form_data.name or existing_form.get("name")

        await db.cohortFeedbackForms.update_one(
            {"_id": ObjectId(form_id)},
            {"$set": {
                "name": name,
                "fields": fields
            }}
        )

        updated_form = await db.cohortFeedbackForms.find_one({"_id": ObjectId(form_id)})
        updated_form["id"] = str(updated_form["_id"])
        updated_form.pop("_id", None)
        return updated_form

    @staticmethod
    async def _sync_progress_with_plan(db: AsyncIOMotorDatabase, cohort_id: str, plan_id: str, plan_weeks: list):
        """Ensure all assigned trainees have all courses from the updated plan in their progress doc, preserving completed courses."""
        trainees_cursor = db.trainees.find({"cohortId": cohort_id, "mentorId": {"$ne": None}})
        async for trainee in trainees_cursor:
            trainee_id = str(trainee["_id"])
            prog = await db.progress.find_one({"traineeId": trainee_id})
            if not prog:
                items = []
                for w in plan_weeks:
                    for c in w.get("courses", []):
                        items.append({
                            "weekNumber": w.get("weekNumber"),
                            "courseId": c.get("courseId"),
                            "completed": False,
                            "completedAt": None,
                            "completedBy": None
                        })
                await db.progress.insert_one({
                    "cohortId": cohort_id,
                    "traineeId": trainee_id,
                    "mentorId": trainee["mentorId"],
                    "planId": plan_id,
                    "items": items,
                    "percentComplete": 0.0,
                    "createdAt": datetime.now(timezone.utc)
                })
            else:
                existing_items_map = {item.get("courseId"): item for item in prog.get("items", [])}
                new_items = []
                for w in plan_weeks:
                    for c in w.get("courses", []):
                        c_id = c.get("courseId")
                        if c_id in existing_items_map:
                            old_item = existing_items_map[c_id]
                            old_item["weekNumber"] = w.get("weekNumber")
                            new_items.append(old_item)
                        else:
                            new_items.append({
                                "weekNumber": w.get("weekNumber"),
                                "courseId": c_id,
                                "completed": False,
                                "completedAt": None,
                                "completedBy": None
                            })
                
                total_items = len(new_items)
                completed_count = sum(1 for it in new_items if it.get("completed"))
                pct = round((completed_count / total_items) * 100.0, 1) if total_items > 0 else 0.0
                
                await db.progress.update_one(
                    {"_id": prog["_id"]},
                    {"$set": {
                        "items": new_items,
                        "percentComplete": pct,
                        "planId": plan_id
                    }}
                )

