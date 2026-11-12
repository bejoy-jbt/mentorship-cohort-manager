import pytest
from bson import ObjectId

@pytest.mark.asyncio
async def test_feedback_validation(client, admin_headers, mentor_headers, mentor_user, test_db):
    # 1. Setup training and feedback templates
    tpl_res = await client.post("/api/training-templates", json={
        "name": "Feedback Test Plan",
        "totalWeeks": 1,
        "weeks": [{"weekNumber": 1, "title": "W1", "courses": [{"title": "C1", "description": "", "durationHrs": 1.0}]}]
    }, headers=admin_headers)
    t_id = tpl_res.json()["id"]

    fb_res = await client.post("/api/feedback-templates", json={
        "name": "Strict Form",
        "fields": [
            {"key": "rating_overall", "label": "Overall", "type": "rating", "options": [], "required": True},
            {"key": "grade", "label": "Grade", "type": "select", "options": ["A", "B", "C"], "required": True},
            {"key": "remarks", "label": "Remarks", "type": "text", "options": [], "required": True}
        ]
    }, headers=admin_headers)
    f_id = fb_res.json()["id"]

    # 2. Setup cohort and link mentor & trainee
    from datetime import date, timedelta
    c_res = await client.post("/api/cohorts", json={
        "name": "Feedback Cohort",
        "startDate": (date.today() + timedelta(days=1)).isoformat(),
        "endDate": (date.today() + timedelta(days=30)).isoformat(),
        "nominatorIds": []
    }, headers=admin_headers)
    cohort_id = c_res.json()["id"]

    await client.put(f"/api/cohorts/{cohort_id}/configure", json={
        "trainingTemplateId": t_id,
        "feedbackTemplateId": f_id
    }, headers=admin_headers)

    m_res = await client.post(f"/api/cohorts/{cohort_id}/mentors", json={
        "name": "Mentor F",
        "email": mentor_user["email"],
        "department": "QA"
    }, headers=admin_headers)
    mentor_id = m_res.json()["id"]
    await test_db.mentors.update_one({"_id": ObjectId(mentor_id)}, {"$set": {"userId": mentor_user["id"]}})

    t_res = await client.post(f"/api/cohorts/{cohort_id}/trainees", json={
        "name": "Trainee F",
        "email": "trainee.f@example.com",
        "employeeId": "EMP-F",
        "department": "QA"
    }, headers=admin_headers)
    trainee_id = t_res.json()["id"]

    await client.put(f"/api/trainees/{trainee_id}/mentor", json={"mentorId": mentor_id}, headers=admin_headers)

    # 3. Validation failure: Missing required field
    missing_req = await client.post(
        f"/api/mentor/trainees/{trainee_id}/feedback",
        json={"weekNumber": 1, "answers": {"rating_overall": 4, "grade": "A"}}, # missing remarks
        headers=mentor_headers
    )
    assert missing_req.status_code == 400
    assert "required" in missing_req.json()["detail"].lower()

    # 4. Validation failure: Rating out of bounds (< 1 or > 5)
    invalid_rating = await client.post(
        f"/api/mentor/trainees/{trainee_id}/feedback",
        json={"weekNumber": 1, "answers": {"rating_overall": 6, "grade": "A", "remarks": "Great"}},
        headers=mentor_headers
    )
    assert invalid_rating.status_code == 400
    assert "between 1 and 5" in invalid_rating.json()["detail"]

    # 5. Validation failure: Select option invalid
    invalid_select = await client.post(
        f"/api/mentor/trainees/{trainee_id}/feedback",
        json={"weekNumber": 1, "answers": {"rating_overall": 5, "grade": "Z", "remarks": "Great"}},
        headers=mentor_headers
    )
    assert invalid_select.status_code == 400
    assert "must be one of" in invalid_select.json()["detail"]

    # 6. Valid submission -> Success
    valid_res = await client.post(
        f"/api/mentor/trainees/{trainee_id}/feedback",
        json={"weekNumber": 1, "answers": {"rating_overall": 5, "grade": "A", "remarks": "Exceptional work!"}},
        headers=mentor_headers
    )
    assert valid_res.status_code == 200
    assert valid_res.json()["answers"]["rating_overall"] == 5

    # 7. Edit/Overwrite existing week feedback -> updates in place
    overwrite_res = await client.post(
        f"/api/mentor/trainees/{trainee_id}/feedback",
        json={"weekNumber": 1, "answers": {"rating_overall": 4, "grade": "B", "remarks": "Updated remarks"}},
        headers=mentor_headers
    )
    assert overwrite_res.status_code == 200
    assert overwrite_res.json()["answers"]["grade"] == "B"

    # Verify only ONE document exists for week 1
    count = await test_db.feedbackResponses.count_documents({"traineeId": trainee_id, "weekNumber": 1})
    assert count == 1
