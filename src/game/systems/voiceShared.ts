export type VoiceUiState =
  | 'disconnected'
  | 'connecting'
  | 'active'
  | 'retrying'
  | 'network_blocked'
  | 'no_mic'
  | 'denied'
  | 'mic_in_use'
  | 'session_required'
  | 'error';

export type VoiceStatusPayload = {
  state: VoiceUiState;
  label: string;
  detail?: string;
  peerCount?: number;
  technicalDetail?: string;
};

export type VoiceMetricProps = Record<string, string | number | boolean>;

export type VoiceIceServer = RTCIceServer;

export type VoiceIceConfigResponse = {
  iceServers: VoiceIceServer[];
  turnEnabled: boolean;
  ttlSeconds: number;
  issuedAt: string;
};

export type VoicePeerServerConfig = {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
  key?: string;
};
