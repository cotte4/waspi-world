import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { applyOutputSinkToSfxContext } from '@/src/game/systems/AudioManager';
import {
  applySinkIdToAudioContext,
  getStoredAudioOutputDeviceId,
  setStoredAudioOutputDeviceId,
} from '@/src/game/systems/audioOutputSink';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from '@/src/game/systems/AudioSettings';
import { loadHudSettings, saveHudSettings, type HudSettings } from '@/src/game/systems/HudSettings';
import {
  assignActionBinding,
  assignMovementBinding,
  clearVirtualJoystickState,
  formatMovementBindingLabel,
  isSupportedActionBindingCode,
  isSupportedMovementBindingCode,
  loadControlSettings,
  saveControlSettings,
  type ActionBinding,
  type ControlSettings,
  type MovementDirection,
} from '@/src/game/systems/ControlSettings';
import { VOICE_MIC_DEVICE_KEY } from '@/app/play/lib/playPageConstants';
import { getInitialSelectedMicDeviceId } from '@/app/play/lib/playPageStorage';
import type { SettingsTab } from '@/app/play/types';

type UiNotice = { msg: string; color?: string } | null;

type UsePlayPageSettingsOptions = {
  audioCtxRef: MutableRefObject<AudioContext | null>;
  jukeboxOpen: boolean;
  setUiNotice: Dispatch<SetStateAction<UiNotice>>;
};

function directionLabel(direction: MovementDirection) {
  switch (direction) {
    case 'up':
      return 'ARRIBA';
    case 'left':
      return 'IZQ';
    case 'down':
      return 'ABAJO';
    case 'right':
      return 'DER';
    default:
      return 'DIR';
  }
}

function actionLabel(action: ActionBinding) {
  switch (action) {
    case 'interact':
      return 'INTERACT';
    case 'shoot':
      return 'DISPARAR';
    case 'inventory':
      return 'INVENTARIO';
    case 'chat':
      return 'CHAT';
    case 'back':
      return 'VOLVER';
    default:
      return 'ACCION';
  }
}

