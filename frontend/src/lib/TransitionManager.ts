import { ScaleConfig } from './ScalingEngine';

// Transition configuration for different animation types
export interface TransitionConfig {
  duration: number;
  easing: string;
  properties: string[];
  willChange: string[];
  transform3d: boolean;
  reduceMotion?: boolean;
}

// Animation state tracking
export interface AnimationState {
  isActive: boolean;
  startTime: number;
  startValue: number;
  endValue: number;
  progress: number;
  currentValue: number;
}

// Transition presets for different scenarios
export const TRANSITION_PRESETS = {
  INSTANT: {
    duration: 0,
    easing: 'linear',
    properties: ['transform'],
    willChange: [],
    transform3d: false
  },
  QUICK: {
    duration: 150,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)', // Material Design standard
    properties: ['transform', 'opacity'],
    willChange: ['transform'],
    transform3d: true
  },
  SMOOTH: {
    duration: 300,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // Smooth ease-out
    properties: ['transform', 'opacity'],
    willChange: ['transform'],
    transform3d: true
  },
  DRAMATIC: {
    duration: 500,
    easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // Back ease-out
    properties: ['transform', 'opacity'],
    willChange: ['transform'],
    transform3d: true
  }
} as const;

// Easing functions for JavaScript-driven animations
export const EASING_FUNCTIONS = {
  linear: (t: number) => t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  bounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }
};

export class TransitionManager {
  private animationStates: Map<string, AnimationState> = new Map();
  private animationFrameId: number | null = null;
  private preferReducedMotion: boolean = false;

  constructor() {
    this.detectMotionPreference();
    this.setupReducedMotionListener();
  }

  /**
   * Create optimized transition configuration based on scale change magnitude
   */
  createOptimalTransition(fromScale: number, toScale: number, force?: keyof typeof TRANSITION_PRESETS): TransitionConfig {
    if (this.preferReducedMotion) {
      return { ...TRANSITION_PRESETS.INSTANT, reduceMotion: true };
    }

    if (force) {
      return TRANSITION_PRESETS[force];
    }

    const scaleDifference = Math.abs(toScale - fromScale);
    
    if (scaleDifference < 0.05) {
      return TRANSITION_PRESETS.QUICK; // Subtle changes
    } else if (scaleDifference < 0.2) {
      return TRANSITION_PRESETS.SMOOTH; // Moderate changes
    } else {
      return TRANSITION_PRESETS.DRAMATIC; // Large changes
    }
  }

  /**
   * Apply CSS-based transition for hardware acceleration
   */
  applyCSSTransition(
    element: HTMLElement, 
    fromScale: number, 
    toScale: number, 
    config?: TransitionConfig
  ): Promise<void> {
    const transition = config || this.createOptimalTransition(fromScale, toScale);
    
    return new Promise((resolve) => {
      if (transition.duration === 0) {
        this.applyScale(element, toScale);
        resolve();
        return;
      }

      // Prepare element for hardware acceleration
      element.style.willChange = transition.willChange.join(', ');
      element.style.transition = this.buildTransitionString(transition);
      
      // Apply transform
      this.applyScale(element, toScale, transition.transform3d);
      
      // Cleanup after animation
      const cleanup = () => {
        element.style.willChange = 'auto';
        element.style.transition = '';
        element.removeEventListener('transitionend', cleanup);
        resolve();
      };
      
      element.addEventListener('transitionend', cleanup);
      
      // Fallback cleanup in case transitionend doesn't fire
      setTimeout(cleanup, transition.duration + 50);
    });
  }

