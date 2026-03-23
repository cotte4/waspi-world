import { useEffect, useMemo, useState } from 'react';
import { JOYSTICK_SCENES } from '@/app/play/lib/playPageConstants';

type UsePlayPageMobileControlsOptions = {
  activeScene: string;
  showVirtualJoystick: boolean;
};

export function usePlayPageMobileControls({
  activeScene,
  showVirtualJoystick,
}: UsePlayPageMobileControlsOptions) {
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [showMobileHint, setShowMobileHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobile(w <= 768);
      setIsPortrait(w < h);
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isMobile && activeScene === 'WorldScene' && !window.localStorage.getItem('waspi_mobile_hint_v1')) {
      let hideTimer: number | null = null;
      const showTimer = window.setTimeout(() => {
        setShowMobileHint(true);
        hideTimer = window.setTimeout(() => {
          setShowMobileHint(false);
          window.localStorage.setItem('waspi_mobile_hint_v1', 'done');
        }, 5000);
      }, 0);

      return () => {
        window.clearTimeout(showTimer);
        if (hideTimer) window.clearTimeout(hideTimer);
      };
    }
  }, [activeScene, isMobile]);

  const joystickVisible = useMemo(
    () => showVirtualJoystick && JOYSTICK_SCENES.has(activeScene),
    [activeScene, showVirtualJoystick]
  );

  return {
    isMobile,
    isPortrait,
    joystickVisible,
    showMobileHint,
  };
}
