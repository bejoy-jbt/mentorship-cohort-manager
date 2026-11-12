from datetime import date, timedelta
import pytest
from bson import ObjectId

START_DATE = (date.today() + timedelta(days=1)).isoformat()
END_DATE = (date.today() + timedelta(days=30)).isoformat()


@pytest.mark.asyncio
async def test_role_based_access_control(
    client, admin_headers, nominator_headers, nominator_user,
    mentor_headers, mentor_user, test_db
):
    # 1. Unauthenticated requests should be rejected
    unauth_res = await client.get("/api/cohorts")
    assert unauth_res.status_code == 401
    assert unauth_res.json()["code"] == "UNAUTHORIZED"

    # 2. Nominator cannot create a cohort (admin only)
    c_nom_res = await client.post("/api/cohorts", json={
        "name": "Nominator Cohort",
        "startDate": START_DATE,
        "endDate": END_DATE,
    }, headers=nominator_headers)
    assert c_nom_res.status_code == 403
    assert c_nom_res.json()["code"] == "FORBIDDEN"

    # 3. Admin creates a cohort
    c_a_res = await client.post("/api/cohorts", json={
        "name": "Cohort A",
        "startDate": START_DATE,
        "endDate": END_DATE,
    }, headers=admin_headers)
    assert c_a_res.status_code == 200
    cohort_a_id = c_a_res.json()["id"]

    # 4. Nominators are independent of cohorts: they cannot list or open any cohort
    nom_cohorts_res = await client.get("/api/cohorts", headers=nominator_headers)
    assert nom_cohorts_res.status_code == 403
    nom_access_a = await client.get(f"/api/cohorts/{cohort_a_id}", headers=nominator_headers)
    assert nom_access_a.status_code == 403
    nom_members = await client.get(f"/api/cohorts/{cohort_a_id}/trainees", headers=nominator_headers)
    assert nom_members.status_code == 403
    nom_templates = await client.get("/api/training-templates", headers=nominator_headers)
    assert nom_templates.status_code == 403

    # 5. A nominator cannot put people directly into a cohort
    nom_direct = await client.post(f"/api/cohorts/{cohort_a_id}/mentors", json={
        "name": "Unauthorized Nominee",
        "email": "unauth@example.com",
        "department": "Security"
    }, headers=nominator_headers)
    assert nom_direct.status_code == 403

    # 6. A nominator CAN nominate a mentor, with no cohort involved
    nom_nominate = await client.post("/api/nominations/mentors", json={
        "name": "Authorized Mentor Nominee",
        "email": "auth.mentor@example.com",
        "employeeId": "EMP-1",
    }, headers=nominator_headers)
    assert nom_nominate.status_code == 200
    assert "cohortId" not in nom_nominate.json()

    # 7. Mentor can only see their own trainees
    m2_user = {
        "name": "Other Mentor",
        "email": "other.mentor@test.com",
        "role": "mentor",
        "isActive": True
    }
    m2_res = await test_db.users.insert_one(m2_user)
    m2_user_id = str(m2_res.inserted_id)

    await test_db.mentors.insert_one({
        "cohortId": cohort_a_id, "nominatedBy": nominator_user["id"],
        "name": "M1", "email": mentor_user["email"], "department": "Dev",
        "userId": mentor_user["id"]
    })
    m2_nom = await test_db.mentors.insert_one({
        "cohortId": cohort_a_id, "nominatedBy": nominator_user["id"],
        "name": "M2", "email": m2_user["email"], "department": "Dev",
        "userId": m2_user_id
    })
    m2_id = str(m2_nom.inserted_id)

    t2 = await test_db.trainees.insert_one({
        "cohortId": cohort_a_id, "nominatedBy": nominator_user["id"],
        "name": "Trainee of M2", "email": "t2@example.com",
        "employeeId": "EMP-2", "department": "Dev", "mentorId": m2_id
    })
    t2_id = str(t2.inserted_id)

    m1_view_t2 = await client.get(f"/api/mentor/trainees/{t2_id}", headers=mentor_headers)
    assert m1_view_t2.status_code == 403
    assert m1_view_t2.json()["code"] == "FORBIDDEN"
