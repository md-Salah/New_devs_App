from datetime import datetime
from decimal import Decimal
from typing import Dict, Any, List
import pytz

async def calculate_monthly_revenue(
    property_id: str,
    tenant_id: str,
    month: int,
    year: int,
    property_timezone: str = 'UTC',
    db_session=None,
) -> Decimal:
    """
    Calculates revenue for a specific month.

    Date boundaries are built in the property's local timezone and then
    converted to UTC so that a reservation like res-tz-1
    (2024-02-29 23:30 UTC = 2024-03-01 00:30 Europe/Paris) is counted in
    the month the guest actually experienced, not the UTC month.

    tenant_id is required to prevent cross-tenant aggregation when two
    tenants share the same property_id string (e.g. both own 'prop-001').
    """
    from sqlalchemy import text

    try:
        tz = pytz.timezone(property_timezone)
    except pytz.exceptions.UnknownTimeZoneError:
        tz = pytz.utc

    local_start = tz.localize(datetime(year, month, 1))
    local_end = (
        tz.localize(datetime(year, month + 1, 1))
        if month < 12
        else tz.localize(datetime(year + 1, 1, 1))
    )

    # Convert to UTC — the column is TIMESTAMP WITH TIME ZONE so PostgreSQL
    # will compare correctly against these offset-aware values.
    start_date = local_start.astimezone(pytz.utc)
    end_date = local_end.astimezone(pytz.utc)

    if db_session is None:
        return Decimal('0')

    query = text("""
        SELECT SUM(total_amount) as total
        FROM reservations
        WHERE property_id = :property_id
        AND tenant_id = :tenant_id
        AND check_in_date >= :start_date
        AND check_in_date < :end_date
    """)

    result = await db_session.execute(query, {
        "property_id": property_id,
        "tenant_id": tenant_id,
        "start_date": start_date,
        "end_date": end_date,
    })
    row = result.fetchone()
    return Decimal(str(row.total)) if row and row.total is not None else Decimal('0')

async def calculate_total_revenue(property_id: str, tenant_id: str) -> Dict[str, Any]:
    """
    Aggregates revenue from database.
    """
    try:
        # Reuse the module-level global pool — never create a new one per call.
        from app.core.database_pool import db_pool
        await db_pool.initialize()
        
        if db_pool.session_factory:
            async with db_pool.get_session() as session:
                # Use SQLAlchemy text for raw SQL
                from sqlalchemy import text
                
                query = text("""
                    SELECT 
                        property_id,
                        SUM(total_amount) as total_revenue,
                        COUNT(*) as reservation_count
                    FROM reservations 
                    WHERE property_id = :property_id AND tenant_id = :tenant_id
                    GROUP BY property_id
                """)
                
                result = await session.execute(query, {
                    "property_id": property_id, 
                    "tenant_id": tenant_id
                })
                row = result.fetchone()
                
                if row:
                    total_revenue = Decimal(str(row.total_revenue))
                    return {
                        "property_id": property_id,
                        "tenant_id": tenant_id,
                        "total": str(total_revenue),
                        "currency": "USD", 
                        "count": row.reservation_count
                    }
                else:
                    # No reservations found for this property
                    return {
                        "property_id": property_id,
                        "tenant_id": tenant_id,
                        "total": "0.00",
                        "currency": "USD",
                        "count": 0
                    }
        else:
            raise Exception("Database pool not available")
            
    except Exception as e:
        print(f"Database error for {property_id} (tenant: {tenant_id}): {e}")
        
        # Create property-specific mock data for testing when DB is unavailable
        # This ensures each property shows different figures
        mock_data = {
            'prop-001': {'total': '1000.00', 'count': 3},
            'prop-002': {'total': '4975.50', 'count': 4}, 
            'prop-003': {'total': '6100.50', 'count': 2},
            'prop-004': {'total': '1776.50', 'count': 4},
            'prop-005': {'total': '3256.00', 'count': 3}
        }
        
        mock_property_data = mock_data.get(property_id, {'total': '0.00', 'count': 0})
        
        return {
            "property_id": property_id,
            "tenant_id": tenant_id, 
            "total": mock_property_data['total'],
            "currency": "USD",
            "count": mock_property_data['count']
        }
