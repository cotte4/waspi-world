# Creator Screen — "THE DROP" Redesign

**Status:** 🟡 In Progress
**Created:** 2026-03-14
**Priority:** High
**Project:** WASPI WORLD

---

## Problem Statement

The current `CreatorScene` feels like a settings form — cramped, generic, and misaligned with the WASPI brand. It doesn't communicate the trap streetwear × pixel game identity. Players spend time here before entering the world, so it should feel like a hype moment, not a config screen.

## Current State

- 2-column layout (left preview + right panels) crammed into 800×600
- Character preview frame is only 152px tall — too small to show off the avatar
- Seed selector is 9 tiny 54×24px text buttons — no visual personality
- Color swatches are 20×20px — hard to distinguish
- ENTRAR button is a small 170×36px rectangle
- No animations, no hover states, no scene entry choreography
- Grid background lines too visible, distracting from content

## Proposed Solution

Full visual rebuild of `CreatorScene.ts` — **"THE DROP"** concept.
Like opening a Supreme box: the character reveal is the hero moment.
3-column layout, cinematic character stage, card-based seed picker, premium swatches.
All game logic preserved — visual layer only.

---

## Implementation Plan

- [ ] **Task 1 — Layout restructure**
  Rebuild to 3-column horizontal layout replacing current 2-column.
  - Col 1 (Character Stage): x=20, w=230
  - Col 2 (Character Picker): x=270, w=220
  - Col 3 (Customization): x=510, w=270
  - Update all `drawCard()` calls with new positions and sizes

- [ ] **Task 2 — Character preview upgrade**
  - Enlarge preview frame: 198×152 → **220×220px**
  - Replace full border with **L-shaped corner brackets** (4× gold 16px lines)
  - Add radial glow graphic behind avatar (gold `#F5C842` at 8% opacity)
  - Add scanline overlay on preview frame (every 3px horizontal line at 6% opacity)
  - Add floating bob tween: `y ±3px`, duration 2500ms, yoyo loop
  - Add `WASPI` watermark text behind character (4% opacity, large, −10° rotation)

- [ ] **Task 3 — Seed picker cards**
  - Replace 54×24px buttons → **62×52px portrait cards**
  - 3×3 grid with 8px gaps
  - Selected state: gold 2px border + `#1A140A` fill + alpha pulse tween
  - Add colored dot indicator per seed type (gold for trap, purple for gengar, etc.)
  - Add `◄ PERSONAJE ►` section label with keyboard hint

- [ ] **Task 4 — Color swatches upgrade**
  - Swatch size: 20×20 → **26×26px**
  - Gap: 26px → **30px**
  - Selected indicator: **white 2px ring** + scale factor 1.2× (tween)
  - Keep `pointerdown` handlers unchanged

- [ ] **Task 5 — Hair style buttons**
  - Size: 34×24 → **52×28px**
  - Selected: gold border + `#2f2410` fill (keep current logic)
  - Labels remain: SPI / FLA / MOH / X

- [ ] **Task 6 — PP/TT sliders redesign**
  - Replace 11-dot array with **continuous filled bar**
  - Bar: 160px wide, 4px tall, `#1A1A2E` bg, `#F5C842` fill up to value
  - Indicator: **14×14px circle** at value position, gold
  - Keep `minus`/`plus` buttons, keep `setValue` callbacks

- [ ] **Task 7 — ENTRAR hero CTA**
  - Size: 170×36 → **720×44px** (full width)
  - Text: `ENTRAR` → `ENTRAR AL MUNDO ►` at 14px
  - Hover: scanline sweep rect animation left→right (tween x from −720 to +720)
  - Press: scale tween 1.0 → 0.97 → 1.0

- [ ] **Task 8 — Background & global polish**
  - Grid line opacity: 0.4 → **0.03**
  - Add 3 large pixel-art diamond decorations at 4% opacity
  - Typography hierarchy:
    - Section headers: `Press Start 2P` 8px `#F5C842`
    - Labels: `Silkscreen` 9px `#5A6080`
    - Values/active: `Silkscreen` 9px `#FFFFFF`
    - CTA: `Press Start 2P` 14px `#111111`

- [ ] **Task 9 — Scene entry animation**
  Staggered fade-in on `create()` complete:
  - t=0ms: Left column fades in (alpha 0→1, duration 200ms)
  - t=100ms: Center column fades in
  - t=200ms: Right column fades in
  - t=300ms: CTA button fades in

- [ ] **Task 10 — Pulsing selected state**
  - Active seed card border: alpha pulse tween 0.6→1.0, 1200ms, yoyo loop
  - Active control label: color highlight `#F5C842` (existing `refreshControlHighlights()`)

---

## Technical Details

### File Modified
- `waspi-world/src/game/scenes/CreatorScene.ts`

### Preserved (no changes)
- `controlOrder`, `adjustActiveControl()`, `activateActiveControl()`
- `refreshSeedButtons()`, `refreshStyleButtons()`, `refreshSliders()`, `refreshPreview()`
- `AvatarRenderer` instantiation and destroy/recreate pattern
- `usernameInput` DOM element and `isUsernameFocused()`
- `commitAndEnter()` → `transitionToScene(this, 'WorldScene')`
- `keyUp/Down/Left/Right/Enter/Esc` bindings
- `cycleInList()`, `getSeedLabel()`

### New helpers to add
- `drawCornerBrackets(x, y, w, h, size, color)` — draws 4 L-shapes
- `drawScanlines(x, y, w, h, gap, alpha)` — horizontal line overlay
- `drawBar(x, y, w, value, max)` — filled progress bar for sliders
- `addPulseTween(target)` — reusable alpha pulse

### No new dependencies
Pure Phaser 3 Graphics + Tweens only.

---

## Testing Plan

- [ ] All 9 seed options selectable via mouse click
- [ ] All 9 seed options cycle correctly with keyboard left/right
- [ ] Color swatches update avatar preview immediately
- [ ] PP/TT sliders respond to click, +/- buttons, and keyboard
- [ ] ENTRAR saves config and transitions to WorldScene
- [ ] Username input accepts A-Z, 0-9, _ only (existing validation)
- [ ] Scene runs at 60fps — no perf regression from new tweens
- [ ] Looks correct at 800×600 viewport

---

## Success Criteria

- [ ] Character preview is the first thing your eye goes to
- [ ] Seed cards feel like character select (not a button grid)
- [ ] Scene entry feels like a reveal moment (staggered animation)
- [ ] ENTRAR button commands attention at the bottom
- [ ] Overall vibe: **hype drop page × pixel game** ✓

---

## Notes

- Design direction: "THE DROP" — Supreme x Pokémon x Binding of Isaac
- Approved by user on 2026-03-14 after frontend-design skill analysis
- Branch target: `characters` (current active branch)
- After implementation: push to `characters`, then PR to main
