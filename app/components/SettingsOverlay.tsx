'use client';

import React from 'react';
import type { AudioSettings } from '@/src/game/systems/AudioSettings';
import type { HudSettings } from '@/src/game/systems/HudSettings';
import type {
  ActionBinding,
  ControlSettings,
  MovementDirection,
  MovementScheme,
} from '@/src/game/systems/ControlSettings';
import { formatMovementBindingLabel } from '@/src/game/systems/ControlSettings';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { supportsAudioOutputDevicePicker } from '@/src/game/systems/audioOutputSink';
import type { VoiceStatusPayload } from '@/src/game/systems/voiceShared';

// ── types ─────────────────────────────────────────────────────────────────────

export type SettingsTab = 'audio' | 'hud' | 'controls' | 'voice';

export interface SettingsOverlayProps {
  isMobile: boolean;
  settingsTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  // Audio
  audioSettings: AudioSettings;
  onAudioChange: (patch: Partial<AudioSettings>) => void;
  outputDevices: MediaDeviceInfo[];
  selectedOutputDeviceId: string;
  onOutputDeviceChange: (deviceId: string) => void;
  // HUD
  hudSettings: HudSettings;
  onHudChange: (patch: Partial<HudSettings>) => void;
  // Controls
  controlSettings: ControlSettings;
  onControlChange: (patch: Partial<ControlSettings>) => void;
  bindingCaptureDirection: MovementDirection | null;
  onCaptureDirection: (dir: MovementDirection | null) => void;
  bindingCaptureAction: ActionBinding | null;
  onCaptureAction: (action: ActionBinding | null) => void;
  // Voice
  voiceEnabled: boolean;
  voiceStatus: VoiceStatusPayload;
  onVoiceEnabledChange: (enabled: boolean) => void;
  micDevices: MediaDeviceInfo[];
  selectedMicDeviceId: string;
  onMicDeviceChange: (deviceId: string) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const DIRECTION_LABEL: Record<MovementDirection, string> = {
  up: '↑ ARRIBA',
  down: '↓ ABAJO',
  left: '← IZQ',
  right: '→ DER',
};

const ACTION_LABEL: Record<ActionBinding, string> = {
  interact: 'INTERACTUAR',
  shoot: 'DISPARAR',
  inventory: 'INVENTARIO',
  chat: 'CHAT',
  back: 'VOLVER',
};

const MOVEMENT_SCHEMES: Array<[MovementScheme, string]> = [
  ['both', 'WASD + FLECHAS'],
  ['wasd', 'SOLO WASD'],
  ['arrows', 'SOLO FLECHAS'],
  ['ijkl', 'IJKL'],
  ['custom', 'CUSTOM'],
];

// ── sub-components ────────────────────────────────────────────────────────────

function SettingsTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 4px',
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 7,
        color: active ? '#39FF14' : 'rgba(160,160,160,0.55)',
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? '#39FF14' : 'transparent'}`,
        cursor: 'pointer',
        outline: 'none',
        letterSpacing: '0.04em',
        transition: 'color .14s, border-color .14s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <span
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 11,
          color: '#FFFFFF',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <button
        onClick={onToggle}
        style={{
          padding: '4px 12px',
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 7,
          color: value ? '#0E0E14' : 'rgba(255,255,255,0.4)',
          background: value ? '#39FF14' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${value ? '#39FF14' : 'rgba(255,255,255,0.12)'}`,
          cursor: 'pointer',
          outline: 'none',
          transition: 'background .14s, color .14s',
          minWidth: 48,
        }}
      >
        {value ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 7,
        color: '#F5C842',
        marginTop: 14,
        marginBottom: 6,
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </div>
  );
}

function OptionButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 8px',
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 6,
        color: selected ? '#0E0E14' : 'rgba(255,255,255,0.55)',
        background: selected ? '#F5C842' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${selected ? '#F5C842' : 'rgba(255,255,255,0.1)'}`,
        cursor: 'pointer',
        outline: 'none',
        transition: 'background .12s, color .12s',
        textAlign: 'center',
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </button>
  );
}

function CaptureButton({
  label,
  capturing,
  onClick,
}: {
  label: string;
  capturing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 8px',
        width: '100%',
        fontFamily: '"Silkscreen", monospace',
        fontSize: 10,
        color: capturing ? '#39FF14' : '#FFFFFF',
        background: capturing ? 'rgba(57,255,20,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${capturing ? '#39FF14' : 'rgba(255,255,255,0.1)'}`,
        cursor: 'pointer',
        outline: 'none',
        transition: 'background .12s, color .12s',
        textAlign: 'left',
        letterSpacing: '0.04em',
      }}
    >
      <span>{label}</span>
      {capturing && (
        <span
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 6,
            color: '#39FF14',
          }}
        >
          PRESIONA...
        </span>
      )}
    </button>
  );
}

// ── tab content ───────────────────────────────────────────────────────────────

function AudioTab({
  audioSettings,
  onAudioChange,
  outputDevices,
  selectedOutputDeviceId,
  onOutputDeviceChange,
}: Pick<
  SettingsOverlayProps,
  | 'audioSettings'
  | 'onAudioChange'
  | 'outputDevices'
  | 'selectedOutputDeviceId'
  | 'onOutputDeviceChange'
>) {
  const supportsPicker = supportsAudioOutputDevicePicker();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <ToggleRow
        label="MÚSICA DE ESCENA"
        value={audioSettings.musicEnabled}
        onToggle={() => onAudioChange({ musicEnabled: !audioSettings.musicEnabled })}
      />
      <ToggleRow
        label="EFECTOS (SFX)"
        value={audioSettings.sfxEnabled}
        onToggle={() => onAudioChange({ sfxEnabled: !audioSettings.sfxEnabled })}
      />

      <SectionLabel>SALIDA DE AUDIO</SectionLabel>

      {supportsPicker ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <OptionButton
            label="Predeterminado del sistema"
            selected={selectedOutputDeviceId === ''}
            onClick={() => onOutputDeviceChange('')}
          />
          {outputDevices.map((device, i) => (
            <OptionButton
              key={device.deviceId}
              label={device.label || `Salida ${i + 1}`}
              selected={selectedOutputDeviceId === device.deviceId}
              onClick={() => onOutputDeviceChange(device.deviceId)}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            fontFamily: '"Silkscreen", monospace',
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            lineHeight: 1.6,
            padding: '8px 0',
          }}
        >
          Para cambiar la salida de audio, usa el mezclador del sistema operativo.
        </div>
      )}
    </div>
  );
}

function HudTab({
  hudSettings,
  onHudChange,
}: Pick<SettingsOverlayProps, 'hudSettings' | 'onHudChange'>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <ToggleRow
        label="SOCIAL"
        value={hudSettings.showSocialPanel}
        onToggle={() => onHudChange({ showSocialPanel: !hudSettings.showSocialPanel })}
      />
      <ToggleRow
        label="PROGRESO"
        value={hudSettings.showProgressPanel}
        onToggle={() => onHudChange({ showProgressPanel: !hudSettings.showProgressPanel })}
      />
      <ToggleRow
        label="AYUDA DE CONTROLES"
        value={hudSettings.showControlsPanel}
        onToggle={() => onHudChange({ showControlsPanel: !hudSettings.showControlsPanel })}
      />
      <ToggleRow
        label="ARENA"
        value={hudSettings.showArenaHud}
        onToggle={() => onHudChange({ showArenaHud: !hudSettings.showArenaHud })}
      />
    </div>
  );
}

