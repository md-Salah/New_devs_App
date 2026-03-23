import { DeviceConfig } from '../components/guestPortal/DeviceFrameContainer';

// Performance metrics interface
export interface PerformanceMetrics {
  renderTime: number;
  scaleCalculationTime: number;
  transitionTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  frameRate: number;
  errorCount: number;
  userInteractionLatency: number;
}

// Performance thresholds for optimization
export interface PerformanceThresholds {
  renderTime: { good: number; warning: number; critical: number };
  scaleCalculationTime: { good: number; warning: number; critical: number };
  transitionTime: { good: number; warning: number; critical: number };
  memoryUsage: { good: number; warning: number; critical: number };
  frameRate: { good: number; warning: number; critical: number };
}

// Performance optimization suggestions
export interface OptimizationSuggestion {
  type: 'render' | 'memory' | 'calculation' | 'transition' | 'cache';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  action: string;
  estimatedImprovement: string;
}

// Cache entry interface
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hitCount: number;
  lastAccess: number;
  size: number;
}

// Performance alert interface
export interface PerformanceAlert {
  type: 'warning' | 'critical';
  metric: keyof PerformanceMetrics;
  value: number;
  threshold: number;
  suggestion: OptimizationSuggestion;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    renderTime: 0,
    scaleCalculationTime: 0,
    transitionTime: 0,
    memoryUsage: 0,
    cacheHitRate: 0,
    frameRate: 60,
    errorCount: 0,
    userInteractionLatency: 0,
  };

  private metricHistory: Array<{ timestamp: number; metrics: PerformanceMetrics }> = [];
  private performanceObserver: PerformanceObserver | null = null;
  private frameRateMonitor: number | null = null;
  private memoryMonitor: number | null = null;
  private alertCallbacks: Array<(alert: PerformanceAlert) => void> = [];
  private isMonitoring = false;
  private isDestroyed = false;
  private lastAlertTimes: Map<string, number> = new Map();
  private alertDebounceMs = 5000; // 5 second debounce for alerts
  private adaptiveMonitoringLevel: 'high' | 'medium' | 'low' = 'medium';
  private lastPerformanceCheck = 0;

  // Performance thresholds (in milliseconds for timing, MB for memory, FPS for frame rate)
  private thresholds: PerformanceThresholds = {
    renderTime: { good: 16, warning: 33, critical: 100 }, // 60fps, 30fps, 10fps
    scaleCalculationTime: { good: 5, warning: 16, critical: 50 },
    transitionTime: { good: 300, warning: 500, critical: 1000 },
    memoryUsage: { good: 50, warning: 100, critical: 200 }, // MB
    frameRate: { good: 50, warning: 30, critical: 15 }, // FPS
  };

  constructor() {
    this.setupPerformanceObserver();
    this.startMonitoring();
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.startFrameRateMonitoring();
    this.startMemoryMonitoring();
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    
    if (this.frameRateMonitor) {
      cancelAnimationFrame(this.frameRateMonitor);
      this.frameRateMonitor = null;
    }
    
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
      this.memoryMonitor = null;
    }
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
  }

  /**
   * Destroy the performance monitor and cleanup all resources
   */
  destroy(): void {
    if (this.isDestroyed) return;
    
    this.isDestroyed = true;
    this.stopMonitoring();
    
    // Clear all data structures
    this.metricHistory = [];
    this.alertCallbacks = [];
    this.lastAlertTimes.clear();
    
    // Reset metrics to initial state
    this.metrics = {
      renderTime: 0,
      scaleCalculationTime: 0,
      transitionTime: 0,
      memoryUsage: 0,
      cacheHitRate: 0,
      frameRate: 60,
      errorCount: 0,
      userInteractionLatency: 0,
    };
  }

  /**
   * Record render performance
   */
  recordRenderTime(startTime: number, endTime?: number): void {
    if (this.isDestroyed) return;
    
    const renderTime = (endTime || performance.now()) - startTime;
    this.updateMetric('renderTime', renderTime);
    this.checkThresholds('renderTime', renderTime);
  }

  /**
   * Record scale calculation performance
   */
  recordScaleCalculation(calculationTime: number): void {
    this.updateMetric('scaleCalculationTime', calculationTime);
    this.checkThresholds('scaleCalculationTime', calculationTime);
  }

  /**
   * Record transition performance
   */
  recordTransitionTime(startTime: number, endTime?: number): void {
    const transitionTime = (endTime || performance.now()) - startTime;
    this.updateMetric('transitionTime', transitionTime);
    this.checkThresholds('transitionTime', transitionTime);
  }

  /**
   * Record user interaction latency
   */
  recordInteractionLatency(startTime: number, endTime?: number): void {
    const latency = (endTime || performance.now()) - startTime;
    this.updateMetric('userInteractionLatency', latency);
  }

  /**
   * Update cache hit rate
   */
  updateCacheHitRate(hitRate: number): void {
    this.updateMetric('cacheHitRate', hitRate);
  }

  /**
   * Record error occurrence
   */
  recordError(): void {
    this.metrics.errorCount++;
    this.saveMetricsHistory();
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance history
   */
  getMetricsHistory(): Array<{ timestamp: number; metrics: PerformanceMetrics }> {
    return [...this.metricHistory];
  }

  /**
   * Get performance analysis
   */
  analyzePerformance(): {
    overall: 'excellent' | 'good' | 'fair' | 'poor';
    suggestions: OptimizationSuggestion[];
    trends: Record<keyof PerformanceMetrics, 'improving' | 'stable' | 'degrading'>;
  } {
    const suggestions = this.generateOptimizationSuggestions();
    const overall = this.calculateOverallPerformance();
    const trends = this.analyzeTrends();

    return { overall, suggestions, trends };
  }

  /**
   * Subscribe to performance alerts
   */
  onPerformanceAlert(callback: (alert: PerformanceAlert) => void): () => void {
    this.alertCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.alertCallbacks.indexOf(callback);
      if (index > -1) {
        this.alertCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get device-specific performance recommendations
   */
  getDevicePerformanceRecommendations(device: DeviceConfig): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const devicePixels = device.frameWidth * device.frameHeight;

    // High resolution device recommendations
    if (devicePixels > 1500000) { // > 1.5M pixels
      suggestions.push({
        type: 'render',
        priority: 'medium',
        description: 'High resolution device detected',
        action: 'Consider reducing scale for better performance',
        estimatedImprovement: '20-30% faster rendering'
      });
    }

    // Low frame rate recommendations
    if (this.metrics.frameRate < this.thresholds.frameRate.warning) {
      suggestions.push({
        type: 'render',
        priority: 'high',
        description: 'Low frame rate detected',
        action: 'Reduce visual effects and use simpler animations',
        estimatedImprovement: '50-100% frame rate improvement'
      });
    }

    // Memory usage recommendations
    if (this.metrics.memoryUsage > this.thresholds.memoryUsage.warning) {
      suggestions.push({
        type: 'memory',
        priority: 'high',
        description: 'High memory usage detected',
        action: 'Clear caches and reduce rendered elements',
        estimatedImprovement: '30-50% memory reduction'
      });
    }

    return suggestions;
  }

  /**
   * Setup Performance Observer for detailed metrics
   */
  private setupPerformanceObserver(): void {
    if (!('PerformanceObserver' in window)) return;

    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        
        for (const entry of entries) {
          switch (entry.entryType) {
            case 'measure':
              if (entry.name.startsWith('preview-')) {
                this.recordCustomMeasure(entry);
              }
              break;
            case 'paint':
              if (entry.name === 'first-contentful-paint') {
                this.recordRenderTime(0, entry.startTime);
              }
              break;
            case 'largest-contentful-paint':
              this.recordRenderTime(0, entry.startTime);
              break;
          }
        }
      });

      this.performanceObserver.observe({ 
        entryTypes: ['measure', 'paint', 'largest-contentful-paint'] 
      });
    } catch (error) {
      console.warn('Performance Observer not supported:', error);
    }
  }

  /**
   * Start frame rate monitoring
   */
  private startFrameRateMonitoring(): void {
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measureFrameRate = (currentTime: number) => {
      frameCount++;
      
      if (currentTime - lastTime >= 1000) { // Update every second
        this.updateMetric('frameRate', frameCount);
        this.checkThresholds('frameRate', frameCount);
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      if (this.isMonitoring) {
        this.frameRateMonitor = requestAnimationFrame(measureFrameRate);
      }
    };
    
    this.frameRateMonitor = requestAnimationFrame(measureFrameRate);
  }

  /**
   * Start memory monitoring with adaptive frequency
   */
  private startMemoryMonitoring(): void {
    if (!('memory' in performance)) return;

    const monitorMemory = () => {
      if (!this.isMonitoring) return;
      
      const memory = (performance as any).memory;
      if (memory) {
        const memoryMB = memory.usedJSHeapSize / (1024 * 1024);
        this.updateMetric('memoryUsage', memoryMB);
        this.checkThresholds('memoryUsage', memoryMB);
        this.updateAdaptiveMonitoringLevel();
      }
      
      // Adaptive monitoring frequency
      const intervalMs = this.getAdaptiveMonitoringInterval();
      this.memoryMonitor = setTimeout(monitorMemory, intervalMs) as any;
    };

    this.memoryMonitor = setTimeout(monitorMemory, this.getAdaptiveMonitoringInterval()) as any;
  }

  /**
   * Update a specific metric
   */
  private updateMetric(metric: keyof PerformanceMetrics, value: number): void {
    // Use exponential moving average for smoothing
    const alpha = 0.1;
    this.metrics[metric] = this.metrics[metric] * (1 - alpha) + value * alpha;
    
    this.saveMetricsHistory();
  }

  /**
   * Save metrics to history
   */
  private saveMetricsHistory(): void {
    const now = Date.now();
    this.metricHistory.push({
      timestamp: now,
      metrics: { ...this.metrics }
    });

    // Keep only last 100 entries
    if (this.metricHistory.length > 100) {
      this.metricHistory = this.metricHistory.slice(-100);
    }
  }

  /**
   * Check performance thresholds and trigger debounced alerts
   */
  private checkThresholds(metric: keyof PerformanceMetrics, value: number): void {
    if (!(metric in this.thresholds)) return;

    const threshold = this.thresholds[metric as keyof PerformanceThresholds];
    let alertType: 'warning' | 'critical' | null = null;
    let thresholdValue: number;

    if (metric === 'frameRate') {
      // Frame rate: lower is worse
      if (value < threshold.critical) {
        alertType = 'critical';
        thresholdValue = threshold.critical;
      } else if (value < threshold.warning) {
        alertType = 'warning';
        thresholdValue = threshold.warning;
      }
    } else {
      // Other metrics: higher is worse
      if (value > threshold.critical) {
        alertType = 'critical';
        thresholdValue = threshold.critical;
      } else if (value > threshold.warning) {
        alertType = 'warning';
        thresholdValue = threshold.warning;
      }
    }

    if (alertType) {
      // Debounce alerts to prevent spam
      const alertKey = `${metric}-${alertType}`;
      const now = Date.now();
      const lastAlertTime = this.lastAlertTimes.get(alertKey) || 0;
      
      if (now - lastAlertTime > this.alertDebounceMs) {
        this.lastAlertTimes.set(alertKey, now);
        
        const suggestion = this.generateSuggestionForMetric(metric, value);
        const alert: PerformanceAlert = {
          type: alertType,
          metric,
          value,
          threshold: thresholdValue,
          suggestion,
          timestamp: now,
        };

        this.alertCallbacks.forEach(callback => callback(alert));
      }
    }
  }

  /**
   * Generate optimization suggestions
   */
  private generateOptimizationSuggestions(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Render performance
    if (this.metrics.renderTime > this.thresholds.renderTime.warning) {
      suggestions.push({
        type: 'render',
        priority: this.metrics.renderTime > this.thresholds.renderTime.critical ? 'critical' : 'high',
        description: 'Slow rendering detected',
        action: 'Reduce device resolution or disable animations',
        estimatedImprovement: '40-60% render speed improvement'
      });
    }

    // Scale calculation performance
    if (this.metrics.scaleCalculationTime > this.thresholds.scaleCalculationTime.warning) {
      suggestions.push({
        type: 'calculation',
        priority: 'medium',
        description: 'Scale calculations are slow',
        action: 'Enable calculation caching',
        estimatedImprovement: '70-90% calculation speed improvement'
      });
    }

    // Memory usage
    if (this.metrics.memoryUsage > this.thresholds.memoryUsage.warning) {
      suggestions.push({
        type: 'memory',
        priority: 'high',
        description: 'High memory usage',
        action: 'Clear preview cache and reduce concurrent previews',
        estimatedImprovement: '30-50% memory reduction'
      });
    }

    // Cache performance
    if (this.metrics.cacheHitRate < 0.7) {
      suggestions.push({
        type: 'cache',
        priority: 'medium',
        description: 'Low cache hit rate',
        action: 'Increase cache size or improve cache key strategy',
        estimatedImprovement: '20-40% performance boost'
      });
    }

    return suggestions;
  }

  /**
   * Generate suggestion for specific metric
   */
  private generateSuggestionForMetric(metric: keyof PerformanceMetrics, value: number): OptimizationSuggestion {
    switch (metric) {
      case 'renderTime':
        return {
          type: 'render',
          priority: 'high',
          description: `Render time is ${Math.round(value)}ms`,
          action: 'Reduce scale or disable animations',
          estimatedImprovement: '50% render speed improvement'
        };
      
      case 'memoryUsage':
        return {
          type: 'memory',
          priority: 'high',
          description: `Memory usage is ${Math.round(value)}MB`,
          action: 'Clear caches and reduce preview complexity',
          estimatedImprovement: '40% memory reduction'
        };
      
      case 'frameRate':
        return {
          type: 'render',
          priority: 'critical',
          description: `Frame rate dropped to ${Math.round(value)}fps`,
          action: 'Switch to performance mode',
          estimatedImprovement: '100% frame rate improvement'
        };
      
      default:
        return {
          type: 'render',
          priority: 'medium',
          description: 'Performance issue detected',
          action: 'Review performance settings',
          estimatedImprovement: '20-30% improvement'
        };
    }
  }

  /**
   * Calculate overall performance score
   */
  private calculateOverallPerformance(): 'excellent' | 'good' | 'fair' | 'poor' {
    let score = 100;

    // Render time (30% weight)
    if (this.metrics.renderTime > this.thresholds.renderTime.critical) score -= 30;
    else if (this.metrics.renderTime > this.thresholds.renderTime.warning) score -= 15;
    else if (this.metrics.renderTime > this.thresholds.renderTime.good) score -= 5;

    // Frame rate (25% weight)
    if (this.metrics.frameRate < this.thresholds.frameRate.critical) score -= 25;
    else if (this.metrics.frameRate < this.thresholds.frameRate.warning) score -= 15;
    else if (this.metrics.frameRate < this.thresholds.frameRate.good) score -= 5;

    // Memory usage (20% weight)
    if (this.metrics.memoryUsage > this.thresholds.memoryUsage.critical) score -= 20;
    else if (this.metrics.memoryUsage > this.thresholds.memoryUsage.warning) score -= 10;
    else if (this.metrics.memoryUsage > this.thresholds.memoryUsage.good) score -= 3;

    // Scale calculation time (15% weight)
    if (this.metrics.scaleCalculationTime > this.thresholds.scaleCalculationTime.critical) score -= 15;
    else if (this.metrics.scaleCalculationTime > this.thresholds.scaleCalculationTime.warning) score -= 8;
    else if (this.metrics.scaleCalculationTime > this.thresholds.scaleCalculationTime.good) score -= 2;

    // Cache hit rate (10% weight)
    if (this.metrics.cacheHitRate < 0.5) score -= 10;
    else if (this.metrics.cacheHitRate < 0.7) score -= 5;
    else if (this.metrics.cacheHitRate < 0.9) score -= 1;

    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  }

  /**
   * Analyze performance trends
   */
  private analyzeTrends(): Record<keyof PerformanceMetrics, 'improving' | 'stable' | 'degrading'> {
    const trends = {} as Record<keyof PerformanceMetrics, 'improving' | 'stable' | 'degrading'>;
    
    if (this.metricHistory.length < 10) {
      // Not enough data
      Object.keys(this.metrics).forEach(key => {
        trends[key as keyof PerformanceMetrics] = 'stable';
      });
      return trends;
    }

    const recent = this.metricHistory.slice(-5);
    const older = this.metricHistory.slice(-10, -5);

    Object.keys(this.metrics).forEach(key => {
      const metric = key as keyof PerformanceMetrics;
      const recentAvg = recent.reduce((sum, entry) => sum + entry.metrics[metric], 0) / recent.length;
      const olderAvg = older.reduce((sum, entry) => sum + entry.metrics[metric], 0) / older.length;
      
      const change = (recentAvg - olderAvg) / olderAvg;
      
      if (metric === 'frameRate' || metric === 'cacheHitRate') {
        // Higher is better for these metrics
        if (change > 0.05) trends[metric] = 'improving';
        else if (change < -0.05) trends[metric] = 'degrading';
        else trends[metric] = 'stable';
      } else {
        // Lower is better for other metrics
        if (change < -0.05) trends[metric] = 'improving';
        else if (change > 0.05) trends[metric] = 'degrading';
        else trends[metric] = 'stable';
      }
    });

    return trends;
  }

  /**
   * Record custom performance measure
   */
  private recordCustomMeasure(entry: PerformanceEntry): void {
    const measureName = entry.name.replace('preview-', '');
    
    switch (measureName) {
      case 'scale-calculation':
        this.recordScaleCalculation(entry.duration);
        break;
      case 'render':
        this.recordRenderTime(entry.startTime, entry.startTime + entry.duration);
        break;
      case 'transition':
        this.recordTransitionTime(entry.startTime, entry.startTime + entry.duration);
        break;
    }
  }

  /**
   * Update adaptive monitoring level based on current performance
   */
  private updateAdaptiveMonitoringLevel(): void {
    const now = Date.now();
    if (now - this.lastPerformanceCheck < 10000) return; // Check every 10 seconds
    
    this.lastPerformanceCheck = now;
    const overall = this.calculateOverallPerformance();
    
    // Adjust monitoring frequency based on performance
    if (overall === 'poor' || overall === 'fair') {
      this.adaptiveMonitoringLevel = 'high'; // Monitor more frequently when performance is poor
    } else if (overall === 'good') {
      this.adaptiveMonitoringLevel = 'medium';
    } else {
      this.adaptiveMonitoringLevel = 'low'; // Monitor less frequently when performance is excellent
    }
  }

  /**
   * Get adaptive monitoring interval based on current performance level
   */
  private getAdaptiveMonitoringInterval(): number {
    switch (this.adaptiveMonitoringLevel) {
      case 'high': return 2000; // 2 seconds - frequent monitoring for poor performance
      case 'medium': return 5000; // 5 seconds - default monitoring
      case 'low': return 10000; // 10 seconds - less frequent monitoring for good performance
      default: return 5000;
    }
  }
}

// Factory function for creating managed instances
export const createPerformanceMonitor = (): PerformanceMonitor => {
  return new PerformanceMonitor();
};

// Instance manager for React components  
let currentPerformanceMonitorInstance: PerformanceMonitor | null = null;

export const getPerformanceMonitorInstance = (): PerformanceMonitor => {
  if (!currentPerformanceMonitorInstance) {
    currentPerformanceMonitorInstance = createPerformanceMonitor();
  }
  return currentPerformanceMonitorInstance;
};

export const destroyPerformanceMonitorInstance = (): void => {
  if (currentPerformanceMonitorInstance) {
    currentPerformanceMonitorInstance.destroy();
    currentPerformanceMonitorInstance = null;
  }
};