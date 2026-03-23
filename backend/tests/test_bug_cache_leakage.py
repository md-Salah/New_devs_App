"""
Bug: Cross-tenant cache leakage.

The Redis cache key in app/services/cache.py is built as:

    cache_key = f"revenue:{property_id}"

It omits tenant_id.  Both tenant-a and tenant-b own a property whose id is
"prop-001" (see database/seed.sql).  Whichever tenant requests the dashboard
first has their data cached under "revenue:prop-001".  The next tenant to
request the same property_id receives the first tenant's data — a serious
privacy violation.

Expected (correct) behaviour
------------------------------
Each (tenant_id, property_id) pair gets its own isolated cache entry so that
tenant-b can never see tenant-a's revenue and vice-versa.

These tests FAIL until the cache key is changed to include tenant_id, e.g.:

    cache_key = f"revenue:{tenant_id}:{property_id}"
"""

import json
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
import fakeredis.aioredis

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TENANT_A_REVENUE = {
    "property_id": "prop-001",
    "tenant_id": "tenant-a",
    "total": "2250.000",
    "currency": "USD",
    "count": 4,
}

TENANT_B_REVENUE = {
    "property_id": "prop-001",
    "tenant_id": "tenant-b",
    "total": "0.000",
    "currency": "USD",
    "count": 0,
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_different_tenants_same_property_get_isolated_cache_entries():
    """
    Tenant-a queries prop-001 first; result is cached.
    Tenant-b then queries the same prop-001 and MUST NOT receive tenant-a's data.

    FAILS with current code because both tenants share the key "revenue:prop-001".
    """
    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=False)

    call_count = {"n": 0}

    async def mock_calculate(property_id, tenant_id):
        call_count["n"] += 1
        if tenant_id == "tenant-a":
            return TENANT_A_REVENUE
        return TENANT_B_REVENUE

    with patch("app.services.cache.redis_client", fake_redis), \
         patch("app.services.reservations.calculate_total_revenue", side_effect=mock_calculate):

        from app.services.cache import get_revenue_summary

        # Tenant-a fetches first — their data gets written to the cache.
        result_a = await get_revenue_summary("prop-001", "tenant-a")
        assert result_a["tenant_id"] == "tenant-a"
        assert result_a["total"] == "2250.000"

        # Tenant-b fetches the same property_id.
        # With the bug: the cache already holds "revenue:prop-001" (tenant-a's data)
        # and it is returned directly — calculate_total_revenue is never called again.
        result_b = await get_revenue_summary("prop-001", "tenant-b")

        # This assertion FAILS with the current code:
        # result_b still contains tenant-a's payload because the shared cache key
        # was hit and calculate_total_revenue was never called for tenant-b.
        assert result_b["tenant_id"] == "tenant-b", (
            f"Cache leakage detected: tenant-b received tenant-a's data. "
            f"Got tenant_id='{result_b['tenant_id']}', total='{result_b['total']}'"
        )
        assert result_b["total"] == "0.000", (
            f"Cache leakage detected: tenant-b's revenue should be '0.000' "
            f"but got '{result_b['total']}' (tenant-a's value)"
        )


@pytest.mark.asyncio
async def test_cache_key_is_tenant_scoped():
    """
    After both tenants have queried, the cache must contain two separate keys —
    one per (tenant_id, property_id) pair — not a single shared key.

    FAILS with current code because only one key "revenue:prop-001" exists.
    """
    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=False)

    async def mock_calculate(property_id, tenant_id):
        if tenant_id == "tenant-a":
            return TENANT_A_REVENUE
        return TENANT_B_REVENUE

    with patch("app.services.cache.redis_client", fake_redis), \
         patch("app.services.reservations.calculate_total_revenue", side_effect=mock_calculate):

        from app.services.cache import get_revenue_summary

        await get_revenue_summary("prop-001", "tenant-a")
        await get_revenue_summary("prop-001", "tenant-b")

    # Inspect what keys were written to fake Redis.
    all_keys = [k.decode() if isinstance(k, bytes) else k for k in await fake_redis.keys("*")]

    # There must be TWO distinct keys — one per tenant.
    assert len(all_keys) == 2, (
        f"Expected 2 isolated cache keys (one per tenant) but found {len(all_keys)}: {all_keys}. "
        f"This means the cache key does not include tenant_id."
    )

    # Each key must contain the tenant identifier so keys are never shared.
    assert any("tenant-a" in k for k in all_keys), (
        f"No cache key contains 'tenant-a'. Keys found: {all_keys}"
    )
    assert any("tenant-b" in k for k in all_keys), (
        f"No cache key contains 'tenant-b'. Keys found: {all_keys}"
    )