function ControlsTab({
  controlSettings,
  onControlChange,
  bindingCaptureDirection,
  onCaptureDirection,
  bindingCaptureAction,
  onCaptureAction,
}: Pick<
  SettingsOverlayProps,
  | 'controlSettings'
  | 'onControlChange'
  | 'bindingCaptureDirection'
  | 'onCaptureDirection'
  | 'bindingCaptureAction'
  | 'onCaptureAction'
>) {
  const directions: MovementDirection[] = ['up', 'left', 'down', 'right'];
  const actions: ActionBinding[] = ['interact', 'shoot', 'inventory', 'chat', 'back'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionLabel>MOVIMIENTO</SectionLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
        }}
      >
        {MOVEMENT_SCHEMES.map(([scheme, label]) => (
          <OptionButton
            key={scheme}
            label={label}
            selected={controlSettings.movementScheme === scheme}
            onClick={() => onControlChange({ movementScheme: scheme })}
          />
        ))}
      </div>

      <SectionLabel>REMAPEO</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {directions.map((dir) => {
          const isCapturing = bindingCaptureDirection === dir;
          const binding = controlSettings.movementBindings[dir];
          const label = isCapturing
            ? `${DIRECTION_LABEL[dir]}: ...`
            : `${DIRECTION_LABEL[dir]}: ${formatMovementBindingLabel(binding)}`;
          return (
            <CaptureButton
              key={dir}
              label={label}
              capturing={isCapturing}
              onClick={() => onCaptureDirection(isCapturing ? null : dir)}
            />
          );
        })}
      </div>

      <SectionLabel>ACCIONES</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {actions.map((action) => {
          const isCapturing = bindingCaptureAction === action;
          const binding = controlSettings.actionBindings[action];
          const label = isCapturing
            ? `${ACTION_LABEL[action]}: ...`
            : `${ACTION_LABEL[action]}: ${formatMovementBindingLabel(binding)}`;
          return (
            <CaptureButton
              key={action}
              label={label}
              capturing={isCapturing}
              onClick={() => onCaptureAction(isCapturing ? null : action)}
            />
          );
        })}
      </div>

      <div style={{ marginTop: 10 }}>
        <ToggleRow
          label="JOYSTICK VIRTUAL"
          value={controlSettings.showVirtualJoystick}
          onToggle={() =>
            onControlChange({ showVirtualJoystick: !controlSettings.showVirtualJoystick })
          }
        />
      </div>
    </div>
  );
}

