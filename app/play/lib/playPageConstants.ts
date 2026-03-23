export const AVATAR_STORAGE_KEY = 'waspi_avatar_config';
export const PLAYER_STATE_STORAGE_KEY = 'waspi_player_state';
export const MAGIC_LINK_COOLDOWN_KEY = 'waspi_magic_link_cooldown_until';
export const VOICE_MIC_DEVICE_KEY = 'waspi_voice_mic_device_id';
export const MAGIC_LINK_COOLDOWN_MS = 60_000;

export const ONBOARDING_SLIDES = [
  {
    title: 'BIENVENIDO A WASPI WORLD',
    body: 'Un mundo abierto donde la ropa que usas es real.\nExplora, juega y viste a tu waspi.',
    icon: '👋',
  },
  {
    title: 'TENKS',
    body: 'Ganas TENKS jugando minijuegos y en combate.\nUsalos para comprar ropa y parcelas.',
    icon: '🪙',
  },
  {
    title: 'EMPEZA POR COTTENKS',
    body: 'Habla con COTTENKS en la plaza.\nTe explica todo lo que necesitas saber.',
    icon: '🗣️',
  },
] as const;

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
