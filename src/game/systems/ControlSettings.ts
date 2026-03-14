import type * as Phaser from 'phaser';

export const CONTROL_SETTINGS_STORAGE_KEY = 'waspi_control_settings';

export type MovementScheme = 'wasd' | 'arrows' | 'both' | 'ijkl' | 'custom';
export type MovementDirection = 'up' | 'left' | 'down' | 'right';
export type MovementBindings = Record<MovementDirection, string>;

export type ControlSettings = {
  movementScheme: MovementScheme;
  movementBindings: MovementBindings;
  showVirtualJoystick: boolean;
};

export const MOVEMENT_PRESETS: Record<Exclude<MovementScheme, 'custom'>, MovementBindings> = {
  both: {
    up: 'KeyW',
    left: 'KeyA',
    down: 'KeyS',
    right: 'KeyD',
  },
  wasd: {
    up: 'KeyW',
    left: 'KeyA',
    down: 'KeyS',
    right: 'KeyD',
  },
  arrows: {
    up: 'ArrowUp',
    left: 'ArrowLeft',
    down: 'ArrowDown',
    right: 'ArrowRight',
  },
  ijkl: {
    up: 'KeyI',
    left: 'KeyJ',
    down: 'KeyK',
    right: 'KeyL',
  },
};

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  movementScheme: 'both',
  movementBindings: { ...MOVEMENT_PRESETS.wasd },
  showVirtualJoystick: false,
};

type LegacyControlSettings = {
  movementScheme?: Exclude<MovementScheme, 'custom'>;
  showVirtualJoystick?: boolean;
};

type ReadMovementOptions = {
  scene: Phaser.Scene;
  settings: ControlSettings;
  includeJoystick?: boolean;
};

type VirtualJoystickState = {
  active: boolean;
  dx: number;
  dy: number;
};

const DIRECTION_ORDER: MovementDirection[] = ['up', 'left', 'down', 'right'];

const DIGIT_KEY_CODES: Record<string, number> = {
  Digit0: 48,
  Digit1: 49,
  Digit2: 50,
  Digit3: 51,
  Digit4: 52,
  Digit5: 53,
  Digit6: 54,
  Digit7: 55,
  Digit8: 56,
  Digit9: 57,
};

const NUMPAD_KEY_CODES: Record<string, number> = {
  Numpad0: 96,
  Numpad1: 97,
  Numpad2: 98,
  Numpad3: 99,
  Numpad4: 100,
  Numpad5: 101,
  Numpad6: 102,
  Numpad7: 103,
  Numpad8: 104,
  Numpad9: 105,
};

const SPECIAL_KEY_CODES: Record<string, number> = {
  ArrowUp: 38,
  ArrowLeft: 37,
  ArrowDown: 40,
  ArrowRight: 39,
  Space: 32,
  Enter: 13,
  Tab: 9,
  ShiftLeft: 16,
  ShiftRight: 16,
  ControlLeft: 17,
  ControlRight: 17,
  AltLeft: 18,
  AltRight: 18,
  Backspace: 8,
  Escape: 27,
  Minus: 189,
  Equal: 187,
  BracketLeft: 219,
  BracketRight: 221,
  Semicolon: 186,
  Quote: 222,
  Comma: 188,
  Period: 190,
  Slash: 191,
  Backslash: 220,
  Backquote: 192,
};

let virtualJoystickState: VirtualJoystickState = {
  active: false,
  dx: 0,
  dy: 0,
};

const sceneKeyCache = new WeakMap<Phaser.Scene, Map<string, Phaser.Input.Keyboard.Key>>();

