export type WeaponVisualMode = string;

export type WeaponAnimationDef = {
  key: string;
  texture: string;
  frameRate: number;
  repeat: number;
};

export type WeaponVisualStat = {
  color: number;
  cooldownMs: number;
  idleAnim: string;
  idleTexture: string;
  label: string;
  shootAnim: string;
};

export type WeaponVisualStatsMap<TWeapon extends string = WeaponVisualMode> = Record<TWeapon, WeaponVisualStat>;

type SpriteAnimStateLike = {
  currentAnim?: { key: string } | null;
  isPlaying: boolean;
};

type SpriteLike = {
  anims: SpriteAnimStateLike;
  scene?: unknown;
  texture: { key: string };
  setDepth(depth: number): SpriteLike;
  setFlipY(flip: boolean): SpriteLike;
  setOrigin(x: number, y: number): SpriteLike;
  setPosition(x: number, y: number): SpriteLike;
  setRotation(angle: number): SpriteLike;
  setScale(scale: number): SpriteLike;
  setVisible(visible: boolean): SpriteLike;
  stop(): SpriteLike;
};

type TextLike = {
  setColor(color: string): TextLike;
  setDepth(depth: number): TextLike;
  setScrollFactor(factor: number): TextLike;
  setText(text: string): TextLike;
  setVisible(visible: boolean): TextLike;
};

type GraphicsLike = {
  clear(): GraphicsLike;
  fillRoundedRect(x: number, y: number, width: number, height: number, radius: number): GraphicsLike;
  fillStyle(color: number, alpha?: number): GraphicsLike;
  lineStyle(width?: number, color?: number, alpha?: number): GraphicsLike;
  setDepth(depth: number): GraphicsLike;
  setScrollFactor(factor: number): GraphicsLike;
  setVisible(visible: boolean): GraphicsLike;
  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number): GraphicsLike;
};

type PointerLike = {
  x: number;
  y: number;
};

type WorldPointLike = {
  x: number;
  y: number;
};

export type RemoteWeaponPlayerLike<TWeapon extends string = WeaponVisualMode> = {
  aimAngle: number;
  gunSprite?: SpriteLike;
  weapon?: TWeapon;
  x: number;
  y: number;
};

export type WeaponSceneLike<TWeapon extends string = WeaponVisualMode> = {
  add: {
    graphics(): GraphicsLike;
    sprite(x: number, y: number, texture: string, frame?: number): SpriteLike;
    text(
      x: number,
      y: number,
      text: string,
      style: {
        color: string;
        fontFamily: string;
        fontSize: string;
      },
    ): TextLike;
  };
  cameras: {
    main: {
      getWorldPoint(x: number, y: number): WorldPointLike;
    };
  };
  currentWeapon: TWeapon;
  gunEnabled: boolean;
  gunSprite?: SpriteLike;
  hudSettings: {
    showArenaHud: boolean;
  };
  input: {
    activePointer?: PointerLike | null;
  };
  lastShotAt: number;
  px: number;
  py: number;
  scale: {
    height: number;
  };
  textures: {
    exists(texture: string): boolean;
  };
  time: {
    now: number;
  };
  weaponAimAngle: number;
  weaponCooldownBar?: GraphicsLike;
  weaponHud?: TextLike;
};

export type WeaponRuntimeHelpers = {
  ensureFallbackRectTexture: (
    scene: unknown,
    textureKey: string,
    width: number,
    height: number,
    fillColor: number,
    strokeColor: number,
  ) => void;
  safeBindAnimationComplete: (
    scene: unknown,
    sprite: SpriteLike,
    onComplete: (animation: { key: string }) => void,
  ) => void;
  safeCreateSpritesheetAnimation: (
    scene: unknown,
    key: string,
    texture: string,
    frameRate: number,
    repeat: number,
  ) => void;
  safePlaySpriteAnimation: (
    scene: unknown,
    sprite: SpriteLike,
    animationKey: string,
    textureKey: string,
    fallbackTextureKey: string,
    ignoreIfPlaying: boolean,
  ) => void;
  safeSetSpriteTexture: (
    scene: unknown,
    sprite: SpriteLike,
    textureKey: string,
    fallbackTextureKey: string,
  ) => void;
  safeWithLiveSprite: (
    sprite: SpriteLike,
    callback: (liveSprite: SpriteLike) => void,
    context: string,
  ) => void;
  weaponAnimations: readonly WeaponAnimationDef[];
};

