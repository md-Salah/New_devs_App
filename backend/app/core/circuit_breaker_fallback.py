"""
Circuit Breaker Fallback Service
Provides graceful degradation when database connections fail
"""
import asyncio
import time
import json
import logging
from typing import Dict, Any, List, Optional, Union
from ..config import settings

logger = logging.getLogger(__name__)

class CircuitBreakerFallback:
    """
    Provides fallback mechanisms when circuit breakers are open
    """
    
    def __init__(self):
        self.cache = {}
        self.cache_ttl = 300  # 5 minutes default TTL
        self.fallback_responses = {
            "reservations": [],
            "properties": [],
            "users": [],
            "default": {"error": "Service temporarily unavailable", "fallback": True}
        }
        
    def get_cached_response(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get a cached response if available and not expired"""
        if cache_key in self.cache:
            cached_item = self.cache[cache_key]
            if time.time() - cached_item['timestamp'] < self.cache_ttl:
                logger.info(f"Returning cached response for {cache_key}")
                cached_item['data']['_fallback_cached'] = True
                cached_item['data']['_cached_at'] = cached_item['timestamp']
                return cached_item['data']
            else:
                # Remove expired cache
                del self.cache[cache_key]
        
        return None
    
    def cache_response(self, cache_key: str, response: Dict[str, Any]):
        """Cache a successful response for future fallback use"""
        try:
            # Only cache successful responses
            if isinstance(response, dict) and not response.get('error'):
                self.cache[cache_key] = {
                    'data': response,
                    'timestamp': time.time()
                }
                logger.debug(f"Cached response for {cache_key}")
        except Exception as e:
            logger.warning(f"Failed to cache response: {e}")
    
    def get_fallback_response(self, operation_type: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Get a fallback response when circuit breaker is open"""
        
        # Try to get from cache first
        cache_key = self._generate_cache_key(operation_type, params)
        cached_response = self.get_cached_response(cache_key)
        if cached_response:
            return cached_response
        
        # Generate appropriate fallback based on operation type
        if operation_type.lower() in ['reservation', 'reservations']:
            return self._get_reservations_fallback(params)
        elif operation_type.lower() in ['property', 'properties']:
            return self._get_properties_fallback(params)
        elif operation_type.lower() in ['user', 'users']:
            return self._get_users_fallback(params)
        elif operation_type.lower() in ['health', 'status']:
            return self._get_health_fallback()
        else:
            return self._get_default_fallback(operation_type, params)
    
    def _generate_cache_key(self, operation_type: str, params: Dict[str, Any] = None) -> str:
        """Generate a cache key for the operation"""
        if params:
            param_str = json.dumps(params, sort_keys=True)
            return f"{operation_type}:{hash(param_str)}"
        return operation_type
    
    def _get_reservations_fallback(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Fallback response for reservations queries"""
        return {
            "data": [],
            "count": 0,
            "error": None,
            "fallback": True,
            "fallback_type": "reservations",
            "message": "Reservations data temporarily unavailable. Showing cached data or empty results.",
            "retry_after": 60,
            "timestamp": time.time()
        }
    
    def _get_properties_fallback(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Fallback response for properties queries"""
        return {
            "data": [],
            "count": 0,
            "error": None,
            "fallback": True,
            "fallback_type": "properties",
            "message": "Properties data temporarily unavailable. Showing cached data or empty results.",
            "retry_after": 60,
            "timestamp": time.time()
        }
    
    def _get_users_fallback(self, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Fallback response for users queries"""
        return {
            "data": [],
            "count": 0,
            "error": None,
            "fallback": True,
            "fallback_type": "users",
            "message": "User data temporarily unavailable. Please try again in a moment.",
            "retry_after": 30,
            "timestamp": time.time()
        }
    
    def _get_health_fallback(self) -> Dict[str, Any]:
        """Fallback response for health checks"""
        return {
            "status": "degraded",
            "fallback": True,
            "message": "Database connections are experiencing issues. Running in degraded mode.",
            "retry_after": 30,
            "timestamp": time.time(),
            "details": {
                "database": "degraded",
                "circuit_breaker": "open",
                "fallback_active": True
            }
        }
    
    def _get_default_fallback(self, operation_type: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """Default fallback response for unknown operation types"""
        return {
            "error": f"Service temporarily unavailable for {operation_type}",
            "fallback": True,
            "fallback_type": "default",
            "message": "The requested service is temporarily unavailable due to database issues.",
            "retry_after": 60,
            "timestamp": time.time(),
            "operation_type": operation_type,
            "params": params
        }
    
    def clear_cache(self):
        """Clear all cached responses"""
        self.cache.clear()
        logger.info("Circuit breaker fallback cache cleared")
    
    def get_cache_status(self) -> Dict[str, Any]:
        """Get cache status information"""
        current_time = time.time()
        valid_entries = 0
        expired_entries = 0
        
        for key, item in self.cache.items():
            if current_time - item['timestamp'] < self.cache_ttl:
                valid_entries += 1
            else:
                expired_entries += 1
        
        return {
            "total_entries": len(self.cache),
            "valid_entries": valid_entries,
            "expired_entries": expired_entries,
            "cache_ttl": self.cache_ttl,
            "last_cleanup": current_time
        }
    
    async def cleanup_expired_cache(self):
        """Remove expired cache entries"""
        current_time = time.time()
        expired_keys = []
        
        for key, item in self.cache.items():
            if current_time - item['timestamp'] >= self.cache_ttl:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.cache[key]
        
        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")

# Global fallback service instance
fallback_service = CircuitBreakerFallback()

def get_fallback_service() -> CircuitBreakerFallback:
    """Get the global fallback service instance"""
    return fallback_service