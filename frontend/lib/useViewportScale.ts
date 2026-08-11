'use client';

import { useEffect, useRef, useState } from 'react';

function sanitizeScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.min(Math.max(value, 0.5), 3);
}

export function useViewportScale(): number {
  const [viewportScale, setViewportScale] = useState(1);
  const baseDevicePixelRatioRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!baseDevicePixelRatioRef.current) {
      baseDevicePixelRatioRef.current = window.devicePixelRatio || 1;
    }

    const updateViewportScale = () => {
      const visualViewportScale = window.visualViewport?.scale;

      if (typeof visualViewportScale === 'number') {
        setViewportScale(sanitizeScale(visualViewportScale));
        return;
      }

      const baseDpr = baseDevicePixelRatioRef.current || 1;
      const dprScale = (window.devicePixelRatio || 1) / baseDpr;
      setViewportScale(sanitizeScale(dprScale));
    };

    updateViewportScale();
    window.visualViewport?.addEventListener('resize', updateViewportScale);
    window.addEventListener('resize', updateViewportScale);

    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewportScale);
      window.removeEventListener('resize', updateViewportScale);
    };
  }, []);

  return viewportScale;
}
