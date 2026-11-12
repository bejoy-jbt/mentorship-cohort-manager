import re
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase


class TalentNextService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.talentnextCourses

    async def _ensure_unique_name(self, name: str, exclude_id: Optional[ObjectId] = None) -> None:
        query = {"name": {"$regex": rf"^\s*{re.escape(name.strip())}\s*$", "$options": "i"}}
        if exclude_id is not None:
            query["_id"] = {"$ne": exclude_id}
        existing = await self.collection.find_one(query, {"_id": 1, "name": 1})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"TalentNext course '{name.strip()}' already exists.",
                headers={"code": "COURSE_ALREADY_EXISTS"},
            )

    async def create(
        self,
        name: str,
        description: Optional[str] = "",
        course_url: Optional[str] = "",
        duration_hrs: Optional[float] = None,
    ) -> dict:
        """Create a new TalentNext course"""
        trimmed_name = name.strip()
        await self._ensure_unique_name(trimmed_name)
        now = datetime.now(timezone.utc)
        doc = {
            "name": trimmed_name,
            "description": (description or "").strip(),
            "courseUrl": (course_url or "").strip(),
            "durationHrs": duration_hrs,
            "createdAt": now,
        }
        result = await self.collection.insert_one(doc)
        doc["id"] = str(result.inserted_id)
        doc.pop("_id", None)
        return doc

    async def list_all(self) -> List[dict]:
        """List all TalentNext courses"""
        courses = []
        async for course in self.collection.find().sort("createdAt", -1):
            course["id"] = str(course.pop("_id"))
            courses.append(course)
        return courses

    async def get_by_id(self, course_id: str) -> Optional[dict]:
        """Get TalentNext course by ID"""
        try:
            course = await self.collection.find_one({"_id": ObjectId(course_id)})
            if course:
                course["id"] = str(course.pop("_id"))
            return course
        except Exception:
            return None

    async def get_by_ids(self, course_ids: List[str]) -> List[dict]:
        """Get multiple TalentNext courses by IDs"""
        try:
            oid_list = [ObjectId(cid) for cid in course_ids]
            courses = []
            async for course in self.collection.find({"_id": {"$in": oid_list}}):
                course["id"] = str(course.pop("_id"))
                courses.append(course)
            return courses
        except Exception:
            return []

    async def update(
        self,
        course_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        course_url: Optional[str] = None,
        duration_hrs: Optional[float] = None,
    ) -> Optional[dict]:
        """Update TalentNext course"""
        try:
            oid = ObjectId(course_id)
        except Exception:
            return None

        update_data = {}
        if name is not None:
            trimmed_name = name.strip()
            await self._ensure_unique_name(trimmed_name, exclude_id=oid)
            update_data["name"] = trimmed_name
        if description is not None:
            update_data["description"] = description.strip()
        if course_url is not None:
            update_data["courseUrl"] = course_url.strip()
        if duration_hrs is not None:
            update_data["durationHrs"] = duration_hrs

        if not update_data:
            return await self.get_by_id(course_id)

        result = await self.collection.find_one_and_update(
            {"_id": oid},
            {"$set": update_data},
            return_document=True,
        )
        if result:
            result["id"] = str(result.pop("_id"))
        return result

    async def delete(self, course_id: str) -> bool:
        """Delete TalentNext course"""
        try:
            result = await self.collection.delete_one({"_id": ObjectId(course_id)})
            return result.deleted_count > 0
        except Exception:
            return False
