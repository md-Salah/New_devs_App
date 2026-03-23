import { useState, useEffect, useMemo } from 'react';
import { DeviceConfig } from '../components/guestPortal/DeviceFrameContainer';

interface ViewportDimensions {
  width: number;
  height: number;
  availableWidth: number;
  availableHeight: number;
}

interface OptimalScaleResult {
  optimalScale: number;
  fitToScreenScale: number;
  canShow100Percent: boolean;
  scaleReason: string;
  viewportDimensions: ViewportDimensions;
}

// Hook to detect viewport size and calculate optimal scaling
export const useOptimalScale = (device: DeviceConfig, isRotated: boolean = false): OptimalScaleResult => {
  const [viewportDimensions, setViewportDimensions] = useState<ViewportDimensions>({
    width: 0,
    height: 0,
    availableWidth: 0,
    availableHeight: 0,
  });

  // Update viewport dimensions on window resize
  useEffect(() => {
    const updateDimensions = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      
      // Reserve space for modal header (approximately 120px) and padding (64px total)
      const headerHeight = 120;
      const totalPadding = 64; // 32px padding on each side
      
      const availableWidth = vw - totalPadding;
      const availableHeight = vh - headerHeight - totalPadding;
      
      setViewportDimensions({
        width: vw,
        height: vh,
        availableWidth: Math.max(availableWidth, 300), // Minimum 300px
        availableHeight: Math.max(availableHeight, 400), // Minimum 400px
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Calculate optimal scaling based on device and available space
  const scaleCalculation = useMemo(() => {
    if (!viewportDimensions.availableWidth || !viewportDimensions.availableHeight) {
      return {
        optimalScale: device.scale,
        fitToScreenScale: device.scale,
        canShow100Percent: false,
        scaleReason: 'Calculating optimal size...',
      };
    }

    // Get device dimensions (considering rotation)
    const deviceWidth = isRotated && device.deviceClass !== 'desktop' 
      ? device.frameHeight 
      : device.frameWidth;
    const deviceHeight = isRotated && device.deviceClass !== 'desktop' 
      ? device.frameWidth 
      : device.frameHeight;

    // Calculate scale to fit within available space
    const widthScale = viewportDimensions.availableWidth / deviceWidth;
    const heightScale = viewportDimensions.availableHeight / deviceHeight;
    const fitToScreenScale = Math.min(widthScale, heightScale, 1.5); // Cap at 150%
    
    // Check if 100% scale fits
    const canShow100Percent = deviceWidth <= viewportDimensions.availableWidth && 
                              deviceHeight <= viewportDimensions.availableHeight;

    let optimalScale: number;
    let scaleReason: string;

    if (canShow100Percent) {
      optimalScale = 1.0;
      scaleReason = 'Showing at 100% - perfect fit';
    } else if (fitToScreenScale >= 0.8) {
      // If we can show at least 80%, use fit-to-screen
      optimalScale = Math.round(fitToScreenScale * 10) / 10; // Round to 1 decimal
      scaleReason = `Optimized for your screen (${Math.round(optimalScale * 100)}%)`;
    } else if (fitToScreenScale >= 0.6) {
      // For very large devices or small screens, use fit-to-screen but warn
      optimalScale = Math.round(fitToScreenScale * 10) / 10;
      scaleReason = `Scaled to fit your screen (${Math.round(optimalScale * 100)}%)`;
    } else {
      // Fallback for extreme cases - use minimum usable scale
      optimalScale = Math.max(fitToScreenScale, 0.4);
      scaleReason = `Minimum scale for usability (${Math.round(optimalScale * 100)}%)`;
    }

    return {
      optimalScale,
      fitToScreenScale: Math.round(fitToScreenScale * 10) / 10,
      canShow100Percent,
      scaleReason,
    };
  }, [device, isRotated, viewportDimensions]);

  return {
    ...scaleCalculation,
    viewportDimensions,
  };
};

// Utility function to calculate if a scale will fit without scrolling
export const willScaleFitInViewport = (
  device: DeviceConfig,
  scale: number,
  isRotated: boolean,
  viewportDimensions: ViewportDimensions
): boolean => {
  const deviceWidth = isRotated && device.deviceClass !== 'desktop' 
    ? device.frameHeight 
    : device.frameWidth;
  const deviceHeight = isRotated && device.deviceClass !== 'desktop' 
    ? device.frameWidth 
    : device.frameHeight;

  const scaledWidth = deviceWidth * scale;
  const scaledHeight = deviceHeight * scale;

  return scaledWidth <= viewportDimensions.availableWidth && 
         scaledHeight <= viewportDimensions.availableHeight;
};

// Get scale preset options based on device and viewport
export const getScalePresets = (optimalScaleResult: OptimalScaleResult) => {
  const { optimalScale, fitToScreenScale, canShow100Percent } = optimalScaleResult;
  
  const presets = [
    {
      name: 'Fit to Screen',
      scale: fitToScreenScale,
      description: 'Maximum size that fits completely',
    },
  ];

  if (canShow100Percent) {
    presets.push({
      name: '100%',
      scale: 1.0,
      description: 'Actual size',
    });
  }

  // Add common scales that fit
  [0.75, 0.5].forEach(scale => {
    if (scale < fitToScreenScale) {
      presets.push({
        name: `${Math.round(scale * 100)}%`,
        scale,
        description: 'Standard preview size',
      });
    }
  });

  return presets;
};