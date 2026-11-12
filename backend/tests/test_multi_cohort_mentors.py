import pytest
from bson import ObjectId


async def _create_cohort(client, admin_headers, name="Test Cohort"):
    from datetime import date, timedelta
    res = await client.post("/api/cohorts", json={
        "name": name,
        "startDate": (date.today() + timedelta(days=1)).isoformat(),
        "endDate": (date.today() + timedelta(days=30)).isoformat()
    }, headers=admin_headers)
    assert res.status_code == 200
    return res.json()["id"]


@pytest.mark.asyncio
async def test_mentor_multi_cohort_assignment_and_editing(client, admin_headers, nominator_headers):
    # 1. Nominator nominates a mentor
    m_res = await client.post("/api/nominations/mentors", json={
        "name": "Sarah Jenkins",
        "email": "sarah.j@example.com",
        "employeeId": "EMP-SJ1"
    }, headers=nominator_headers)
    assert m_res.status_code == 200
    mentor_id = m_res.json()["id"]

    # Create two cohorts
    cohort_a = await _create_cohort(client, admin_headers, "Cohort Alpha")
    cohort_b = await _create_cohort(client, admin_headers, "Cohort Beta")

    # 2. Assign mentor to Cohort A
    assign_a = await client.post(f"/api/cohorts/{cohort_a}/mentors/allocate", json={
        "ids": [mentor_id]
    }, headers=admin_headers)
    assert assign_a.status_code == 200
    assert assign_a.json()["allocated"] == 1

    # 3. Assign the same mentor to Cohort B
    assign_b = await client.post(f"/api/cohorts/{cohort_b}/mentors/allocate", json={
        "ids": [mentor_id]
    }, headers=admin_headers)
    assert assign_b.status_code == 200
    assert assign_b.json()["allocated"] == 1

    # 4. Confirm duplicate assignment to Cohort A is prevented / skipped
    assign_dup = await client.post(f"/api/cohorts/{cohort_a}/mentors/allocate", json={
        "ids": [mentor_id]
    }, headers=admin_headers)
    assert assign_dup.status_code == 200
    assert assign_dup.json()["allocated"] == 0
    assert len(assign_dup.json()["skipped"]) == 1

    # 5. Confirm mentor appears in both cohorts
    mentors_a = await client.get(f"/api/cohorts/{cohort_a}/mentors", headers=admin_headers)
    assert mentors_a.status_code == 200
    assert any(m["id"] == mentor_id for m in mentors_a.json()["items"])

    mentors_b = await client.get(f"/api/cohorts/{cohort_b}/mentors", headers=admin_headers)
    assert mentors_b.status_code == 200
    assert any(m["id"] == mentor_id for m in mentors_b.json()["items"])

    # 6. Verify mentor pool listing shows both cohorts in assignedCohorts
    pool = await client.get("/api/nominations/mentors?allocation=allocated", headers=admin_headers)
    assert pool.status_code == 200
    mentor_entry = next(m for m in pool.json()["items"] if m["id"] == mentor_id)
    assert len(mentor_entry["assignedCohorts"]) == 2
    assert set(mentor_entry["cohortIds"]) == {cohort_a, cohort_b}

    # 7. Edit mentor's cohort list: remove Cohort B
    edit_res = await client.put(f"/api/nominations/mentors/{mentor_id}/cohorts", json={
        "cohortIds": [cohort_a]
    }, headers=admin_headers)
    assert edit_res.status_code == 200

    # Confirm mentor now only in Cohort A
    mentors_b_after = await client.get(f"/api/cohorts/{cohort_b}/mentors", headers=admin_headers)
    assert not any(m["id"] == mentor_id for m in mentors_b_after.json()["items"])
    mentors_a_after = await client.get(f"/api/cohorts/{cohort_a}/mentors", headers=admin_headers)
    assert any(m["id"] == mentor_id for m in mentors_a_after.json()["items"])


