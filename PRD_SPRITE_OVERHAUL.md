# PRD: Sprite Overhaul — WASPI WORLD
**Version:** 1.0
**Date:** 2026-03-14
**Status:** Ready for implementation
**Project path:** `waspi-world/`

> Ver también **`PRD_ESTADO_ACTUAL.md`** para inventario de assets en disco; §0 describe cómo encaja este doc con los otros PRD del repo.

---

## Overview & Goals

The current game renders the player character using procedural Phaser primitives (`Arc`, `Rectangle`, `Graphics`) and enemies as colored circles (`Phaser.GameObjects.Arc`). Guns have spritesheets but lack a character-hold connection and a reload animation. This PRD defines the full sprite overhaul across three sequential phases.

**Primary goals:**
1. Replace the procedural `AvatarRenderer` with a proper spritesheet character that carries the WASPI brand aesthetic.
2. Replace circle enemies with zombie sprites that visually communicate each enemy archetype's behavior.
3. Improve gun sprites and add an arm-overlay system so weapons visually attach to the player body.

**Non-goals for this PRD:**
- Multiplayer avatar skin customization via spritesheets (deferred — customization system stays procedural until Phase 1 lands).
- Texture atlas packing (listed as optional Phase 2 item, not in scope here).
- New enemy AI behavior changes (sprite swap only, AI logic untouched).

---

## Visual Design Spec

### Palette
| Token | Hex | Usage |
|---|---|---|
| Background | `#0E0E14` | Scene bg, chroma-key removal fallback |
| Golden accent | `#F5C842` | HUD, boss highlights, muzzle flash |
| Chroma green | `#00FF00` | AI generation background — removed at runtime |
| Shadow | `#000000` @ 35% alpha | Ground shadow ellipse under all characters |

### Style Reference
- **Binding of Isaac** top-down perspective: character seen from slightly above (~15-20 degree tilt), head larger than body, short limbs.
- **Pixel art**: hard pixel edges, no anti-aliasing. All sprites exported with `NEAREST` filter in Phaser.
- **Palette limit**: aim for 16-32 colors per sprite to keep the pixel-art look tight. Shading via dithering, not gradients.
- **Outline**: 1-pixel dark outline (`#0E0E14` or `#111111`) on all characters for readability against varied backgrounds.

### Resolution Standards
| Entity | Frame size | Notes |
|---|---|---|
| Player character | 64x64 px | 4-directional variants |
| Rusher zombie | 64x64 px | |
| Shooter zombie | 64x64 px | |
| Tank zombie | 96x96 px | Upscaled hitbox radius matches (22px → 33px visual) |
| Boss zombie | 128x128 px | |
| Gun sprites | 64x64 px | Standardizes existing strips |
| Arm overlay | 64x64 px | Composited on top of player at runtime |

---

## Phase 1: Main Character Sprites

### 1.1 Asset Specification

**Character identity:**
Urban streetwear male/neutral figure. Loose-fit tee, cargo pants or baggy jeans, chunky sneakers. Cap or beanie optional. Represents the WASPI brand visual language. No brand logos visible in sprite (avoids trademark issues in AI generation). Skin tone: medium-warm, adaptable.

**Perspective:** Top-down, head at top of frame, feet at bottom. Head takes ~30% of frame height.

**Frame layout:** Horizontal strip — all frames side by side in a single PNG. Frame 0 is leftmost. Each frame is exactly 64x64 px, so a 4-frame strip is 256x64 px total.

**Animation states:**

| State | Frame count | Frame rate | Loop | Notes |
|---|---|---|---|---|
| `idle` | 4 | 6 fps | yes | Subtle breathing bob, weight shift |
| `walk_down` | 6 | 8 fps | yes | Moving toward camera, arms swing |
| `walk_up` | 6 | 8 fps | yes | Moving away from camera |
| `walk_side` | 6 | 8 fps | yes | Used for both left (x-flip) and right |
| `shoot` | 4 | 12 fps | no | Recoil — completes once then returns to idle |
| `hurt` | 3 | 10 fps | no | Hit flash, brief knockback |
| `death` | 6 | 8 fps | no | Falls down, do not loop |

**Directional handling:**
- Generate `walk_down`, `walk_up`, and `walk_side` as separate spritesheets.
- Left-facing walk is the `walk_side` strip with `setFlipX(true)` — no extra asset needed.
- `shoot` and `hurt` are direction-agnostic (player sprite flips with movement direction).

