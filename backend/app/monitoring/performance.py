"""Database and API Performance Monitoring Module"""

import time
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from collections import defaultdict, deque
import asyncio
from contextlib import contextmanager
import threading
from dataclasses import dataclass, field
import json

logger = logging.getLogger(__name__)

@dataclass
class QueryMetrics:
    """Metrics for a single database query"""
    query_type: str  # SELECT, INSERT, UPDATE, DELETE
    table_name: str
    duration_ms: float
    timestamp: datetime
    success: bool
    error_message: Optional[str] = None
    row_count: Optional[int] = None
    query_hash: Optional[str] = None

@dataclass
class EndpointMetrics:
    """Metrics for API endpoint performance"""
    endpoint: str
    method: str
    duration_ms: float
    timestamp: datetime
    status_code: int
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    cache_hit: bool = False
    db_queries: List[QueryMetrics] = field(default_factory=list)

class PerformanceMonitor:
    """Centralized performance monitoring system"""
    
    def __init__(self, max_metrics_history: int = 1000):
        self.max_metrics_history = max_metrics_history
        self.endpoint_metrics: deque = deque(maxlen=max_metrics_history)
        self.query_metrics: deque = deque(maxlen=max_metrics_history)
        self.slow_query_threshold_ms = 1000  # 1 second
        self.slow_endpoint_threshold_ms = 2000  # 2 seconds
        self._lock = threading.Lock()
        
        # Aggregated stats
        self.endpoint_stats = defaultdict(list)
        self.query_stats = defaultdict(list)
        
    def record_query(self, metrics: QueryMetrics):
        """Record database query metrics"""
        with self._lock:
            self.query_metrics.append(metrics)
            
            # Log slow queries
            if metrics.duration_ms > self.slow_query_threshold_ms:
                logger.warning(
                    f"SLOW QUERY DETECTED: {metrics.table_name} took {metrics.duration_ms:.2f}ms "
                    f"at {metrics.timestamp}"
                )
            
            # Update aggregated stats
            key = f"{metrics.query_type}_{metrics.table_name}"
            self.query_stats[key].append(metrics.duration_ms)
            
            # Keep only recent stats (last 100 for each query type)
            if len(self.query_stats[key]) > 100:
                self.query_stats[key] = self.query_stats[key][-100:]
    
    def record_endpoint(self, metrics: EndpointMetrics):
        """Record API endpoint metrics"""
        with self._lock:
            self.endpoint_metrics.append(metrics)
            
            # Log slow endpoints
            if metrics.duration_ms > self.slow_endpoint_threshold_ms:
                db_time = sum(q.duration_ms for q in metrics.db_queries)
                logger.warning(
                    f"SLOW ENDPOINT DETECTED: {metrics.method} {metrics.endpoint} took {metrics.duration_ms:.2f}ms "
                    f"(DB: {db_time:.2f}ms, {len(metrics.db_queries)} queries) "
                    f"for user {metrics.user_id} at {metrics.timestamp}"
                )
            
            # Update aggregated stats
            key = f"{metrics.method}_{metrics.endpoint}"
            self.endpoint_stats[key].append(metrics.duration_ms)
            
            # Keep only recent stats
            if len(self.endpoint_stats[key]) > 100:
                self.endpoint_stats[key] = self.endpoint_stats[key][-100:]
    
    def get_slow_queries(self, limit: int = 10) -> List[QueryMetrics]:
        """Get slowest queries in recent history"""
        with self._lock:
            sorted_queries = sorted(
                self.query_metrics, 
                key=lambda x: x.duration_ms, 
                reverse=True
            )
            return list(sorted_queries[:limit])
    
    def get_slow_endpoints(self, limit: int = 10) -> List[EndpointMetrics]:
        """Get slowest endpoints in recent history"""
        with self._lock:
            sorted_endpoints = sorted(
                self.endpoint_metrics,
                key=lambda x: x.duration_ms,
                reverse=True
            )
            return list(sorted_endpoints[:limit])
    
    def get_query_stats(self, table_name: Optional[str] = None) -> Dict[str, Any]:
        """Get aggregated query statistics"""
        with self._lock:
            stats = {}
            
            for key, durations in self.query_stats.items():
                if table_name and table_name not in key:
                    continue
                    
                if durations:
                    stats[key] = {
                        'count': len(durations),
                        'avg_ms': sum(durations) / len(durations),
                        'min_ms': min(durations),
                        'max_ms': max(durations),
                        'p95_ms': sorted(durations)[int(len(durations) * 0.95)] if len(durations) > 0 else 0
                    }
            
            return stats
    
    def get_endpoint_stats(self, endpoint: Optional[str] = None) -> Dict[str, Any]:
        """Get aggregated endpoint statistics"""
        with self._lock:
            stats = {}
            
            for key, durations in self.endpoint_stats.items():
                if endpoint and endpoint not in key:
                    continue
                    
                if durations:
                    stats[key] = {
                        'count': len(durations),
                        'avg_ms': sum(durations) / len(durations),
                        'min_ms': min(durations),
                        'max_ms': max(durations),
                        'p95_ms': sorted(durations)[int(len(durations) * 0.95)] if len(durations) > 0 else 0
                    }
            
            return stats
    
    def get_health_summary(self) -> Dict[str, Any]:
        """Get overall system health summary"""
        with self._lock:
            recent_cutoff = datetime.now() - timedelta(minutes=5)
            
            # Recent queries
            recent_queries = [q for q in self.query_metrics if q.timestamp > recent_cutoff]
            recent_endpoints = [e for e in self.endpoint_metrics if e.timestamp > recent_cutoff]
            
            # Calculate health metrics
            slow_queries = [q for q in recent_queries if q.duration_ms > self.slow_query_threshold_ms]
            slow_endpoints = [e for e in recent_endpoints if e.duration_ms > self.slow_endpoint_threshold_ms]
            failed_queries = [q for q in recent_queries if not q.success]
            
            return {
                'timestamp': datetime.now().isoformat(),
                'recent_metrics': {
                    'queries': len(recent_queries),
                    'endpoints': len(recent_endpoints),
                    'slow_queries': len(slow_queries),
                    'slow_endpoints': len(slow_endpoints),
                    'failed_queries': len(failed_queries)
                },
                'performance': {
                    'avg_query_time_ms': sum(q.duration_ms for q in recent_queries) / len(recent_queries) if recent_queries else 0,
                    'avg_endpoint_time_ms': sum(e.duration_ms for e in recent_endpoints) / len(recent_endpoints) if recent_endpoints else 0,
                    'query_success_rate': (len(recent_queries) - len(failed_queries)) / len(recent_queries) if recent_queries else 1.0
                },
                'alerts': {
                    'high_query_latency': len(slow_queries) > 0,
                    'high_endpoint_latency': len(slow_endpoints) > 0,
                    'query_failures': len(failed_queries) > 0
                }
            }

