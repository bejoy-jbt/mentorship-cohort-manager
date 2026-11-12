import pytest
from bson import ObjectId

@pytest.mark.asyncio
async def test_progress_creation_and_percent_calculation(client, admin_headers, mentor_headers, mentor_user, test_db):
    # 1. Setup training template (2 weeks, 2 courses per week = 4 total courses)
    tpl_res = await client.post("/api/training-templates", json={
        "name": "Progress Test Plan",
        "totalWeeks": 2,
        "weeks": [
            {
                "weekNumber": 1,
                "title": "Week 1",
                "courses": [
                    {"title": "Course 1", "description": "", "durationHrs": 1.0},
                    {"title": "Course 2", "description": "", "durationHrs": 1.0}
                ]
            },
            {
                "weekNumber": 2,
                "title": "Week 2",
                "courses": [
                    {"title": "Course 3", "description": "", "durationHrs": 1.0},
                    {"title": "Course 4", "description": "", "durationHrs": 1.0}
                ]
            }
        ]
    }, headers=admin_headers)
    training_tpl_id = tpl_res.json()["id"]

    fb_res = await client.post("/api/feedback-templates", json={
        "name": "Feedback",
        "fields": [{"key": "notes", "label": "Notes", "type": "text", "options": [], "required": False}]
    }, headers=admin_headers)
    fb_tpl_id = fb_res.json()["id"]

    # 2. Create Cohort and Configure
    from datetime import date, timedelta
    c_res = await client.post("/api/cohorts", json={
        "name": "Progress Cohort",
        "startDate": (date.today() + timedelta(days=1)).isoformat(),
        "endDate": (date.today() + timedelta(days=30)).isoformat(),
        "nominatorIds": []
    }, headers=admin_headers)
    cohort_id = c_res.json()["id"]

    await client.put(f"/api/cohorts/{cohort_id}/configure", json={
        "trainingTemplateId": training_tpl_id,
        "feedbackTemplateId": fb_tpl_id
    }, headers=admin_headers)

    # 3. Nominate Mentor and link to mentor_user
    m_res = await client.post(f"/api/cohorts/{cohort_id}/mentors", json={
        "name": "John Mentor",
        "email": mentor_user["email"],
        "department": "Engineering"
    }, headers=admin_headers)
    mentor_id = m_res.json()["id"]
    await test_db.mentors.update_one({"_id": ObjectId(mentor_id)}, {"$set": {"userId": mentor_user["id"]}})

    # 4. Nominate Trainee
    t_res = await client.post(f"/api/cohorts/{cohort_id}/trainees", json={
        "name": "Jane Trainee",
        "email": "jane@example.com",
        "employeeId": "EMP-999",
        "department": "Engineering"
    }, headers=admin_headers)
    trainee_id = t_res.json()["id"]

    # 5. Assign Trainee to Mentor -> Progress document should be created!
    assign_res = await client.put(f"/api/trainees/{trainee_id}/mentor", json={"mentorId": mentor_id}, headers=admin_headers)
    assert assign_res.status_code == 200

    prog_doc = await test_db.progress.find_one({"traineeId": trainee_id})
    assert prog_doc is not None
    assert len(prog_doc["items"]) == 4
    assert prog_doc["percentComplete"] == 0.0

    course_1_id = prog_doc["items"][0]["courseId"]

    # 6. Mentor marks course 1 complete (1 out of 4 = 25.0%)
    patch_res = await client.patch(
        f"/api/mentor/trainees/{trainee_id}/progress",
        json={"courseId": course_1_id, "completed": True},
        headers=mentor_headers
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["percentComplete"] == 25.0

    # 7. Mentor marks whole Week 2 complete (week 2 has courses 3 and 4 -> 3 out of 4 = 75.0%)
    patch_week_res = await client.patch(
        f"/api/mentor/trainees/{trainee_id}/progress",
        json={"weekNumber": 2, "completed": True},
        headers=mentor_headers
    )
    assert patch_week_res.status_code == 200
    assert patch_week_res.json()["percentComplete"] == 75.0

    # 8. Unmark course 1 -> (2 out of 4 = 50.0%)
    patch_unmark = await client.patch(
        f"/api/mentor/trainees/{trainee_id}/progress",
        json={"courseId": course_1_id, "completed": False},
        headers=mentor_headers
    )
    assert patch_unmark.status_code == 200
    assert patch_unmark.json()["percentComplete"] == 50.0