**File naming convention:**
```
public/assets/sprites/character/player/
  idle_strip.png           (256x64  — 4 frames)
  walk_down_strip.png      (384x64  — 6 frames)
  walk_up_strip.png        (384x64  — 6 frames)
  walk_side_strip.png      (384x64  — 6 frames)
  shoot_strip.png          (256x64  — 4 frames)
  hurt_strip.png           (192x64  — 3 frames)
  death_strip.png          (384x64  — 6 frames)
```

Individual frames are kept alongside the strip for AI pipeline reference:
```
  idle_frame_01.png … idle_frame_04.png
  walk_down_frame_01.png … walk_down_frame_06.png
  (etc.)
```

### 1.2 Code Changes

**Files to modify:**

`src/game/systems/AvatarRenderer.ts`
- Add a new code path inside `buildAvatar()` that detects when a texture key `player_idle` exists in the scene's texture cache and builds a `Phaser.GameObjects.Sprite` instead of the procedural primitives.
- The sprite-based path replaces: `body`, `shirt`, `leftFoot`, `rightFoot`, `leftHand`, `rightHand`, `hair`, eye circles — all replaced by one `Phaser.GameObjects.Sprite` added to the container.
- The shadow ellipse is kept as-is.
- `update()` method: replace the `walkTick`/`swing`/`bob` math with `sprite.play()` calls based on `isMoving` and `dx`/`dy` state.
- Existing procedural path remains as fallback when textures are not loaded (backward compatible).
- New `AvatarKind` value: `'sprite'` — set automatically when `player_idle` texture is present.

Key `update()` animation logic:
```typescript
// Inside AvatarRenderer.update(isMoving, dx, dy, isShooting, isHurt)
if (this.playerSprite) {
  if (isHurt) {
    this.playerSprite.play('player_hurt', true);
  } else if (isShooting) {
    this.playerSprite.play('player_shoot', true);
  } else if (isMoving) {
    if (Math.abs(dy) > Math.abs(dx)) {
      this.playerSprite.play(dy > 0 ? 'player_walk_down' : 'player_walk_up', true);
    } else {
      this.playerSprite.play('player_walk_side', true);
      this.playerSprite.setFlipX(dx < 0);
    }
  } else {
    this.playerSprite.play('player_idle', true);
  }
}
```

`src/game/scenes/BootScene.ts`
- Add spritesheet loads for all player animation strips:
```typescript
this.load.spritesheet('player_idle',      '/assets/sprites/character/player/idle_strip.png',      { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('player_walk_down', '/assets/sprites/character/player/walk_down_strip.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('player_walk_up',   '/assets/sprites/character/player/walk_up_strip.png',   { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('player_walk_side', '/assets/sprites/character/player/walk_side_strip.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('player_shoot',     '/assets/sprites/character/player/shoot_strip.png',     { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('player_hurt',      '/assets/sprites/character/player/hurt_strip.png',      { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('player_death',     '/assets/sprites/character/player/death_strip.png',     { frameWidth: 64, frameHeight: 64 });
```

`src/game/scenes/WorldScene.ts` (or a new `AnimationRegistry.ts` helper)
- Register all player animations in `create()`:
```typescript
this.anims.create({ key: 'player_idle',      frames: this.anims.generateFrameNumbers('player_idle',      { start: 0, end: 3 }), frameRate: 6,  repeat: -1 });
this.anims.create({ key: 'player_walk_down', frames: this.anims.generateFrameNumbers('player_walk_down', { start: 0, end: 5 }), frameRate: 8,  repeat: -1 });
this.anims.create({ key: 'player_walk_up',   frames: this.anims.generateFrameNumbers('player_walk_up',   { start: 0, end: 5 }), frameRate: 8,  repeat: -1 });
this.anims.create({ key: 'player_walk_side', frames: this.anims.generateFrameNumbers('player_walk_side', { start: 0, end: 5 }), frameRate: 8,  repeat: -1 });
this.anims.create({ key: 'player_shoot',     frames: this.anims.generateFrameNumbers('player_shoot',     { start: 0, end: 3 }), frameRate: 12, repeat: 0  });
this.anims.create({ key: 'player_hurt',      frames: this.anims.generateFrameNumbers('player_hurt',      { start: 0, end: 2 }), frameRate: 10, repeat: 0  });
this.anims.create({ key: 'player_death',     frames: this.anims.generateFrameNumbers('player_death',     { start: 0, end: 5 }), frameRate: 8,  repeat: 0  });
```

---

## Phase 2: Zombie Enemy Sprites

### 2.1 Asset Specification