export type WeaponVisualConfig<TWeapon extends string = WeaponVisualMode> = {
  fallbackTextureKey: string;
  stats: WeaponVisualStatsMap<TWeapon>;
};

// Future WorldScene integration:
// `ensureWeaponAnimations()` -> pass `this` plus current animation registry/helper set.
export function ensureWeaponAnimationsForScene<TWeapon extends string>(
  scene: WeaponSceneLike<TWeapon>,
  config: WeaponVisualConfig<TWeapon>,
  helpers: WeaponRuntimeHelpers,
) {
  helpers.ensureFallbackRectTexture(
    scene,
    config.fallbackTextureKey,
    24,
    8,
    0xf5c842,
    0x1a1a1a,
  );

  for (const animation of helpers.weaponAnimations) {
    helpers.safeCreateSpritesheetAnimation(
      scene,
      animation.key,
      animation.texture,
      animation.frameRate,
      animation.repeat,
    );
  }
}

// Future WorldScene integration:
// `setupWeaponSystem()` -> call once after player spawn and before first HUD render.
export function setupWeaponSystemVisuals<TWeapon extends string>(
  scene: WeaponSceneLike<TWeapon>,
  config: WeaponVisualConfig<TWeapon>,
  helpers: WeaponRuntimeHelpers,
) {
  ensureWeaponAnimationsForScene(scene, config, helpers);

  const weapon = config.stats[scene.currentWeapon];
  const initialTexture = scene.textures.exists(weapon.idleTexture)
    ? weapon.idleTexture
    : config.fallbackTextureKey;

  scene.gunSprite = scene.add.sprite(scene.px, scene.py - 8, initialTexture, 0)
    .setDepth(2050)
    .setVisible(false)
    .setOrigin(0.26, 0.62)
    .setScale(0.72);

  helpers.safeBindAnimationComplete(scene, scene.gunSprite, (animation) => {
    const currentWeapon = config.stats[scene.currentWeapon];
    if (animation.key === currentWeapon.shootAnim && scene.gunSprite) {
      helpers.safePlaySpriteAnimation(
        scene,
        scene.gunSprite,
        currentWeapon.idleAnim,
        currentWeapon.idleTexture,
        config.fallbackTextureKey,
        true,
      );
    }
  });

  scene.weaponHud = scene.add.text(8, scene.scale.height - 42, '', {
    fontSize: '7px',
    fontFamily: '"Press Start 2P", monospace',
    color: '#F5C842',
  }).setScrollFactor(0).setDepth(9999);

  scene.weaponCooldownBar = scene.add.graphics().setScrollFactor(0).setDepth(9998);

  syncWeaponVisualState(scene, config, helpers);
}

// Future WorldScene integration:
// `syncWeaponVisual()` -> call after weapon switch, gun toggle, or HUD visibility changes.
export function syncWeaponVisualState<TWeapon extends string>(
  scene: WeaponSceneLike<TWeapon>,
  config: WeaponVisualConfig<TWeapon>,
  helpers: Pick<WeaponRuntimeHelpers, 'safePlaySpriteAnimation' | 'safeSetSpriteTexture'>,
) {
  if (!scene.gunSprite || !scene.weaponHud) return;

  const weapon = config.stats[scene.currentWeapon];
  const shouldShow = scene.gunEnabled;
  scene.gunSprite.setVisible(shouldShow);
  scene.weaponHud.setVisible(shouldShow && scene.hudSettings.showArenaHud);

  if (!shouldShow) {
    scene.weaponHud.setText('');
    scene.gunSprite.stop();
    return;
  }

  if (scene.gunSprite.texture.key !== weapon.idleTexture) {
    helpers.safeSetSpriteTexture(scene, scene.gunSprite, weapon.idleTexture, config.fallbackTextureKey);
  }

  if (!scene.gunSprite.anims.isPlaying || scene.gunSprite.anims.currentAnim?.key !== weapon.idleAnim) {
    helpers.safePlaySpriteAnimation(
      scene,
      scene.gunSprite,
      weapon.idleAnim,
      weapon.idleTexture,
      config.fallbackTextureKey,
      true,
    );
  }

  scene.weaponHud.setColor(scene.currentWeapon === ('shotgun' as TWeapon) ? '#FF8B3D' : '#F5C842');
  scene.weaponHud.setText(`ARMA ${weapon.label} | Q CAMBIA`);
}

