"""Nominators are independent of cohorts; admin allocates nominees to cohorts."""
import pytest


async def _make_cohort(client, admin_headers, name="Cohort One"):
    from datetime import date, timedelta
    res = await client.post("/api/cohorts", json={
        "name": name,
        "startDate": (date.today() + timedelta(days=1)).isoformat(),
        "endDate": (date.today() + timedelta(days=30)).isoformat(),
    }, headers=admin_headers)
    assert res.status_code == 200
    return res.json()["id"]


MENTOR = {"name": "Maya Mentor", "email": "maya@example.com", "employeeId": "EMP-M1"}
TRAINEE = {"name": "Tom Trainee", "email": "tom@example.com", "employeeId": "EMP-T1",
           "location": "Pune, India", "timezone": "Asia/Kolkata"}


@pytest.mark.asyncio
async def test_nominator_nominates_without_cohort(client, nominator_headers):
    m = await client.post("/api/nominations/mentors", json=MENTOR, headers=nominator_headers)
    t = await client.post("/api/nominations/trainees", json=TRAINEE, headers=nominator_headers)
    assert m.status_code == 200 and t.status_code == 200
    for body in (m.json(), t.json()):
        assert "cohortId" not in body and "mentorId" not in body

    mine = await client.get("/api/nominations/mine/trainees", headers=nominator_headers)
    assert mine.status_code == 200
    assert mine.json()["total"] == 1
    assert "cohortId" not in mine.json()["items"][0]


@pytest.mark.asyncio
async def test_duplicate_nomination_rejected(client, nominator_headers):
    first = await client.post("/api/nominations/trainees", json=TRAINEE, headers=nominator_headers)
    assert first.status_code == 200
    second = await client.post("/api/nominations/trainees", json=TRAINEE, headers=nominator_headers)
    assert second.status_code == 409
    assert second.json()["code"] == "DUPLICATE_NOMINATION"


@pytest.mark.asyncio
async def test_nominator_sees_only_own_nominations_and_no_cohort_data(
    client, nominator_headers, admin_headers, test_db
):
    await client.post("/api/nominations/trainees", json=TRAINEE, headers=nominator_headers)
    await test_db.trainees.insert_one({
        "cohortId": None, "nominatedBy": "someone-else", "name": "Other", "email": "other@example.com",
        "employeeId": "EMP-X", "mentorId": None,
    })
    mine = await client.get("/api/nominations/mine/trainees", headers=nominator_headers)
    assert [i["email"] for i in mine.json()["items"]] == ["tom@example.com"]

    # Admin-only endpoints are closed to nominators
    assert (await client.get("/api/nominations/trainees", headers=nominator_headers)).status_code == 403
    assert (await client.get("/api/cohorts", headers=nominator_headers)).status_code == 403
    dash = await client.get("/api/nominator/dashboard", headers=nominator_headers)
    assert dash.status_code == 200
    assert "cohortsList" not in dash.json() and dash.json()["totalTraineesNominated"] == 1


@pytest.mark.asyncio
async def test_admin_sees_all_nominees_and_allocates_to_cohort(
    client, nominator_headers, admin_headers
):
    await client.post("/api/nominations/mentors", json=MENTOR, headers=nominator_headers)
    await client.post("/api/nominations/trainees", json=TRAINEE, headers=nominator_headers)
    cohort_id = await _make_cohort(client, admin_headers)

    pool = await client.get("/api/nominations/trainees?allocation=unallocated", headers=admin_headers)
    assert pool.status_code == 200
    item = pool.json()["items"][0]
    assert item["nominatorName"] == "Test Nominator"
    assert item["allocationStatus"] == "unallocated"

    mentor_id = (await client.get("/api/nominations/mentors", headers=admin_headers)).json()["items"][0]["id"]
    alloc_m = await client.post(f"/api/cohorts/{cohort_id}/mentors/allocate", json={"ids": [mentor_id]}, headers=admin_headers)
    alloc_t = await client.post(f"/api/cohorts/{cohort_id}/trainees/allocate", json={"ids": [item["id"]]}, headers=admin_headers)
    assert alloc_m.json()["allocated"] == 1 and alloc_t.json()["allocated"] == 1

    # allocating twice is skipped, not duplicated
    again = await client.post(f"/api/cohorts/{cohort_id}/trainees/allocate", json={"ids": [item["id"]]}, headers=admin_headers)
    assert again.json()["allocated"] == 0 and len(again.json()["skipped"]) == 1

    # now visible inside the cohort, and no longer in the unallocated pool
    members = await client.get(f"/api/cohorts/{cohort_id}/trainees", headers=admin_headers)
    assert members.json()["total"] == 1
    pool = await client.get("/api/nominations/trainees?allocation=unallocated", headers=admin_headers)
    assert pool.json()["total"] == 0

    # any mentor in the cohort can be assigned to any trainee (no domain rules)
    assign = await client.put(f"/api/trainees/{item['id']}/mentor", json={"mentorId": mentor_id}, headers=admin_headers)
    assert assign.status_code == 200
    assert assign.json()["mentorName"] == "Maya Mentor"


@pytest.mark.asyncio
async def test_cannot_allocate_to_closed_cohort(client, nominator_headers, admin_headers):
    await client.post("/api/nominations/trainees", json=TRAINEE, headers=nominator_headers)
    cohort_id = await _make_cohort(client, admin_headers)
    await client.patch(f"/api/cohorts/{cohort_id}/status", json={"status": "closed"}, headers=admin_headers)
    trainee_id = (await client.get("/api/nominations/trainees", headers=admin_headers)).json()["items"][0]["id"]
    res = await client.post(f"/api/cohorts/{cohort_id}/trainees/allocate", json={"ids": [trainee_id]}, headers=admin_headers)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_admin_creates_global_nominator(client, admin_headers):
    res = await client.post("/api/users/nominators", json={
        "name": "Nina Nominator", "employeeId": "EMP-N9", "email": "nina@example.com",
    }, headers=admin_headers)
    assert res.status_code == 201
    assert res.json()["temporaryPassword"]
    listing = await client.get("/api/users/nominators", headers=admin_headers)
    assert listing.json()[0]["email"] == "nina@example.com"
    assert listing.json()[0]["mentorsNominated"] == 0