Four zombie variants map 1:1 to the existing `EnemyArchetype` type in `WorldScene.ts`:

| Archetype | Zombie variant | Size | Visual personality |
|---|---|---|---|
| `rusher` | Fast zombie | 64x64 | Lean, hunched forward, torn tank top, fast gait |
| `shooter` | Armed zombie | 64x64 | Holding improvised weapon, slower, more upright |
| `tank` | Bloated zombie | 96x96 | Fat, slow, massive arms, shredded clothing |
| `boss` | Boss zombie | 128x128 | Unique design: spiked shoulders, crown-like head wound, glowing eyes |

**Current enemy tints (from `ENEMY_PROFILES` in `WorldScene.ts`):**
- rusher: `0xFF5E5E` (red) — zombie should have reddish torn clothing
- shooter: `0xFF8B3D` (orange) — orange-ish worn outfit
- tank: `0xB74DFF` (purple) — purple decay, bloated
- boss: `0xF5C842` (gold) — golden highlights, imposing

**Animation states per zombie:**

| State | rusher | shooter | tank | boss | Frame rate |
|---|---|---|---|---|---|
| `idle` | 4 frames | 4 frames | 4 frames | 4 frames | 6 fps |
| `walk` | 6 frames | 6 frames | 6 frames | 6 frames | 8 fps |
| `attack` | 4 frames | 4 frames | 4 frames | 6 frames | 12 fps |
| `hurt` | 3 frames | 3 frames | 3 frames | 3 frames | 10 fps |
| `death` | 6 frames | 6 frames | 6 frames | 8 frames | 8 fps |

Boss gets extra frames in `attack` (6) and `death` (8) for more dramatic effect.

**File naming convention:**
```
public/assets/sprites/enemies/zombies/
  rusher/
    idle_strip.png    (256x64)
    walk_strip.png    (384x64)
    attack_strip.png  (256x64)
    hurt_strip.png    (192x64)
    death_strip.png   (384x64)
  shooter/
    (same structure)
  tank/
    idle_strip.png    (384x96)   <- 96px frames
    walk_strip.png    (576x96)
    attack_strip.png  (384x96)
    hurt_strip.png    (288x96)
    death_strip.png   (576x96)
  boss/
    idle_strip.png    (512x128)  <- 128px frames
    walk_strip.png    (768x128)
    attack_strip.png  (768x128)  <- 6 frames
    hurt_strip.png    (384x128)
    death_strip.png   (1024x128) <- 8 frames
```

### 2.2 New System: `EnemySprite.ts`

Create `src/game/systems/EnemySprite.ts` — a state machine wrapper for zombie sprites.

Responsibilities:
- Holds a `Phaser.GameObjects.Sprite` reference.
- Exposes `setState(state: ZombieState)` which calls `.play()` with the correct animation key.
- Manages the transition back to `idle` or `walk` after `attack`, `hurt` fire-and-forget animations complete.
- Handles `death` sequence: plays death animation, then hides sprite after completion.

```typescript
type ZombieState = 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
type ZombieType = 'rusher' | 'shooter' | 'tank' | 'boss';

// Animation key pattern: zombie_[type]_[state]
// Example: zombie_rusher_walk, zombie_boss_attack
```

### 2.3 Code Changes

**`src/game/scenes/BootScene.ts`** — add spritesheet loads:
```typescript
const ZOMBIE_TYPES = ['rusher', 'shooter', 'tank', 'boss'] as const;
const ZOMBIE_STATES = ['idle', 'walk', 'attack', 'hurt', 'death'] as const;
const ZOMBIE_SIZES: Record<string, number> = { rusher: 64, shooter: 64, tank: 96, boss: 128 };

for (const type of ZOMBIE_TYPES) {
  const fw = ZOMBIE_SIZES[type];
  for (const state of ZOMBIE_STATES) {
    this.load.spritesheet(
      `zombie_${type}_${state}`,
      `/assets/sprites/enemies/zombies/${type}/${state}_strip.png`,
      { frameWidth: fw, frameHeight: fw }
    );
  }
}
```