  /**
   * JavaScript-driven animation for complex scenarios
   */
  animateScale(
    element: HTMLElement,
    fromScale: number,
    toScale: number,
    config?: TransitionConfig,
    onProgress?: (progress: number, currentScale: number) => void
  ): Promise<void> {
    const transition = config || this.createOptimalTransition(fromScale, toScale);
    const animationId = `scale-${Date.now()}`;
    
    if (transition.duration === 0) {
      this.applyScale(element, toScale);
      onProgress?.(1, toScale);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const startTime = performance.now();
      const easingFn = this.getEasingFunction(transition.easing);
      
      // Initialize animation state
      this.animationStates.set(animationId, {
        isActive: true,
        startTime,
        startValue: fromScale,
        endValue: toScale,
        progress: 0,
        currentValue: fromScale
      });

      // Prepare element
      element.style.willChange = transition.willChange.join(', ');

      const animate = (currentTime: number) => {
        const state = this.animationStates.get(animationId);
        if (!state || !state.isActive) {
          resolve();
          return;
        }

        const elapsed = currentTime - startTime;
        const rawProgress = Math.min(elapsed / transition.duration, 1);
        const easedProgress = easingFn(rawProgress);
        
        const currentScale = fromScale + (toScale - fromScale) * easedProgress;
        
        // Update animation state
        state.progress = rawProgress;
        state.currentValue = currentScale;
        
        // Apply transform
        this.applyScale(element, currentScale, transition.transform3d);
        
        // Call progress callback
        onProgress?.(rawProgress, currentScale);
        
        if (rawProgress < 1) {
          this.animationFrameId = requestAnimationFrame(animate);
        } else {
          // Animation complete
          this.cleanupAnimation(animationId, element);
          resolve();
        }
      };

      this.animationFrameId = requestAnimationFrame(animate);
    });
  }

  /**
   * Cancel any running animations
   */
  cancelAnimations(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Mark all animations as inactive
    this.animationStates.forEach(state => {
      state.isActive = false;
    });
    
    this.animationStates.clear();
  }

  /**
   * Get current animation state for a given ID
   */
  getAnimationState(animationId: string): AnimationState | null {
    return this.animationStates.get(animationId) || null;
  }

  /**
   * Apply scale transform with optimal performance
   */
  private applyScale(element: HTMLElement, scale: number, transform3d: boolean = true): void {
    if (transform3d) {
      // Use 3D transform for hardware acceleration
      element.style.transform = `scale3d(${scale}, ${scale}, 1)`;
    } else {
      // Use 2D transform for simpler scenarios
      element.style.transform = `scale(${scale})`;
    }
  }

  /**
   * Build optimized CSS transition string
   */
  private buildTransitionString(config: TransitionConfig): string {
    const properties = config.properties.map(prop => 
      `${prop} ${config.duration}ms ${config.easing}`
    );
    return properties.join(', ');
  }

  /**
   * Get easing function for JavaScript animations
   */
  private getEasingFunction(easing: string): (t: number) => number {
    // Map common CSS easing functions to JavaScript equivalents
    if (easing.includes('cubic-bezier')) {
      // For simplicity, map to closest standard function
      if (easing.includes('0.25, 0.46, 0.45, 0.94')) return EASING_FUNCTIONS.easeOut;
      if (easing.includes('0.68, -0.55, 0.265, 1.55')) return EASING_FUNCTIONS.bounce;
      return EASING_FUNCTIONS.easeInOut;
    }
    
    switch (easing) {
      case 'linear': return EASING_FUNCTIONS.linear;
      case 'ease-out': return EASING_FUNCTIONS.easeOut;
      case 'ease-in-out': return EASING_FUNCTIONS.easeInOut;
      default: return EASING_FUNCTIONS.easeInOut;
    }
  }

  /**
   * Cleanup after animation completion
   */
  private cleanupAnimation(animationId: string, element: HTMLElement): void {
    this.animationStates.delete(animationId);
    element.style.willChange = 'auto';
  }

  /**
   * Detect user's motion preferences
   */
  private detectMotionPreference(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.preferReducedMotion = mediaQuery.matches;
    }
  }

  /**
   * Listen for changes in motion preferences
   */
  private setupReducedMotionListener(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      
      const handleChange = (e: MediaQueryListEvent) => {
        this.preferReducedMotion = e.matches;
        
        // Cancel any running animations if user prefers reduced motion
        if (this.preferReducedMotion) {
          this.cancelAnimations();
        }
      };
      
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
      } else {
        // Fallback for older browsers
        mediaQuery.addListener(handleChange);
      }
    }
  }

  /**
   * Public getter for motion preference
   */
  get prefersReducedMotion(): boolean {
    return this.preferReducedMotion;
  }
}

// Singleton instance for global use
export const transitionManager = new TransitionManager();

// Hook for React components
export const useTransitionManager = () => {
  return transitionManager;
};