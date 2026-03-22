export const AVATAR_STORAGE_KEY = 'waspi_avatar_config';
export const PLAYER_STATE_STORAGE_KEY = 'waspi_player_state';
export const MAGIC_LINK_COOLDOWN_KEY = 'waspi_magic_link_cooldown_until';
export const VOICE_MIC_DEVICE_KEY = 'waspi_voice_mic_device_id';
export const MAGIC_LINK_COOLDOWN_MS = 60_000;

export const CHAT_SCENES = new Set([
  'WorldScene',
  'VecindadScene',
  'StoreInterior',
  'GunShopInterior',
  'CafeInterior',
  'ArcadeInterior',
  'CasinoInterior',
  'HouseInterior',
  'PvpArenaScene',
  'ZombiesScene',
  'BasementZombiesScene',
  'BosqueMaterialesScene',
]);

export const INTERIOR_SOCIAL_SCENES = new Set([
  'VecindadScene',
  'StoreInterior',
  'GunShopInterior',
  'CafeInterior',
  'ArcadeInterior',
  'CasinoInterior',
  'HouseInterior',
  'ZombiesScene',
  'BasementZombiesScene',
  'BosqueMaterialesScene',
]);

export const JOYSTICK_SCENES = new Set([
  'WorldScene',
  'VecindadScene',
  'StoreInterior',
  'GunShopInterior',
  'PvpArenaScene',
  'ZombiesScene',
  'BasementZombiesScene',
  'BosqueMaterialesScene',
]);