**`src/game/scenes/WorldScene.ts`**
- In `create()`: register zombie animations. Use a helper:
```typescript
function registerZombieAnims(scene: Phaser.Scene) {
  const configs = [
    { type: 'rusher',  state: 'idle',   end: 3, fps: 6,  repeat: -1 },
    { type: 'rusher',  state: 'walk',   end: 5, fps: 8,  repeat: -1 },
    { type: 'rusher',  state: 'attack', end: 3, fps: 12, repeat: 0  },
    { type: 'rusher',  state: 'hurt',   end: 2, fps: 10, repeat: 0  },
    { type: 'rusher',  state: 'death',  end: 5, fps: 8,  repeat: 0  },
    // ... repeat for shooter, tank
    { type: 'boss',    state: 'attack', end: 5, fps: 12, repeat: 0  },
    { type: 'boss',    state: 'death',  end: 7, fps: 8,  repeat: 0  },
    // ... boss idle/walk/hurt
  ];
  for (const c of configs) {
    const key = `zombie_${c.type}_${c.state}`;
    if (!scene.anims.exists(key)) {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: c.end }),
        frameRate: c.fps,
        repeat: c.repeat,
      });
    }
  }
}
```

- In the enemy spawn logic (currently `scene.add.arc(...)` with tint): replace with:
```typescript
// Before: const dummy = this.physics.add.existing(this.add.arc(...)) as CombatDummy;
// After:
const textureKey = `zombie_${archetype}_idle`;
const zombieSprite = this.add.sprite(x, y, textureKey);
zombieSprite.setScale(archetype === 'boss' ? 1 : archetype === 'tank' ? 0.75 : 0.9);
// EnemySprite system manages .play() from here
```

- `DummyState` type: add `sprite?: Phaser.GameObjects.Sprite` field alongside existing `nameplate` and `hpBar` fields. The `Arc` field becomes optional during migration.

- Enemy hitbox: keep the invisible `physics.add.existing(arc)` body for collision detection. The sprite is a visual layer only, positioned to match the arc's center each frame in `update()`.

---

## Phase 3: Gun Sprite + Character Hold Animation

### 3.1 Improved Gun Sprites

All 6 guns get re-generated at standardized 64x64px per frame with consistent perspective (side view, slight tilt toward camera, muzzle pointing right).

**Guns:**
| ID | Name | Personality |
|---|---|---|
| 01 | glock | Sleek, compact, silver-black |
| 02 | uzi | Boxy, aggressive, short barrel |
| 03 | shotgun | Wide pump action, wooden stock |
| 04 | blaster | Sci-fi / energy weapon, glowing barrel |
| 05 | deagle | Large, chrome, heavy feel |
| 06 | cannon | Oversized, comically big, chunky |

**New animation state — `reload`:**

| State | Frame count | Frame rate | Loop | Notes |
|---|---|---|---|---|
| `idle` | 4 frames | 6 fps | yes | Subtle sway, light catch |
| `shoot` | 4 frames | 12 fps | no | Frame 0-1: muzzle flash. Frame 2-3: recoil return |
| `reload` | 6 frames | 8 fps | no | Mag drop -> insert -> rack |

**File naming (same directory, backward compatible):**
```
public/assets/sprites/guns/
  01_glock/
    idle_strip.png    (256x64)
    shoot_strip.png   (256x64)
    reload_strip.png  (384x64)  <- NEW
  02_uzi/
    idle_strip.png
    shoot_strip.png
    reload_strip.png
  03_shotgun/
    idle_strip.png
    shoot_strip.png
    reload_strip.png
  04_blaster/  (same)
  05_deagle/   (same)
  06_cannon/   (same)
```

Individual seed and raw frames kept for pipeline reference.

### 3.2 Arm Overlay Sprite

A separate "arm + hand holding gun" sprite that composites on top of the player body, positioned at the player's right-hand origin and rotated to the aim angle.

**Design:** Pixel-art arm matching the player character's skin tone and sleeve style (short-sleeve tee). The hand grips an invisible handle area — the gun sprite sits in front of the hand. Arm origin point: shoulder center (top-left corner of the 64x64 frame for positional math).

**Animation states:**
| State | Frame count | Frame rate | Loop | Notes |
|---|---|---|---|---|
| `hold_idle` | 2 frames | 4 fps | yes | Slight arm sway |
| `hold_shoot` | 4 frames | 12 fps | no | Arm recoil: extends forward on frame 0, snaps back by frame 3 |

**File naming:**
```
public/assets/sprites/guns/arm_overlay/
  hold_idle_strip.png    (128x64  — 2 frames)
  hold_shoot_strip.png   (256x64  — 4 frames)
```

### 3.3 Code Changes

