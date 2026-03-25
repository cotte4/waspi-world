'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { CHAT } from '@/src/game/config/constants';
import { CATALOG, type CatalogItem } from '@/src/game/config/catalog';
import { loadAudioSettings } from '@/src/game/systems/AudioSettings';
import { applySinkIdToAudioContext, getStoredAudioOutputDeviceId } from '@/src/game/systems/audioOutputSink';
import { clearVirtualJoystickState } from '@/src/game/systems/ControlSettings';
import { getLevelFloorXp, getMaxProgressionLevel, loadProgressionState, type ProgressionState } from '@/src/game/systems/ProgressionSystem';
import { ONBOARDING_SLIDES } from '@/app/play/lib/playPageConstants';
import { usePlayPageActivities } from '@/app/play/hooks/usePlayPageActivities';
import { usePlayPageSceneEvents } from '@/app/play/hooks/usePlayPageSceneEvents';
import { usePlayPageAuth } from '@/app/play/hooks/usePlayPageAuth';
import { usePlayPageChat } from '@/app/play/hooks/usePlayPageChat';
import { usePlayPageMobileControls } from '@/app/play/hooks/usePlayPageMobileControls';
import { usePlayPagePlayerState } from '@/app/play/hooks/usePlayPagePlayerState';
import { usePlayPageShop } from '@/app/play/hooks/usePlayPageShop';
import { usePlayPageSafeReset } from '@/app/play/hooks/usePlayPageSafeReset';
import { usePlayPageSettings } from '@/app/play/hooks/usePlayPageSettings';
import { usePlayPageStats } from '@/app/play/hooks/usePlayPageStats';
import type {
  CombatStats,
} from '@/app/play/types';

const PhaserGame = dynamic(() => import('@/app/components/PhaserGame'), { ssr: false });
const JukeboxOverlay = dynamic(() => import('@/app/components/JukeboxOverlay'), { ssr: false });
const GameHUD = dynamic(() => import('@/app/components/GameHUD'), { ssr: false });
const CharacterCreatorOverlay = dynamic(() => import('@/app/components/CharacterCreatorOverlay'), { ssr: false });
const ShopOverlay = dynamic(() => import('@/app/components/ShopOverlay'), { ssr: false });
const InventoryOverlay = dynamic(() => import('@/app/components/InventoryOverlay'), { ssr: false });
const UINotice = dynamic(() => import('@/app/components/UINotice'), { ssr: false });
const PlayerActionsOverlay = dynamic(() => import('@/app/components/PlayerActionsOverlay'), { ssr: false });
const StatsOverlay = dynamic(() => import('@/app/components/StatsOverlay'), { ssr: false });
const SettingsOverlay = dynamic(() => import('@/app/components/SettingsOverlay'), { ssr: false });
const LoginCard = dynamic(() => import('@/app/components/LoginCard'), { ssr: false });
const LeaderboardOverlay = dynamic(() => import('@/app/components/LeaderboardOverlay'), { ssr: false });
const QuestTracker = dynamic(() => import('@/app/components/QuestTracker'), { ssr: false });
const VirtualJoystick = dynamic(() => import('@/app/components/VirtualJoystick'), { ssr: false });
const SkillTreeOverlay = dynamic(() => import('@/app/components/SkillTreeOverlay'), { ssr: false });
const CasinoOverlay = dynamic(() => import('@/app/components/CasinoOverlay'), { ssr: false });
const ZombiesHUD = dynamic(() => import('@/app/components/ZombiesHUD'), { ssr: false });
const BasketHUD = dynamic(() => import('@/app/components/BasketHUD'), { ssr: false });
const PenaltyHUD = dynamic(() => import('@/app/components/PenaltyHUD'), { ssr: false });
const DartsHUD = dynamic(() => import('@/app/components/DartsHUD'), { ssr: false });
const VecindadHUD = dynamic(() => import('@/app/components/VecindadHUD'), { ssr: false });
const BosqueHUD = dynamic(() => import('@/app/components/BosqueHUD'), { ssr: false });
const GunShopOverlay = dynamic(() => import('@/app/components/GunShopOverlay'), { ssr: false });
const FlappyHUD = dynamic(() => import('@/app/components/FlappyHUD'), { ssr: false });
const DinoHUD = dynamic(() => import('@/app/components/DinoHUD'), { ssr: false });
const GymHUD = dynamic(() => import('@/app/components/GymHUD'), { ssr: false });
const ArcadeHUD = dynamic(() => import('@/app/components/ArcadeHUD'), { ssr: false });
const PvpHUD = dynamic(() => import('@/app/components/PvpHUD'), { ssr: false });
const WorldHUD = dynamic(() => import('@/app/components/WorldHUD'), { ssr: false });

