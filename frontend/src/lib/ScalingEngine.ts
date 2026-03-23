import { DeviceConfig } from '../components/guestPortal/DeviceFrameContainer';

// Enhanced viewport management with caching
export interface ViewportDimensions {
  width: number;
  height: number;
  availableWidth: number;
  availableHeight: number;
  density: number;
  orientation: 'portrait' | 'landscape';
}

// Comprehensive scale configuration
export interface ScaleConfig {
  current: number;
  mode: 'smart' | 'fit' | 'actual' | 'focus' | 'custom';
  reason: string;
  canShow100Percent: boolean;
  fitToScreenScale: number;
  focusScale: number;
  constraints: {
    min: number;
    max: number;
    preferred: number;
  };
}

// Performance-optimized scale result
export interface ScaleResult {
  config: ScaleConfig;
  viewport: ViewportDimensions;
  device: DeviceConfig;
  performance: {
    calculationTime: number;
    cacheHit: boolean;
    renderComplexity: 'low' | 'medium' | 'high';
  };
  recommendations: ScaleRecommendation[];
}

// Intelligent recommendations
export interface ScaleRecommendation {
  scale: number;
  mode: ScaleConfig['mode'];
  reason: string;
  confidence: number;
  benefits: string[];
}

// Transition configuration for smooth animations
export interface TransitionConfig {
  duration: number;
  easing: string;
  properties: string[];
  willChange: string[];
  transform3d: boolean;
}

// Cache key generation for efficient lookups
type CacheKey = string;

export class ScalingEngine {
  private cache: Map<CacheKey, ScaleResult> = new Map();
  private viewport: ViewportDimensions | null = null;
  private performanceMetrics: Map<string, number> = new Map();
  private cleanupFunctions: (() => void)[] = [];
  private isDestroyed: boolean = false;
  