**`src/game/scenes/BootScene.ts`** — additional loads:
```typescript
// Reload strips for all 6 guns
this.load.spritesheet('weapon_glock_reload',   '/assets/sprites/guns/01_glock/reload_strip.png',   { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_uzi_idle',       '/assets/sprites/guns/02_uzi/idle_strip.png',       { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_uzi_shoot',      '/assets/sprites/guns/02_uzi/shoot_strip.png',      { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_uzi_reload',     '/assets/sprites/guns/02_uzi/reload_strip.png',     { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_blaster_idle',   '/assets/sprites/guns/04_blaster/idle_strip.png',   { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_blaster_shoot',  '/assets/sprites/guns/04_blaster/shoot_strip.png',  { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_blaster_reload', '/assets/sprites/guns/04_blaster/reload_strip.png', { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_deagle_idle',    '/assets/sprites/guns/05_deagle/idle_strip.png',    { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_deagle_shoot',   '/assets/sprites/guns/05_deagle/shoot_strip.png',   { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_deagle_reload',  '/assets/sprites/guns/05_deagle/reload_strip.png',  { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_cannon_idle',    '/assets/sprites/guns/06_cannon/idle_strip.png',    { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_cannon_shoot',   '/assets/sprites/guns/06_cannon/shoot_strip.png',   { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('weapon_cannon_reload',  '/assets/sprites/guns/06_cannon/reload_strip.png',  { frameWidth: 64, frameHeight: 64 });
// Arm overlay
this.load.spritesheet('arm_hold_idle',  '/assets/sprites/guns/arm_overlay/hold_idle_strip.png',  { frameWidth: 64, frameHeight: 64 });
this.load.spritesheet('arm_hold_shoot', '/assets/sprites/guns/arm_overlay/hold_shoot_strip.png', { frameWidth: 64, frameHeight: 64 });
```

**`src/game/scenes/WorldScene.ts`**
- Extend `WEAPON_STATS` to include `reloadAnim` key per weapon.
- The existing `gunSprite` on `RemotePlayer` and the local gun sprite should have an `armSprite` sibling added.
- `armSprite` positioning logic in the gun update section:
```typescript
// Runs each frame in update() when gun is active
const aimAngle = this.localAimAngle;
armSprite.setPosition(playerX + Math.cos(aimAngle) * 8, playerY + Math.sin(aimAngle) * 8);
armSprite.setRotation(aimAngle);
armSprite.setDepth(playerDepth + 1);
// Gun sprite sits at end of arm
gunSprite.setPosition(
  playerX + Math.cos(aimAngle) * 22,
  playerY + Math.sin(aimAngle) * 22
);
gunSprite.setRotation(aimAngle);
```

- On weapon fire: trigger `armSprite.play('arm_hold_shoot')`. On animation complete, return to `arm_hold_idle`.
- Register arm animations in `create()`:
```typescript
this.anims.create({ key: 'arm_hold_idle',  frames: this.anims.generateFrameNumbers('arm_hold_idle',  { start: 0, end: 1 }), frameRate: 4,  repeat: -1 });
this.anims.create({ key: 'arm_hold_shoot', frames: this.anims.generateFrameNumbers('arm_hold_shoot', { start: 0, end: 3 }), frameRate: 12, repeat: 0  });
```

---

## AI Generation Pipeline

All sprites are generated using the **sprite-animator skill** (OpenAI GPT Image Edit API). This section documents the exact prompting and workflow per deliverable.

### General Rules Across All Deliverables
1. **Background**: Always use solid chroma-green `#00FF00` — the existing `createChromaKeyTexture()` function in `AvatarRenderer.ts` handles removal at runtime using tolerance-based pixel scan.
2. **Canvas size**: Match target frame size exactly (64x64, 96x96, or 128x128). Do not upscale.
3. **Pixel art constraint**: Include "pixel art, hard pixel edges, no anti-aliasing, limited color palette, 16-bit game sprite style" in every prompt.
4. **Consistency**: Generate a seed frame first. Use it as the inpaint source for remaining frames to maintain visual consistency.
5. **Horizontal strip assembly**: After generating individual frames, stitch left-to-right using any image processing tool (Sharp, ImageMagick, Canvas API). Save as `[state]_strip.png`.

### Phase 1 Pipeline: Player Character

**Seed prompt (idle frame 1):**
```
pixel art game sprite, 64x64 pixels, top-down view from slightly above,
streetwear character, baggy tee shirt, cargo pants, chunky sneakers,
medium skin tone, neutral standing pose, arms slightly out from body,
head at top of frame, visible from head to toe,
hard pixel edges, no anti-aliasing, dark outline,
solid bright green background #00FF00, Binding of Isaac perspective
```

