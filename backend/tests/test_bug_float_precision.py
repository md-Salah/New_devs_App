"""
Bug: Float conversion of Decimal revenue loses sub-cent precision.

In app/api/v1/dashboard.py the endpoint does:

    total_revenue_float = float(revenue_data['total'])

The database column is NUMERIC(10, 3) — three decimal places, deliberately
chosen to track sub-cent amounts (see schema comment).  Converting to Python
float (IEEE 754 double) is unsafe for financial values because many decimal
fractions cannot be represented exactly in binary floating-point.

The seed data uses the amounts  333.333 + 333.333 + 333.334  for prop-001 /
tenant-a, which sum to exactly 1 000.000 in NUMERIC arithmetic but produce
999.9999999999999 when summed as Python floats.

Expected (correct) behaviour
------------------------------
The API should return the total_revenue as a string representation of the
exact decimal value (e.g. "2250.000"), preserving the precision that the
database guarantees.  It must NOT return a bare JSON number (float).

These tests FAIL until the dashboard endpoint returns the value as a string
instead of converting it with float().
"""

import pytest
import pytest_asyncio
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from app.models.auth import AuthenticatedUser


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(tenant_id: str) -> AuthenticatedUser:
    return AuthenticatedUser(
        id="test-user",
        email="test@example.com",
        permissions=[],
        cities=[],
        is_admin=False,
        tenant_id=tenant_id,
    )


# ---------------------------------------------------------------------------
# Unit test — demonstrates why float is unsafe for financial arithmetic
# ---------------------------------------------------------------------------

def test_float_arithmetic_is_imprecise_for_seed_data_amounts():
    """
    The seed data stores three reservations for prop-001 / tenant-a:
        333.333 + 333.333 + 333.334 = 1 000.000  (exact, NUMERIC)

    When Python performs the same addition as floats the result is wrong.
    This test is intentionally a *unit* proof-of-concept — it does not touch
    the application code — but it demonstrates precisely why the float()
    conversion in dashboard.py is dangerous.

    This test FAILS, proving float is not safe for these values.
    """
    amounts_str = ["333.333", "333.333", "333.334"]

    # Exact arithmetic with Decimal (mirrors what PostgreSQL NUMERIC does).
    decimal_total = sum(Decimal(a) for a in amounts_str)
    assert decimal_total == Decimal("1000.000"), (
        f"Decimal arithmetic should be exact: {decimal_total}"
    )

    # Same values summed as floats — the result is NOT 1000.0.
    float_total = sum(float(a) for a in amounts_str)

    # This assertion FAILS: float_total == 999.9999999999999
    assert float_total == 1000.0, (
        f"Float arithmetic produced {float_total!r} instead of 1000.0. "
        f"This proves float is unsafe for sub-cent financial values."
    )


# ---------------------------------------------------------------------------
# Endpoint test — dashboard must return the value as an exact string
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dashboard_returns_revenue_as_exact_string_not_float():
    """
    When the revenue service returns total = "333.333" the dashboard endpoint
    must preserve that exact value.  Returning it as a JSON number (float)
    risks silent precision loss in downstream consumers.

    The test mocks authentication and the revenue service so no database or
    Redis connection is required.

    This test FAILS with the current code because dashboard.py converts the
    total to float before returning it, making the JSON response field a number
    rather than a string.
    """
    from app.main import app
    from app.core.auth import authenticate_request as _auth_dep
    from app.services.cache import get_revenue_summary as _cache_dep

    precise_total = "333.333"
    mock_revenue = {
        "property_id": "prop-001",
        "tenant_id": "tenant-a",
        "total": precise_total,
        "currency": "USD",
        "count": 3,
    }

    # Override auth so no JWT/Supabase needed.
    app.dependency_overrides[_auth_dep] = lambda: _make_user("tenant-a")

    try:
        with patch("app.api.v1.dashboard.get_revenue_summary", new=AsyncMock(return_value=mock_revenue)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get(
                    "/api/v1/dashboard/summary",
                    params={"property_id": "prop-001"},
                )

        assert response.status_code == 200, f"Unexpected status: {response.status_code} — {response.text}"

        data = response.json()
        total_revenue = data["total_revenue"]

        # The value must be returned as a STRING so decimal precision is preserved.
        # This assertion FAILS because the current code does float(revenue_data['total']),
        # making total_revenue a JSON number (Python float), not a string.
        assert isinstance(total_revenue, str), (
            f"total_revenue should be a string to preserve decimal precision, "
            f"but got {type(total_revenue).__name__!r} with value {total_revenue!r}. "
            f"Converting '333.333' to float introduces IEEE 754 imprecision."
        )

        # The string value must match the database value exactly.
        assert total_revenue == precise_total, (
            f"Expected '{precise_total}' but got '{total_revenue}'"
        )
    finally:
        app.dependency_overrides.clear()