export default function PlayPage() {
  const initialProgression = useMemo(() => loadProgressionState(), []);
  const [, setConnected] = useState(false);
  const [, setCombatStats] = useState<CombatStats>({ kills: 0, deaths: 0 });
  const [progression, setProgression] = useState<ProgressionState>(initialProgression);
  const [, setTenksAnimating] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [smoking, setSmoking] = useState(false);
  const [activeScene, setActiveScene] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);
  const [uiNotice, setUiNotice] = useState<{ msg: string; color?: string } | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [skillTreeOpen, setSkillTreeOpen] = useState(false);
  const [zombiesHudActive, setZombiesHudActive] = useState(false);
  const [basketHudActive, setBasketHudActive] = useState(false);
  const [penaltyHudActive, setPenaltyHudActive] = useState(false);
  const [dartsHudActive, setDartsHudActive] = useState(false);
  const [bosqueHudActive, setBosqueHudActive] = useState(false);
  const [flappyHudActive, setFlappyHudActive] = useState(false);
  const [dinoHudActive, setDinoHudActive] = useState(false);
  const [pvpHudActive, setPvpHudActive] = useState(false);
  const [jukeboxOpen, setJukeboxOpen] = useState(false);
  const [rescueArmed, setRescueArmed] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tokenRef = useRef<string | null>(null);
  const activeSceneRef = useRef('');
  /** Escena Phaser anterior (para no re-abrir onboarding al volver del interior con ESC). */
  const previousPhaserSceneRef = useRef('');
  const mutedPlayersRef = useRef<string[]>([]);
  const rescueTimeoutRef = useRef<number | null>(null);

  const {
    activeWeapon,
    applyPlayerState,
    ballOn,
    equipped,
    gunOn,
    handleEquipOwnedItem,
    hydratePlayerState,
    owned,
    persistEditablePlayerPatch,
    playerState,
    refreshPlayerState,
    setActiveWeapon,
    setBallOn,
    setEquipped,
    setGunOn,
    setOwned,
    setTenks,
    syncPlayerState,
    tenks,
  } = usePlayPagePlayerState({
    tokenRef,
    mutedPlayersRef,
    activeScene,
  });

  const playUiSfx = useCallback((freq: number, duration: number, sweep?: number) => {
    try {
      if (!loadAudioSettings().sfxEnabled) return;
      let created = false;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        created = true;
      }
      const ctx = audioCtxRef.current;
      if (created) {
        const sid = getStoredAudioOutputDeviceId();
        if (sid) void applySinkIdToAudioContext(ctx, sid);
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (sweep !== undefined) osc.frequency.linearRampToValueAtTime(sweep, ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.01);
    } catch { /* silent fail */ }
  }, []);

  const {
    authBusy,
    authStatus,
    authMode,
    emailInput,
    isAuthenticated,
    passwordInput,
    rememberMe,
    resetPassword,
    sendMagicLink,
    setAuthMode,
    setEmailInput,
    setPasswordInput,
    setRememberMe,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
  } = usePlayPageAuth({
    hydratePlayerState,
  });

  const {
    buyShopItem,
    checkoutBusyId,
    checkoutRedirecting,
    closeShop,
    clothingItems,
    loadOrders,
    openShop,
    orders,
    ordersLoaded,
    ordersLoading,
    selectedSize,
    setSelectedSize,
    setCheckoutRedirecting,
    setShopOpen,
    setShopSource,
    setShopStatus,
    setShopTab,
    shopOpen,
    shopStatus,
    shopTab,
    startStripeCheckout,
  } = usePlayPageShop({
    tokenRef,
    applyPlayerState,
    refreshPlayerState,
    isAuthenticated,
    activeScene,
  });

  const {
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
    voiceStatus,
  } = usePlayPageSettings({
    audioCtxRef,
    jukeboxOpen,
    setUiNotice,
  });

  const {
    chatEnabled,
    chatVisible,
    handleInputBlur,
    handleInputFocus,
    handleInputKeyDown,
    handleMutePlayer,
    handleReportPlayer,
    input,
    inputRef,
    isChatScene,
    logRef,
    messages,
    playerActions,
    playerInfo,
    presencePlayers,
    setInput,
    setMessages,
    setPlayerActions,
    setPlayerInfo,
    setPresencePlayers,
  } = usePlayPageChat({
    activeScene,
    applyPlayerState,
    chatBinding: controlSettings.actionBindings.chat,
    inventoryBinding: controlSettings.actionBindings.inventory,
    jukeboxOpen,
    mutedPlayersRef,
    playUiSfx,
    playerState,
    persistEditablePlayerPatch,
    setShopStatus,
    syncPlayerState,
    tokenRef,
  });

  const {
    closeStats,
    openStats,
    statsData,
    statsLoading,
    statsOpen,
  } = usePlayPageStats({
    tokenRef,
  });

  const {
    isMobile,
    isPortrait,
    joystickVisible,
    showMobileHint,
  } = usePlayPageMobileControls({
    activeScene,
    showVirtualJoystick: controlSettings.showVirtualJoystick,
  });
  const activeActivities = usePlayPageActivities();

  usePlayPageSceneEvents({
    mutedPlayersRef,
    previousPhaserSceneRef,
    tokenRef,
    playerState,
    applyPlayerState,
    playUiSfx,
    syncPlayerState,
    setMessages,
    setPlayerInfo,
    setPresencePlayers,
    setConnected,
    setCombatStats,
    setProgression,
    setTenks,
    setTenksAnimating,
    setActiveScene,
    setShopOpen,
    setShopSource,
    setCheckoutRedirecting,
    setJukeboxOpen,
    setShowOnboarding,
    setInventoryOpen,
    setOwned,
    setEquipped,
    setGunOn,
    setBallOn,
    setActiveWeapon,
    setPlayerActions,
    setUiNotice,
    setShopStatus,
    setZombiesHudActive,
    setBasketHudActive,
    setPenaltyHudActive,
    setDartsHudActive,
    setBosqueHudActive,
    setFlappyHudActive,
    setDinoHudActive,
    setPvpHudActive,
  });

  useEffect(() => {
    if (!uiNotice) return;
    const timer = window.setTimeout(() => setUiNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [uiNotice]);

  useEffect(() => {
    activeSceneRef.current = activeScene;
  }, [activeScene]);

  useEffect(() => () => {
    clearVirtualJoystickState();
    if (rescueTimeoutRef.current) {
      window.clearTimeout(rescueTimeoutRef.current);
      rescueTimeoutRef.current = null;
    }
  }, []);

  const currentLevelFloorXp = getLevelFloorXp(progression.level);
  const nextLevelDelta = progression.nextLevelAt === null
    ? 0
    : Math.max(0, progression.nextLevelAt - progression.xp);
  const levelSpanXp = progression.nextLevelAt === null
    ? 1
    : Math.max(1, progression.nextLevelAt - currentLevelFloorXp);
  const progressPct = progression.nextLevelAt === null
    ? 1
    : Math.max(0, Math.min(1, (progression.xp - currentLevelFloorXp) / levelSpanXp));
  const comboCount = activeActivities.size;
  const comboMultiplier = comboCount >= 3 ? '2.0' : comboCount === 2 ? '1.5' : null;
  const { handleSafeReset } = usePlayPageSafeReset({
    activeSceneRef,
    closeSettings,
    rescueArmed,
    rescueTimeoutRef,
    setRescueArmed,
    setUiNotice,
  });

  const passiveUtilityItems = useMemo(
    () => owned
      .map((id) => CATALOG.find((i) => i.id === id))
      .filter((item): item is CatalogItem => Boolean(item))
      .filter((item) => item.slot === 'utility' && item.id !== 'UTIL-GUN-01' && item.id !== 'UTIL-BALL-01' && item.id !== 'UTIL-CIG-01'),
    [owned],
  );

  return (
    <>
      <style jsx global>{`
        @keyframes wwFadeUp {
          from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.98); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes wwModalIn {
          from { opacity: 0; transform: translate3d(0, 22px, 0) scale(0.94); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes wwToastIn {
          from { opacity: 0; transform: translate3d(-50%, -10px, 0); }
          to { opacity: 1; transform: translate3d(-50%, 0, 0); }
        }
        @keyframes wwPulseGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(57,255,20,0.1); opacity: 0.82; }
          50% { box-shadow: 0 0 14px rgba(57,255,20,0.45); opacity: 1; }
        }
        @keyframes wwChatIn {
          from { opacity: 0; transform: translate3d(-8px, 0, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        .ww-shell {
          animation: wwFadeUp 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .ww-frame {
          animation: wwFadeUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .ww-frame button,
        .ww-frame input {
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            border-color 160ms ease,
            background-color 160ms ease,
            opacity 160ms ease,
            color 160ms ease;
        }
        .ww-frame button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.24);
        }
        .ww-frame button:active:not(:disabled) {
          transform: translateY(0);
        }
        .ww-frame input:focus {
          transform: translateY(-1px);
          box-shadow: 0 0 0 1px rgba(245, 200, 66, 0.18), 0 14px 28px rgba(0, 0, 0, 0.18);
        }
        .ww-chip,
        .ww-panel,
        .ww-auth-card {
          backdrop-filter: blur(8px);
          animation: wwFadeUp 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .ww-panel {
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .ww-panel:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.22);
        }
        .ww-panel-delayed,
        .ww-auth-card {
          animation-delay: 70ms;
        }
        .ww-auth-card {
          transition: width 220ms ease, padding 220ms ease, transform 180ms ease, box-shadow 180ms ease;
        }
        .ww-status-dot {
          animation: wwPulseGlow 1.4s ease-in-out infinite;
        }
        .ww-overlay {
          animation: wwFadeUp 180ms ease-out both;
          backdrop-filter: blur(9px);
        }
        .ww-modal {
          animation: wwModalIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .ww-presence-row,
        .ww-chat-line {
          animation: wwChatIn 220ms ease-out both;
        }
        .ww-chat-shell {
          backdrop-filter: blur(7px);
        }
        .ww-notice {
          animation: wwToastIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .ww-shell,
          .ww-frame,
          .ww-chip,
          .ww-panel,
          .ww-auth-card,
          .ww-overlay,
          .ww-modal,
          .ww-presence-row,
          .ww-chat-line,
          .ww-notice,
          .ww-status-dot {
            animation: none !important;
          }
          .ww-frame button,
          .ww-frame input,
          .ww-panel,
          .ww-auth-card {
            transition: none !important;
          }
        }
        @keyframes wwComboIn {
          from { opacity: 0; transform: translate3d(-50%, 0, 0) scale(0.7); }
          to   { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1); }
        }
        @keyframes wwComboPulse {
          0%, 100% { box-shadow: 0 0 6px rgba(245,200,66,0.3); }
          50%       { box-shadow: 0 0 18px rgba(245,200,66,0.75); }
        }
        .ww-combo-badge {
          animation: wwComboIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both,
                     wwComboPulse 1.6s ease-in-out 280ms infinite;
        }
        /* Right toolbar */
        .ww-toolbar {
          display: flex;
          flex-direction: column;
          gap: 3px;
          background: rgba(0,0,0,0.72);
          border: 1px solid rgba(245,200,66,0.14);
          padding: 5px;
          backdrop-filter: blur(8px);
          animation: wwFadeUp 540ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .ww-toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 28px;
          cursor: pointer;
          border: 1px solid transparent;
          background: transparent;
          font-size: 13px;
          line-height: 1;
          color: rgba(255,255,255,0.45);
        }
        .ww-toolbar-btn img {
          width: 22px;
          height: 22px;
          object-fit: contain;
          display: block;
          pointer-events: none;
          opacity: 0.9;
        }
        .ww-toolbar-btn:hover:not(:disabled) img {
          opacity: 1;
        }
        .ww-toolbar-btn svg.ww-toolbar-icon {
          width: 22px;
          height: 22px;
          display: block;
          pointer-events: none;
          flex-shrink: 0;
          opacity: 0.92;
          filter: drop-shadow(0 0 4px rgba(245, 200, 66, 0.35));
        }
        .ww-toolbar-btn:hover:not(:disabled) svg.ww-toolbar-icon {
          opacity: 1;
          filter: drop-shadow(0 0 6px rgba(245, 200, 66, 0.5));
        }
        .ww-toolbar-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.07) !important;
          border-color: rgba(255,255,255,0.14) !important;
          color: rgba(255,255,255,0.9) !important;
          transform: translateY(0) !important;
        }
        .ww-toolbar-divider {
          height: 1px;
          background: rgba(255,255,255,0.07);
          margin: 1px 0;
        }
        /* Stripe redirect spinner */
        @keyframes wwSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes wwStripeSlide {
          from { opacity: 0; transform: translate3d(-50%, -16px, 0); }
          to   { opacity: 1; transform: translate3d(-50%, 0, 0); }
        }
        .ww-stripe-spinner {
          width: 28px;
          height: 28px;
          border: 2px solid rgba(245,200,66,0.18);
          border-top-color: #F5C842;
          border-radius: 50%;
          animation: wwSpin 0.7s linear infinite;
        }
        /* Shop status banner */
        @keyframes wwStatusIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ww-shop-status {
          animation: wwStatusIn 220ms ease-out both;
        }
        /* TENKS pack cards */
        .ww-pack-card {
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .ww-pack-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgba(0,0,0,0.32);
        }
        .ww-pack-card:hover .ww-pack-popular {
          border-color: rgba(245,200,66,0.9);
        }
        /* Tab bar */
        .ww-tab-bar {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 14px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .ww-tab-bar::-webkit-scrollbar { display: none; }
        /* Controls hint */
        .ww-ctrl-wrap {
          position: relative;
          display: inline-block;
        }
        .ww-ctrl-toggle {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: default;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.55);
          color: rgba(255,255,255,0.28);
          font-family: "Press Start 2P", monospace;
          font-size: 7px;
          backdrop-filter: blur(6px);
        }
        .ww-ctrl-panel {
          display: none;
          position: absolute;
          top: 0;
          right: 30px;
          white-space: nowrap;
          background: rgba(0,0,0,0.82);
          border: 1px solid rgba(255,255,255,0.09);
          padding: 6px 8px;
          font-family: "Press Start 2P", monospace;
          color: rgba(255,255,255,0.32);
          font-size: 7px;
          line-height: 1.9;
          backdrop-filter: blur(8px);
        }
        .ww-ctrl-wrap:hover .ww-ctrl-panel {
          display: block;
        }
      `}</style>
      {isMobile && isPortrait && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#0E0E14',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
            padding: 32,
          }}
        >
          <div style={{ fontSize: 56 }}>↻</div>
          <div style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '9px',
            color: '#F5C842',
            textAlign: 'center',
            lineHeight: 2,
          }}>
            GIRA TU CELULAR<br />
            <span style={{ color: '#46B3FF', fontSize: '7px' }}>el juego funciona en landscape</span>
          </div>
        </div>
      )}
      <div
      className="ww-shell w-screen h-screen overflow-hidden flex items-center justify-center"
      style={{
        backgroundColor: '#02030A',
        backgroundImage: 'radial-gradient(circle at top, rgba(245,200,66,0.12), transparent 55%)',
      }}
    >
      <div
        className="ww-frame relative"
        style={{
          width: isMobile ? '100%' : 800,
          height: isMobile ? '100%' : 600,
          borderRadius: isMobile ? 0 : 18,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
          border: '1px solid rgba(245,200,66,0.25)',
          background: 'radial-gradient(circle at top, #161623 0, #05050A 55%)',
        }}
      >
        <PhaserGame />

        <GameHUD />
        <WorldHUD />

        {activeScene === 'CreatorScene' && (
          <CharacterCreatorOverlay isMobile={isMobile} />
        )}

        {comboMultiplier !== null && (
          <div
            className="ww-combo-badge pointer-events-none"
            style={{
              position: 'absolute',
              bottom: 48,
              left: '50%',
              transform: 'translate3d(-50%, 0, 0)',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '10px',
              color: '#F5C842',
              background: 'rgba(14,14,20,0.88)',
              border: '1px solid rgba(245,200,66,0.55)',
              padding: '5px 12px',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}
          >
            COMBO x{comboMultiplier}
          </div>
        )}

        {hudSettings.showSocialPanel && (
          <div
            className="ww-panel ww-panel-delayed absolute top-12 left-2"
            style={{
              width: 172,
              background: 'rgba(5,5,10,0.84)',
              border: '1px solid rgba(255,255,255,0.07)',
              padding: '8px 9px',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}
          >
            {/* Social */}
            {hudSettings.showSocialPanel && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                  onClick={() => onHudChange({ socialCollapsed: !hudSettings.socialCollapsed })}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#39FF14',
                      boxShadow: '0 0 4px #39FF1499',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: '"Silkscreen", monospace',
                      fontSize: '10px',
                      color: 'rgba(57,255,20,0.7)',
                    }}>
                      {presencePlayers.length} online
                    </span>
                  </div>
                  <span style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: '6px',
                    color: 'rgba(255,255,255,0.25)',
                  }}>
                    {hudSettings.socialCollapsed ? '+' : '−'}
                  </span>
                </div>

                {!hudSettings.socialCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 10 }}>
                    {presencePlayers.slice(0, 5).map((player, index) => (
                      <div
                        className="ww-presence-row"
                        key={player.playerId}
                        style={{
                          fontFamily: '"Silkscreen", monospace',
                          fontSize: '11px',
                          color: player.playerId === playerInfo?.playerId ? '#F5C842' : 'rgba(255,255,255,0.6)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          animationDelay: `${index * 45}ms`,
                        }}
                      >
                        {player.playerId === playerInfo?.playerId ? '▶ ' : '· '}{player.username}
                      </div>
                    ))}
                    {presencePlayers.length === 0 && (
                      <div style={{
                        fontFamily: '"Silkscreen", monospace',
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.3)',
                      }}>
                        solo vos por ahora
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {hudSettings.showControlsPanel && !isMobile && (
          <div className="ww-ctrl-wrap absolute top-2 right-2 pointer-events-auto">
            <div className="ww-ctrl-toggle">[?]</div>
            <div className="ww-ctrl-panel">
              WASD / FLECHAS MOVER<br />
              {chatVisible ? 'ENTER CHATEAR' : 'ENTER CHAT OFF'}<br />
                    {isChatScene ? (chatEnabled ? 'T CHAT OFF' : 'T CHAT ON') : ''}<br />
              I INVENTARIO
            </div>
          </div>
        )}

        {/* Right toolbar */}
        <div className="ww-toolbar absolute right-2 top-12">
          {/* SHOP primary action */}
          <button
            onClick={() => { openShop('hud'); }}
            title="Tienda"
            style={{
              width: 34,
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '7px',
              padding: '7px 4px',
              background: '#F5C842',
              color: '#0E0E14',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              lineHeight: 1.4,
            }}
          >
            🛍️<br />SHOP
          </button>

          <div className="ww-toolbar-divider" />

          {/* Settings SVG: the PNG was RGB without alpha, so the board looked gray */}
          <button type="button" onClick={openSettings} className="ww-toolbar-btn" title="Ajustes" aria-label="Ajustes">
            <svg className="ww-toolbar-icon" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#F5C842"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M11.078 2.25c.63-1.121 2.193-1.121 2.824 0l.357.63c.155.274.425.458.722.519.155.031.31.064.465.097.295.063.564.255.718.525l.22.4c.609 1.109 2.047 1.109 2.656 0l.155-.282a.978.978 0 011.639-.97l.389.689c.615 1.078-.325 2.393-1.51 2.393H19.5v.883c0 .615-.299 1.191-.797 1.541l-3.647 2.484a.978.978 0 00-.354 1.343l.11.192a.98.98 0 01-.97 1.422l-3.308-.769a.98.98 0 01-.63-.363l-.219-.312a1.125 1.125 0 00-1.851.086l-.45.677A1.125 1.125 0 018.583 21h-1.167c-.603 0-1.15-.363-1.384-.92l-.45-.677a1.125 1.125 0 00-1.852-.086l-.219.313a.982.982 0 01-.63.363l-3.308.769a.98.98 0 01-.97-1.422l.11-.192a.978.978 0 00-.354-1.343L2.303 13.33A1.989 1.989 0 012 11.883V11h.5c1.185 0 2.125-1.315 1.51-2.393l.389-.689a.978.978 0 011.639-.97l.155.282c.609 1.109 2.047 1.109 2.656 0l.22-.4c.154-.27.423-.462.718-.525.155-.033.31-.066.465-.097.297-.061.567-.245.722-.519l.357-.63zM12 15a3 3 0 100-6 3 3 0 000 6z"
              />
            </svg>
          </button>

          {/* Stats */}
          <button onClick={() => void openStats()} className="ww-toolbar-btn" title="Estadísticas">📊</button>

          {/* Leaderboard */}
          <button onClick={() => setLeaderboardOpen(true)} className="ww-toolbar-btn" title="Leaderboard">🏆</button>

          {/* Skill Tree */}
          <button onClick={() => setSkillTreeOpen(true)} className="ww-toolbar-btn" title="Habilidades">⚡</button>

          <div className="ww-toolbar-divider" />

          {/* Rescue dormant strip, activates on arm */}
          <button
            onClick={handleSafeReset}
            title={rescueArmed ? 'Confirmar vuelta a plaza' : 'Volver a plaza'}
            style={{
              width: 34,
              height: rescueArmed ? 28 : 8,
              cursor: 'pointer',
              border: 'none',
              background: rescueArmed ? '#FF6A6A' : 'rgba(255,106,106,0.2)',
              color: rescueArmed ? '#0E0E14' : 'transparent',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '6px',
              overflow: 'hidden',
              transition: 'height 220ms ease, background 220ms ease, color 220ms ease, box-shadow 220ms ease',
              boxShadow: rescueArmed ? '0 0 16px rgba(255,106,106,0.45)' : 'none',
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
            }}
          >
            {rescueArmed ? '✓ PLAZA' : ''}
          </button>
        </div>

        {activeScene !== 'CreatorScene' && !isAuthenticated && (
          <LoginCard
            authMode={authMode}
            emailInput={emailInput}
            onEmailChange={setEmailInput}
            passwordInput={passwordInput}
            onPasswordChange={setPasswordInput}
            rememberMe={rememberMe}
            onRememberMeChange={setRememberMe}
            authBusy={authBusy}
            authStatus={authStatus}
            onPasswordSubmit={() => void (authMode === 'signup' ? signUpWithPassword() : signInWithPassword())}
            onModeChange={setAuthMode}
            onResetPassword={() => void resetPassword()}
            onMagicLink={() => void sendMagicLink()}
            onGoogle={() => void signInWithGoogle()}
          />
        )}

        {checkoutRedirecting && (
          <div className="ww-overlay absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.78)', zIndex: 70 }}>
            <div className="ww-stripe-spinner" style={{ marginBottom: 18 }} />
            <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#F5C842', letterSpacing: '0.06em', textAlign: 'center', lineHeight: 2 }}>
              CONECTANDO<br />CON STRIPE...
            </div>
          </div>
        )}

        {shopOpen && (
          <ShopOverlay
            isMobile={isMobile}
            shopTab={shopTab}
            onTabChange={setShopTab}
            onClose={closeShop}
            clothingItems={clothingItems}
            owned={owned}
            equipped={equipped}
            tenks={tenks}
            isAuthenticated={isAuthenticated}
            checkoutBusyId={checkoutBusyId}
            checkoutRedirecting={checkoutRedirecting}
            selectedSize={selectedSize}
            onSizeChange={setSelectedSize}
            shopStatus={shopStatus}
            orders={orders}
            ordersLoaded={ordersLoaded}
            ordersLoading={ordersLoading}
            onLoadOrders={() => void loadOrders()}
            onBuyVirtual={(item) => void buyShopItem(item)}
            onEquip={(itemId, active) => {
              handleEquipOwnedItem(itemId);
              setShopStatus(active ? 'Ya está puesto.' : 'Equipado.');
            }}
            onBuyPhysical={(item) => void startStripeCheckout('product', { itemId: item.id, size: selectedSize })}
            onBuyPack={(packId) => void startStripeCheckout('tenks_pack', { packId })}
          />
        )}


        <PlayerActionsOverlay
          player={playerActions}
          onMute={handleMutePlayer}
          onReport={handleReportPlayer}
          onClose={() => setPlayerActions(null)}
        />

        {inventoryOpen && (
          <InventoryOverlay
            isMobile={isMobile}
            owned={owned}
            equipped={equipped}
            smoking={smoking}
            onToggleSmoke={setSmoking}
            gunOn={gunOn}
            ballOn={ballOn}
            activeWeapon={activeWeapon}
            passiveUtilityItems={passiveUtilityItems}
            clothingCatalog={CATALOG}
            onEquip={handleEquipOwnedItem}
            onClose={() => setInventoryOpen(false)}
          />
        )}


        {chatVisible && (
          <div className="absolute bottom-0 left-0 right-0">
            <div
              ref={logRef}
              className="ww-chat-shell overflow-y-auto px-2 pt-1 pb-1"
              style={{
                maxHeight: isMobile ? '72px' : '100px',
                background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))',
              }}
            >
              {messages.map((m, index) => (
                <p
                  className="ww-chat-line"
                  key={m.id}
                  style={{
                    fontFamily: '"Silkscreen", "Courier New", monospace',
                    fontSize: '10px',
                    lineHeight: '1.5',
                    color: 'rgba(255,255,255,0.75)',
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                    animationDelay: `${Math.min(index, 6) * 25}ms`,
                  }}
                >
                  <span style={{ color: m.isMe ? '#F5C842' : '#88AAFF' }}>{m.username}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>: </span>
                  {m.message}
                </p>
              ))}
            </div>

            <div className="px-2 pb-2 pt-0.5">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                maxLength={CHAT.MAX_CHARS}
                placeholder="Presiona ENTER para chatear..."
                autoComplete="off"
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.75)',
                  border: '1px solid rgba(245,200,66,0.3)',
                  color: '#FFFFFF',
                  fontFamily: '"Silkscreen", "Courier New", monospace',
                  fontSize: isMobile ? '9px' : '10px',
                  padding: '7px 12px',
                  outline: 'none',
                  caretColor: '#F5C842',
                }}
                className="focus:border-[rgba(245,200,66,0.8)] transition-colors"
              />
            </div>
          </div>
        )}

        {settingsOpen && (
          <SettingsOverlay
            isMobile={isMobile}
            settingsTab={settingsTab}
            onTabChange={setSettingsTab}
            onClose={closeSettings}
            audioSettings={audioSettings}
            onAudioChange={onAudioChange}
            outputDevices={outputDevices}
            selectedOutputDeviceId={selectedOutputDeviceId}
            onOutputDeviceChange={setSelectedOutputDeviceId}
            hudSettings={hudSettings}
            onHudChange={onHudChange}
            controlSettings={controlSettings}
            onControlChange={onControlChange}
            bindingCaptureDirection={bindingCaptureDirection}
            onCaptureDirection={setBindingCaptureDirection}
            bindingCaptureAction={bindingCaptureAction}
            onCaptureAction={setBindingCaptureAction}
            voiceEnabled={voiceEnabled}
            voiceStatus={voiceStatus}
            onVoiceEnabledChange={onVoiceEnabledChange}
            micDevices={micDevices}
            selectedMicDeviceId={selectedMicDeviceId}
            onMicDeviceChange={setSelectedMicDeviceId}
          />
        )}

        {statsOpen && (
          <StatsOverlay
            isMobile={isMobile}
            statsLoading={statsLoading}
            statsData={statsData}
            isAuthenticated={isAuthenticated}
            onClose={closeStats}
          />
        )}

        <VirtualJoystick visible={joystickVisible} />

        {/* Leaderboard overlay */}
        {leaderboardOpen && (
          <LeaderboardOverlay
            isMobile={isMobile}
            currentPlayerId={undefined}
            onClose={() => setLeaderboardOpen(false)}
          />
        )}

        {/* Skill Tree overlay */}
        {skillTreeOpen && (
          <SkillTreeOverlay
            isMobile={isMobile}
            isAuthenticated={isAuthenticated}
            onClose={() => setSkillTreeOpen(false)}
          />
        )}

        {/* Casino overlay self-manages visibility via CASINO_OPEN/CLOSE events */}
        <CasinoOverlay isMobile={isMobile} />

        {/* Gun Shop overlay self-manages visibility via GUN_SHOP_OPEN/CLOSE events */}
        <GunShopOverlay isMobile={isMobile} />

        {/* Zombies HUD shown only when ZombiesScene is active */}
        {zombiesHudActive && <ZombiesHUD />}

        {/* Minigame HUDs shown only when their respective scene is active */}
        {basketHudActive && <BasketHUD />}
        {penaltyHudActive && <PenaltyHUD />}
        {dartsHudActive && <DartsHUD />}
        {flappyHudActive && <FlappyHUD />}
        {dinoHudActive && <DinoHUD />}

        {/* Vecindad HUD shown only when VecindadScene is active */}
        <VecindadHUD />

        {/* Bosque HUD shown only when BosqueMaterialesScene is active */}
        {bosqueHudActive && <BosqueHUD />}

        {/* Gym HUD self-manages visibility via GYM_SCENE_ACTIVE event */}
        <GymHUD />

        {/* Arcade HUD self-manages visibility via ARCADE_SCENE_ACTIVE event */}
        <ArcadeHUD />

        {/* PVP Arena HUD shown only when PvpArenaScene is active */}
        {pvpHudActive && <PvpHUD />}

        {/* Quest Tracker always mounted when in-game, self-manages visibility */}
        {activeScene !== 'CreatorScene' && (
          <QuestTracker isAuthenticated={isAuthenticated} isMobile={isMobile} />
        )}

        {showOnboarding && (
          <div
            className="ww-overlay absolute inset-0 flex flex-col items-center justify-center"
            style={{
              background: 'rgba(14,14,20,0.92)',
              zIndex: 9999,
              fontFamily: '"Press Start 2P", monospace',
            }}
          >
            <div style={{ textAlign: 'center', padding: '0 24px', maxWidth: 480 }}>
              <div style={{ fontSize: 48, marginBottom: 24 }}>
                {ONBOARDING_SLIDES[onboardingSlide].icon}
              </div>
              <div style={{ color: '#F5C842', fontSize: 10, marginBottom: 20, lineHeight: '20px' }}>
                {ONBOARDING_SLIDES[onboardingSlide].title}
              </div>
              <div style={{ color: '#ffffff', fontSize: 7, lineHeight: '16px', whiteSpace: 'pre-line' }}>
                {ONBOARDING_SLIDES[onboardingSlide].body}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, margin: '32px 0 24px' }}>
              {ONBOARDING_SLIDES.map((_, i) => (
                <div key={i} style={{
                  width: 8, height: 8,
                  borderRadius: '50%',
                  background: i === onboardingSlide ? '#F5C842' : '#444',
                }} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              {onboardingSlide < ONBOARDING_SLIDES.length - 1 ? (
                <button
                  onClick={() => setOnboardingSlide(s => s + 1)}
                  style={{
                    background: '#F5C842', color: '#0E0E14',
                    border: 'none', padding: '10px 24px',
                    fontFamily: '"Press Start 2P", monospace', fontSize: 8,
                    cursor: 'pointer',
                  }}
                >
                  SIGUIENTE →
                </button>
              ) : (
                <button
                  onClick={() => {
                    localStorage.setItem('waspi_onboarding_v1', 'done');
                    setShowOnboarding(false);
                  }}
                  style={{
                    background: '#F5C842', color: '#0E0E14',
                    border: 'none', padding: '10px 24px',
                    fontFamily: '"Press Start 2P", monospace', fontSize: 8,
                    cursor: 'pointer',
                  }}
                >
                  ¡ENTRAR AL MUNDO!
                </button>
              )}
              <button
                onClick={() => {
                  localStorage.setItem('waspi_onboarding_v1', 'done');
                  setShowOnboarding(false);
                }}
                style={{
                  background: 'transparent', color: '#666',
                  border: '1px solid #333', padding: '10px 16px',
                  fontFamily: '"Press Start 2P", monospace', fontSize: 7,
                  cursor: 'pointer',
                }}
              >
                SKIP
              </button>
            </div>
          </div>
        )}

        {showMobileHint && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(14,14,20,0.88)',
              border: '1px solid #46B3FF44',
              color: '#46B3FF',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 6,
              padding: '8px 16px',
              textAlign: 'center',
              zIndex: 8000,
              pointerEvents: 'none',
              lineHeight: '14px',
              whiteSpace: 'nowrap',
            }}
          >
            JOYSTICK = MOVER · A = INTERACTUAR
          </div>
        )}

        {jukeboxOpen && (
          <JukeboxOverlay
            onClose={() => { setJukeboxOpen(false); eventBus.emit(EVENTS.JUKEBOX_CLOSE); }}
            isMobile={isMobile}
          />
        )}

        <UINotice notice={uiNotice} isMobile={isMobile} />
      </div>
    </div>
    </>
  );
}

function hudCollapseButtonStyle() {
  return {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: '8px',
    color: '#BBBBBB',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  } as const;
}

