import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/src/lib/supabase';
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
  const [authBusy, setAuthBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [magicLinkCooldownUntil, setMagicLinkCooldownUntil] = useState(getInitialMagicLinkCooldownUntil);

  const isAuthenticated = useMemo(() => Boolean(authEmail), [authEmail]);

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
        setAuthStatus('Sesion iniciada.');
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
    const redirectTo = appUrl
      ? `${appUrl}/play`
      : typeof window !== 'undefined'
        ? `${window.location.origin}/play`
        : undefined;
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
  }, [emailInput, magicLinkCooldownUntil]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      setAuthStatus('Supabase no esta configurado.');
      return;
    }
    setAuthBusy(true);
    setAuthStatus('');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
    const redirectTo = appUrl
      ? `${appUrl}/play`
      : typeof window !== 'undefined'
        ? `${window.location.origin}/play`
        : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    setAuthBusy(false);
    if (error) {
      setAuthStatus(error.message);
    }
  }, []);

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
    emailInput,
    isAuthenticated,
    sendMagicLink,
    setEmailInput,
    signInWithGoogle,
    signOut,
  };
}
