"""
Minimal tenant cache for caching tenant-related data.
"""
from typing import Optional, Any, Dict
import time
import logging

logger = logging.getLogger(__name__)


class TenantCache:
    """Simple in-memory cache for tenant data with TTL support."""

    def __init__(self, default_ttl: int = 300):
        """
        Initialize the tenant cache.

        Args:
            default_ttl: Default time-to-live in seconds (default: 5 minutes)
        """
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from the cache.

        Args:
            key: Cache key

        Returns:
            Cached value if found and not expired, None otherwise
        """
        if key not in self._cache:
            return None

        entry = self._cache[key]

        # Check if expired
        if entry['expires_at'] < time.time():
            del self._cache[key]
            return None

        return entry['value']

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """
        Set a value in the cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds (uses default if not specified)
        """
        ttl = ttl if ttl is not None else self._default_ttl
        expires_at = time.time() + ttl

        self._cache[key] = {
            'value': value,
            'expires_at': expires_at
        }

    def delete(self, key: str) -> None:
        """
        Delete a key from the cache.

        Args:
            key: Cache key to delete
        """
        if key in self._cache:
            del self._cache[key]

    def clear(self) -> None:
        """Clear all entries from the cache."""
        self._cache.clear()

    def clear_expired(self) -> int:
        """
        Clear all expired entries from the cache.

        Returns:
            Number of entries cleared
        """
        current_time = time.time()
        expired_keys = [
            key for key, entry in self._cache.items()
            if entry['expires_at'] < current_time
        ]

        for key in expired_keys:
            del self._cache[key]

        if expired_keys:
            logger.debug(f"Cleared {len(expired_keys)} expired cache entries")

        return len(expired_keys)

    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dictionary with cache statistics
        """
        current_time = time.time()
        expired_count = sum(
            1 for entry in self._cache.values()
            if entry['expires_at'] < current_time
        )

        return {
            'total_entries': len(self._cache),
            'expired_entries': expired_count,
            'active_entries': len(self._cache) - expired_count
        }


# Global tenant cache instance
tenant_cache = TenantCache(default_ttl=300)  # 5 minutes default TTL
