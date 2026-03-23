import { DeviceConfig } from '../components/guestPortal/DeviceFrameContainer';

// Device usage statistics
export interface DeviceUsageStats {
  deviceName: string;
  deviceClass: 'mobile' | 'tablet' | 'desktop';
  usageCount: number;
  lastUsed: Date;
  averageSessionDuration: number;
  preferredScale: number;
  userSatisfactionScore: number; // 0-1, based on user interactions
  performanceScore: number; // 0-1, based on render performance
}

// User context for intelligent recommendations
export interface UserContext {
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  userAgent: string;
  browserType: 'chrome' | 'firefox' | 'safari' | 'edge' | 'other';
  operatingSystem: 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'other';
  connectionSpeed: 'slow' | 'medium' | 'fast' | 'unknown';
  preferredLanguage: string;
  timezone: string;
  sessionCount: number;
  isFirstVisit: boolean;
}

// Device recommendation with reasoning
export interface DeviceRecommendation {
  device: DeviceConfig;
  confidence: number; // 0-1
  reasons: string[];
  benefits: string[];
  warnings?: string[];
  estimatedPerformance: 'excellent' | 'good' | 'fair' | 'poor';
  recommendedScale: number;
}

// Analytics events for tracking
export interface AnalyticsEvent {
  type: 'device_selected' | 'scale_changed' | 'rotation_toggled' | 'session_started' | 'session_ended' | 'error_occurred' | 'performance_issue';
  timestamp: Date;
  deviceName: string;
  data: Record<string, any>;
  userContext: Partial<UserContext>;
}

class DeviceAnalytics {
  private usageStats: Map<string, DeviceUsageStats> = new Map();
  private userContext: UserContext | null = null;
  private analyticsEvents: AnalyticsEvent[] = [];
  private sessionStartTime: Date | null = null;
  
  // Storage keys
  private readonly USAGE_STATS_KEY = 'preview_device_usage_stats';
  private readonly USER_CONTEXT_KEY = 'preview_user_context';
  private readonly MAX_EVENTS_STORED = 1000;

  constructor() {
    this.loadStoredData();
    this.initializeUserContext();
    this.setupAnalyticsCollection();
  }

  /**
   * Initialize user context with browser/device detection
   */
  private initializeUserContext(): void {
    if (typeof window === 'undefined') return;

    const stored = this.getStoredUserContext();
    const sessionCount = stored?.sessionCount || 0;
    
    this.userContext = {
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent,
      browserType: this.detectBrowser(),
      operatingSystem: this.detectOS(),
      connectionSpeed: this.detectConnectionSpeed(),
      preferredLanguage: navigator.language || 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sessionCount: sessionCount + 1,
      isFirstVisit: sessionCount === 0,
    };

    this.storeUserContext();
  }

