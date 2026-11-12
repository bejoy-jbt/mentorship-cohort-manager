import pytest
from httpx import AsyncClient, ASGITransport
from motor.motor_asyncio import AsyncIOMotorClient
from app.main import app
from app.core.config import settings
from app.core.security import get_password_hash, create_access_token

TEST_DB_NAME = "cohort_manager_test"

@pytest.fixture(autouse=True)
async def test_db():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[TEST_DB_NAME]
    
    settings.DATABASE_NAME = TEST_DB_NAME
    from app.core.db import db_instance
    db_instance.client = client
    db_instance.db = db

    collections = [
        "users", "cohorts", "mentors", "trainees",
        "trainingTemplates", "cohortTrainingPlans",
        "feedbackTemplates", "cohortFeedbackForms",
        "progress", "feedbackResponses",
        "personIdentityClaims", "talentnextCourses",
        "batches", "sessions", "attendance",
    ]
    for col in collections:
        await db[col].delete_many({})
        
    yield db
    
    client.close()

@pytest.fixture
def db(test_db):
    return test_db

@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

@pytest.fixture
async def admin_user(test_db):
    user = {
        "name": "Test Admin",
        "email": "admin@test.com",
        "passwordHash": get_password_hash("Admin@123"),
        "role": "admin",
        "isActive": True
    }
    res = await test_db.users.insert_one(user)
    user["id"] = str(res.inserted_id)
    return user

@pytest.fixture
def admin_token(admin_user):
    return create_access_token(subject=admin_user["id"], role="admin")

@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture
async def nominator_user(test_db):
    user = {
        "name": "Test Nominator",
        "email": "nominator@test.com",
        "passwordHash": get_password_hash("Nom@123"),
        "role": "nominator",
        "isActive": True
    }
    res = await test_db.users.insert_one(user)
    user["id"] = str(res.inserted_id)
    return user

@pytest.fixture
def nominator_token(nominator_user):
    return create_access_token(subject=nominator_user["id"], role="nominator")

@pytest.fixture
def nominator_headers(nominator_token):
    return {"Authorization": f"Bearer {nominator_token}"}

@pytest.fixture
async def mentor_user(test_db):
    user = {
        "name": "Test Mentor",
        "email": "mentor@test.com",
        "passwordHash": get_password_hash("Mentor@123"),
        "role": "mentor",
        "isActive": True
    }
    res = await test_db.users.insert_one(user)
    user["id"] = str(res.inserted_id)
    return user

@pytest.fixture
def mentor_token(mentor_user):
    return create_access_token(subject=mentor_user["id"], role="mentor")

@pytest.fixture
def mentor_headers(mentor_token):
    return {"Authorization": f"Bearer {mentor_token}"}