export function loadControlSettings(): ControlSettings {
  if (typeof window === 'undefined') return DEFAULT_CONTROL_SETTINGS;
  try {
    const raw = window.localStorage.getItem(CONTROL_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CONTROL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ControlSettings> & LegacyControlSettings;
    const movementScheme = sanitizeMovementScheme(parsed.movementScheme);
    const bindings = sanitizeBindings(parsed.movementBindings)
      ?? { ...MOVEMENT_PRESETS[movementScheme === 'custom' ? 'wasd' : movementScheme] };

    return {
      movementScheme,
      movementBindings: bindings,
      showVirtualJoystick: Boolean(parsed.showVirtualJoystick),
    };
  } catch {
    return DEFAULT_CONTROL_SETTINGS;
  }
}

export function saveControlSettings(settings: ControlSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONTROL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function setVirtualJoystickState(next: Partial<VirtualJoystickState>) {
  virtualJoystickState = {
    ...virtualJoystickState,
    ...next,
  };
}

export function clearVirtualJoystickState() {
  virtualJoystickState = {
    active: false,
    dx: 0,
    dy: 0,
  };
}

export function getVirtualJoystickState() {
  return virtualJoystickState;
}

export function assignMovementBinding(
  bindings: MovementBindings,
  direction: MovementDirection,
  code: string
): MovementBindings {
  const next = { ...bindings };
  const previous = next[direction];
  for (const otherDirection of DIRECTION_ORDER) {
    if (otherDirection !== direction && next[otherDirection] === code) {
      next[otherDirection] = previous;
    }
  }
  next[direction] = code;
  return next;
}

export function formatMovementBindingLabel(code: string) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  switch (code) {
    case 'ArrowUp':
      return '↑';
    case 'ArrowLeft':
      return '←';
    case 'ArrowDown':
      return '↓';
    case 'ArrowRight':
      return '→';
    case 'Space':
      return 'SPACE';
    case 'Enter':
      return 'ENTER';
    case 'Tab':
      return 'TAB';
    case 'ShiftLeft':
      return 'SHIFT IZQ';
    case 'ShiftRight':
      return 'SHIFT DER';
    case 'ControlLeft':
      return 'CTRL IZQ';
    case 'ControlRight':
      return 'CTRL DER';
    case 'AltLeft':
      return 'ALT IZQ';
    case 'AltRight':
      return 'ALT DER';
    case 'Backspace':
      return 'BACKSPACE';
    case 'Escape':
      return 'ESC';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    case 'Backslash':
      return '\\';
    case 'Backquote':
      return '`';
    default:
      return code.toUpperCase();
  }
}

export function isSupportedMovementBindingCode(code: string) {
  return resolvePhaserKeyCode(code) !== null;
}

export function readMovementVector(options: ReadMovementOptions) {
  const { scene, settings } = options;
  const activeCodes = getActiveMovementCodes(settings);

  const left = isAnyBindingDown(scene, activeCodes.left);
  const right = isAnyBindingDown(scene, activeCodes.right);
  const up = isAnyBindingDown(scene, activeCodes.up);
  const down = isAnyBindingDown(scene, activeCodes.down);

  let dx = (right ? 1 : 0) - (left ? 1 : 0);
  let dy = (down ? 1 : 0) - (up ? 1 : 0);

  if (dx === 0 && dy === 0 && options.includeJoystick) {
    const joystick = getVirtualJoystickState();
    if (joystick.active) {
      dx = joystick.dx;
      dy = joystick.dy;
    }
  }

  return { dx, dy };
}

function sanitizeMovementScheme(value: unknown): MovementScheme {
  switch (value) {
    case 'wasd':
    case 'arrows':
    case 'both':
    case 'ijkl':
    case 'custom':
      return value;
    default:
      return DEFAULT_CONTROL_SETTINGS.movementScheme;
  }
}

function sanitizeBindings(value: unknown): MovementBindings | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Record<MovementDirection, unknown>>;
  const up = typeof candidate.up === 'string' && isSupportedMovementBindingCode(candidate.up) ? candidate.up : null;
  const left = typeof candidate.left === 'string' && isSupportedMovementBindingCode(candidate.left) ? candidate.left : null;
  const down = typeof candidate.down === 'string' && isSupportedMovementBindingCode(candidate.down) ? candidate.down : null;
  const right = typeof candidate.right === 'string' && isSupportedMovementBindingCode(candidate.right) ? candidate.right : null;
  if (!up || !left || !down || !right) return null;
  return { up, left, down, right };
}

function getActiveMovementCodes(settings: ControlSettings): Record<MovementDirection, string[]> {
  switch (settings.movementScheme) {
    case 'wasd':
      return mapSingleBindings(MOVEMENT_PRESETS.wasd);
    case 'arrows':
      return mapSingleBindings(MOVEMENT_PRESETS.arrows);
    case 'ijkl':
      return mapSingleBindings(MOVEMENT_PRESETS.ijkl);
    case 'custom':
      return mapSingleBindings(settings.movementBindings);
    case 'both':
    default:
      return {
        up: [MOVEMENT_PRESETS.wasd.up, MOVEMENT_PRESETS.arrows.up],
        left: [MOVEMENT_PRESETS.wasd.left, MOVEMENT_PRESETS.arrows.left],
        down: [MOVEMENT_PRESETS.wasd.down, MOVEMENT_PRESETS.arrows.down],
        right: [MOVEMENT_PRESETS.wasd.right, MOVEMENT_PRESETS.arrows.right],
      };
  }
}

function mapSingleBindings(bindings: MovementBindings): Record<MovementDirection, string[]> {
  return {
    up: [bindings.up],
    left: [bindings.left],
    down: [bindings.down],
    right: [bindings.right],
  };
}

function isAnyBindingDown(scene: Phaser.Scene, codes: string[]) {
  for (const code of codes) {
    const key = getSceneKey(scene, code);
    if (key?.isDown) return true;
  }
  return false;
}

function getSceneKey(scene: Phaser.Scene, code: string) {
  const keyboard = scene.input.keyboard;
  if (!keyboard) return null;

  let cache = sceneKeyCache.get(scene);
  if (!cache) {
    cache = new Map<string, Phaser.Input.Keyboard.Key>();
    sceneKeyCache.set(scene, cache);
    scene.events.once('shutdown', () => {
      sceneKeyCache.delete(scene);
    });
  }

  const cached = cache.get(code);
  if (cached) return cached;

  const keyCode = resolvePhaserKeyCode(code);
  if (keyCode === null) return null;

  const created = keyboard.addKey(keyCode, false);
  cache.set(code, created);
  return created;
}

function resolvePhaserKeyCode(code: string): number | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.charCodeAt(3);
  }

  if (code in DIGIT_KEY_CODES) return DIGIT_KEY_CODES[code];
  if (code in NUMPAD_KEY_CODES) return NUMPAD_KEY_CODES[code];
  if (code in SPECIAL_KEY_CODES) return SPECIAL_KEY_CODES[code];
  return null;
}