@pytest.mark.asyncio
async def test_trainee_cohort_editing(client, admin_headers, nominator_headers):
    # Nominator nominates trainee
    t_res = await client.post("/api/nominations/trainees", json={
        "name": "Alex River",
        "email": "alex.r@example.com",
        "employeeId": "EMP-AR1"
    }, headers=nominator_headers)
    assert t_res.status_code == 200
    trainee_id = t_res.json()["id"]

    cohort_1 = await _create_cohort(client, admin_headers, "Cohort One")
    cohort_2 = await _create_cohort(client, admin_headers, "Cohort Two")

    # Allocate to Cohort 1
    alloc = await client.post(f"/api/cohorts/{cohort_1}/trainees/allocate", json={
        "ids": [trainee_id]
    }, headers=admin_headers)
    assert alloc.status_code == 200

    # Correct mistaken assignment: change to Cohort 2
    edit_res = await client.put(f"/api/nominations/trainees/{trainee_id}/cohort", json={
        "cohortId": cohort_2
    }, headers=admin_headers)
    assert edit_res.status_code == 200
    assert edit_res.json()["cohortId"] == cohort_2

    # Verify trainee in Cohort 2 and not Cohort 1
    t1_list = await client.get(f"/api/cohorts/{cohort_1}/trainees", headers=admin_headers)
    assert not any(t["id"] == trainee_id for t in t1_list.json()["items"])

    t2_list = await client.get(f"/api/cohorts/{cohort_2}/trainees", headers=admin_headers)
    assert any(t["id"] == trainee_id for t in t2_list.json()["items"])

    # Remove assignment entirely (back to unallocated)
    unassign_res = await client.put(f"/api/nominations/trainees/{trainee_id}/cohort", json={
        "cohortId": None
    }, headers=admin_headers)
    assert unassign_res.status_code == 200
    assert unassign_res.json()["cohortId"] is None

    unalloc_pool = await client.get("/api/nominations/trainees?allocation=unallocated", headers=admin_headers)
    assert any(t["id"] == trainee_id for t in unalloc_pool.json()["items"])


@pytest.mark.asyncio
async def test_nominator_name_click_details_and_admin_filter(client, admin_headers, nominator_user, nominator_headers):
    nominator_id = nominator_user["id"]

    # Nominator creates 1 mentor and 1 trainee
    m_res = await client.post("/api/nominations/mentors", json={
        "name": "Nominator Mentor",
        "email": "nom.mentor@example.com",
        "employeeId": "EMP-NM1"
    }, headers=nominator_headers)
    t_res = await client.post("/api/nominations/trainees", json={
        "name": "Nominator Trainee",
        "email": "nom.trainee@example.com",
        "employeeId": "EMP-NT1"
    }, headers=nominator_headers)
    assert m_res.status_code == 200 and t_res.status_code == 200

    # Admin creates 1 trainee directly
    admin_t_res = await client.post("/api/nominations/trainees", json={
        "name": "Admin Trainee",
        "email": "admin.trainee@example.com",
        "employeeId": "EMP-AT1"
    }, headers=admin_headers)
    assert admin_t_res.status_code == 200

    # Click nominator name: fetch details by nominator ID
    nom_details = await client.get(f"/api/nominations/by-nominator/{nominator_id}", headers=admin_headers)
    assert nom_details.status_code == 200
    data = nom_details.json()
    assert data["nominator"]["id"] == nominator_id
    assert any(m["name"] == "Nominator Mentor" for m in data["mentors"])
    assert any(t["name"] == "Nominator Trainee" for t in data["trainees"])
    assert not any(t["name"] == "Admin Trainee" for t in data["trainees"])

    # Filter nominations by Platform Administrator
    admin_pool = await client.get("/api/nominations/trainees?nominator_id=admin", headers=admin_headers)
    assert admin_pool.status_code == 200
    admin_items = admin_pool.json()["items"]
    assert any(t["name"] == "Admin Trainee" for t in admin_items)
    assert not any(t["name"] == "Nominator Trainee" for t in admin_items)


