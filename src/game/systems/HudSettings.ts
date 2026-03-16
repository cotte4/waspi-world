export const HUD_SETTINGS_STORAGE_KEY = 'waspi_hud_settings';

export type HudSettings = {
  showSocialPanel: boolean;
  socialCollapsed: boolean;
  showProgressPanel: boolean;
  progressCollapsed: boolean;
  showControlsPanel: boolean;
  showArenaHud: boolean;
};

const _isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

export const DEFAULT_HUD_SETTINGS: HudSettings = {
  showSocialPanel: !_isMobile,
  socialCollapsed: _isMobile,
  showProgressPanel: !_isMobile,
  progressCollapsed: _isMobile,
  showControlsPanel: true,
  showArenaHud: true,
};

export function loadHudSettings(): HudSettings {
  if (typeof window === 'undefined') return DEFAULT_HUD_SETTINGS;
  try {
    const raw = window.localStorage.getItem(HUD_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_HUD_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<HudSettings>;
    return {
      ...DEFAULT_HUD_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_HUD_SETTINGS;
  }
}

export function saveHudSettings(settings: HudSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HUD_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
