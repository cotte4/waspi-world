'use client';

import React from 'react';

// ── types ─────────────────────────────────────────────────────────────────────

export interface LoginCardProps {
  emailInput: string;
  onEmailChange: (v: string) => void;
  authBusy: boolean;
  authStatus: string;
  onMagicLink: () => void;
  onGoogle: () => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buttonStyle(
  bg: string,
  color: string,
  disabled: boolean,
  bordered = false
): React.CSSProperties {
  return {
    width: '100%',
    padding: '7px 10px',
    fontFamily: '"Press Start 2P", monospace',
    fontSize: 7,
    color: disabled ? 'rgba(255,255,255,0.3)' : color,
    background: disabled ? 'rgba(255,255,255,0.04)' : bg,
    border: bordered
      ? `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'}`
      : `1px solid ${disabled ? 'rgba(245,200,66,0.1)' : 'rgba(245,200,66,0.6)'}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',
    letterSpacing: '0.04em',
    transition: 'background .14s, opacity .14s',
    opacity: disabled ? 0.6 : 1,
  };
}

// ── Google SVG icon ───────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 18 18"
      width={14}
      height={14}
      style={{ flexShrink: 0 }}
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LoginCard({
  emailInput,
  onEmailChange,
  authBusy,
  authStatus,
  onMagicLink,
  onGoogle,
}: LoginCardProps) {
  return (
    <div
      className="ww-auth-card absolute"
      style={{
        bottom: 8,
        right: 8,
        width: 228,
        background: 'rgba(0,0,0,0.82)',
        border: '1px solid rgba(245,200,66,0.2)',
        padding: '10px',
        borderRadius: 4,
        boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
        zIndex: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 7,
          color: '#F5C842',
          marginBottom: 2,
          letterSpacing: '0.06em',
        }}
      >
        WASPI ID
      </div>
      <div
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 9,
          color: 'rgba(255,255,255,0.35)',
          marginBottom: 10,
          letterSpacing: '0.04em',
        }}
      >
        Guarda progreso y avatar
      </div>

      {/* Email input + magic link */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          value={emailInput}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="email@waspi.world"
          autoComplete="email"
          style={{
            width: '100%',
            padding: '6px 8px',
            fontFamily: '"Silkscreen", monospace',
            fontSize: 10,
            color: '#FFFFFF',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(245,200,66,0.25)',
            outline: 'none',
            borderRadius: 2,
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(245,200,66,0.65)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(245,200,66,0.25)';
          }}
        />
        <button
          onClick={onMagicLink}
          disabled={authBusy}
          style={buttonStyle('#F5C842', '#0E0E14', authBusy)}
        >
          {authBusy ? 'ENVIANDO...' : 'MAGIC LINK ✉'}
        </button>
      </div>

      {/* Divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '8px 0',
        }}
      >
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        <span
          style={{
            fontFamily: '"Silkscreen", monospace',
            fontSize: 9,
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          O
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
      </div>

      {/* Google button */}
      <button
        onClick={onGoogle}
        disabled={authBusy}
        style={{
          ...buttonStyle('rgba(255,255,255,0.06)', '#FFFFFF', authBusy, true),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <GoogleIcon />
        ENTRAR CON GOOGLE
      </button>

      {/* Status message */}
      <div
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 10,
          color: authStatus ? '#BBBBBB' : 'rgba(255,255,255,0.3)',
          marginTop: 8,
          minHeight: 14,
          letterSpacing: '0.03em',
          lineHeight: 1.4,
        }}
      >
        {authStatus || 'Guarda TENKS, inventario y avatar.'}
      </div>
    </div>
  );
}