function VoiceTab({
  voiceEnabled,
  onVoiceEnabledChange,
  micDevices,
  selectedMicDeviceId,
  onMicDeviceChange,
}: Pick<SettingsOverlayProps, 'voiceEnabled' | 'onVoiceEnabledChange' | 'micDevices' | 'selectedMicDeviceId' | 'onMicDeviceChange'>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ToggleRow
        label="ACTIVAR VOZ"
        value={voiceEnabled}
        onToggle={() => onVoiceEnabledChange(!voiceEnabled)}
      />

      <SectionLabel>MICRÓFONO</SectionLabel>

      {micDevices.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {micDevices.map((device, i) => (
            <OptionButton
              key={device.deviceId}
              label={device.label || `Micrófono ${i + 1}`}
              selected={selectedMicDeviceId === device.deviceId}
              onClick={() => {
                onMicDeviceChange(device.deviceId);
                eventBus.emit(EVENTS.VOICE_MIC_CHANGED, device.deviceId);
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            fontFamily: '"Silkscreen", monospace',
            fontSize: 10,
            color: 'rgba(255,255,255,0.35)',
            padding: '8px 0',
          }}
        >
          No hay micrófonos listados.
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => eventBus.emit(EVENTS.VOICE_DISABLE)}
          style={{
            width: '100%',
            padding: '8px',
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 7,
            color: '#FF006E',
            background: 'rgba(255,0,110,0.08)',
            border: '1px solid rgba(255,0,110,0.3)',
            cursor: 'pointer',
            outline: 'none',
            letterSpacing: '0.04em',
            transition: 'background .12s',
          }}
        >
          DESACTIVAR VOZ
        </button>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function SettingsOverlay({
  isMobile,
  settingsTab,
  onTabChange,
  onClose,
  audioSettings,
  onAudioChange,
  outputDevices,
  selectedOutputDeviceId,
  onOutputDeviceChange,
  hudSettings,
  onHudChange,
  controlSettings,
  onControlChange,
  bindingCaptureDirection,
  onCaptureDirection,
  bindingCaptureAction,
  onCaptureAction,
  voiceEnabled,
  voiceStatus,
  onVoiceEnabledChange,
  micDevices,
  selectedMicDeviceId,
  onMicDeviceChange,
}: SettingsOverlayProps) {
  const panelWidth = isMobile ? '94%' : 640;
  const maxHeight = isMobile ? '88dvh' : '80vh';

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        zIndex: 40,
      }}
    >
      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: panelWidth,
          maxHeight,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(14,14,20,0.97)',
          border: '1px solid #39FF14',
          boxShadow: '0 0 24px rgba(57,255,20,0.12), 0 8px 32px rgba(0,0,0,0.6)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Corner decorations */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 10,
            height: 10,
            borderTop: '2px solid #39FF14',
            borderLeft: '2px solid #39FF14',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 10,
            height: 10,
            borderTop: '2px solid #39FF14',
            borderRight: '2px solid #39FF14',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 10,
            height: 10,
            borderBottom: '2px solid #39FF14',
            borderLeft: '2px solid #39FF14',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 10,
            height: 10,
            borderBottom: '2px solid #39FF14',
            borderRight: '2px solid #39FF14',
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px 8px',
            borderBottom: '1px solid rgba(57,255,20,0.15)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 9,
              color: '#39FF14',
              letterSpacing: '0.08em',
            }}
          >
            AJUSTES
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              cursor: 'pointer',
              outline: 'none',
              padding: '2px 4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            flexShrink: 0,
            padding: '0 8px',
          }}
        >
          <SettingsTab
            label="AUDIO"
            active={settingsTab === 'audio'}
            onClick={() => onTabChange('audio')}
          />
          <SettingsTab
            label="HUD"
            active={settingsTab === 'hud'}
            onClick={() => onTabChange('hud')}
          />
          <SettingsTab
            label="CTRLS"
            active={settingsTab === 'controls'}
            onClick={() => onTabChange('controls')}
          />
          <SettingsTab
            label="VOZ"
            active={settingsTab === 'voice'}
            onClick={() => onTabChange('voice')}
          />
        </div>

        {/* Tab content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px 16px',
          }}
        >
          {settingsTab === 'audio' && (
            <AudioTab
              audioSettings={audioSettings}
              onAudioChange={onAudioChange}
              outputDevices={outputDevices}
              selectedOutputDeviceId={selectedOutputDeviceId}
              onOutputDeviceChange={onOutputDeviceChange}
            />
          )}
          {settingsTab === 'hud' && (
            <HudTab hudSettings={hudSettings} onHudChange={onHudChange} />
          )}
          {settingsTab === 'controls' && (
            <ControlsTab
              controlSettings={controlSettings}
              onControlChange={onControlChange}
              bindingCaptureDirection={bindingCaptureDirection}
              onCaptureDirection={onCaptureDirection}
              bindingCaptureAction={bindingCaptureAction}
              onCaptureAction={onCaptureAction}
            />
          )}
          {settingsTab === 'voice' && (
            <>
              <div
                style={{
                  marginBottom: 10,
                  padding: '8px 10px',
                  border: '1px solid rgba(70,179,255,0.18)',
                  background: 'rgba(70,179,255,0.06)',
                  fontFamily: '"Silkscreen", monospace',
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.82)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ color: '#46B3FF', marginBottom: 4 }}>ESTADO {voiceStatus.label}</div>
                <div>{voiceStatus.detail || 'Voz desactivada.'}</div>
              </div>
              <VoiceTab
                voiceEnabled={voiceEnabled}
                onVoiceEnabledChange={onVoiceEnabledChange}
                micDevices={micDevices}
                selectedMicDeviceId={selectedMicDeviceId}
                onMicDeviceChange={onMicDeviceChange}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
