/**
 * fetch con AbortController timeout.
 * Si la request no resuelve en timeoutMs, hace abort y lanza AbortError.
 * Usar en cualquier fetch que pueda bloquear estado de juego (rewardPending, etc).
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(id);
  }
}
