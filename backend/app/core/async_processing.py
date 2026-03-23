"""
Async Request Processing Service
Provides background task processing and concurrent request handling
to improve response times and system throughput
"""
import asyncio
import logging
from typing import Callable, Any, Dict, List, Optional, Union
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)

class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class AsyncTask:
    """Represents an async task with metadata"""
    id: str
    name: str
    user_id: str
    tenant_id: str
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Any = None
    error: Optional[str] = None
    progress: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

class AsyncProcessor:
    """
    High-performance async processing service for concurrent operations
    """
    
    def __init__(self, max_workers: int = 10, max_concurrent_tasks: int = 50):
        self.max_workers = max_workers
        self.max_concurrent_tasks = max_concurrent_tasks
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        
        # Task management
        self.tasks: Dict[str, AsyncTask] = {}
        self.active_tasks: Dict[str, asyncio.Task] = {}
        
        # Performance tracking
        self.total_tasks_processed = 0
        self.total_processing_time = 0.0
        self.task_cleanup_threshold = timedelta(hours=24)  # Clean up tasks after 24h
        
        # Rate limiting
        self.user_task_limits: Dict[str, int] = {}  # user_id -> active_task_count
        self.max_user_concurrent_tasks = 5
        
        # Background cleanup task
        self._cleanup_task = None
        self._shutdown = False
    
    def start_background_cleanup(self):
        """Start background task cleanup service"""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_old_tasks())
            logger.info("Async processor background cleanup started")
    
    async def _cleanup_old_tasks(self):
        """Clean up old completed tasks to prevent memory leaks"""
        while not self._shutdown:
            try:
                current_time = datetime.now()
                tasks_to_remove = []
                
                for task_id, task in self.tasks.items():
                    # Remove tasks that are old and completed/failed
                    if (task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED] and
                        task.completed_at and 
                        current_time - task.completed_at > self.task_cleanup_threshold):
                        tasks_to_remove.append(task_id)
                
                # Remove old tasks
                for task_id in tasks_to_remove:
                    del self.tasks[task_id]
                    if task_id in self.active_tasks:
                        del self.active_tasks[task_id]
                
                if tasks_to_remove:
                    logger.info(f"Cleaned up {len(tasks_to_remove)} old async tasks")
                
                # Sleep for 1 hour between cleanup cycles
                await asyncio.sleep(3600)
                
            except Exception as e:
                logger.error(f"Error in async task cleanup: {e}")
                await asyncio.sleep(300)  # Sleep 5 minutes on error
    
    async def submit_task(
        self, 
        name: str,
        func: Callable,
        user_id: str,
        tenant_id: str,
        *args,
        **kwargs
    ) -> str:
        """
        Submit a task for async processing
        
        Returns:
            task_id: Unique identifier for tracking the task
        """
        # Check user rate limits
        user_active_tasks = self.user_task_limits.get(user_id, 0)
        if user_active_tasks >= self.max_user_concurrent_tasks:
            raise ValueError(f"User {user_id} has reached maximum concurrent tasks limit ({self.max_user_concurrent_tasks})")
        
        # Check global task limits
        if len(self.active_tasks) >= self.max_concurrent_tasks:
            raise ValueError(f"System has reached maximum concurrent tasks limit ({self.max_concurrent_tasks})")
        
        # Create task
        task_id = str(uuid.uuid4())
        task = AsyncTask(
            id=task_id,
            name=name,
            user_id=user_id,
            tenant_id=tenant_id,
            metadata={
                "args": str(args)[:200],  # Truncate for storage
                "kwargs_keys": list(kwargs.keys())
            }
        )
        
        self.tasks[task_id] = task
        
        # Update user rate limiting
        self.user_task_limits[user_id] = user_active_tasks + 1
        
        # Start the async task
        async_task = asyncio.create_task(self._execute_task(task, func, *args, **kwargs))
        self.active_tasks[task_id] = async_task
        
        logger.info(f"Submitted async task {task_id} ({name}) for user {user_id}")
        return task_id
    
    async def _execute_task(self, task: AsyncTask, func: Callable, *args, **kwargs) -> Any:
        """Execute a task and update its status"""
        try:
            task.status = TaskStatus.IN_PROGRESS
            task.started_at = datetime.now()
            
            start_time = time.time()
            
            # Execute the function (handles both sync and async functions)
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                # Run CPU-bound sync functions in thread pool
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(self.executor, func, *args, **kwargs)
            
            # Update task completion
            task.result = result
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.now()
            task.progress = 1.0
            
            # Performance tracking
            processing_time = time.time() - start_time
            self.total_tasks_processed += 1
            self.total_processing_time += processing_time
            
            logger.info(f"Completed async task {task.id} ({task.name}) in {processing_time:.2f}s")
            return result
            
        except asyncio.CancelledError:
            task.status = TaskStatus.CANCELLED
            task.completed_at = datetime.now()
            logger.info(f"Cancelled async task {task.id} ({task.name})")
            raise
            
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.completed_at = datetime.now()
            logger.error(f"Failed async task {task.id} ({task.name}): {e}")
            raise
            
        finally:
            # Clean up tracking
            if task.id in self.active_tasks:
                del self.active_tasks[task.id]
            
            # Update user rate limiting
            user_active_count = self.user_task_limits.get(task.user_id, 0)
            if user_active_count > 0:
                self.user_task_limits[task.user_id] = user_active_count - 1
            
            if self.user_task_limits.get(task.user_id, 0) == 0:
                del self.user_task_limits[task.user_id]
    
    async def get_task_status(self, task_id: str) -> Optional[AsyncTask]:
        """Get status of a specific task"""
        return self.tasks.get(task_id)
    
    async def get_user_tasks(self, user_id: str) -> List[AsyncTask]:
        """Get all tasks for a specific user"""
        return [task for task in self.tasks.values() if task.user_id == user_id]
    
    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a pending or in-progress task"""
        if task_id in self.active_tasks:
            async_task = self.active_tasks[task_id]
            if not async_task.done():
                async_task.cancel()
                
                if task_id in self.tasks:
                    self.tasks[task_id].status = TaskStatus.CANCELLED
                
                logger.info(f"Cancelled async task {task_id}")
                return True
        return False
    
    async def wait_for_task(self, task_id: str, timeout: Optional[float] = None) -> Any:
        """Wait for a task to complete and return its result"""
        if task_id not in self.active_tasks:
            # Task might already be completed
            if task_id in self.tasks:
                task = self.tasks[task_id]
                if task.status == TaskStatus.COMPLETED:
                    return task.result
                elif task.status == TaskStatus.FAILED:
                    raise Exception(task.error)
                else:
                    raise ValueError(f"Task {task_id} is not running")
            else:
                raise ValueError(f"Task {task_id} not found")
        
        async_task = self.active_tasks[task_id]
        
        try:
            if timeout:
                result = await asyncio.wait_for(async_task, timeout=timeout)
            else:
                result = await async_task
            return result
        except asyncio.TimeoutError:
            logger.warning(f"Task {task_id} timed out after {timeout}s")
            raise
    
    async def batch_process(
        self, 
        name: str,
        func: Callable,
        items: List[Any],
        user_id: str,
        tenant_id: str,
        batch_size: int = 10,
        max_concurrent: int = 5
    ) -> List[str]:
        """
        Process items in batches concurrently
        
        Returns:
            List of task_ids for tracking progress
        """
        if not items:
            return []
        
        # Split items into batches
        batches = [items[i:i + batch_size] for i in range(0, len(items), batch_size)]
        task_ids = []
        
        # Process batches with concurrency limit
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def process_batch(batch_items, batch_index):
            async with semaphore:
                batch_name = f"{name}_batch_{batch_index}"
                return await self.submit_task(
                    batch_name,
                    func,
                    user_id,
                    tenant_id,
                    batch_items
                )
        
        # Submit all batch tasks
        batch_tasks = [
            process_batch(batch, i) 
            for i, batch in enumerate(batches)
        ]
        
        task_ids = await asyncio.gather(*batch_tasks)
        logger.info(f"Started batch processing: {len(task_ids)} batches for {len(items)} items")
        
        return task_ids
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        active_count = len(self.active_tasks)
        completed_count = len([t for t in self.tasks.values() if t.status == TaskStatus.COMPLETED])
        failed_count = len([t for t in self.tasks.values() if t.status == TaskStatus.FAILED])
        
        avg_processing_time = (
            self.total_processing_time / self.total_tasks_processed 
            if self.total_tasks_processed > 0 else 0
        )
        
        return {
            "active_tasks": active_count,
            "total_tasks": len(self.tasks),
            "completed_tasks": completed_count,
            "failed_tasks": failed_count,
            "total_processed": self.total_tasks_processed,
            "average_processing_time_seconds": round(avg_processing_time, 3),
            "user_task_counts": dict(self.user_task_limits),
            "max_workers": self.max_workers,
            "max_concurrent_tasks": self.max_concurrent_tasks
        }
    
    async def shutdown(self):
        """Gracefully shutdown the processor"""
        self._shutdown = True
        
        # Cancel cleanup task
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
        
        # Cancel all active tasks
        for task_id, async_task in self.active_tasks.items():
            if not async_task.done():
                async_task.cancel()
        
        # Wait for all tasks to complete or timeout
        if self.active_tasks:
            await asyncio.wait(
                self.active_tasks.values(),
                timeout=30,
                return_when=asyncio.ALL_COMPLETED
            )
        
        # Shutdown thread pool
        self.executor.shutdown(wait=True)
        
        logger.info("Async processor shutdown completed")

# Global async processor instance
async_processor = AsyncProcessor(max_workers=15, max_concurrent_tasks=100)

# Utility functions for common async patterns
async def process_concurrently(
    items: List[Any],
    func: Callable,
    max_concurrent: int = 10,
    timeout_per_item: Optional[float] = None
) -> List[Any]:
    """
    Process a list of items concurrently with optional timeout
    """
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_item(item):
        async with semaphore:
            if timeout_per_item:
                return await asyncio.wait_for(func(item), timeout=timeout_per_item)
            else:
                return await func(item)
    
    tasks = [process_item(item) for item in items]
    return await asyncio.gather(*tasks, return_exceptions=True)

async def timeout_wrapper(coro, timeout: float, default=None):
    """
    Wrap a coroutine with a timeout and return default value on timeout
    """
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning(f"Operation timed out after {timeout}s, returning default")
        return default