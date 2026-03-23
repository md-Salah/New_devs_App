"""
Tests for 3 additional logical bugs discovered after the initial fix pass.

Bug 4 – Timezone-naive date boundaries in calculate_monthly_revenue
Bug 5 – Missing tenant_id filter in calculate_monthly_revenue query
Bug 6 – New DatabasePool instantiated on every calculate_total_revenue call
"""

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Bug 4 — Timezone-naive monthly boundaries
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_monthly_revenue_uses_timezone_aware_boundaries():
    """
    Bug 4: calculate_monthly_revenue builds date boundaries with naive
    datetime objects (no tzinfo).

    The seed reservation res-tz-1 has check_in_date = '2024-02-29 23:30:00+00'.
    Beach House Alpha is in Europe/Paris (UTC+1), so that timestamp is
    2024-03-01 00:30 local time — a March booking in the client's eyes.

    Because the current code uses datetime(2024, 3, 1) (naive UTC) as the
    lower bound, the query treats the boundary as 00:00 UTC and correctly
    starts there — BUT it never converts "start of March in Paris" to the
    equivalent UTC moment (2024-02-29 23:00 UTC for CET).  Any booking
    between 2024-02-29 23:00 UTC and 2024-03-01 00:00 UTC that belongs to a
    Paris property is silently dropped from the March total.

    The fix must pass timezone-aware datetimes to the query so that UTC-stored
    timestamps are compared against the correct boundary.

    FAILS because datetime(year, month, 1) has tzinfo = None.
    """
    from app.services.reservations import calculate_monthly_revenue

    captured = {}

    mock_result = MagicMock()
    mock_result.fetchone.return_value = None

    async def capture_execute(query, params):
        captured.update(params)
        return mock_result

    mock_session = AsyncMock()
    mock_session.execute = capture_execute

    await calculate_monthly_revenue("prop-001", 3, 2024, db_session=mock_session)

    start_date = captured.get("start_date")
    assert start_date is not None, "start_date was never passed to the query"

    # The start_date MUST carry timezone info so that the comparison against
    # TIMESTAMP WITH TIME ZONE columns is unambiguous.
    assert start_date.tzinfo is not None, (
        f"start_date {start_date!r} is timezone-naive. "
        f"Naive boundaries silently mis-assign reservations near UTC midnight "
        f"for properties in non-UTC timezones (e.g. Europe/Paris). "
        f"res-tz-1 (2024-02-29 23:30 UTC = 2024-03-01 00:30 Paris) is counted "
        f"in February instead of March, making the March total $1,250 short."
    )


# ---------------------------------------------------------------------------
# Bug 5 — Missing tenant_id filter in calculate_monthly_revenue
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_monthly_revenue_filters_by_tenant_id():
    """
    Bug 5: calculate_monthly_revenue has no tenant_id parameter and no
    tenant_id filter in its SQL query.

    Both tenant-a and tenant-b own a property called 'prop-001'.  Without a
    tenant_id filter the monthly SUM aggregates reservations from BOTH tenants,
    leaking cross-tenant revenue data — the same category of bug as the cache
    key issue, just in a different layer.

    Correct behaviour: the function must accept a tenant_id argument and pass
    it to the WHERE clause.

    FAILS because the current signature is
        calculate_monthly_revenue(property_id, month, year, db_session=None)
    with no tenant_id parameter — calling it with tenant_id raises TypeError.
    """
    from app.services.reservations import calculate_monthly_revenue

    captured = {}

    mock_result = MagicMock()
    mock_result.fetchone.return_value = None

    async def capture_execute(query, params):
        captured["sql"] = str(query)
        captured["params"] = dict(params)
        return mock_result

    mock_session = AsyncMock()
    mock_session.execute = capture_execute

    # This call itself raises TypeError with the current signature — that is
    # the failing assertion: the function does not accept tenant_id at all.
    await calculate_monthly_revenue(
        "prop-001", 3, 2024,
        tenant_id="tenant-a",        # <-- required param that does not exist yet
        db_session=mock_session,
    )

    # If the call somehow succeeds, also verify the SQL uses it.
    assert "tenant_id" in captured.get("params", {}), (
        "tenant_id was not passed as a bind parameter to the query. "
        "Without it, prop-001 revenue from both tenants is summed together."
    )
    assert "tenant_id" in captured.get("sql", "").lower(), (
        "The SQL query does not contain a tenant_id filter. "
        "Cross-tenant data leakage will occur for shared property IDs."
    )


# ---------------------------------------------------------------------------
# Bug 6 — New DatabasePool per request
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_calculate_total_revenue_does_not_create_new_pool_per_call():
    """
    Bug 6: calculate_total_revenue does:

        db_pool = DatabasePool()   # ← brand-new pool every call
        await db_pool.initialize() # ← opens up to 20 new DB connections

    The module-level global `db_pool` in database_pool.py is completely
    ignored.  Under load every request opens 20 PostgreSQL connections that
    are never properly recycled, exhausting the database's connection limit.

    Correct behaviour: reuse the global pool; instantiate DatabasePool at
    most once across multiple calls.

    FAILS because DatabasePool() is currently called inside the function body,
    so each call to calculate_total_revenue creates a new instance.
    """
    from app.core.database_pool import DatabasePool

    instance_count = {"n": 0}

    real_init = DatabasePool.__init__

    def counting_init(self):
        instance_count["n"] += 1
        self.engine = None
        self.session_factory = None  # prevent actual DB connection

    # DatabasePool is imported inside the function body, so patch the source module.
    def track_new(*args, **kwargs):
        instance_count["n"] += 1
        inst = MagicMock()
        inst.session_factory = None  # triggers the fallback/exception path
        inst.initialize = AsyncMock()
        return inst

    with patch("app.core.database_pool.DatabasePool", side_effect=track_new):
        from app.services.reservations import calculate_total_revenue

        # Two sequential calls — should reuse one pool, not create two.
        await calculate_total_revenue("prop-001", "tenant-a")
        await calculate_total_revenue("prop-001", "tenant-a")

    assert instance_count["n"] <= 1, (
        f"DatabasePool was instantiated {instance_count['n']} times across 2 calls. "
        f"Each instantiation opens up to 20 new PostgreSQL connections. "
        f"The global db_pool from database_pool.py should be reused instead."
    )
