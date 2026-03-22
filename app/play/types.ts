import type { PlayerState } from '@/src/lib/playerState';
import type { SharedParcelState } from '@/src/lib/vecindad';

export type SettingsTab = 'audio' | 'hud' | 'controls' | 'voice';

export interface ChatMsg {
  id: string;
  playerId: string;
  username: string;
  message: string;
  isMe: boolean;
}

export interface PlayerInfo {
  playerId: string;
  username: string;
}

export interface PresencePlayer {
  playerId: string;
  username: string;
}

export interface CombatStats {
  kills: number;
  deaths: number;
}

export type ShopTab = 'tenks_virtual' | 'physical' | 'tenks_packs' | 'orders';

export interface OrderRow {
  id: string;
  created_at: string;
  items: Array<{ product_id: string; size: string }>;
  total: number;
  currency: string;
  status: string;
  discount_code: string | null;
}

export interface ShopOpenPayload {
  tab?: ShopTab;
  itemId?: string;
  source?: string;
}

export interface PenaltyResultPayload {
  won: boolean;
  goals: number;
  shots: number;
}

export interface PlayerActionsPayload {
  playerId: string;
  username: string;
}

export interface ParcelBuyPayload {
  parcelId: string;
  cost: number;
}

export interface VecindadUpdatePayload {
  vecindad: PlayerState['vecindad'];
  notice?: string;
}

export interface VecindadSharedPayload {
  parcels: SharedParcelState[];
  broadcast?: boolean;
}

export type FarmActionRequestPayload =
  | { action: 'farm_unlock' }
  | { action: 'farm_plant'; slotIndex: number; seedType: 'basica' | 'indica' | 'sativa' | 'purple_haze' | 'og_kush' }
  | { action: 'farm_water'; slotIndex: number }
  | { action: 'farm_harvest'; slotIndex: number };
