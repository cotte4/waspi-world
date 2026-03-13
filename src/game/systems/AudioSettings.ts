export const AUDIO_SETTINGS_STORAGE_KEY = 'waspi_audio_settings';

export type AudioSettings = {
  musicEnabled: boolean;
  sfxEnabled: boolean;
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicEnabled: true,
  sfxEnabled: true,
};

export function loadAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_AUDIO_SETTINGS };
  const raw = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      musicEnabled: parsed.musicEnabled ?? DEFAULT_AUDIO_SETTINGS.musicEnabled,
      sfxEnabled: parsed.sfxEnabled ?? DEFAULT_AUDIO_SETTINGS.sfxEnabled,
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(settings: AudioSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
