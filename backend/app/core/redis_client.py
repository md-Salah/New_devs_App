import redis.asyncio as redis
import json
import logging
from typing import Any, Optional, Union
import orjson
import lz4.frame
from ..config import settings

logger = logging.getLogger(__name__)

class RedisClient:
    def __init__(self):
        self.redis_pool = None
        self.redis_client = None
    
    @property
    def is_connected(self) -> bool:
        """Check if Redis client is connected"""
        return self.redis_client is not None
        
    async def initialize(self):
        """Initialize Redis connection pool"""
        try:
            # Create connection pool for better performance
            if getattr(settings, 'redis_url', None):
                self.redis_pool = redis.ConnectionPool.from_url(
                    settings.redis_url,
                    max_connections=50,
                    retry_on_timeout=True,
                    socket_keepalive=True,
                    health_check_interval=30,
                    socket_connect_timeout=5,
                    retry_on_error=[redis.ConnectionError, redis.TimeoutError]
                )
            else:
                self.redis_pool = redis.ConnectionPool(
                    host=getattr(settings, 'redis_host', 'localhost'),
                    port=getattr(settings, 'redis_port', 6379),
                    db=getattr(settings, 'redis_db', 0),
                    password=getattr(settings, 'redis_password', None),
                    max_connections=50,
                    retry_on_timeout=True,
                    socket_keepalive=True,
                    socket_keepalive_options={},
                    health_check_interval=30,
                    socket_connect_timeout=5,
                    retry_on_error=[redis.ConnectionError, redis.TimeoutError]
                )
            
            self.redis_client = redis.Redis(connection_pool=self.redis_pool)
            
            # Test connection with timeout
            await self.redis_client.ping()
            logger.info("✅ Redis connection established with connection pooling")
            
        except Exception as e:
            logger.warning(f"⚠️ Redis connection failed: {e}. Falling back to in-memory cache.")
            self.redis_client = None
    
    async def close(self):
        """Close Redis connections"""
        if self.redis_client:
            await self.redis_client.close()
        if self.redis_pool:
            await self.redis_pool.disconnect()
    
    @property
    def is_connected(self) -> bool:
        """Check if Redis client is connected"""
        return self.redis_client is not None
    
    def _serialize_data(self, data: Any) -> bytes:
        """Serialize data with compression for optimal storage"""
        try:
            # Use orjson for faster JSON serialization
            json_data = orjson.dumps(data)
            # Compress with LZ4 for speed
            compressed_data = lz4.frame.compress(json_data)
            return compressed_data
        except Exception as e:
            logger.error(f"Serialization error: {e}")
            return b""
    
    def _deserialize_data(self, data: bytes) -> Any:
        """Deserialize compressed data"""
        try:
            # Decompress
            json_data = lz4.frame.decompress(data)
            # Parse JSON
            return orjson.loads(json_data)
        except Exception as e:
            logger.error(f"Deserialization error: {e}")
            return None
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from Redis with automatic deserialization"""
        if not self.redis_client:
            return None
            
        try:
            data = await self.redis_client.get(key)
            if data:
                return self._deserialize_data(data)
            return None
        except Exception as e:
            logger.error(f"Redis GET error for key {key}: {e}")
            return None
    
    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """Set value in Redis with compression and TTL"""
        if not self.redis_client:
            return False
            
        try:
            serialized_data = self._serialize_data(value)
            if serialized_data:
                await self.redis_client.setex(key, ttl, serialized_data)
                return True
            return False
        except Exception as e:
            logger.error(f"Redis SET error for key {key}: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from Redis"""
        if not self.redis_client:
            return False
            
        try:
            result = await self.redis_client.delete(key)
            return result > 0
        except Exception as e:
            logger.error(f"Redis DELETE error for key {key}: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if key exists in Redis"""
        if not self.redis_client:
            return False
            
        try:
            result = await self.redis_client.exists(key)
            return result > 0
        except Exception as e:
            logger.error(f"Redis EXISTS error for key {key}: {e}")
            return False
    
    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern"""
        if not self.redis_client:
            return 0
            
        try:
            keys = await self.redis_client.keys(pattern)
            if keys:
                return await self.redis_client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Redis CLEAR_PATTERN error for pattern {pattern}: {e}")
            return 0
    
    async def pipeline_set(self, data: dict, ttl: int = 300) -> bool:
        """Set multiple keys using pipeline for better performance"""
        if not self.redis_client or not data:
            return False

        try:
            pipe = self.redis_client.pipeline()
            for key, value in data.items():
                serialized_data = self._serialize_data(value)
                if serialized_data:
                    pipe.setex(key, ttl, serialized_data)

            await pipe.execute()
            return True
        except Exception as e:
            logger.error(f"Redis PIPELINE_SET error: {e}")
            return False

    async def publish(self, channel: str, message: str) -> bool:
        """Publish message to Redis Pub/Sub channel"""
        if not self.redis_client:
            return False

        try:
            await self.redis_client.publish(channel, message)
            logger.debug(f"Published to channel {channel}: {message}")
            return True
        except Exception as e:
            logger.error(f"Redis PUBLISH error for channel {channel}: {e}")
            return False

    async def subscribe(self, channel: str):
        """Subscribe to a Redis Pub/Sub channel and return pubsub object"""
        if not self.redis_client:
            return None

        try:
            pubsub = self.redis_client.pubsub()
            await pubsub.subscribe(channel)
            logger.info(f"Subscribed to Redis channel: {channel}")
            return pubsub
        except Exception as e:
            logger.error(f"Redis SUBSCRIBE error for channel {channel}: {e}")
            return None

# Global Redis client instance
redis_client = RedisClient()

async def get_redis_client() -> RedisClient:
    """Dependency to get Redis client"""
    return redis_client