  // Cache configuration
  private readonly MAX_CACHE_SIZE = 50;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.setupViewportTracking();
    this.setupPerformanceMonitoring();
  }

  /**
   * Cleanup all resources and event listeners
   */
  destroy(): void {
    if (this.isDestroyed) return;
    
    this.isDestroyed = true;
    
    // Execute all cleanup functions
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.warn('Cleanup function failed:', error);
      }
    });
    
    // Clear all data structures
    this.cache.clear();
    this.performanceMetrics.clear();
    this.cleanupFunctions = [];
    this.viewport = null;
  }

  /**
   * Core method: Calculate optimal scale with intelligent caching
   */
  calculateScale(device: DeviceConfig, isRotated: boolean = false, mode: ScaleConfig['mode'] = 'smart'): ScaleResult {
    // Return fallback result if engine is destroyed
    if (this.isDestroyed) {
      console.warn('ScalingEngine is destroyed, returning fallback result');
      return this.getFallbackScaleResult(device, isRotated, mode);
    }

    const startTime = performance.now();
    
    if (!this.viewport) {
      this.updateViewportDimensions();
    }

    const cacheKey = this.generateCacheKey(device, isRotated, mode, this.viewport!);
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached)) {
      return {
        ...cached,
        performance: {
          ...cached.performance,
          calculationTime: performance.now() - startTime,
          cacheHit: true
        }
      };
    }

    const result = this.performScaleCalculation(device, isRotated, mode);
    
    // Store in cache with cleanup
    this.cache.set(cacheKey, result);
    this.cleanupCache();
    
    return {
      ...result,
      performance: {
        ...result.performance,
        calculationTime: performance.now() - startTime,
        cacheHit: false
      }
    };
  }

  /**
   * Smart scaling logic with multiple intelligence layers
   */
  private performScaleCalculation(device: DeviceConfig, isRotated: boolean, mode: ScaleConfig['mode']): ScaleResult {
    const viewport = this.viewport!;
    
    // Get device dimensions considering rotation
    const deviceWidth = isRotated && device.deviceClass !== 'desktop' 
      ? device.frameHeight 
      : device.frameWidth;
    const deviceHeight = isRotated && device.deviceClass !== 'desktop' 
      ? device.frameWidth 
      : device.frameHeight;

    // Calculate fundamental scales
    const widthScale = viewport.availableWidth / deviceWidth;
    const heightScale = viewport.availableHeight / deviceHeight;
    const fitToScreenScale = Math.min(widthScale, heightScale);
    const canShow100Percent = fitToScreenScale >= 1.0;

    // Smart mode selection logic
    let currentScale: number;
    let reason: string;
    
    switch (mode) {
      case 'actual':
        currentScale = canShow100Percent ? 1.0 : fitToScreenScale;
        reason = canShow100Percent 
          ? 'Showing actual size (100%)'
          : `Scaled to ${Math.round(fitToScreenScale * 100)}% to fit screen`;
        break;
        
      case 'fit':
        currentScale = fitToScreenScale;
        reason = `Scaled to fit your screen (${Math.round(fitToScreenScale * 100)}%)`;
        break;
        
      case 'focus':
        // Focus mode: zoom to content area, typically 1.2-1.5x if space allows
        const focusScale = Math.min(fitToScreenScale * 1.3, 1.5);
        currentScale = focusScale;
        reason = `Focused view for detailed inspection (${Math.round(focusScale * 100)}%)`;
        break;
        
      default: // 'smart'
        currentScale = this.calculateSmartScale(fitToScreenScale, canShow100Percent, device, viewport);
        reason = this.getSmartScaleReason(currentScale, canShow100Percent, fitToScreenScale);
    }

    // Ensure scale is within reasonable bounds
    currentScale = Math.max(0.3, Math.min(2.0, currentScale));

    const config: ScaleConfig = {
      current: Math.round(currentScale * 100) / 100, // Round to 2 decimals
      mode,
      reason,
      canShow100Percent,
      fitToScreenScale: Math.round(fitToScreenScale * 100) / 100,
      focusScale: Math.round(Math.min(fitToScreenScale * 1.3, 1.5) * 100) / 100,
      constraints: {
        min: 0.3,
        max: 2.0,
        preferred: canShow100Percent ? 1.0 : fitToScreenScale
      }
    };

    const recommendations = this.generateRecommendations(config, device, viewport);
    
    return {
      config,
      viewport,
      device,
      performance: {
        calculationTime: 0, // Will be set by caller
        cacheHit: false,
        renderComplexity: this.assessRenderComplexity(currentScale, device)
      },
      recommendations
    };
  }

  /**
   * Intelligent smart scale calculation
   */
  private calculateSmartScale(fitToScreenScale: number, canShow100Percent: boolean, device: DeviceConfig, viewport: ViewportDimensions): number {
    // Priority 1: Show 100% if it fits comfortably (with 10% margin)
    if (canShow100Percent && fitToScreenScale >= 1.1) {
      return 1.0;
    }
    
    // Priority 2: Use fit-to-screen if it's reasonable (≥ 70%)
    if (fitToScreenScale >= 0.7) {
      return fitToScreenScale;
    }
    
    // Priority 3: For mobile devices on large screens, prefer readability
    if (device.deviceClass === 'mobile' && viewport.width >= 1920) {
      return Math.min(0.8, fitToScreenScale);
    }
    
    // Priority 4: For desktop devices on small screens, ensure usability
    if (device.deviceClass === 'desktop' && viewport.availableWidth < 1200) {
      return Math.max(0.4, fitToScreenScale);
    }
    
    // Default: Use fit-to-screen with minimum usability threshold
    return Math.max(0.4, fitToScreenScale);
  }

  /**
   * Generate human-readable reasoning for smart scale choice
   */
  private getSmartScaleReason(scale: number, canShow100Percent: boolean, fitToScreenScale: number): string {
    if (scale === 1.0 && canShow100Percent) {
      return 'Perfect fit at actual size (100%)';
    }
    
    if (scale === fitToScreenScale && scale >= 0.8) {
      return `Optimized for your screen (${Math.round(scale * 100)}%)`;
    }
    
    if (scale === fitToScreenScale && scale >= 0.6) {
      return `Scaled to fit your display (${Math.round(scale * 100)}%)`;
    }
    
    if (scale > fitToScreenScale) {
      return `Enhanced for readability (${Math.round(scale * 100)}%)`;
    }
    
    return `Minimum usable scale (${Math.round(scale * 100)}%)`;
  }

  /**
   * Generate intelligent scale recommendations
   */
  private generateRecommendations(config: ScaleConfig, device: DeviceConfig, viewport: ViewportDimensions): ScaleRecommendation[] {
    const recommendations: ScaleRecommendation[] = [];
    
    // Always recommend smart mode if not currently active
    if (config.mode !== 'smart') {
      recommendations.push({
        scale: this.calculateSmartScale(config.fitToScreenScale, config.canShow100Percent, device, viewport),
        mode: 'smart',
        reason: 'AI-optimized for your screen and device',
        confidence: 0.95,
        benefits: ['Perfect balance', 'No configuration needed', 'Adapts automatically']
      });
    }
    
    // Recommend 100% if possible and beneficial
    if (config.canShow100Percent && config.current !== 1.0) {
      recommendations.push({
        scale: 1.0,
        mode: 'actual',
        reason: 'See actual device size',
        confidence: 0.8,
        benefits: ['True-to-life preview', 'Accurate sizing', 'No scaling artifacts']
      });
    }
    
    // Recommend fit-to-screen if different from current
    if (Math.abs(config.current - config.fitToScreenScale) > 0.05) {
      recommendations.push({
        scale: config.fitToScreenScale,
        mode: 'fit',
        reason: 'Maximize screen usage',
        confidence: 0.7,
        benefits: ['Uses full screen', 'No scrolling needed', 'Efficient viewing']
      });
    }
    
    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Assess rendering complexity for performance optimization
   */
  private assessRenderComplexity(scale: number, device: DeviceConfig): 'low' | 'medium' | 'high' {
    const pixelCount = (device.frameWidth * scale) * (device.frameHeight * scale);
    
    if (pixelCount > 2000000) return 'high'; // > 2M pixels
    if (pixelCount > 800000) return 'medium'; // > 800K pixels
    return 'low';
  }

  /**
   * Performance-optimized viewport tracking with proper cleanup
   */
  private setupViewportTracking(): void {
    if (typeof window === 'undefined') return;

    let timeoutId: NodeJS.Timeout;
    
    const updateViewport = () => {
      if (this.isDestroyed) return;
      this.updateViewportDimensions();
      this.clearCache(); // Invalidate cache when viewport changes significantly
    };
    
    const debouncedUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateViewport, 150); // Debounce to 150ms
    };
    
    // Add event listeners
    window.addEventListener('resize', debouncedUpdate);
    window.addEventListener('orientationchange', debouncedUpdate);
    
    // Register cleanup function
    this.cleanupFunctions.push(() => {
      clearTimeout(timeoutId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', debouncedUpdate);
        window.removeEventListener('orientationchange', debouncedUpdate);
      }
    });
    
    // Initialize viewport
    this.updateViewportDimensions();
  }

  /**
   * Enhanced viewport dimension calculation
   */
  private updateViewportDimensions(): void {
    if (typeof window === 'undefined') return;
    
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const density = window.devicePixelRatio || 1;
    const orientation = vw > vh ? 'landscape' : 'portrait';
    
    // Dynamic header calculation based on actual DOM
    const headerElement = document.querySelector('[class*="px-4 lg:px-6 py-3 lg:py-4"]');
    const headerHeight = headerElement?.getBoundingClientRect().height || 100;
    
    // Smart padding calculation
    const basePadding = Math.min(32, vw * 0.02); // 2% of viewport, max 32px
    const totalPadding = basePadding * 2;
    
    this.viewport = {
      width: vw,
      height: vh,
      availableWidth: Math.max(vw - totalPadding, 300),
      availableHeight: Math.max(vh - headerHeight - totalPadding, 400),
      density,
      orientation
    };
  }

  /**
   * Performance monitoring setup
   */
  private setupPerformanceMonitoring(): void {
    // Track calculation times for optimization
    this.performanceMetrics.set('avgCalculationTime', 0);
    this.performanceMetrics.set('cacheHitRate', 0);
  }

  /**
   * Cache key generation for efficient lookups
   */
  private generateCacheKey(device: DeviceConfig, isRotated: boolean, mode: ScaleConfig['mode'], viewport: ViewportDimensions): CacheKey {
    const deviceKey = `${device.name}-${isRotated}`;
    const viewportKey = `${viewport.availableWidth}x${viewport.availableHeight}-${viewport.orientation}`;
    const configKey = `${mode}`;
    
    return `${deviceKey}|${viewportKey}|${configKey}`;
  }

  /**
   * Cache validation and cleanup
   */
  private isCacheValid(result: ScaleResult): boolean {
    if (!this.viewport) return false;
    
    // Check if viewport changed significantly (> 5% difference)
    const widthDiff = Math.abs(result.viewport.availableWidth - this.viewport.availableWidth) / this.viewport.availableWidth;
    const heightDiff = Math.abs(result.viewport.availableHeight - this.viewport.availableHeight) / this.viewport.availableHeight;
    
    return widthDiff < 0.05 && heightDiff < 0.05;
  }

  private cleanupCache(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) return;
    
    // Remove oldest entries (simple LRU)
    const entries = Array.from(this.cache.entries());
    const toDelete = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
    
    toDelete.forEach(([key]) => this.cache.delete(key));
  }

  private clearCache(): void {
    this.cache.clear();
  }

  /**
   * Public method to get current viewport
   */
  getCurrentViewport(): ViewportDimensions | null {
    return this.viewport;
  }

  /**
   * Public method to get performance metrics
   */
  getPerformanceMetrics(): Map<string, number> {
    return new Map(this.performanceMetrics);
  }

  /**
   * Public method to invalidate cache (useful for testing)
   */
  invalidateCache(): void {
    this.clearCache();
  }

  /**
   * Get fallback scale result when engine is destroyed
   */
  private getFallbackScaleResult(device: DeviceConfig, isRotated: boolean, mode: ScaleConfig['mode']): ScaleResult {
    const fallbackScale = 0.8; // Safe fallback scale
    
    return {
      config: {
        current: fallbackScale,
        mode,
        reason: 'Fallback mode - engine unavailable',
        canShow100Percent: false,
        fitToScreenScale: fallbackScale,
        focusScale: fallbackScale,
        constraints: { min: 0.3, max: 2.0, preferred: fallbackScale }
      },
      viewport: {
        width: 1920,
        height: 1080,
        availableWidth: 1600,
        availableHeight: 900,
        density: 1,
        orientation: 'landscape'
      },
      device,
      performance: {
        calculationTime: 0,
        cacheHit: false,
        renderComplexity: 'low'
      },
      recommendations: []
    };
  }
}

// Factory function for creating managed instances
export const createScalingEngine = (): ScalingEngine => {
  return new ScalingEngine();
};

// Instance manager for React components
let currentEngineInstance: ScalingEngine | null = null;

export const getScalingEngineInstance = (): ScalingEngine => {
  if (!currentEngineInstance) {
    currentEngineInstance = createScalingEngine();
  }
  return currentEngineInstance;
};

export const destroyScalingEngineInstance = (): void => {
  if (currentEngineInstance) {
    currentEngineInstance.destroy();
    currentEngineInstance = null;
  }
};