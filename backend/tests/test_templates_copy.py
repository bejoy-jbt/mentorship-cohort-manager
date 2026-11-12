import pytest
from bson import ObjectId

@pytest.mark.asyncio
async def test_template_copy_independence(client, admin_headers, test_db):
    # 1. Create a training template
    tpl_payload = {
        "name": "Original Training Template",
        "totalWeeks": 2,
        "weeks": [
            {
                "weekNumber": 1,
                "title": "Week 1: Fundamentals",
                "courses": [{"title": "Course 101", "description": "Intro", "durationHrs": 2.0}]
            },
            {
                "weekNumber": 2,
                "title": "Week 2: Advanced",
                "courses": [{"title": "Course 102", "description": "Deep Dive", "durationHrs": 3.0}]
            }
        ]
    }
    res = await client.post("/api/training-templates", json=tpl_payload, headers=admin_headers)
    assert res.status_code == 200, res.text
    training_tpl = res.json()
    training_tpl_id = training_tpl["id"]

    # 2. Create a feedback template
    fb_payload = {
        "name": "Original Feedback Template",
        "fields": [
            {"key": "rating_score", "label": "Score", "type": "rating", "options": [], "required": True},
            {"key": "comment", "label": "Comment", "type": "text", "options": [], "required": False}
        ]
    }
    res = await client.post("/api/feedback-templates", json=fb_payload, headers=admin_headers)
    assert res.status_code == 200, res.text
    feedback_tpl = res.json()
    feedback_tpl_id = feedback_tpl["id"]

    # 3. Create a cohort
    from datetime import date, timedelta
    cohort_payload = {
        "name": "Spring 2026 Batch",
        "description": "Test Cohort",
        "startDate": (date.today() + timedelta(days=1)).isoformat(),
        "endDate": (date.today() + timedelta(days=15)).isoformat(),
        "nominatorIds": []
    }
    res = await client.post("/api/cohorts", json=cohort_payload, headers=admin_headers)
    assert res.status_code == 200, res.text
    cohort = res.json()
    cohort_id = cohort["id"]

    # 4. Configure cohort (triggers copy-on-configure)
    config_payload = {
        "trainingTemplateId": training_tpl_id,
        "feedbackTemplateId": feedback_tpl_id
    }
    res = await client.put(f"/api/cohorts/{cohort_id}/configure", json=config_payload, headers=admin_headers)
    assert res.status_code == 200, res.text
    configured_cohort = res.json()

    # Verify new copy IDs were stored and original template IDs were NOT stored as references
    assert configured_cohort["trainingPlanId"] is not None
    assert configured_cohort["feedbackFormId"] is not None
    assert configured_cohort["trainingPlanId"] != training_tpl_id
    assert configured_cohort["feedbackFormId"] != feedback_tpl_id

    # Verify fresh course ObjectIds were generated
    plan_doc = await test_db.cohortTrainingPlans.find_one({"_id": ObjectId(configured_cohort["trainingPlanId"])})
    assert plan_doc is not None
    assert len(plan_doc["weeks"]) == 2
    assert "courseId" in plan_doc["weeks"][0]["courses"][0]
    first_course_id = plan_doc["weeks"][0]["courses"][0]["courseId"]

    # 5. Modify original template in DB
    await test_db.trainingTemplates.update_one(
        {"_id": ObjectId(training_tpl_id)},
        {"$set": {"name": "MUTATED ORIGINAL TEMPLATE NAME", "totalWeeks": 99}}
    )

    # 6. Verify cohort's copied training plan remained completely unaffected!
    unaffected_plan = await test_db.cohortTrainingPlans.find_one({"_id": ObjectId(configured_cohort["trainingPlanId"])})
    assert unaffected_plan["name"] == "Original Training Template"
    assert unaffected_plan["totalWeeks"] == 2
    assert unaffected_plan["weeks"][0]["courses"][0]["courseId"] == first_course_id
