"""
Async wrapper for Supabase client to prevent blocking the event loop
"""
import asyncio
from functools import partial
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor
from ..database import supabase

# Enhanced thread pool for database operations with better connection handling
# Increased pool size to handle concurrent upsell purchase operations
executor = ThreadPoolExecutor(max_workers=50, thread_name_prefix="supabase_")

# Connection pooling settings to prevent connection terminated errors
import time
import logging
from threading import Lock
from ..config import settings

logger = logging.getLogger(__name__)

# Enhanced connection health tracking with configurable thresholds
class ConnectionTracker:
    def __init__(self):
        self.failed_connections = 0
        self.last_failure = None
        self.lock = Lock()
        self.max_retries = settings.database_max_retries
        self.base_delay = settings.database_retry_delay
        self.failure_threshold = 5  # Configurable failure threshold
        self.throttle_duration = 30  # Configurable throttle duration
        
        # Track retry attempts per operation
        self.retry_counts = {}
        self.operation_timeouts = {}
    
    def record_failure(self, operation_id: str = None):
        with self.lock:
            self.failed_connections += 1
            self.last_failure = time.time()
            
            if operation_id:
                self.retry_counts[operation_id] = self.retry_counts.get(operation_id, 0) + 1
    
    def record_success(self, operation_id: str = None):
        with self.lock:
            self.failed_connections = max(0, self.failed_connections - 1)
            
            if operation_id and operation_id in self.retry_counts:
                del self.retry_counts[operation_id]
    
    def should_throttle(self):
        with self.lock:
            if self.failed_connections > self.failure_threshold and self.last_failure:
                return time.time() - self.last_failure < self.throttle_duration
            return False
    
    def should_retry(self, operation_id: str, error_type: str = None) -> bool:
        """Check if an operation should be retried based on retry count and error type"""
        with self.lock:
            retry_count = self.retry_counts.get(operation_id, 0)
            
            # Don't retry if we've exceeded max retries
            if retry_count >= self.max_retries:
                return False
            
            # Always retry connection-related errors
            if error_type and error_type in ['connection', 'timeout', 'pool_exhausted']:
                return True
            
            # Retry other errors up to max_retries
            return retry_count < self.max_retries
    
    def get_retry_delay(self, operation_id: str) -> float:
        """Get exponential backoff delay for retry"""
        with self.lock:
            retry_count = self.retry_counts.get(operation_id, 0)
            # Exponential backoff: base_delay * 2^retry_count, capped at 30 seconds
            delay = min(self.base_delay * (2 ** retry_count), 30.0)
            return delay
    
    def cleanup_old_operations(self):
        """Clean up old operation tracking data"""
        current_time = time.time()
        with self.lock:
            # Remove operations older than 5 minutes
            old_operations = [
                op_id for op_id, timestamp in self.operation_timeouts.items()
                if current_time - timestamp > 300
            ]
            for op_id in old_operations:
                self.retry_counts.pop(op_id, None)
                self.operation_timeouts.pop(op_id, None)

connection_tracker = ConnectionTracker()