  /**
   * Get intelligent device recommendations based on user context and analytics
   */
  getDeviceRecommendations(devices: DeviceConfig[]): DeviceRecommendation[] {
    if (!this.userContext) {
      return this.getDefaultRecommendations(devices);
    }

    const recommendations = devices.map(device => {
      const confidence = this.calculateRecommendationConfidence(device);
      const reasons = this.generateRecommendationReasons(device);
      const benefits = this.generateDeviceBenefits(device);
      const warnings = this.generateDeviceWarnings(device);
      const performance = this.estimateDevicePerformance(device);
      const recommendedScale = this.calculateRecommendedScale(device);

      return {
        device,
        confidence,
        reasons,
        benefits,
        warnings,
        estimatedPerformance: performance,
        recommendedScale
      };
    });

    // Sort by confidence score
    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate recommendation confidence based on multiple factors
   */
  private calculateRecommendationConfidence(device: DeviceConfig): number {
    let confidence = 0.5; // Base confidence

    const stats = this.usageStats.get(device.name);
    const context = this.userContext!;

    // Factor 1: Usage history (weight: 0.3)
    if (stats) {
      const usageScore = Math.min(stats.usageCount / 10, 1); // Normalize to 0-1
      const satisfactionScore = stats.userSatisfactionScore;
      confidence += (usageScore * satisfactionScore * 0.3);
    }

    // Factor 2: Screen compatibility (weight: 0.4)
    const screenCompatibility = this.calculateScreenCompatibility(device);
    confidence += screenCompatibility * 0.4;

    // Factor 3: Performance prediction (weight: 0.2)
    const performanceScore = this.predictPerformanceScore(device);
    confidence += performanceScore * 0.2;

    // Factor 4: Industry standards (weight: 0.1)
    if (device.deviceClass === 'mobile') {
      confidence += 0.1; // Mobile-first preference
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Calculate screen compatibility score
   */
  private calculateScreenCompatibility(device: DeviceConfig): number {
    const context = this.userContext!;
    const availableWidth = context.screenWidth * 0.8; // Assume 80% of screen is available
    const availableHeight = context.screenHeight * 0.7; // Assume 70% of screen is available

    const deviceWidth = device.frameWidth;
    const deviceHeight = device.frameHeight;

    const widthRatio = availableWidth / deviceWidth;
    const heightRatio = availableHeight / deviceHeight;
    const minRatio = Math.min(widthRatio, heightRatio);

    // Perfect fit (100% scale) = 1.0 score
    // Need to scale down = lower score
    // Can scale up = bonus score
    if (minRatio >= 1.0) {
      return Math.min(1.0, 0.8 + (minRatio - 1.0) * 0.2);
    } else {
      return Math.max(0.2, minRatio);
    }
  }

  /**
   * Predict device performance score
   */
  private predictPerformanceScore(device: DeviceConfig): number {
    const context = this.userContext!;
    let score = 0.7; // Base score

    // Factor 1: Screen resolution vs device resolution
    const pixelRatio = context.devicePixelRatio;
    const devicePixels = device.frameWidth * device.frameHeight;
    const screenPixels = context.screenWidth * context.screenHeight;
    
    if (devicePixels * pixelRatio > screenPixels) {
      score -= 0.2; // Penalty for high resolution rendering
    }

    // Factor 2: Connection speed
    switch (context.connectionSpeed) {
      case 'fast':
        score += 0.2;
        break;
      case 'slow':
        score -= 0.3;
        break;
    }

    // Factor 3: Browser type
    if (context.browserType === 'chrome') {
      score += 0.1; // Chrome generally has better performance
    }

    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * Generate human-readable recommendation reasons
   */
  private generateRecommendationReasons(device: DeviceConfig): string[] {
    const reasons: string[] = [];
    const context = this.userContext!;
    const stats = this.usageStats.get(device.name);

    // Usage-based reasons
    if (stats && stats.usageCount > 0) {
      if (stats.usageCount >= 5) {
        reasons.push(`You've successfully used this device ${stats.usageCount} times`);
      }
      if (stats.userSatisfactionScore > 0.8) {
        reasons.push('High satisfaction score from previous sessions');
      }
    }

    // Screen compatibility reasons
    const compatibility = this.calculateScreenCompatibility(device);
    if (compatibility >= 0.9) {
      reasons.push('Perfect fit for your screen size');
    } else if (compatibility >= 0.7) {
      reasons.push('Good fit for your display');
    }

    // Industry standards
    if (device.deviceClass === 'mobile' && context.isFirstVisit) {
      reasons.push('Most guests access portal via mobile devices');
    }

    // Performance reasons
    const performance = this.predictPerformanceScore(device);
    if (performance >= 0.8) {
      reasons.push('Excellent performance expected on your device');
    }

    return reasons;
  }

  /**
   * Generate device benefits
   */
  private generateDeviceBenefits(device: DeviceConfig): string[] {
    const benefits: string[] = [];
    
    switch (device.deviceClass) {
      case 'mobile':
        benefits.push('Authentic guest experience');
        benefits.push('Test mobile-specific features');
        benefits.push('Compact view for quick review');
        break;
      case 'tablet':
        benefits.push('Larger screen for details');
        benefits.push('Good balance of size and portability');
        benefits.push('Test tablet-optimized layouts');
        break;
      case 'desktop':
        benefits.push('Full-featured preview');
        benefits.push('Maximum content visibility');
        benefits.push('Best for detailed inspection');
        break;
    }

    return benefits;
  }

  /**
   * Generate device warnings if applicable
   */
  private generateDeviceWarnings(device: DeviceConfig): string[] | undefined {
    const warnings: string[] = [];
    const context = this.userContext!;
    
    const compatibility = this.calculateScreenCompatibility(device);
    if (compatibility < 0.5) {
      warnings.push('Device may appear small on your screen');
    }

    const performance = this.predictPerformanceScore(device);
    if (performance < 0.5) {
      warnings.push('Performance may be slower than optimal');
    }

    if (device.deviceClass === 'desktop' && context.screenWidth < 1200) {
      warnings.push('Desktop preview works best on larger screens');
    }

    return warnings.length > 0 ? warnings : undefined;
  }

  /**
   * Estimate device performance category
   */
  private estimateDevicePerformance(device: DeviceConfig): 'excellent' | 'good' | 'fair' | 'poor' {
    const score = this.predictPerformanceScore(device);
    
    if (score >= 0.85) return 'excellent';
    if (score >= 0.65) return 'good';
    if (score >= 0.45) return 'fair';
    return 'poor';
  }

  /**
   * Calculate recommended scale for device
   */
  private calculateRecommendedScale(device: DeviceConfig): number {
    const context = this.userContext!;
    const stats = this.usageStats.get(device.name);
    
    // Use historical preference if available
    if (stats && stats.preferredScale > 0) {
      return stats.preferredScale;
    }

    // Calculate based on screen compatibility
    const compatibility = this.calculateScreenCompatibility(device);
    if (compatibility >= 1.0) {
      return 1.0; // Can show at 100%
    }
    
    return Math.max(0.4, Math.min(1.0, compatibility));
  }

  /**
   * Track device usage
   */
  trackDeviceUsage(device: DeviceConfig, sessionDuration: number, scale: number, satisfactionScore: number = 0.8): void {
    const stats = this.usageStats.get(device.name) || {
      deviceName: device.name,
      deviceClass: device.deviceClass,
      usageCount: 0,
      lastUsed: new Date(),
      averageSessionDuration: 0,
      preferredScale: scale,
      userSatisfactionScore: 0.5,
      performanceScore: 0.5,
    };

    // Update statistics
    stats.usageCount++;
    stats.lastUsed = new Date();
    stats.averageSessionDuration = (stats.averageSessionDuration * (stats.usageCount - 1) + sessionDuration) / stats.usageCount;
    stats.preferredScale = (stats.preferredScale * 0.7) + (scale * 0.3); // Weighted average
    stats.userSatisfactionScore = (stats.userSatisfactionScore * 0.8) + (satisfactionScore * 0.2);

    this.usageStats.set(device.name, stats);
    this.storeUsageStats();

    // Track analytics event
    this.trackEvent({
      type: 'device_selected',
      timestamp: new Date(),
      deviceName: device.name,
      data: {
        sessionDuration,
        scale,
        satisfactionScore,
      },
      userContext: this.userContext || {},
    });
  }

  /**
   * Track analytics event
   */
  private trackEvent(event: AnalyticsEvent): void {
    this.analyticsEvents.push(event);
    
    // Keep only recent events
    if (this.analyticsEvents.length > this.MAX_EVENTS_STORED) {
      this.analyticsEvents = this.analyticsEvents.slice(-this.MAX_EVENTS_STORED);
    }
  }

  /**
   * Get usage statistics for all devices
   */
  getUsageStats(): DeviceUsageStats[] {
    return Array.from(this.usageStats.values()).sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Get popular devices based on usage
   */
  getPopularDevices(devices: DeviceConfig[], limit: number = 3): DeviceConfig[] {
    const stats = this.getUsageStats();
    return stats
      .slice(0, limit)
      .map(stat => devices.find(device => device.name === stat.deviceName))
      .filter(device => device !== undefined) as DeviceConfig[];
  }

  // Browser detection
  private detectBrowser(): UserContext['browserType'] {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('chrome')) return 'chrome';
    if (userAgent.includes('firefox')) return 'firefox';
    if (userAgent.includes('safari')) return 'safari';
    if (userAgent.includes('edge')) return 'edge';
    return 'other';
  }

  // OS detection
  private detectOS(): UserContext['operatingSystem'] {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('windows')) return 'windows';
    if (userAgent.includes('mac')) return 'macos';
    if (userAgent.includes('linux')) return 'linux';
    if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'ios';
    if (userAgent.includes('android')) return 'android';
    return 'other';
  }

  // Connection speed detection
  private detectConnectionSpeed(): UserContext['connectionSpeed'] {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection.effectiveType) {
        switch (connection.effectiveType) {
          case '4g': return 'fast';
          case '3g': return 'medium';
          case '2g': return 'slow';
          default: return 'medium';
        }
      }
    }
    return 'unknown';
  }

  // Default recommendations for new users
  private getDefaultRecommendations(devices: DeviceConfig[]): DeviceRecommendation[] {
    return devices.map(device => ({
      device,
      confidence: device.deviceClass === 'mobile' ? 0.8 : 0.6,
      reasons: device.deviceClass === 'mobile' ? ['Most popular choice', 'Authentic guest experience'] : ['Good for detailed review'],
      benefits: ['Standard preview experience'],
      estimatedPerformance: 'good' as const,
      recommendedScale: 0.8,
    }));
  }

  // Storage methods
  private loadStoredData(): void {
    try {
      const stored = localStorage.getItem(this.USAGE_STATS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.usageStats = new Map(Object.entries(parsed).map(([key, value]: [string, any]) => [
          key,
          { ...value, lastUsed: new Date(value.lastUsed) }
        ]));
      }
    } catch (error) {
      console.warn('Failed to load device usage stats:', error);
    }
  }

  private storeUsageStats(): void {
    try {
      const data = Object.fromEntries(this.usageStats);
      localStorage.setItem(this.USAGE_STATS_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to store device usage stats:', error);
    }
  }

  private getStoredUserContext(): UserContext | null {
    try {
      const stored = localStorage.getItem(this.USER_CONTEXT_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to load user context:', error);
      return null;
    }
  }

  private storeUserContext(): void {
    try {
      localStorage.setItem(this.USER_CONTEXT_KEY, JSON.stringify(this.userContext));
    } catch (error) {
      console.warn('Failed to store user context:', error);
    }
  }

  // Setup analytics collection
  private setupAnalyticsCollection(): void {
    this.sessionStartTime = new Date();
    
    // Track session end when page unloads
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.sessionStartTime) {
          const sessionDuration = Date.now() - this.sessionStartTime.getTime();
          this.trackEvent({
            type: 'session_ended',
            timestamp: new Date(),
            deviceName: 'unknown',
            data: { sessionDuration },
            userContext: this.userContext || {},
          });
        }
      });
    }
  }
}

// Singleton instance
export const deviceAnalytics = new DeviceAnalytics();

// Hook for React components
export const useDeviceAnalytics = () => {
  return deviceAnalytics;
};