@pytest.mark.asyncio
async def test_global_active_inactive_toggle_and_authorization(client, admin_headers, nominator_headers):
    # Create and activate mentor
    m_res = await client.post("/api/nominations/mentors", json={
        "name": "Toggle Mentor",
        "email": "toggle.mentor@example.com",
        "employeeId": "EMP-TM1"
    }, headers=nominator_headers)
    mentor_id = m_res.json()["id"]

    act_res = await client.post(f"/api/mentors/{mentor_id}/activate-login", headers=admin_headers)
    assert act_res.status_code == 200
    temp_pass = act_res.json()["temporaryPassword"]
    user_id = act_res.json()["userId"]

    # Toggle mentor globally inactive
    deact_res = await client.put(f"/api/nominations/mentors/{mentor_id}/status", json={
        "isActive": False
    }, headers=admin_headers)
    assert deact_res.status_code == 200
    assert deact_res.json()["isActive"] is False

    # Login attempt must be denied (403 ACCOUNT_INACTIVE)
    login_res = await client.post("/api/auth/login", json={
        "email": "toggle.mentor@example.com",
        "password": temp_pass
    })
    assert login_res.status_code == 403
    assert login_res.json()["code"] == "ACCOUNT_INACTIVE"

    # Reactivate mentor
    react_res = await client.put(f"/api/nominations/mentors/{mentor_id}/status", json={
        "isActive": True
    }, headers=admin_headers)
    assert react_res.status_code == 200
    assert react_res.json()["isActive"] is True


@pytest.mark.asyncio
async def test_mentor_dashboard_cohort_scoping_and_authorization(client, admin_headers, test_db):
    cohort_1 = await _create_cohort(client, admin_headers, "Cohort Alpha")
    cohort_2 = await _create_cohort(client, admin_headers, "Cohort Beta")
    cohort_3 = await _create_cohort(client, admin_headers, "Cohort Gamma Unassigned")

    # Create mentor user
    from app.core.security import get_password_hash, create_access_token
    user_doc = {
        "name": "Multi Mentor",
        "email": "multi.mentor@example.com",
        "passwordHash": get_password_hash("Mentor@123"),
        "role": "mentor",
        "isActive": True
    }
    user_res = await test_db.users.insert_one(user_doc)
    user_id = str(user_res.inserted_id)
    token = create_access_token(subject=user_id, role="mentor")
    headers = {"Authorization": f"Bearer {token}"}

    # Mentor profile assigned to Cohort 1 and Cohort 2
    mentor_doc = {
        "name": "Multi Mentor",
        "email": "multi.mentor@example.com",
        "userId": user_id,
        "cohortId": cohort_1,
        "cohortIds": [cohort_1, cohort_2],
        "isActive": True
    }
    m_res = await test_db.mentors.insert_one(mentor_doc)
    m_id = str(m_res.inserted_id)

    # Trainee in Cohort 1 assigned to this mentor
    await test_db.trainees.insert_one({
        "name": "Trainee C1",
        "email": "t1@example.com",
        "cohortId": cohort_1,
        "mentorId": m_id,
        "status": "in_progress"
    })

    # Trainee in Cohort 2 assigned to this mentor
    await test_db.trainees.insert_one({
        "name": "Trainee C2",
        "email": "t2@example.com",
        "cohortId": cohort_2,
        "mentorId": m_id,
        "status": "in_progress"
    })

    # 1. /mentor/cohorts returns both cohorts with proper counts
    my_cohorts = await client.get("/api/mentor/cohorts", headers=headers)
    assert my_cohorts.status_code == 200
    cohort_items = my_cohorts.json()
    assert len(cohort_items) == 2
    c1_item = next(c for c in cohort_items if c["id"] == cohort_1)
    c2_item = next(c for c in cohort_items if c["id"] == cohort_2)
    assert c1_item["traineeCount"] == 1
    assert c2_item["traineeCount"] == 1

    # 2. Scoped dashboard for Cohort 1
    dash_c1 = await client.get(f"/api/mentor/dashboard?cohort_id={cohort_1}", headers=headers)
    assert dash_c1.status_code == 200
    assert dash_c1.json()["totalTrainees"] == 1
    assert dash_c1.json()["trainees"][0]["name"] == "Trainee C1"

    # 3. Scoped dashboard for Cohort 2
    dash_c2 = await client.get(f"/api/mentor/dashboard?cohort_id={cohort_2}", headers=headers)
    assert dash_c2.status_code == 200
    assert dash_c2.json()["totalTrainees"] == 1
    assert dash_c2.json()["trainees"][0]["name"] == "Trainee C2"

    # 4. Unauthorized cohort request returns 403
    unauth_dash = await client.get(f"/api/mentor/dashboard?cohort_id={cohort_3}", headers=headers)
    assert unauth_dash.status_code == 403
