// Comprehensive crash monitoring and reporting system

interface CrashReport {
  id: string;
  timestamp: number;
  type: 'error' | 'warning' | 'performance' | 'memory';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  sessionId: string;
  userId?: string;
  tenantId?: string;
  buildVersion?: string;
  context: {
    memoryUsage?: any;
    networkStatus: boolean;
    viewportSize: { width: number; height: number };
    timestamp: string;
    route: string;
    userActions: string[];
  };
  reproduction?: {
    steps: string[];
    expectedBehavior: string;
    actualBehavior: string;
  };
}

interface PerformanceMetrics {
  fcp: number; // First Contentful Paint
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
  ttfb: number; // Time to First Byte
}

class CrashMonitor {
  private static instance: CrashMonitor;
  private sessionId: string;
  private userActions: string[] = [];
  private isMonitoring = false;
  private reportQueue: CrashReport[] = [];
  private maxReports = 50;
  private maxUserActions = 20;
  private lastReportTime = 0;
  private reportCount = 0;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_REPORTS_PER_WINDOW = 10;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeMonitoring();
  }

  static getInstance(): CrashMonitor {
    if (!CrashMonitor.instance) {
      CrashMonitor.instance = new CrashMonitor();
    }
    return CrashMonitor.instance;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private initializeMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Global error handler
    window.addEventListener('error', this.handleError.bind(this));
    
    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', this.handlePromiseRejection.bind(this));
    
    // Performance monitoring
    this.initializePerformanceMonitoring();
    
    // Memory monitoring
    this.initializeMemoryMonitoring();
    
    // User action tracking
    this.initializeUserActionTracking();
    
    // Network monitoring
    this.initializeNetworkMonitoring();

  }

  private handleError(event: ErrorEvent) {
    const report: CrashReport = {
      id: this.generateReportId(),
      timestamp: Date.now(),
      type: 'error',
      severity: this.classifyErrorSeverity(event.error),
      message: event.message,
      stack: event.error?.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      userId: this.getCurrentUserId(),
      tenantId: this.getCurrentTenantId(),
      buildVersion: this.getBuildVersion(),
      context: this.gatherContext(),
    };

    this.addReport(report);
  }

  private handlePromiseRejection(event: PromiseRejectionEvent) {
    const report: CrashReport = {
      id: this.generateReportId(),
      timestamp: Date.now(),
      type: 'error',
      severity: 'medium',
      message: `Unhandled Promise Rejection: ${event.reason?.message || event.reason}`,
      stack: event.reason?.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      userId: this.getCurrentUserId(),
      tenantId: this.getCurrentTenantId(),
      buildVersion: this.getBuildVersion(),
      context: this.gatherContext(),
    };

    this.addReport(report);
  }

  private initializePerformanceMonitoring() {
    // Core Web Vitals monitoring
    if ('PerformanceObserver' in window) {
      // First Contentful Paint & Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        
        if (lastEntry.startTime > 4000) { // LCP > 4s is poor
          this.reportPerformanceIssue('lcp', lastEntry.startTime, 'high');
        }
      });

      try {
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        // LCP monitoring not supported - silently continue
      }

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          if (entry.processingStart - entry.startTime > 100) { // FID > 100ms is poor
            this.reportPerformanceIssue('fid', entry.processingStart - entry.startTime, 'medium');
          }
        });
      });

      try {
        fidObserver.observe({ entryTypes: ['first-input'] });
      } catch (e) {
        // FID monitoring not supported - silently continue
      }

      // Layout Shift
      const clsObserver = new PerformanceObserver((list) => {
        let clsScore = 0;
        list.getEntries().forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsScore += entry.value;
          }
        });

        if (clsScore > 0.25) { // CLS > 0.25 is poor
          this.reportPerformanceIssue('cls', clsScore, 'medium');
        }
      });

      try {
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        // CLS monitoring not supported - silently continue
      }
    }

    // Long task monitoring
    if ('PerformanceObserver' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 50) { // Tasks > 50ms can cause janky interactions
            this.reportPerformanceIssue('long-task', entry.duration, 'low');
          }
        });
      });

      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        // Long task monitoring not supported - silently continue
      }
    }
  }

  private initializeMemoryMonitoring() {
    if ('memory' in performance) {
      setInterval(() => {
        const memInfo = (performance as any).memory;
        const usedMB = Math.round(memInfo.usedJSHeapSize / (1024 * 1024));
        const totalMB = Math.round(memInfo.totalJSHeapSize / (1024 * 1024));
        const limitMB = Math.round(memInfo.jsHeapSizeLimit / (1024 * 1024));
        const usedPercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;

        if (usedPercent > 90) {
          this.reportMemoryIssue('critical', {
            usedMB,
            totalMB,
            limitMB,
            usedPercent: Math.round(usedPercent),
          });
        } else if (usedPercent > 80) {
          this.reportMemoryIssue('high', {
            usedMB,
            totalMB,
            limitMB,
            usedPercent: Math.round(usedPercent),
          });
        }
      }, 30000); // Check every 30 seconds
    }
  }

  private initializeUserActionTracking() {
    // Track clicks
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = `Click: ${target.tagName}${target.className ? '.' + target.className.split(' ').join('.') : ''}${target.id ? '#' + target.id : ''}`;
      this.addUserAction(action);
    });

    // Track route changes
    let currentPath = window.location.pathname;
    const checkRouteChange = () => {
      if (window.location.pathname !== currentPath) {
        currentPath = window.location.pathname;
        this.addUserAction(`Navigation: ${currentPath}`);
      }
    };

    setInterval(checkRouteChange, 1000);

    // Track form submissions
    document.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement;
      const action = `Form Submit: ${form.action || form.id || 'unnamed'}`;
      this.addUserAction(action);
    });
  }

  private initializeNetworkMonitoring() {
    // Monitor network status changes
    window.addEventListener('online', () => {
      this.addUserAction('Network: Back online');
    });

    window.addEventListener('offline', () => {
      this.reportNetworkIssue('offline');
    });

    // Monitor fetch failures (monkey patch fetch) - only in development
    if (process.env.NODE_ENV !== 'production') {
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        try {
          const response = await originalFetch(...args);
          
          if (!response.ok && response.status >= 500) {
            this.reportNetworkIssue('http_error', {
              status: response.status,
              url: args[0].toString(),
            });
          }

          return response;
        } catch (error) {
          this.reportNetworkIssue('fetch_failure', {
            url: args[0].toString(),
            error: error.message,
          });
          throw error;
        }
      };
    }
  }

  private addUserAction(action: string) {
    this.userActions.push(`${new Date().toISOString()}: ${action}`);
    
    // Keep only the last N actions
    if (this.userActions.length > this.maxUserActions) {
      this.userActions = this.userActions.slice(-this.maxUserActions);
    }
  }

  private gatherContext() {
    return {
      memoryUsage: 'memory' in performance ? (performance as any).memory : null,
      networkStatus: navigator.onLine,
      viewportSize: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      timestamp: new Date().toISOString(),
      route: window.location.pathname,
      userActions: [...this.userActions],
    };
  }

  private classifyErrorSeverity(error: Error): CrashReport['severity'] {
    if (!error) return 'low';

    const message = error.message?.toLowerCase() || '';
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes('chunk') && message.includes('load')) return 'critical';
    if (message.includes('out of memory')) return 'critical';
    if (message.includes('maximum call stack')) return 'critical';
    if (stack.includes('auth')) return 'high';

    // High severity
    if (message.includes('network') || message.includes('fetch')) return 'high';
    if (message.includes('permission') || message.includes('unauthorized')) return 'high';
    if (stack.includes('payment') || stack.includes('billing')) return 'high';

    // Medium severity
    if (message.includes('validation') || message.includes('invalid')) return 'medium';
    if (message.includes('timeout')) return 'medium';

    return 'low';
  }

  private reportPerformanceIssue(metric: string, value: number, severity: CrashReport['severity']) {
    const report: CrashReport = {
      id: this.generateReportId(),
      timestamp: Date.now(),
      type: 'performance',
      severity,
      message: `Performance issue: ${metric} = ${value.toFixed(2)}ms`,
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      userId: this.getCurrentUserId(),
      tenantId: this.getCurrentTenantId(),
      buildVersion: this.getBuildVersion(),
      context: this.gatherContext(),
    };

    this.addReport(report);
  }

  private reportMemoryIssue(severity: CrashReport['severity'], memInfo: any) {
    const report: CrashReport = {
      id: this.generateReportId(),
      timestamp: Date.now(),
      type: 'memory',
      severity,
      message: `High memory usage: ${memInfo.usedPercent}% (${memInfo.usedMB}MB/${memInfo.limitMB}MB)`,
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      userId: this.getCurrentUserId(),
      tenantId: this.getCurrentTenantId(),
      buildVersion: this.getBuildVersion(),
      context: { ...this.gatherContext(), memoryDetails: memInfo },
    };

    this.addReport(report);
  }

  private reportNetworkIssue(type: string, details?: any) {
    // Prevent infinite loops by skipping crash-reports related network issues
    if (details?.url?.includes('/api/crash-reports') || 
        details?.url?.includes('crash-reports')) {
      return;
    }

    const report: CrashReport = {
      id: this.generateReportId(),
      timestamp: Date.now(),
      type: 'error',
      severity: type === 'offline' ? 'high' : 'medium',
      message: `Network issue: ${type}`,
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      userId: this.getCurrentUserId(),
      tenantId: this.getCurrentTenantId(),
      buildVersion: this.getBuildVersion(),
      context: { ...this.gatherContext(), networkDetails: details },
    };

    this.addReport(report);
  }

  private addReport(report: CrashReport) {
    if (report.severity !== 'critical') {
      return;
    }

    const now = Date.now();
    
    // Rate limiting: reset counter if outside window
    if (now - this.lastReportTime > this.RATE_LIMIT_WINDOW) {
      this.reportCount = 0;
      this.lastReportTime = now;
    }
    
    // Check rate limit
    if (this.reportCount >= this.MAX_REPORTS_PER_WINDOW) {
      // Silently drop reports when rate limited
      return;
    }
    
    this.reportCount++;
    this.reportQueue.push(report);
    
    // Keep only the last N reports in memory
    if (this.reportQueue.length > this.maxReports) {
      this.reportQueue = this.reportQueue.slice(-this.maxReports);
    }

    // Send to monitoring service (in production only) - no localStorage
    if (this.isProductionEnvironment()) {
      this.sendReportToService(report);
    }
  }


  private isProductionEnvironment(): boolean {
    // Check if we're in production based on backend URL
    // This ensures staging deployments don't send crash emails
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const isProduction = backendUrl === 'https://pms.base360.ai' || backendUrl.endsWith('://pms.base360.ai');
    
    // Debug logging (only in development)
    if (backendUrl.includes('localhost')) {
      console.debug(`[CrashMonitor] Environment check - URL: ${backendUrl}, isProduction: ${isProduction}`);
    }
    
    return isProduction;
  }

  private async sendReportToService(report: CrashReport) {
    // Prevent infinite loops by checking if this is a crash report related error
    if (report.message && report.message.toLowerCase().includes('crash-reports')) {
      return;
    }

    try {
      if (!this.isProductionEnvironment() || report.severity !== 'critical') {
        return;
      }

      const response = await fetch('/api/crash-reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      // Silently handle all responses - no console output
    } catch (error) {
      // Silently fail to prevent infinite loops - no console output
    }
  }


  private generateReportId(): string {
    return `crash_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private getCurrentUserId(): string | undefined {
    // Try to get from auth context or localStorage
    try {
      const authData = localStorage.getItem('auth_session');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.user?.id;
      }
    } catch (error) {
      // Ignore
    }
    return undefined;
  }

  private getCurrentTenantId(): string | undefined {
    // Try to get from auth context or localStorage
    try {
      const authData = localStorage.getItem('auth_session');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.user?.tenant_id;
      }
    } catch (error) {
      // Ignore
    }
    return undefined;
  }

  private getBuildVersion(): string | undefined {
    return process.env.REACT_APP_VERSION || process.env.VITE_APP_VERSION;
  }

  // Public methods for manual reporting
  public reportError(error: Error, context?: string) {
    const report: CrashReport = {
      id: this.generateReportId(),
      timestamp: Date.now(),
      type: 'error',
      severity: this.classifyErrorSeverity(error),
      message: context ? `${context}: ${error.message}` : error.message,
      stack: error.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      userId: this.getCurrentUserId(),
      tenantId: this.getCurrentTenantId(),
      buildVersion: this.getBuildVersion(),
      context: this.gatherContext(),
    };

    this.addReport(report);
  }

  public getReports(): CrashReport[] {
    return [...this.reportQueue];
  }

  public clearReports() {
    this.reportQueue = [];
  }

  public exportReports(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      exportTime: new Date().toISOString(),
      reports: this.reportQueue,
    }, null, 2);
  }
}

// Initialize the crash monitor
export const crashMonitor = CrashMonitor.getInstance();

// Export for use in components
export default crashMonitor;