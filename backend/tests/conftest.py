import pytest
import pytest_asyncio
import fakeredis.aioredis
from app.models.auth import AuthenticatedUser


@pytest.fixture
def fake_redis():
    """An in-process async Redis substitute — no real Redis needed."""
    return fakeredis.aioredis.FakeRedis(decode_responses=False)


@pytest.fixture
def tenant_a_user():
    return AuthenticatedUser(
        id="user-a",
        email="sunset@propertyflow.com",
        permissions=[],
        cities=[],
        is_admin=False,
        tenant_id="tenant-a",
    )


@pytest.fixture
def tenant_b_user():
    return AuthenticatedUser(
        id="user-b",
        email="ocean@propertyflow.com",
        permissions=[],
        cities=[],
        is_admin=False,
        tenant_id="tenant-b",
    )