class AsyncSupabase:
    """Async wrapper for Supabase operations"""
    
    def __init__(self, client):
        self.client = client
        
    async def execute_async(self, operation):
        """Execute a Supabase operation asynchronously"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, operation)
    
    def table(self, table_name: str):
        """Return an async table wrapper"""
        return AsyncTable(self.client.table(table_name))
    
    def rpc(self, function_name: str, params: Dict = None):
        """Return an async RPC wrapper"""
        return AsyncRPC(self.client, function_name, params)

class AsyncTable:
    """Async wrapper for Supabase table operations"""
    
    def __init__(self, table):
        self.table = table
        self._query = table
        
    def select(self, *args, **kwargs):
        """Chain select operation"""
        self._query = self._query.select(*args, **kwargs)
        return self
    
    def insert(self, data: Dict):
        """Chain insert operation"""
        self._query = self._query.insert(data)
        return self
    
    def update(self, data: Dict):
        """Chain update operation"""
        self._query = self._query.update(data)
        return self
    
    def upsert(self, data: Dict):
        """Chain upsert operation"""
        self._query = self._query.upsert(data)
        return self
    
    def delete(self):
        """Chain delete operation"""
        self._query = self._query.delete()
        return self
    
    def eq(self, column: str, value: Any):
        """Chain eq filter"""
        self._query = self._query.eq(column, value)
        return self
    
    def neq(self, column: str, value: Any):
        """Chain neq filter"""
        self._query = self._query.neq(column, value)
        return self
    
    def gt(self, column: str, value: Any):
        """Chain gt filter"""
        self._query = self._query.gt(column, value)
        return self
    
    def gte(self, column: str, value: Any):
        """Chain gte filter"""
        self._query = self._query.gte(column, value)
        return self
    
    def lt(self, column: str, value: Any):
        """Chain lt filter"""
        self._query = self._query.lt(column, value)
        return self
    
    def lte(self, column: str, value: Any):
        """Chain lte filter"""
        self._query = self._query.lte(column, value)
        return self
    
    def in_(self, column: str, values: List):
        """Chain in filter"""
        self._query = self._query.in_(column, values)
        return self
    
    def is_(self, column: str, value: Any):
        """Chain is filter"""
        self._query = self._query.is_(column, value)
        return self
    
    def order(self, column: str, desc: bool = False):
        """Chain order operation"""
        self._query = self._query.order(column, desc=desc)
        return self
    
    def limit(self, count: int):
        """Chain limit operation"""
        self._query = self._query.limit(count)
        return self
    
    def single(self):
        """Chain single operation"""
        self._query = self._query.single()
        return self
    
    def maybe_single(self):
        """Chain maybe_single operation"""
        self._query = self._query.maybe_single()
        return self
    
    def range(self, start: int, end: int):
        """Chain range operation for pagination"""
        self._query = self._query.range(start, end)
        return self
    
    async def execute(self):
        """Execute the built query asynchronously with enhanced connection health tracking and retry logic"""
        import uuid
        operation_id = str(uuid.uuid4())
        
        # Check if we should throttle due to connection issues
        if connection_tracker.should_throttle():
            logger.warning("Throttling database query due to connection issues")
            await asyncio.sleep(2)  # Longer delay to let connections recover
        
        loop = asyncio.get_event_loop()
        
        while connection_tracker.should_retry(operation_id):
            try:
                result = await loop.run_in_executor(executor, self._query.execute)
                connection_tracker.record_success(operation_id)
                return result
                
            except Exception as e:
                error_msg = str(e).lower()
                
                # Classify error type for retry logic
                error_type = None
                if any(phrase in error_msg for phrase in [
                    'resource temporarily unavailable',
                    'connection reset',
                    'connection terminated',
                    'connection refused',
                    'pool exhausted'
                ]):
                    error_type = 'connection'
                elif any(phrase in error_msg for phrase in ['timeout', 'timed out']):
                    error_type = 'timeout'
                elif 'pool' in error_msg and 'exhausted' in error_msg:
                    error_type = 'pool_exhausted'
                
                connection_tracker.record_failure(operation_id, error_type)
                
                # Check if we should retry
                if connection_tracker.should_retry(operation_id, error_type):
                    delay = connection_tracker.get_retry_delay(operation_id)
                    retry_count = connection_tracker.retry_counts.get(operation_id, 0)
                    logger.warning(
                        f"Database query failed (attempt {retry_count}/{settings.database_max_retries}), "
                        f"retrying in {delay}s: {str(e)}"
                    )
                    await asyncio.sleep(delay)
                    continue
                else:
                    retry_count = connection_tracker.retry_counts.get(operation_id, 0)
                    logger.error(f"Database query failed after {retry_count} attempts: {str(e)}")
                    # Clean up tracking for this operation
                    connection_tracker.record_success(operation_id)
                    raise

class AsyncRPC:
    """Async wrapper for Supabase RPC operations"""
    
    def __init__(self, client, function_name: str, params: Dict = None):
        self.client = client
        self.function_name = function_name
        self.params = params or {}
    
    async def execute(self):
        """Execute the RPC call asynchronously with enhanced connection health tracking and retry logic"""
        import uuid
        operation_id = str(uuid.uuid4())
        
        # Check if we should throttle due to connection issues
        if connection_tracker.should_throttle():
            logger.warning("Throttling RPC call due to connection issues")
            await asyncio.sleep(2)  # Longer delay to let connections recover
        
        loop = asyncio.get_event_loop()
        
        while connection_tracker.should_retry(operation_id):
            try:
                rpc_call = partial(self.client.rpc, self.function_name, self.params)
                rpc_query = await loop.run_in_executor(executor, rpc_call)
                result = await loop.run_in_executor(executor, rpc_query.execute)
                connection_tracker.record_success(operation_id)
                return result
                
            except Exception as e:
                error_msg = str(e).lower()
                
                # Classify error type for retry logic
                error_type = None
                if any(phrase in error_msg for phrase in [
                    'resource temporarily unavailable',
                    'connection reset',
                    'connection terminated',
                    'connection refused',
                    'pool exhausted'
                ]):
                    error_type = 'connection'
                elif any(phrase in error_msg for phrase in ['timeout', 'timed out']):
                    error_type = 'timeout'
                elif 'pool' in error_msg and 'exhausted' in error_msg:
                    error_type = 'pool_exhausted'
                
                connection_tracker.record_failure(operation_id, error_type)
                
                # Check if we should retry
                if connection_tracker.should_retry(operation_id, error_type):
                    delay = connection_tracker.get_retry_delay(operation_id)
                    retry_count = connection_tracker.retry_counts.get(operation_id, 0)
                    logger.warning(
                        f"RPC call failed (attempt {retry_count}/{settings.database_max_retries}), "
                        f"retrying in {delay}s: {str(e)}"
                    )
                    await asyncio.sleep(delay)
                    continue
                else:
                    retry_count = connection_tracker.retry_counts.get(operation_id, 0)
                    logger.error(f"RPC call failed after {retry_count} attempts: {str(e)}")
                    # Clean up tracking for this operation
                    connection_tracker.record_success(operation_id)
                    raise

# Global async Supabase client
async_supabase = AsyncSupabase(supabase)