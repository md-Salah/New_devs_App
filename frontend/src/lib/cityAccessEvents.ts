/**
 * Event system for city access to coordinate with authentication
 * This ensures city access is fetched immediately after auth
 */

class CityAccessEventEmitter extends EventTarget {
  private static instance: CityAccessEventEmitter;
  
  private constructor() {
    super();
  }
  
  static getInstance(): CityAccessEventEmitter {
    if (!CityAccessEventEmitter.instance) {
      CityAccessEventEmitter.instance = new CityAccessEventEmitter();
    }
    return CityAccessEventEmitter.instance;
  }
  
  /**
   * Emit auth success event to trigger city access fetch
   */
  emitAuthSuccess(userId: string) {
    console.log('[CityAccessEvents] Emitting auth success for user:', userId);
    const event = new CustomEvent('auth-success', { detail: { userId } });
    this.dispatchEvent(event);
  }
  
  /**
   * Emit auth logout event to clear city access
   */
  emitAuthLogout() {
    console.log('[CityAccessEvents] Emitting auth logout');
    const event = new CustomEvent('auth-logout');
    this.dispatchEvent(event);
  }
  
  /**
   * Listen for auth success
   */
  onAuthSuccess(callback: (userId: string) => void) {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent;
      callback(customEvent.detail.userId);
    };
    this.addEventListener('auth-success', handler);
    return () => this.removeEventListener('auth-success', handler);
  }
  
  /**
   * Listen for auth logout
   */
  onAuthLogout(callback: () => void) {
    const handler = () => callback();
    this.addEventListener('auth-logout', handler);
    return () => this.removeEventListener('auth-logout', handler);
  }
}

export const cityAccessEvents = CityAccessEventEmitter.getInstance();