**Walk cycle prompts (frames 2-6):**
Use seed frame as inpaint mask. Vary leg and arm positions. Prompt addition:
```
walking pose frame [N] of 6, leg stride [description], arm swing opposite leg
```

**Direction variants (walk_up, walk_side):**
- `walk_up`: Prompt addition: "walking away from camera, back visible, head smaller"
- `walk_side`: Prompt addition: "side profile walking right, left arm and leg visible in foreground"

**Shoot frame:**
```
same character, recoil pose, right arm extended forward holding invisible gun,
body tilted back slightly, feet planted
```

**Hurt frame:**
```
same character, hit reaction, body recoiling left, brief white flash overlay frame 1,
pain expression
```

**Death sequence:**
```
same character falling, frame [N] of 6: [standing -> stumbling -> kneeling -> collapsing -> prone -> final]
```

### Phase 2 Pipeline: Zombie Enemies

**Rusher seed prompt:**
```
pixel art game sprite, 64x64 pixels, top-down zombie, lean fast zombie,
torn tank top red shreds, hunched aggressive pose, clawed hands,
decayed greenish skin with red wounds, hard pixel edges,
bright green background #00FF00, Binding of Isaac style enemy
```

**Shooter seed prompt:**
```
pixel art game sprite, 64x64 pixels, top-down zombie, armed zombie,
holding improvised club/bone weapon, orange-toned clothing scraps,
slower upright posture, one arm raised holding weapon,
hard pixel edges, bright green background #00FF00
```

**Tank seed prompt (96x96):**
```
pixel art game sprite, 96x96 pixels, top-down zombie, massive bloated zombie,
enormous arms, shredded purple-toned shirt stretched over fat body,
slow heavy stance, tiny head compared to body,
hard pixel edges, bright green background #00FF00
```

**Boss seed prompt (128x128):**
```
pixel art game sprite, 128x128 pixels, top-down boss zombie,
imposing unique design, spiked shoulders made of bone,
crown-like head wound, one glowing golden eye,
golden accents #F5C842 on wounds, tattered regal clothing,
hard pixel edges, bright green background #00FF00, boss enemy feel
```

For each enemy: generate seed (idle frame 1) -> animate walk (shambling gait, stiff arms) -> animate attack (lunge/swipe) -> hurt/death.

### Phase 3 Pipeline: Guns and Arm Overlay

**Gun improvement prompts** follow the same pattern as existing ones. Add to existing prompts:
```
64x64 pixels, pixel art, gun facing right, slight downward tilt,
side view with subtle 3/4 perspective, bright green background #00FF00,
no hand holding the gun — gun only
```

**Reload animation additional frames:** Show magazine drop (frame 1), empty (2), new mag insert (3-4), rack slide (5-6).

**Muzzle flash** on shoot frames 0-1: add "bright yellow-orange muzzle flash at barrel tip, #F5C842 color".

**Arm overlay seed prompt:**
```
pixel art, 64x64 pixels, disembodied arm and hand,
medium skin tone, short sleeve cut at shoulder,
right arm extended horizontally to the right holding a pistol grip position,
wrist at right edge of frame, shoulder at left edge,
bright green background #00FF00, no gun visible — hand grip only
```

**Arm hold_shoot frames:** progressive recoil — arm pushed back left by 2-3 px in frames 1-2, returning in frames 3-4.

---

## File Structure

Complete directory tree of all new files:

