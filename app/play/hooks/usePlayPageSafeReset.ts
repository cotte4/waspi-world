import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

type UiNotice = { msg: string; color?: string } | null;

type UsePlayPageSafeResetOptions = {
  activeSceneRef: MutableRefObject<string>;
  closeSettings: () => void;
  rescueArmed: boolean;
  rescueTimeoutRef: MutableRefObject<number | null>;
  setRescueArmed: Dispatch<SetStateAction<boolean>>;
  setUiNotice: Dispatch<SetStateAction<UiNotice>>;
};

export function usePlayPageSafeReset({
  activeSceneRef,
  closeSettings,
  rescueArmed,
  rescueTimeoutRef,
  setRescueArmed,
  setUiNotice,
}: UsePlayPageSafeResetOptions) {
  const armSafeReset = useCallback(() => {
    setRescueArmed(true);
    setUiNotice({ msg: 'Volver a plaza armado. Toca de nuevo para confirmar.', color: '#46B3FF' });
    window.setTimeout(() => {
      setRescueArmed(false);
    }, 4000);
  }, [setRescueArmed, setUiNotice]);

  const confirmSafeReset = useCallback(() => {
    setRescueArmed(false);
    closeSettings();
    setUiNotice({ msg: 'Rescate a plaza...', color: '#46B3FF' });
    eventBus.emit(EVENTS.SAFE_RESET_TO_PLAZA);
    if (rescueTimeoutRef.current) {
      window.clearTimeout(rescueTimeoutRef.current);
    }
    rescueTimeoutRef.current = window.setTimeout(() => {
      if (activeSceneRef.current !== 'WorldScene') {
        window.location.assign('/play');
      }
    }, 1200);
  }, [activeSceneRef, closeSettings, rescueTimeoutRef, setRescueArmed, setUiNotice]);

  const handleSafeReset = useCallback(() => {
    if (rescueArmed) {
      confirmSafeReset();
      return;
    }
    armSafeReset();
  }, [armSafeReset, confirmSafeReset, rescueArmed]);

  return {
    armSafeReset,
    confirmSafeReset,
    handleSafeReset,
  };
}