# Global performance monitor instance
performance_monitor = PerformanceMonitor()

@contextmanager
def track_query(query_type: str, table_name: str):
    """Context manager to track database query performance"""
    start_time = time.time()
    success = True
    error_message = None
    row_count = None
    
    try:
        yield
    except Exception as e:
        success = False
        error_message = str(e)
        raise
    finally:
        duration_ms = (time.time() - start_time) * 1000
        
        metrics = QueryMetrics(
            query_type=query_type,
            table_name=table_name,
            duration_ms=duration_ms,
            timestamp=datetime.now(),
            success=success,
            error_message=error_message,
            row_count=row_count
        )
        
        performance_monitor.record_query(metrics)

def get_performance_stats() -> Dict[str, Any]:
    """Get comprehensive performance statistics"""
    return {
        'health_summary': performance_monitor.get_health_summary(),
        'slow_queries': [
            {
                'table': q.table_name,
                'type': q.query_type,
                'duration_ms': q.duration_ms,
                'timestamp': q.timestamp.isoformat(),
                'success': q.success,
                'error': q.error_message
            }
            for q in performance_monitor.get_slow_queries(5)
        ],
        'slow_endpoints': [
            {
                'endpoint': e.endpoint,
                'method': e.method,
                'duration_ms': e.duration_ms,
                'timestamp': e.timestamp.isoformat(),
                'status_code': e.status_code,
                'cache_hit': e.cache_hit,
                'db_queries': len(e.db_queries)
            }
            for e in performance_monitor.get_slow_endpoints(5)
        ],
        'query_stats': performance_monitor.get_query_stats(),
        'endpoint_stats': performance_monitor.get_endpoint_stats()
    }