```
public/assets/sprites/
├── character/
│   └── player/
│       ├── idle_strip.png
│       ├── idle_frame_01.png … idle_frame_04.png
│       ├── walk_down_strip.png
│       ├── walk_down_frame_01.png … walk_down_frame_06.png
│       ├── walk_up_strip.png
│       ├── walk_up_frame_01.png … walk_up_frame_06.png
│       ├── walk_side_strip.png
│       ├── walk_side_frame_01.png … walk_side_frame_06.png
│       ├── shoot_strip.png
│       ├── shoot_frame_01.png … shoot_frame_04.png
│       ├── hurt_strip.png
│       ├── hurt_frame_01.png … hurt_frame_03.png
│       ├── death_strip.png
│       └── death_frame_01.png … death_frame_06.png
│
├── enemies/
│   └── zombies/
│       ├── rusher/
│       │   ├── idle_strip.png
│       │   ├── walk_strip.png
│       │   ├── attack_strip.png
│       │   ├── hurt_strip.png
│       │   └── death_strip.png
│       ├── shooter/
│       │   └── (same 5 files)
│       ├── tank/
│       │   └── (same 5 files — 96px frames)
│       └── boss/
│           └── (same 5 files — 128px frames, more boss frames)
│
└── guns/
    ├── 01_glock/
    │   ├── idle_strip.png      (updated)
    │   ├── shoot_strip.png     (updated)
    │   └── reload_strip.png    (NEW)
    ├── 02_uzi/
    │   ├── idle_strip.png      (updated)
    │   ├── shoot_strip.png     (updated, was missing shoot)
    │   └── reload_strip.png    (NEW)
    ├── 03_shotgun/
    │   ├── idle_strip.png      (updated)
    │   ├── shoot_strip.png     (updated)
    │   └── reload_strip.png    (NEW)
    ├── 04_blaster/
    │   ├── idle_strip.png      (updated)
    │   ├── shoot_strip.png     (updated)
    │   └── reload_strip.png    (NEW)
    ├── 05_deagle/
    │   ├── idle_strip.png      (updated)
    │   ├── shoot_strip.png     (updated, was missing shoot)
    │   └── reload_strip.png    (NEW)
    ├── 06_cannon/
    │   ├── idle_strip.png      (updated)
    │   ├── shoot_strip.png     (updated, was missing shoot)
    │   └── reload_strip.png    (NEW)
    └── arm_overlay/            (NEW directory)
        ├── hold_idle_strip.png
        └── hold_shoot_strip.png

src/game/
├── systems/
│   ├── AvatarRenderer.ts       (modified — sprite path added)
│   └── EnemySprite.ts          (NEW)
└── scenes/
    ├── BootScene.ts            (modified — new spritesheet loads)
    └── WorldScene.ts           (modified — anim registration, enemy spawn, arm overlay)
```

---

## Phaser Integration Guide

### Loading a Spritesheet (BootScene.preload)
```typescript
this.load.spritesheet('texture_key', '/path/to/strip.png', {
  frameWidth: 64,   // or 96 / 128 for tank/boss
  frameHeight: 64,
});
```
All spritesheets use `NEAREST` filter. Set it after load completes:
```typescript
this.load.on('complete', () => {
  ['player_idle', 'player_walk_down', /* ... */].forEach(key => {
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  });
});
```

### Registering Animations (WorldScene.create or AnimationRegistry helper)
```typescript
// Check before creating to avoid duplicate registration across scene restarts
if (!this.anims.exists('player_idle')) {
  this.anims.create({
    key: 'player_idle',
    frames: this.anims.generateFrameNumbers('player_idle', { start: 0, end: 3 }),
    frameRate: 6,
    repeat: -1,
  });
}
```

### Playing Animations on a Sprite
```typescript
const sprite = this.add.sprite(x, y, 'player_idle');
sprite.play('player_idle');

// Transition to walk
sprite.play('player_walk_down');

// Play once and return to idle
sprite.play('player_shoot');
sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
  sprite.play('player_idle');
}, this);
```

### Flipping for Left-Facing
```typescript
// Right-facing (default): no flip
sprite.setFlipX(false);
// Left-facing: flip horizontally
sprite.setFlipX(true);
```

### Arm Overlay Rotation
```typescript
// Each update() tick:
const angle = Phaser.Math.Angle.Between(playerX, playerY, pointerX, pointerY);
armSprite.setRotation(angle);
armSprite.setPosition(
  playerX + Math.cos(angle) * ARM_OFFSET,
  playerY + Math.sin(angle) * ARM_OFFSET
);
gunSprite.setPosition(
  playerX + Math.cos(angle) * GUN_OFFSET,
  playerY + Math.sin(angle) * GUN_OFFSET
);
gunSprite.setRotation(angle);
// Flip arm/gun vertically when aiming leftward (angle > PI/2 or < -PI/2)
const facingLeft = Math.abs(angle) > Math.PI / 2;
armSprite.setFlipY(facingLeft);
gunSprite.setFlipY(facingLeft);
```

### EnemySprite State Machine
```typescript
import { EnemySprite } from '../systems/EnemySprite';

// Spawn
const enemySprite = new EnemySprite(scene, x, y, 'rusher');
enemySprite.setState('walk');

// On hit
enemySprite.setState('hurt');

// On death
enemySprite.setState('death'); // auto-destroys sprite after anim completes
```

---

## Success Criteria