export function usePlayPageSettings({
  audioCtxRef,
  jukeboxOpen,
  setUiNotice,
}: UsePlayPageSettingsOptions) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState<string>(getInitialSelectedMicDeviceId);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('waspi_voice_pref') === 'on'
  );
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>(() =>
    typeof window !== 'undefined' ? getStoredAudioOutputDeviceId() : ''
  );
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('audio');
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => loadAudioSettings());
  const [hudSettings, setHudSettings] = useState<HudSettings>(() => loadHudSettings());
  const [controlSettings, setControlSettings] = useState<ControlSettings>(() => loadControlSettings());
  const [bindingCaptureDirection, setBindingCaptureDirection] = useState<MovementDirection | null>(null);
  const [bindingCaptureAction, setBindingCaptureAction] = useState<ActionBinding | null>(null);

  useEffect(() => {
    saveAudioSettings(audioSettings);
    eventBus.emit(EVENTS.AUDIO_SETTINGS_CHANGED, audioSettings);
  }, [audioSettings]);

  useEffect(() => {
    saveHudSettings(hudSettings);
    eventBus.emit(EVENTS.HUD_SETTINGS_CHANGED, hudSettings);
  }, [hudSettings]);

  useEffect(() => {
    saveControlSettings(controlSettings);
    eventBus.emit(EVENTS.CONTROL_SETTINGS_CHANGED, controlSettings);
    if (!controlSettings.showVirtualJoystick) {
      clearVirtualJoystickState();
    }
  }, [controlSettings]);

  useEffect(() => {
    if (!settingsOpen) return;
    navigator.mediaDevices?.enumerateDevices().then((devices) => {
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      setMicDevices(inputs);
      setSelectedMicDeviceId((prev) => {
        if (inputs.length === 0) return prev;
        if (prev && inputs.some((d) => d.deviceId === prev)) return prev;
        return inputs[0].deviceId;
      });
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      setOutputDevices(outputs);
      setSelectedOutputDeviceId((prev) => {
        if (!prev) return prev;
        if (outputs.some((d) => d.deviceId === prev)) return prev;
        return '';
      });
    }).catch(() => {});
  }, [settingsOpen]);

  useEffect(() => {
    setStoredAudioOutputDeviceId(selectedOutputDeviceId);
  }, [selectedOutputDeviceId]);

  useEffect(() => {
    eventBus.emit(EVENTS.AUDIO_OUTPUT_SINK_CHANGED, selectedOutputDeviceId);
    void applyOutputSinkToSfxContext(selectedOutputDeviceId);
    const ctx = audioCtxRef.current;
    if (ctx) void applySinkIdToAudioContext(ctx, selectedOutputDeviceId);
  }, [audioCtxRef, selectedOutputDeviceId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (selectedMicDeviceId) {
        window.localStorage.setItem(VOICE_MIC_DEVICE_KEY, selectedMicDeviceId);
      } else {
        window.localStorage.removeItem(VOICE_MIC_DEVICE_KEY);
      }
    } catch {
      // noop
    }
  }, [selectedMicDeviceId]);

  useEffect(() => {
    if ((!bindingCaptureDirection && !bindingCaptureAction) || !settingsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (jukeboxOpen) return;
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.code === 'Escape') {
        setBindingCaptureDirection(null);
        setBindingCaptureAction(null);
        setUiNotice({ msg: 'Remapeo cancelado.' });
        return;
      }

      if (bindingCaptureDirection && !isSupportedMovementBindingCode(event.code)) {
        setUiNotice({ msg: 'Tecla no soportada para movimiento.', color: '#FF4444' });
        return;
      }

      if (bindingCaptureAction && !isSupportedActionBindingCode(event.code)) {
        setUiNotice({ msg: 'Tecla no soportada para accion.', color: '#FF4444' });
        return;
      }

      if (bindingCaptureDirection) {
        setControlSettings((current) => ({
          ...current,
          movementScheme: 'custom',
          movementBindings: assignMovementBinding(current.movementBindings, bindingCaptureDirection, event.code),
        }));
        setBindingCaptureDirection(null);
        setUiNotice({ msg: `Movimiento ${directionLabel(bindingCaptureDirection)}: ${formatMovementBindingLabel(event.code)}` });
        return;
      }

      if (bindingCaptureAction) {
        setControlSettings((current) => ({
          ...current,
          actionBindings: assignActionBinding(current.actionBindings, bindingCaptureAction, event.code),
        }));
        setBindingCaptureAction(null);
        setUiNotice({ msg: `Accion ${actionLabel(bindingCaptureAction)}: ${formatMovementBindingLabel(event.code)}` });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [bindingCaptureAction, bindingCaptureDirection, jukeboxOpen, setUiNotice, settingsOpen]);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setBindingCaptureDirection(null);
    setBindingCaptureAction(null);
    setSettingsOpen(false);
  }, []);

  const onAudioChange = useCallback((patch: Partial<AudioSettings>) => {
    setAudioSettings((current) => ({ ...current, ...patch }));
  }, []);

  const onHudChange = useCallback((patch: Partial<HudSettings>) => {
    setHudSettings((current) => ({ ...current, ...patch }));
  }, []);

  const onControlChange = useCallback((patch: Partial<ControlSettings>) => {
    setControlSettings((current) => ({ ...current, ...patch }));
  }, []);

  const onVoiceEnabledChange = useCallback((enabled: boolean) => {
    setVoiceEnabled(enabled);
    if (enabled) {
      eventBus.emit(EVENTS.VOICE_ENABLE);
    } else {
      eventBus.emit(EVENTS.VOICE_DISABLE);
    }
  }, []);

  return {
    audioSettings,
    bindingCaptureAction,
    bindingCaptureDirection,
    closeSettings,
    controlSettings,
    hudSettings,
    micDevices,
    onAudioChange,
    onControlChange,
    onHudChange,
    onVoiceEnabledChange,
    openSettings,
    outputDevices,
    selectedMicDeviceId,
    selectedOutputDeviceId,
    setBindingCaptureAction,
    setBindingCaptureDirection,
    setSelectedMicDeviceId,
    setSelectedOutputDeviceId,
    setSettingsTab,
    settingsOpen,
    settingsTab,
    voiceEnabled,
  };
}
