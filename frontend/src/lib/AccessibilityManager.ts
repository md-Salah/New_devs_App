import { useEffect, useRef, useCallback, useState } from 'react';
import { DeviceConfig } from '../components/guestPortal/DeviceFrameContainer';
import { ScaleConfig } from './ScalingEngine';

// Keyboard shortcut configuration
export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  category: 'navigation' | 'device' | 'scale' | 'settings' | 'help';
  action: () => void;
}

// Focus management configuration
export interface FocusConfig {
  trapFocus: boolean;
  restoreOnClose: boolean;
  initialFocusSelector?: string;
  skipLinks?: boolean;
}

// Accessibility announcements
export interface AccessibilityAnnouncement {
  message: string;
  priority: 'polite' | 'assertive';
  delay?: number;
}

// ARIA live region types
type LiveRegionType = 'status' | 'log' | 'alert';

class AccessibilityManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private liveRegions: Map<LiveRegionType, HTMLElement | null> = new Map();
  private focusHistory: HTMLElement[] = [];
  private isKeyboardNavigating = false;
  private shortcutsEnabled = true;
  private announceQueue: AccessibilityAnnouncement[] = [];
  private announceTimeoutId: NodeJS.Timeout | null = null;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private isDestroyed = false;

  constructor() {
    this.setupKeyboardDetection();
    this.createLiveRegions();
    this.setupGlobalKeyboardHandler();
  }

  /**
   * Destroy the accessibility manager and cleanup all resources
   */
  destroy(): void {
    if (this.isDestroyed) return;
    
    this.isDestroyed = true;
    this.cleanup();
  }

  /**
   * Register keyboard shortcut
   */
  registerShortcut(shortcut: KeyboardShortcut): void {
    const key = this.createShortcutKey(shortcut);
    this.shortcuts.set(key, shortcut);
  }

  /**
   * Unregister keyboard shortcut
   */
  unregisterShortcut(shortcut: Partial<KeyboardShortcut>): void {
    const key = this.createShortcutKey(shortcut as KeyboardShortcut);
    this.shortcuts.delete(key);
  }

  /**
   * Get all registered shortcuts grouped by category
   */
  getShortcuts(): Record<string, KeyboardShortcut[]> {
    const grouped: Record<string, KeyboardShortcut[]> = {};
    
    this.shortcuts.forEach((shortcut) => {
      if (!grouped[shortcut.category]) {
        grouped[shortcut.category] = [];
      }
      grouped[shortcut.category].push(shortcut);
    });

    return grouped;
  }

  /**
   * Enable/disable keyboard shortcuts
   */
  setShortcutsEnabled(enabled: boolean): void {
    this.shortcutsEnabled = enabled;
  }

  /**
   * Announce message to screen readers
   */
  announce(message: string, priority: 'polite' | 'assertive' = 'polite', delay = 100): void {
    this.announceQueue.push({ message, priority, delay });
    this.processAnnounceQueue();
  }

  /**
   * Announce device change
   */
  announceDeviceChange(device: DeviceConfig, isRotated: boolean): void {
    const orientation = isRotated ? 'landscape' : 'portrait';
    const message = `Device changed to ${device.name} in ${orientation} mode`;
    this.announce(message, 'polite');
  }

  /**
   * Announce scale change
   */
  announceScaleChange(oldScale: number, newScale: number, reason?: string): void {
    const oldPercent = Math.round(oldScale * 100);
    const newPercent = Math.round(newScale * 100);
    let message = `Scale changed from ${oldPercent}% to ${newPercent}%`;
    
    if (reason) {
      message += `. ${reason}`;
    }
    
    this.announce(message, 'polite');
  }

  /**
   * Announce scale mode change
   */
  announceScaleModeChange(mode: ScaleConfig['mode'], scale: number): void {
    const percent = Math.round(scale * 100);
    let message = '';
    
    switch (mode) {
      case 'smart':
        message = `Smart scaling enabled at ${percent}%`;
        break;
      case 'actual':
        message = `Actual size mode enabled at ${percent}%`;
        break;
      case 'fit':
        message = `Fit to screen mode enabled at ${percent}%`;
        break;
      case 'focus':
        message = `Focus mode enabled at ${percent}%`;
        break;
      case 'custom':
        message = `Custom scale set to ${percent}%`;
        break;
    }
    
    this.announce(message, 'polite');
  }

  /**
   * Set up focus management for modal
   */
  setupFocusManagement(container: HTMLElement, config: FocusConfig): () => void {
    const originalFocus = document.activeElement as HTMLElement;
    
    if (config.restoreOnClose && originalFocus) {
      this.focusHistory.push(originalFocus);
    }

    // Set initial focus
    if (config.initialFocusSelector) {
      const initialElement = container.querySelector(config.initialFocusSelector) as HTMLElement;
      if (initialElement) {
        // Delay focus to ensure element is rendered
        setTimeout(() => initialElement.focus(), 100);
      }
    }

    let focusTrapHandler: ((e: KeyboardEvent) => void) | null = null;
    
    if (config.trapFocus) {
      focusTrapHandler = this.createFocusTrap(container);
      document.addEventListener('keydown', focusTrapHandler);
    }

    // Cleanup function
    return () => {
      if (focusTrapHandler) {
        document.removeEventListener('keydown', focusTrapHandler);
      }
      
      if (config.restoreOnClose && this.focusHistory.length > 0) {
        const previousFocus = this.focusHistory.pop();
        if (previousFocus && document.contains(previousFocus)) {
          setTimeout(() => previousFocus.focus(), 100);
        }
      }
    };
  }

  /**
   */
  private createFocusTrap(container: HTMLElement): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as NodeListOf<HTMLElement>;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
  }

  /**
   * Get ARIA label for device
   */
  getDeviceAriaLabel(device: DeviceConfig, isRotated: boolean): string {
    const orientation = isRotated ? 'landscape' : 'portrait';
    return `${device.name} device preview in ${orientation} orientation, ${device.width} by ${device.height} pixels`;
  }

  /**
   * Get ARIA label for scale control
   */
  getScaleAriaLabel(scale: number, mode: ScaleConfig['mode']): string {
    const percent = Math.round(scale * 100);
    const modeLabels = {
      smart: 'Smart scaling',
      actual: 'Actual size',
      fit: 'Fit to screen',
      focus: 'Focus mode',
      custom: 'Custom scale'
    };
    
    return `${modeLabels[mode]}: ${percent}% scale`;
  }

  /**
   * Create high contrast mode detection
   */
  detectHighContrastMode(): boolean {
    // Create test element to detect high contrast
    const testEl = document.createElement('div');
    testEl.style.position = 'absolute';
    testEl.style.top = '-9999px';
    testEl.style.background = '#000';
    testEl.style.color = '#fff';
    document.body.appendChild(testEl);
    
    const computedStyle = window.getComputedStyle(testEl);
    const isHighContrast = computedStyle.backgroundColor === computedStyle.color;
    
    document.body.removeChild(testEl);
    return isHighContrast;
  }

  /**
   * Check if user prefers reduced motion
   */
  prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Setup keyboard navigation detection
   */
  private setupKeyboardDetection(): void {
    // Track keyboard vs mouse usage
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        this.isKeyboardNavigating = true;
        document.body.classList.add('keyboard-navigation');
      }
    });

    document.addEventListener('mousedown', () => {
      this.isKeyboardNavigating = false;
      document.body.classList.remove('keyboard-navigation');
    });
  }

  /**
   * Create ARIA live regions for announcements
   */
  private createLiveRegions(): void {
    // Create status region (polite)
    const statusRegion = document.createElement('div');
    statusRegion.setAttribute('aria-live', 'polite');
    statusRegion.setAttribute('aria-atomic', 'true');
    statusRegion.setAttribute('aria-relevant', 'text');
    statusRegion.style.position = 'absolute';
    statusRegion.style.left = '-9999px';
    statusRegion.style.width = '1px';
    statusRegion.style.height = '1px';
    statusRegion.style.overflow = 'hidden';
    document.body.appendChild(statusRegion);
    this.liveRegions.set('status', statusRegion);

    // Create alert region (assertive)
    const alertRegion = document.createElement('div');
    alertRegion.setAttribute('aria-live', 'assertive');
    alertRegion.setAttribute('aria-atomic', 'true');
    alertRegion.setAttribute('aria-relevant', 'text');
    alertRegion.style.position = 'absolute';
    alertRegion.style.left = '-9999px';
    alertRegion.style.width = '1px';
    alertRegion.style.height = '1px';
    alertRegion.style.overflow = 'hidden';
    document.body.appendChild(alertRegion);
    this.liveRegions.set('alert', alertRegion);
  }

  /**
   * Process announcement queue
   */
  private processAnnounceQueue(): void {
    if (this.announceTimeoutId || this.announceQueue.length === 0) {
      return;
    }

    const announcement = this.announceQueue.shift()!;
    
    this.announceTimeoutId = setTimeout(() => {
      const region = announcement.priority === 'assertive' 
        ? this.liveRegions.get('alert')
        : this.liveRegions.get('status');
      
      if (region) {
        region.textContent = announcement.message;
        
        // Clear after announcement to allow repeated messages
        setTimeout(() => {
          region.textContent = '';
        }, 1000);
      }
      
      this.announceTimeoutId = null;
      
      // Process next announcement
      if (this.announceQueue.length > 0) {
        this.processAnnounceQueue();
      }
    }, announcement.delay);
  }

  /**
   * Setup global keyboard shortcut handler
   */
  private setupGlobalKeyboardHandler(): void {
    this.keyboardHandler = (e: KeyboardEvent) => {
      if (!this.shortcutsEnabled || this.isDestroyed) return;

      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement || 
          e.target instanceof HTMLSelectElement) {
        return;
      }

      const shortcutKey = this.createShortcutKey({
        key: e.key.toLowerCase(),
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey
      } as KeyboardShortcut);

      const shortcut = this.shortcuts.get(shortcutKey);
      if (shortcut) {
        e.preventDefault();
        shortcut.action();
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Create unique key for shortcut mapping
   */
  private createShortcutKey(shortcut: KeyboardShortcut): string {
    const modifiers = [
      shortcut.ctrlKey ? 'ctrl' : '',
      shortcut.shiftKey ? 'shift' : '',
      shortcut.altKey ? 'alt' : ''
    ].filter(Boolean).join('+');

    return modifiers ? `${modifiers}+${shortcut.key.toLowerCase()}` : shortcut.key.toLowerCase();
  }

  /**
   * Get keyboard navigation state
   */
  get isUsingKeyboard(): boolean {
    return this.isKeyboardNavigating;
  }

  /**
   * Cleanup function
   */
  cleanup(): void {
    // Remove live regions
    this.liveRegions.forEach((region) => {
      if (region && region.parentNode) {
        region.parentNode.removeChild(region);
      }
    });
    this.liveRegions.clear();
    
    // Clear announcement timeout
    if (this.announceTimeoutId) {
      clearTimeout(this.announceTimeoutId);
      this.announceTimeoutId = null;
    }
    
    // Remove global keyboard handler
    if (this.keyboardHandler && typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
    
    // Clear data structures
    this.shortcuts.clear();
    this.focusHistory = [];
    this.announceQueue = [];
    this.shortcutsEnabled = false;
  }
}

// Factory function for creating managed instances
export const createAccessibilityManager = (): AccessibilityManager => {
  return new AccessibilityManager();
};

// Instance manager for React components
let currentAccessibilityManagerInstance: AccessibilityManager | null = null;

export const getAccessibilityManagerInstance = (): AccessibilityManager => {
  if (!currentAccessibilityManagerInstance) {
    currentAccessibilityManagerInstance = createAccessibilityManager();
  }
  return currentAccessibilityManagerInstance;
};

export const destroyAccessibilityManagerInstance = (): void => {
  if (currentAccessibilityManagerInstance) {
    currentAccessibilityManagerInstance.destroy();
    currentAccessibilityManagerInstance = null;
  }
};