import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseRememberPreference, setSupabaseRememberPreference, supabase } from '@/src/lib/supabase';
import { getInitialMagicLinkCooldownUntil } from '@/app/play/lib/playPageStorage';
import { MAGIC_LINK_COOLDOWN_KEY, MAGIC_LINK_COOLDOWN_MS } from '@/app/play/lib/playPageConstants';

type UsePlayPageAuthOptions = {
  hydratePlayerState: (session: Session | null) => Promise<void>;
};

export function usePlayPageAuth({
  hydratePlayerState,
}: UsePlayPageAuthOptions) {
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [rememberMe, setRememberMe] = useState(getSupabaseRememberPreference);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [magicLinkCooldownUntil, setMagicLinkCooldownUntil] = useState(getInitialMagicLinkCooldownUntil);

  const isAuthenticated = useMemo(() => Boolean(authEmail), [authEmail]);
  const resolveRedirectTo = useCallback(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin.replace(/\/+$/, '')}/play`;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
    return appUrl ? `${appUrl}/play` : undefined;
  }, []);

  useEffect(() => {
    if (!magicLinkCooldownUntil || magicLinkCooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= magicLinkCooldownUntil) {
        setMagicLinkCooldownUntil(0);
        window.localStorage.removeItem(MAGIC_LINK_COOLDOWN_KEY);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [magicLinkCooldownUntil]);

  useEffect(() => {
    setSupabaseRememberPreference(rememberMe);
  }, [rememberMe]);

  const hydrateSession = useCallback(async (session: Session | null) => {
    setAuthEmail(session?.user?.email ?? null);
    await hydratePlayerState(session);
  }, [hydratePlayerState]);

  useEffect(() => {
    if (!supabase) return;
    const supabaseClient = supabase;

    let active = true;
    const bootstrap = async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!active) return;
      await hydrateSession(data.session ?? null);
    };
    bootstrap();

    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
      void hydrateSession(session);
      setAuthBusy(false);
      if (event === 'SIGNED_IN') {
        setPasswordInput('');
        setAuthStatus('Sesion iniciada.');
      } else if (event === 'INITIAL_SESSION' && session?.user?.email) {
        setAuthStatus('Sesion recuperada.');
      } else if (event === 'SIGNED_OUT') {
        setAuthStatus('Sesion cerrada.');
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [hydrateSession]);

  const sendMagicLink = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setAuthStatus('Escribi tu email primero.');
      return;
    }

    const remainingMs = magicLinkCooldownUntil - Date.now();
    if (remainingMs > 0) {
      setAuthStatus(`Ya te mandamos un link. Espera ${Math.ceil(remainingMs / 1000)}s o usa el ultimo mail.`);
      return;
    }

    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession.session?.user?.email?.toLowerCase() === email) {
      setAuthStatus('Ese mail ya tiene una sesion iniciada.');
      return;
    }

    setAuthBusy(true);
    setAuthStatus('');
    setSupabaseRememberPreference(rememberMe);
    const redirectTo = resolveRedirectTo();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setAuthBusy(false);
    if (error) {
      const lowered = error.message.toLowerCase();
      if (lowered.includes('rate limit') || lowered.includes('security purposes')) {
        const cooldownUntil = Date.now() + MAGIC_LINK_COOLDOWN_MS;
        setMagicLinkCooldownUntil(cooldownUntil);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(MAGIC_LINK_COOLDOWN_KEY, String(cooldownUntil));
        }
        setAuthStatus('Tu mail ya puede entrar. Usa el ultimo link recibido o espera 60s para pedir otro.');
        return;
      }
      setAuthStatus(error.message);
      return;
    }

    const cooldownUntil = Date.now() + MAGIC_LINK_COOLDOWN_MS;
    setMagicLinkCooldownUntil(cooldownUntil);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MAGIC_LINK_COOLDOWN_KEY, String(cooldownUntil));
    }
    setAuthStatus('Magic link enviado. Si tu mail ya esta verificado, entra con el ultimo link del correo.');
  }, [emailInput, magicLinkCooldownUntil, rememberMe, resolveRedirectTo]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }
    setAuthBusy(true);
    setAuthStatus('');
    setSupabaseRememberPreference(rememberMe);
    const redirectTo = resolveRedirectTo();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    setAuthBusy(false);
    if (error) {
      setAuthStatus(error.message);
    }
  }, [rememberMe, resolveRedirectTo]);

  const signInWithPassword = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setAuthStatus('Escribi tu email primero.');
      return;
    }

    if (!passwordInput) {
      setAuthStatus('Escribi tu password.');
      return;
    }

    setAuthBusy(true);
    setAuthStatus('');
    setSupabaseRememberPreference(rememberMe);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: passwordInput,
    });
    setAuthBusy(false);
    if (error) {
      setAuthStatus(error.message);
    }
  }, [emailInput, passwordInput, rememberMe]);

  const signUpWithPassword = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setAuthStatus('Escribi tu email primero.');
      return;
    }

    if (passwordInput.length < 6) {
      setAuthStatus('La password necesita al menos 6 caracteres.');
      return;
    }

    setAuthBusy(true);
    setAuthStatus('');
    setSupabaseRememberPreference(rememberMe);
    const redirectTo = resolveRedirectTo();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: passwordInput,
      options: { emailRedirectTo: redirectTo },
    });
    setAuthBusy(false);
    if (error) {
      setAuthStatus(error.message);
      return;
    }

    if (data.session) {
      setPasswordInput('');
      setAuthStatus('Cuenta creada. Sesion iniciada.');
      return;
    }

    setAuthStatus('Cuenta creada. Revisa tu mail para confirmar el acceso.');
  }, [emailInput, passwordInput, rememberMe, resolveRedirectTo]);

  const resetPassword = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }

    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setAuthStatus('Escribi tu email primero.');
      return;
    }

    setAuthBusy(true);
    setAuthStatus('');
    const redirectTo = resolveRedirectTo();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setAuthBusy(false);
    if (error) {
      setAuthStatus(error.message);
      return;
    }

    setAuthStatus('Te mandamos un mail para resetear la password.');
  }, [emailInput, resolveRedirectTo]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      setAuthStatus(error.message);
    }
  }, []);

  return {
    authEmail,
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
    signOut,
    signUpWithPassword,
  };
}
