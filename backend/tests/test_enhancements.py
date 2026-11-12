from datetime import date, datetime, timedelta, timezone
import pytest
from pymongo.errors import DuplicateKeyError

from app.core.db import _ensure_unique_trainee_employee_id_index


def _iso_offset(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


# ---------------------------------------------------------------------------
# 1. Cohort Start Date, End Date & Timeline Validation
# ---------------------------------------------------------------------------

async def test_cohort_date_validation_create_update_and_extend(client, admin_headers):
    today = _iso_offset(0)
    yesterday = _iso_offset(-1)
    next_month = _iso_offset(28)

    # Past start date must fail
    res = await client.post(
        "/api/cohorts",
        headers=admin_headers,
        json={"name": "Past Cohort", "startDate": yesterday, "endDate": next_month},
    )
    assert res.status_code == 400
    assert "past" in res.json()["detail"].lower()

    # Equal start and end date must fail
    res = await client.post(
        "/api/cohorts",
        headers=admin_headers,
        json={"name": "Same Day Cohort", "startDate": today, "endDate": today},
    )
    assert res.status_code == 400
    assert "later than start date" in res.json()["detail"].lower()

    # End date earlier than start date must fail
    res = await client.post(
        "/api/cohorts",
        headers=admin_headers,
        json={"name": "Backwards Cohort", "startDate": _iso_offset(10), "endDate": _iso_offset(5)},
    )
    assert res.status_code == 400

    # Valid future cohort succeeds
    res = await client.post(
        "/api/cohorts",
        headers=admin_headers,
        json={"name": "Valid Cohort", "startDate": today, "endDate": next_month},
    )
    assert res.status_code == 200
    cohort_id = res.json()["id"]

    # Updating cohort to invalid endDate <= startDate fails
    bad_update = await client.put(
        f"/api/cohorts/{cohort_id}",
        headers=admin_headers,
        json={"endDate": today},
    )
    assert bad_update.status_code == 400

    # Extending timeline with newEndDate <= startDate fails
    bad_extend = await client.post(
        f"/api/cohorts/{cohort_id}/extend-timeline",
        headers=admin_headers,
        json={"additionalWeeks": 1, "newEndDate": today},
    )
    assert bad_extend.status_code == 400


# ---------------------------------------------------------------------------
# 2. Unique Trainee Employee ID Validation & Cohort Reassignment
# ---------------------------------------------------------------------------

async def test_unique_trainee_employee_id_and_reassignment(client, db, admin_headers, nominator_headers):
    # Create first trainee with spaces to verify trimming
    res1 = await client.post(
        "/api/nominations/trainees",
        headers=nominator_headers,
        json={
            "name": "Trainee One",
            "email": "t1@example.com",
            "employeeId": "  EMP-TRN-101  ",
            "location": "Bengaluru, India",
            "timezone": "Asia/Kolkata",
        },
    )
    assert res1.status_code == 200
    t1 = res1.json()
    assert t1["employeeId"] == "EMP-TRN-101"

    # Pre-check endpoint confirms existence case-insensitively with trimming
    chk_taken = await client.get(
        "/api/nominations/check-employee-id",
        headers=nominator_headers,
        params={"employeeId": "  emp-trn-101 "},
    )
    assert chk_taken.status_code == 200
    assert chk_taken.json() == {"employeeId": "emp-trn-101", "exists": True}

    chk_free = await client.get(
        "/api/nominations/check-employee-id",
        headers=admin_headers,
        params={"employeeId": "EMP-TRN-999"},
    )
    assert chk_free.status_code == 200
    assert chk_free.json() == {"employeeId": "EMP-TRN-999", "exists": False}

    # Exact duplicate fails with 409 and explicit error message
    res_dup = await client.post(
        "/api/nominations/trainees",
        headers=admin_headers,
        json={
            "name": "Trainee Two",
            "email": "t2@example.com",
            "employeeId": "EMP-TRN-101",
            "location": "Bengaluru, India",
            "timezone": "Asia/Kolkata",
        },
    )
    assert res_dup.status_code == 409
    assert "Employee ID EMP-TRN-101 already exists" in res_dup.json()["detail"]

    # Case-insensitive duplicate fails with 409
    res_ci = await client.post(
        "/api/nominations/trainees",
        headers=admin_headers,
        json={
            "name": "Trainee Three",
            "email": "t3@example.com",
            "employeeId": "  emp-trn-101 ",
            "location": "Bengaluru, India",
            "timezone": "Asia/Kolkata",
        },
    )
    assert res_ci.status_code == 409

    # Whitespace-only Employee ID fails 422
    res_blank = await client.post(
        "/api/nominations/trainees",
        headers=admin_headers,
        json={
            "name": "Trainee Blank",
            "email": "tblank@example.com",
            "employeeId": "   ",
            "location": "Bengaluru, India",
            "timezone": "Asia/Kolkata",
        },
    )
    assert res_blank.status_code == 422

    # Reassigning the existing trainee across cohorts works without duplicating the record
    c1 = (await client.post(
        "/api/cohorts",
        headers=admin_headers,
        json={"name": "Cohort A", "startDate": _iso_offset(1), "endDate": _iso_offset(29)},
    )).json()
    c2 = (await client.post(
        "/api/cohorts",
        headers=admin_headers,
        json={"name": "Cohort B", "startDate": _iso_offset(1), "endDate": _iso_offset(29)},
    )).json()

    alloc = await client.post(
        f"/api/cohorts/{c1['id']}/trainees/allocate",
        headers=admin_headers,
        json={"ids": [t1["id"]]},
    )
    assert alloc.status_code == 200

    move = await client.put(
        f"/api/nominations/trainees/{t1['id']}/cohort",
        headers=admin_headers,
        json={"cohortId": c2["id"]},
    )
    assert move.status_code == 200
    assert move.json()["cohortId"] == c2["id"]
    assert await db.trainees.count_documents({}) == 1


async def test_legacy_duplicate_employee_ids_remediated_and_unique_index_enforced(db):
    indexes = await db.trainees.index_information()
    for idx_name, idx_info in indexes.items():
        if idx_info.get("key") == [("employeeId", 1)]:
            await db.trainees.drop_index(idx_name)

    now = datetime.now(timezone.utc)
    await db.trainees.insert_many([
        {
            "name": "Legacy First",
            "email": "legacy1@example.com",
            "employeeId": " EMP-LEG-10 ",
            "createdAt": now - timedelta(days=2),
        },
        {
            "name": "Legacy Dup",
            "email": "legacy2@example.com",
            "employeeId": "emp-leg-10",
            "createdAt": now - timedelta(days=1),
        },
    ])

    await _ensure_unique_trainee_employee_id_index(db)

    docs = await db.trainees.find().sort("createdAt", 1).to_list(10)
    assert docs[0]["employeeId"] == "EMP-LEG-10"
    assert docs[1]["legacyDuplicateEmployeeId"] == "emp-leg-10"
    assert docs[1]["employeeId"].startswith("emp-leg-10__DUP_")

    # Direct DB insert violating case-insensitive uniqueness raises DuplicateKeyError
    with pytest.raises(DuplicateKeyError):
        await db.trainees.insert_one({
            "name": "Direct DB Dup",
            "email": "directdup@example.com",
            "employeeId": "emp-leg-10",
            "createdAt": now,
        })


# ---------------------------------------------------------------------------
# 3. TalentNext Course Creation, Duplicate Check & Template/Cohort Flow
# ---------------------------------------------------------------------------

async def test_talentnext_course_creation_rbac_duplicates_and_persistence(
    client, admin_headers, nominator_headers
):
    # Non-admin forbidden
    forbidden = await client.post(
        "/api/talentnext-courses",
        headers=nominator_headers,
        json={"name": "Unauthorized Course"},
    )
    assert forbidden.status_code == 403

    # Admin creates course with optional fields
    created = await client.post(
        "/api/talentnext-courses",
        headers=admin_headers,
        json={
            "name": "  Docker Essentials  ",
            "description": "Containers and multi-stage builds",
            "courseUrl": "https://talentnext.example.com/docker",
            "durationHrs": 4.5,
        },
    )
    assert created.status_code == 201
    course = created.json()
    assert course["name"] == "Docker Essentials"
    assert course["description"] == "Containers and multi-stage builds"
    assert course["courseUrl"] == "https://talentnext.example.com/docker"
    assert course["durationHrs"] == 4.5

    # Duplicate name (case-insensitive) rejected 409
    dup = await client.post(
        "/api/talentnext-courses",
        headers=admin_headers,
        json={"name": "docker essentials"},
    )
    assert dup.status_code == 409

    # Course persists in catalog list
    catalog = (await client.get("/api/talentnext-courses")).json()
    assert any(item["id"] == course["id"] and item["name"] == "Docker Essentials" for item in catalog)

    # Selected course persists on template and applies to cohort
    tpl = await client.post(
        "/api/training-templates",
        headers=admin_headers,
        json={
            "name": "Platform Track",
            "totalWeeks": 1,
            "weeks": [{"weekNumber": 1, "title": "Week 1", "courses": []}],
            "talentnextCourses": [{"courseId": course["id"], "isMandatory": True}],
        },
    )
    assert tpl.status_code == 200
    tpl_id = tpl.json()["id"]

    cohort = await client.post(
        "/api/cohorts",
        headers=admin_headers,
        json={
            "name": "Cloud Cohort",
            "startDate": _iso_offset(1),
            "endDate": _iso_offset(29),
            "trainingTemplateId": tpl_id,
            "talentnextCourses": [{"courseId": course["id"], "isMandatory": False}],
        },
    )
    assert cohort.status_code == 200
    assert cohort.json()["talentnextCourses"] == [{"courseId": course["id"], "isMandatory": False}]
