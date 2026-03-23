import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getAuthenticatedUser } from '@/src/lib/supabaseServer';
import type { VoiceIceConfigResponse, VoiceIceServer } from '@/src/game/systems/voiceShared';

const STUN_FALLBACK: VoiceIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function isRateLimited(key: string) {
  const now = Date.now();
  const existing = rateLimitBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > RATE_LIMIT_MAX_REQUESTS;
}

function parseTurnUrls(): string[] {
  return (process.env.VOICE_TURN_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getMeteredDomain(): string {
  return (process.env.METERED_TURN_DOMAIN ?? '').trim();
}

function getMeteredUrls(): VoiceIceServer[] {
  const overrideUrls = parseTurnUrls();
  if (overrideUrls.length > 0) {
    return overrideUrls.map((url) => ({ urls: url }));
  }

  return [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp' },
    { urls: 'turn:global.relay.metered.ca:443' },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp' },
  ];
}

async function buildMeteredIceConfig(userId: string): Promise<VoiceIceConfigResponse> {
  const meteredDomain = getMeteredDomain();
  const secretKey = (process.env.METERED_TURN_SECRET_KEY ?? '').trim();
  const ttlSecondsRaw = Number(process.env.VOICE_TURN_TTL_SECONDS ?? '3600');
  const ttlSeconds = Number.isFinite(ttlSecondsRaw) && ttlSecondsRaw > 0 ? Math.floor(ttlSecondsRaw) : 3600;

  if (!meteredDomain || !secretKey) {
    throw new Error('Metered TURN is not configured. Missing METERED_TURN_DOMAIN or METERED_TURN_SECRET_KEY.');
  }

  const response = await fetch(`https://${meteredDomain}/api/v1/turn/credential?secretKey=${encodeURIComponent(secretKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      label: `voice-${userId}`,
      expiryInSeconds: ttlSeconds,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new Error(`Metered TURN credential request failed (${response.status}): ${payload || 'Unknown error'}`);
  }

  const payload = await response.json() as {
    username?: string;
    password?: string;
    expiryInSeconds?: number;
  };

  if (!payload.username || !payload.password) {
    throw new Error('Metered TURN response did not include username/password.');
  }

  const iceServers = getMeteredUrls().map((server) => ({
    ...server,
    username: payload.username!,
    credential: payload.password!,
  }));

  return {
    iceServers,
    turnEnabled: true,
    ttlSeconds: typeof payload.expiryInSeconds === 'number' ? payload.expiryInSeconds : ttlSeconds,
    issuedAt: new Date().toISOString(),
  };
}

function buildIceConfig(userId: string): VoiceIceConfigResponse {
  const ttlSecondsRaw = Number(process.env.VOICE_TURN_TTL_SECONDS ?? '3600');
  const ttlSeconds = Number.isFinite(ttlSecondsRaw) && ttlSecondsRaw > 0 ? Math.floor(ttlSecondsRaw) : 3600;
  const issuedAt = new Date().toISOString();
  const turnSecret = process.env.VOICE_TURN_SECRET?.trim() ?? '';
  const turnUrls = parseTurnUrls();

  if (!turnSecret || turnUrls.length === 0) {
    return {
      iceServers: STUN_FALLBACK,
      turnEnabled: false,
      ttlSeconds,
      issuedAt,
    };
  }

  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiresAt}:${userId}`;
  const credential = createHmac('sha1', turnSecret).update(username).digest('base64');

  return {
    iceServers: [
      ...STUN_FALLBACK,
      {
        urls: turnUrls,
        username,
        credential,
      },
    ],
    turnEnabled: true,
    ttlSeconds,
    issuedAt,
  };
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitKey = `${user.id}:${getClientIp(request)}`;
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: 'Too many ICE config requests.' }, { status: 429 });
  }

  try {
    const payload = getMeteredDomain()
      ? await buildMeteredIceConfig(user.id)
      : buildIceConfig(user.id);
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { subsystem: 'voice', route: '/api/voice/ice' },
      extra: { userId: user.id },
    });
    return NextResponse.json({ error: 'Failed to build ICE config.' }, { status: 500 });
  }
}
