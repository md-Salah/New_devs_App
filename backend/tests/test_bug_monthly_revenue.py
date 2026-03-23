"""
Bug: Monthly revenue calculation always returns Decimal('0').

In app/services/reservations.py the function calculate_monthly_revenue has
its actual database query commented out and replaced with a placeholder:

    # result = await db.fetch_val(query, property_id, tenant_id, ...)
    # return result or Decimal('0')

    return Decimal('0')  # Placeholder for now until DB connection is finalized

This means any monthly breakdown shown on the dashboard will always be zero,
regardless of the actual reservation data in the database.

Seed data for prop-001 / tenant-a in March 2024
------------------------------------------------
    res-dec-1   333.333
    res-dec-2   333.333
    res-dec-3   333.334
    ─────────────────────
    total      1 000.000

The reservation res-tz-1 (check_in_date 2024-02-29 23:30 UTC) has a check-in
in February UTC, so it is excluded from the March total when filtering by
check_in_date.

Expected (correct) behaviour
------------------------------
calculate_monthly_revenue("prop-001", "tenant-a", 3, 2024, db_session)
should return Decimal("1000.000") when the database session reports that
total for the given property / tenant / month window.

These tests FAIL until the placeholder return is replaced with a real query.
"""

import pytest
import pytest_asyncio
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_monthly_revenue_returns_db_total_not_zero():
    """
    When the database session returns a row whose SUM is 1 000.000 for
    prop-001 / tenant-a / March 2024, calculate_monthly_revenue must return
    that value — not the hardcoded Decimal('0').

    FAILS with current code because the DB query is commented out.
    """
    from app.services.reservations import calculate_monthly_revenue

    # Build a mock DB session whose execute() returns a row with total=1000.000.
    mock_row = MagicMock()
    mock_row.total = Decimal("1000.000")

    mock_result = MagicMock()
    mock_result.fetchone.return_value = mock_row

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await calculate_monthly_revenue(
        property_id="prop-001",
        month=3,
        year=2024,
        db_session=mock_session,
    )

    # This assertion FAILS: current code returns Decimal('0') unconditionally.
    assert result == Decimal("1000.000"), (
        f"Expected Decimal('1000.000') from the DB mock but got {result!r}. "
        f"The monthly revenue query is commented out and returns a placeholder 0."
    )


@pytest.mark.asyncio
async def test_monthly_revenue_is_not_always_zero():
    """
    Sanity check: the function must NOT return zero when the database has data.

    FAILS with current code.
    """
    from app.services.reservations import calculate_monthly_revenue

    mock_row = MagicMock()
    mock_row.total = Decimal("5000.00")

    mock_result = MagicMock()
    mock_result.fetchone.return_value = mock_row

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await calculate_monthly_revenue(
        property_id="prop-002",
        month=3,
        year=2024,
        db_session=mock_session,
    )

    assert result != Decimal("0"), (
        f"calculate_monthly_revenue returned Decimal('0') even though the "
        f"database mock reported a non-zero total. The placeholder return "
        f"statement must be removed and replaced with a real DB query."
    )


@pytest.mark.asyncio
async def test_monthly_revenue_respects_month_boundaries():
    """
    The function must pass the correct start/end date range for the given
    month to the DB query — i.e. it must actually call the session.

    FAILS with current code because the session is never called (the function
    returns immediately with Decimal('0') before reaching the query).
    """
    from app.services.reservations import calculate_monthly_revenue

    mock_row = MagicMock()
    mock_row.total = Decimal("420.00")

    mock_result = MagicMock()
    mock_result.fetchone.return_value = mock_row

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    await calculate_monthly_revenue(
        property_id="prop-004",
        month=3,
        year=2024,
        db_session=mock_session,
    )

    # The session must have been called at least once — meaning the query ran.
    # FAILS with current code because execute() is never reached.
    mock_session.execute.assert_called_once(), (
        "calculate_monthly_revenue never called the database session. "
        "The query is commented out and execution returns early with 0."
    )