### Phase 1 — Definition of Done
- [ ] All 7 player animation strips exist in `public/assets/sprites/character/player/` at correct pixel dimensions.
- [ ] Player sprite visible in-game replacing the procedural blobs — no `Arc`/`Rectangle` primitives render for the local player.
- [ ] All 7 animations play correctly: idle loops, walk variants switch on direction, shoot plays once on fire, hurt plays once on damage, death plays on death.
- [ ] `NEAREST` filter applied — no bilinear blurring visible.
- [ ] Procedural fallback still works if textures fail to load (backward compatible).
- [ ] No performance regression — game maintains 60fps with sprite-based player.
- [ ] `AvatarRenderer.ts` passes lint with no TypeScript errors.

### Phase 2 — Definition of Done
- [ ] All 4 zombie variants have all 5 animation strips at correct sizes.
- [ ] `EnemySprite.ts` system class created and typed.
- [ ] All enemy archetypes spawn with zombie sprites instead of colored circles.
- [ ] Hitbox/collision physics unchanged — only visual layer replaced.
- [ ] Zombie animations reflect enemy state: walk when chasing, attack on contact, hurt on bullet hit, death on HP zero.
- [ ] Tank (96px) and boss (128px) sprites scale correctly in the world — `setScale()` compensates if needed.
- [ ] No duplicate animation registration errors in console.

### Phase 3 — Definition of Done
- [ ] All 6 guns have updated `idle_strip`, `shoot_strip`, and new `reload_strip`.
- [ ] `arm_overlay/hold_idle_strip.png` and `hold_shoot_strip.png` exist.
- [ ] Arm sprite visually connects player body to gun — no floating gun.
- [ ] Arm rotates smoothly to pointer/aim angle.
- [ ] Arm and gun flip vertically when aiming left.
- [ ] `hold_shoot` arm animation triggers on fire event and returns to `hold_idle`.
- [ ] All 6 guns listed in `WEAPON_STATS` have `reloadAnim` key populated.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI-generated frames are visually inconsistent between states | High | Medium | Use seed frame as inpaint source for every subsequent frame of the same character. Re-run failing frames until consistent. Keep seed PNGs in `/assets/sprites/.seeds/` for re-generation. |
| Chroma key removal leaves green fringe pixels | Medium | Low | Increase tolerance parameter in `createChromaKeyTexture()` from 26 to 32. Add secondary pass for near-green pixels if needed. |
| Tank/boss sprite sizes misalign with hitbox radius | Medium | Medium | Hitbox stays on invisible `Arc` object. Visual sprite is independent. Use `setScale()` on sprite to match visual with physics body. Document the scale factors in `EnemySprite.ts`. |
| `anims.create()` called multiple times causes errors | High | Low | Gate all animation creation with `if (!this.anims.exists(key))` check. Consider centralizing into a single `AnimationRegistry.ts` helper called once. |
| `AvatarRenderer` refactor breaks multiplayer remote players | Medium | High | Remote players use the same `AvatarRenderer` class. The sprite path activates only when textures are loaded — same for all clients. Test with 2-client session after Phase 1 merge. |
| Reload animation has no game mechanic to trigger | Low | Low | Register the animation regardless. Trigger can be wired to a future ammo/reload mechanic. For now, it exists as an asset. |
| Missing shoot strips for uzi/deagle/cannon (not in current file tree) | Confirmed | Medium | These 3 guns only have `idle_strip` currently. Phase 3 must generate `shoot_strip` and `reload_strip` for all 3 before registering animations in `WEAPON_STATS`. |
| Performance: 30 simultaneous players each with sprite + arm + gun | Low | Medium | Profile before and after. Sprites are far cheaper than GPU fill from `Graphics` redraws. If needed, batch with `Phaser.GameObjects.Group` and texture atlas in a follow-up. |

---

## Appendix: Current State Inventory

Observed in codebase as of 2026-03-14:

**Guns with both idle + shoot strips:** glock (01), uzi (02), shotgun (03), blaster (04)
**Guns with idle strip only (shoot strip missing):** deagle (05), cannon (06)
**Guns loaded in BootScene:** only glock + shotgun (pistol + shotgun WeaponMode). uzi/blaster/deagle/cannon are assets-only, not yet wired to a WeaponMode.
**Weapon modes in WorldScene:** `'pistol' | 'shotgun'` only — expanding to all 6 is a future task, not in scope for this sprite PRD.
**Enemy archetypes defined:** `'rusher' | 'shooter' | 'tank' | 'boss'` — all 4 need zombie sprites.
**AvatarKind enum:** `'procedural' | 'gengar' | 'buho' | 'piplup' | 'chacha'` — add `'sprite'` in Phase 1.
**Existing chroma key system:** functional in `AvatarRenderer.ts` (`createChromaKeyTexture()` function), reuse as-is for all new sprites.
