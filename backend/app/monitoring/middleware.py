"""FastAPI middleware for performance monitoring"""

import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from .performance import performance_monitor, EndpointMetrics
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class PerformanceMonitoringMiddleware(BaseHTTPMiddleware):
    """Middleware to track API endpoint performance"""
    
    async def dispatch(self, request: Request, call_next):
        # Skip monitoring for health checks and static files
        if request.url.path in ['/health', '/metrics', '/docs', '/openapi.json']:
            return await call_next(request)
        
        start_time = time.time()
        
        # Extract user context if available
        user_id = None
        tenant_id = None
        cache_hit = False
        
        try:
            # Try to extract user info from request state (set by auth middleware)
            if hasattr(request.state, 'user'):
                user_id = getattr(request.state.user, 'id', None)
                tenant_id = getattr(request.state.user, 'tenant_id', None)
        except:
            pass
        
        # Process the request
        response = await call_next(request)
        
        # Calculate duration
        duration_ms = (time.time() - start_time) * 1000
        
        # Check for cache hit header (set by our optimized endpoints)
        cache_hit = response.headers.get('x-cache-hit', 'false').lower() == 'true'
        
        # Create endpoint metrics
        metrics = EndpointMetrics(
            endpoint=request.url.path,
            method=request.method,
            duration_ms=duration_ms,
            timestamp=datetime.now(),
            status_code=response.status_code,
            user_id=user_id,
            tenant_id=tenant_id,
            cache_hit=cache_hit
        )
        
        # Record the metrics
        performance_monitor.record_endpoint(metrics)
        
        # Add performance headers to response
        response.headers['x-response-time'] = f"{duration_ms:.2f}ms"
        if cache_hit:
            response.headers['x-cache-hit'] = 'true'
        
        return response