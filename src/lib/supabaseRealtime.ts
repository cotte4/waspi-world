type RealtimeBroadcastPayload = {
  type: 'broadcast';
  event: string;
  payload: unknown;
};

type RealtimeChannelWithHttpSend = {
  send: (payload: RealtimeBroadcastPayload) => Promise<unknown> | void;
  httpSend?: (event: string, payload: unknown, opts?: { timeout?: number }) => Promise<unknown> | void;
};

export function preferSupabaseHttpBroadcast<T extends RealtimeChannelWithHttpSend | null>(channel: T): T {
  if (!channel || typeof channel.httpSend !== 'function') return channel;
  channel.send = (payload: RealtimeBroadcastPayload) => channel.httpSend!(payload.event, payload.payload ?? {});
  return channel;
}
