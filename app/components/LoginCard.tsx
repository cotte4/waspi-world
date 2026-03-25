'use client';

import React, { useEffect } from 'react';

export interface LoginCardProps {
  authMode: 'login' | 'signup';
  emailInput: string;
  onEmailChange: (v: string) => void;
  passwordInput: string;
  onPasswordChange: (v: string) => void;
  rememberMe: boolean;
  onRememberMeChange: (v: boolean) => void;
  authBusy: boolean;
  authStatus: string;
  onPasswordSubmit: () => void;
  onModeChange: (mode: 'login' | 'signup') => void;
  onResetPassword: () => void;
  onMagicLink: () => void;
  onGoogle: () => void;
  onDismiss?: () => void;
}

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

function inputStyle(borderColor: string): React.CSSProperties {
  return {
    width: '100%',
    padding: '6px 8px',
    fontFamily: '"Silkscreen", monospace',
    fontSize: 10,
    color: '#FFFFFF',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${borderColor}`,
    outline: 'none',
    borderRadius: 2,
    boxSizing: 'border-box',
  };
}

export default function LoginCard({
  authMode,
  emailInput,
  onEmailChange,
  passwordInput,
  onPasswordChange,
  rememberMe,
  onRememberMeChange,
  authBusy,
  authStatus,
  onPasswordSubmit,
  onModeChange,
  onResetPassword,
  onMagicLink,
  onGoogle,
  onDismiss,
}: LoginCardProps) {
  useEffect(() => {
    if (!onDismiss) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <div
      className="ww-auth-card absolute"
      style={{
        bottom: 8,
        right: 8,
        width: 272,
        background: 'rgba(0,0,0,0.82)',
        border: '1px solid rgba(245,200,66,0.2)',
        padding: '10px',
        borderRadius: 4,
        boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
        zIndex: 12,
      }}
    >
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
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              cursor: 'pointer',
              padding: '2px 4px',
              lineHeight: 1,
            }}
            title="Cerrar (ESC)"
          >
            ×
          </button>
        )}
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
        Guarda progreso, TENKS y nivel
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => onModeChange('login')}
          disabled={authBusy}
          style={buttonStyle(
            authMode === 'login' ? '#F5C842' : 'rgba(255,255,255,0.06)',
            authMode === 'login' ? '#0E0E14' : '#FFFFFF',
            authBusy,
            authMode !== 'login'
          )}
        >
          LOGIN
        </button>
        <button
          onClick={() => onModeChange('signup')}
          disabled={authBusy}
          style={buttonStyle(
            authMode === 'signup' ? '#46B3FF' : 'rgba(255,255,255,0.06)',
            '#FFFFFF',
            authBusy,
            authMode !== 'signup'
          )}
        >
          SIGN UP
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          value={emailInput}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="email@waspi.world"
          autoComplete="email"
          style={inputStyle('rgba(245,200,66,0.25)')}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(245,200,66,0.65)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(245,200,66,0.25)';
          }}
        />
        <input
          value={passwordInput}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder={authMode === 'signup' ? 'min 6 caracteres' : 'tu password'}
          autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
          type="password"
          style={inputStyle('rgba(70,179,255,0.25)')}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(70,179,255,0.65)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(70,179,255,0.25)';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onPasswordSubmit();
          }}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: '"Silkscreen", monospace',
            fontSize: 10,
            color: 'rgba(255,255,255,0.72)',
          }}
        >
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => onRememberMeChange(e.target.checked)}
            disabled={authBusy}
          />
          Recordarme en este dispositivo
        </label>
        <button
          onClick={onPasswordSubmit}
          disabled={authBusy}
          style={buttonStyle(
            authMode === 'signup' ? '#46B3FF' : '#F5C842',
            authMode === 'signup' ? '#FFFFFF' : '#0E0E14',
            authBusy
          )}
        >
          {authBusy ? 'PROCESANDO...' : authMode === 'signup' ? 'CREAR CUENTA' : 'ENTRAR CON PASSWORD'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
        <button
          onClick={onResetPassword}
          disabled={authBusy}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: '"Silkscreen", monospace',
            fontSize: 9,
            cursor: authBusy ? 'not-allowed' : 'pointer',
          }}
        >
          Olvide mi password
        </button>
        <button
          onClick={onMagicLink}
          disabled={authBusy}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: '#F5C842',
            fontFamily: '"Silkscreen", monospace',
            fontSize: 9,
            cursor: authBusy ? 'not-allowed' : 'pointer',
          }}
        >
          Usar magic link
        </button>
      </div>

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
        {authStatus || 'Tu cuenta ahora puede usar password, Google o magic link.'}
      </div>
    </div>
  );
}
