import pytest

@pytest.mark.asyncio
async def test_status_transitions_and_locking(client, admin_headers):
    # 1. Create a draft cohort
    from datetime import date, timedelta
    c_res = await client.post("/api/cohorts", json={
        "name": "Locking Cohort",
        "startDate": (date.today() + timedelta(days=1)).isoformat(),
        "endDate": (date.today() + timedelta(days=30)).isoformat(),
        "nominatorIds": []
    }, headers=admin_headers)
    cohort_id = c_res.json()["id"]

    # 2. Attempt to activate WITHOUT plan and form -> 400 Bad Request
    act_res = await client.patch(f"/api/cohorts/{cohort_id}/status", json={"status": "active"}, headers=admin_headers)
    assert act_res.status_code == 400
    assert act_res.json()["code"] == "CONFIGURATION_REQUIRED"

    # 3. Create templates and configure cohort
    tpl_res = await client.post("/api/training-templates", json={
        "name": "TPL", "totalWeeks": 1,
        "weeks": [{"weekNumber": 1, "title": "W1", "courses": [{"title": "C1", "description": "", "durationHrs": 1.0}]}]
    }, headers=admin_headers)
    t_id = tpl_res.json()["id"]

    fb_res = await client.post("/api/feedback-templates", json={
        "name": "FB", "fields": [{"key": "notes", "label": "Notes", "type": "text", "options": [], "required": False}]
    }, headers=admin_headers)
    f_id = fb_res.json()["id"]

    conf_res = await client.put(f"/api/cohorts/{cohort_id}/configure", json={
        "trainingTemplateId": t_id,
        "feedbackTemplateId": f_id
    }, headers=admin_headers)
    assert conf_res.status_code == 200

    # 4. Now activate cohort -> Success
    act_ok = await client.patch(f"/api/cohorts/{cohort_id}/status", json={"status": "active"}, headers=admin_headers)
    assert act_ok.status_code == 200
    assert act_ok.json()["status"] == "active"

    # 5. Attempt to re-configure active cohort -> Rejected!
    reconf_res = await client.put(f"/api/cohorts/{cohort_id}/configure", json={
        "trainingTemplateId": t_id,
        "feedbackTemplateId": f_id
    }, headers=admin_headers)
    assert reconf_res.status_code == 400
    assert reconf_res.json()["code"] == "COHORT_LOCKED"

    # 6. Close cohort
    close_res = await client.patch(f"/api/cohorts/{cohort_id}/status", json={"status": "closed"}, headers=admin_headers)
    assert close_res.status_code == 200
    assert close_res.json()["status"] == "closed"