// Future WorldScene integration:
// use from both local and remote weapon updates to keep offsets/depth rules in one place.
export function positionWeaponSprite(
  safeWithLiveSprite: WeaponRuntimeHelpers['safeWithLiveSprite'],
  sprite: SpriteLike,
  x: number,
  y: number,
  angle: number,
  depth: number,
) {
  const safeAngle = Number.isFinite(angle) ? angle : 0;
  const offsetX = Math.cos(safeAngle) * 16;
  const offsetY = Math.sin(safeAngle) * 10 - 8;

  safeWithLiveSprite(sprite, (liveSprite) => {
    liveSprite.setPosition(x + offsetX, y + offsetY);
    liveSprite.setRotation(safeAngle);
    liveSprite.setFlipY(safeAngle > Math.PI / 2 || safeAngle < -Math.PI / 2);
    liveSprite.setDepth(depth);
  }, 'positionWeaponSprite');
}

// Future WorldScene integration:
// `updateRemoteWeaponSprite(rp)` -> call after remote move / aim / weapon updates.
export function syncRemoteWeaponVisual<TWeapon extends string>(
  scene: WeaponSceneLike<TWeapon>,
  remotePlayer: RemoteWeaponPlayerLike<TWeapon>,
  config: WeaponVisualConfig<TWeapon>,
  helpers: Pick<
    WeaponRuntimeHelpers,
    'safeBindAnimationComplete' | 'safePlaySpriteAnimation' | 'safeSetSpriteTexture' | 'safeWithLiveSprite'
  >,
) {
  if (!scene.gunEnabled) {
    remotePlayer.gunSprite?.setVisible(false);
    return;
  }

  const weapon = config.stats[remotePlayer.weapon ?? scene.currentWeapon];
  if (!remotePlayer.gunSprite || remotePlayer.gunSprite.scene !== scene) {
    const initialTexture = scene.textures.exists(weapon.idleTexture)
      ? weapon.idleTexture
      : config.fallbackTextureKey;

    remotePlayer.gunSprite = scene.add.sprite(remotePlayer.x, remotePlayer.y - 8, initialTexture, 0)
      .setDepth(2100 + Math.floor(remotePlayer.y / 10))
      .setVisible(scene.gunEnabled)
      .setOrigin(0.26, 0.62)
      .setScale(0.72);

    helpers.safeBindAnimationComplete(scene, remotePlayer.gunSprite, (animation) => {
      const currentWeapon = config.stats[remotePlayer.weapon ?? scene.currentWeapon];
      if (animation.key === currentWeapon.shootAnim && remotePlayer.gunSprite) {
        helpers.safePlaySpriteAnimation(
          scene,
          remotePlayer.gunSprite,
          currentWeapon.idleAnim,
          currentWeapon.idleTexture,
          config.fallbackTextureKey,
          true,
        );
      }
    });
  }

  if (!remotePlayer.gunSprite) return;

  if (remotePlayer.gunSprite.texture.key !== weapon.idleTexture) {
    helpers.safeSetSpriteTexture(scene, remotePlayer.gunSprite, weapon.idleTexture, config.fallbackTextureKey);
  }
  if (
    !remotePlayer.gunSprite.anims.isPlaying ||
    remotePlayer.gunSprite.anims.currentAnim?.key !== weapon.idleAnim
  ) {
    helpers.safePlaySpriteAnimation(
      scene,
      remotePlayer.gunSprite,
      weapon.idleAnim,
      weapon.idleTexture,
      config.fallbackTextureKey,
      true,
    );
  }

  remotePlayer.gunSprite.setVisible(true);
  positionWeaponSprite(
    helpers.safeWithLiveSprite,
    remotePlayer.gunSprite,
    remotePlayer.x,
    remotePlayer.y,
    remotePlayer.aimAngle,
    2100 + Math.floor(remotePlayer.y / 10),
  );
}
