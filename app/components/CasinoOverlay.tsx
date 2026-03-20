'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { getTenksBalance, spendTenks, addTenks } from '@/src/game/systems/TenksSystem';

/* ─── Types ────────────────────────────────────────────────────────────────── */

type GameId = 'slots' | 'roulette' | 'blackjack' | 'poker';

type BlackjackPhase = 'bet' | 'player' | 'dealer' | 'result';
type HoldemPhase = 'ante' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
type RouletteBetKind = 'red' | 'black' | 'even' | 'odd' | 'lucky7';

interface SlotsState {
  betIndex: number;
  reels: string[];
  resultText: string;
  spinning: boolean;
}

interface RouletteState {
  betIndex: number;
  optionIndex: number;
  resultText: string;
  spinning: boolean;
  lastNumber: number | null;
  lastColor: 'red' | 'black' | 'green' | null;
}

interface BlackjackState {
  phase: BlackjackPhase;
  betIndex: number;
  playerCards: number[];
  dealerCards: number[];
  dealerHidden: boolean;
  actionIndex: number;
  resultText: string;
  currentBet: number;
  deck: number[];
  settled: boolean;
}

interface HoldemState {
  phase: HoldemPhase;
  anteIndex: number;
  playerHole: number[];
  cpuHole: number[];
  community: number[];
  pot: number;
  playerPaid: number;
  deck: number[];
  resultText: string;
  actionIndex: number;
  cpuLastAction: string;
}

interface RouletteBetOption {
  id: RouletteBetKind;
  label: string;
  payout: number;
  color: string;
}

interface PokerResult {
  label: string;
  rank: number;
  tiebreak: number[];
}

export interface CasinoOverlayProps {
  isMobile: boolean;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const SLOT_BETS = [50, 100, 250, 500] as const;
const ROULETTE_BETS = [100, 250, 500, 1000] as const;
const BLACKJACK_BETS = [100, 250, 500, 1000] as const;
const HOLDEM_ANTES = [100, 250, 500, 1000] as const;
const SLOT_SYMBOLS = ['7', 'BAR', 'WASP', 'STAR', 'BELL'] as const;

const ROULETTE_OPTIONS: RouletteBetOption[] = [
  { id: 'red',    label: 'ROJO',  payout: 2,  color: '#FF5A5A' },
  { id: 'black',  label: 'NEGRO', payout: 2,  color: '#DDDDDD' },
  { id: 'even',   label: 'PAR',   payout: 2,  color: '#4FD1C5' },
  { id: 'odd',    label: 'IMPAR', payout: 2,  color: '#F5C842' },
  { id: 'lucky7', label: 'NUM 7', payout: 12, color: '#B794F4' },
];

const ROULETTE_RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const GAME_LABELS: Record<GameId, string> = {
  slots: 'SLOTS',
  roulette: 'RULETA',
  blackjack: 'BLACKJACK',
  poker: 'POKER',
};

const GAME_ACCENT: Record<GameId, string> = {
  slots:     '#F5C842',
  roulette:  '#FF5A5A',
  blackjack: '#22CC88',
  poker:     '#8B5CF6',
};

const S = {
  font: '"Press Start 2P", monospace',
  fontBody: '"Silkscreen", monospace',
  bg: 'rgba(14,14,20,0.97)',
  gold: '#F5C842',
  white: '#ffffff',
  muted: 'rgba(255,255,255,0.4)',
  green: '#22CC88',
  purple: '#8B5CF6',
  red: '#FF5A5A',
};

/* ─── Pure helpers (no Phaser) ─────────────────────────────────────────────── */

function randomSlotSymbol(): string {
  return SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
}

function buildLosingReels(): string[] {
  const copy = [...SLOT_SYMBOLS];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return [copy[0], copy[1], copy[2]];
}

function rollSlotsOutcome(): { reels: string[]; payoutMultiplier: number; label: string } {
  const roll = Math.random() * 100;
  if (roll < 2) {
    const symbol = Math.random() < 0.5 ? '7' : 'WASP';
    return { reels: [symbol, symbol, symbol], payoutMultiplier: 8, label: 'JACKPOT!' };
  }
  if (roll < 7) {
    const symbol = randomSlotSymbol();
    return { reels: [symbol, symbol, symbol], payoutMultiplier: 4, label: 'TRIPLE MATCH!' };
  }
  if (roll < 17) {
    const symbol = randomSlotSymbol();
    const special = Math.random() < 0.5 ? '7' : 'STAR';
    return { reels: [symbol, symbol, special], payoutMultiplier: 2.5, label: 'CASI JACKPOT!' };
  }
  if (roll < 40) {
    const symbol = randomSlotSymbol();
    const other = randomSlotSymbol();
    return { reels: [symbol, symbol, other], payoutMultiplier: 1.25, label: 'PAREJA!' };
  }
  return { reels: buildLosingReels(), payoutMultiplier: 0, label: 'NADA' };
}

function getRouletteColor(number: number): 'red' | 'black' | 'green' {
  if (number === 0) return 'green';
  return ROULETTE_RED_NUMBERS.has(number) ? 'red' : 'black';
}

function createShuffledDeck52(): number[] {
  const deck: number[] = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push(suit * 13 + rank);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function createBlackjackDeck(): number[] {
  const deck: number[] = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push(rank);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getHandTotal(cards: number[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card === 1) { aces++; total += 11; }
    else if (card >= 10) total += 10;
    else total += card;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function formatBJCard(card: number): string {
  if (card === 1) return 'A';
  if (card === 11) return 'J';
  if (card === 12) return 'Q';
  if (card === 13) return 'K';
  return String(card);
}

function pokerRankValue(card: number): number {
  const rank = ((card - 1) % 13) + 1;
  return rank === 1 ? 14 : rank;
}

function getStraightHighCard(sortedUniqueRanks: number[]): number {
  if (sortedUniqueRanks.length !== 5) return 0;
  if (sortedUniqueRanks[4] - sortedUniqueRanks[0] === 4) return sortedUniqueRanks[4];
  if (sortedUniqueRanks.join(',') === '2,3,4,5,14') return 5;
  return 0;
}

function evaluatePokerHand(cards: number[]): PokerResult {
  const ranks = cards.map(pokerRankValue);
  const suits = cards.map((c) => Math.floor((c - 1) / 13));
  const counts = new Map<number, number>();
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  const isFlush = suits.every((s) => s === suits[0]);
  const straightHigh = getStraightHighCard(uniqueRanks);
  const grouped = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));

  if (isFlush && straightHigh === 14) return { label: 'ESCALERA REAL', rank: 9, tiebreak: [14] };
  if (isFlush && straightHigh > 0) return { label: 'ESCALERA COLOR', rank: 8, tiebreak: [straightHigh] };
  if (grouped[0].count === 4) return { label: 'POKER', rank: 7, tiebreak: [grouped[0].rank, grouped[1].rank] };
  if (grouped[0].count === 3 && grouped[1].count === 2) return { label: 'FULL HOUSE', rank: 6, tiebreak: [grouped[0].rank, grouped[1].rank] };
  if (isFlush) return { label: 'COLOR', rank: 5, tiebreak: [...ranks].sort((a, b) => b - a) };
  if (straightHigh > 0) return { label: 'ESCALERA', rank: 4, tiebreak: [straightHigh] };
  if (grouped[0].count === 3) {
    const kickers = grouped.filter((g) => g.count === 1).map((g) => g.rank).sort((a, b) => b - a);
    return { label: 'TRIO', rank: 3, tiebreak: [grouped[0].rank, ...kickers] };
  }
  if (grouped[0].count === 2 && grouped[1].count === 2) {
    const pairRanks = grouped.filter((g) => g.count === 2).map((g) => g.rank).sort((a, b) => b - a);
    const kicker = grouped.find((g) => g.count === 1)?.rank ?? 0;
    return { label: 'DOBLE PAREJA', rank: 2, tiebreak: [pairRanks[0], pairRanks[1], kicker] };
  }
  if (grouped[0].count === 2) {
    const kickers = grouped.filter((g) => g.count === 1).map((g) => g.rank).sort((a, b) => b - a);
    return { label: 'PAR', rank: 1, tiebreak: [grouped[0].rank, ...kickers] };
  }
  return { label: 'CARTA ALTA', rank: 0, tiebreak: [...ranks].sort((a, b) => b - a) };
}

function bestAvailableHand(hole: number[], community: number[]): PokerResult {
  const all = [...hole, ...community];
  if (all.length < 2) return { label: 'SIN CARTAS', rank: 0, tiebreak: [0] };
  if (all.length < 5) {
    const ranksSorted = all.map(pokerRankValue).sort((a, b) => b - a);
    return { label: 'CARTA ALTA', rank: 0, tiebreak: ranksSorted };
  }
  if (all.length === 5) return evaluatePokerHand(all);
  let best: PokerResult = { label: 'CARTA ALTA', rank: 0, tiebreak: [0] };
  for (let i = 0; i < all.length - 1; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const hand5 = all.filter((_, k) => k !== i && k !== j);
      if (hand5.length !== 5) continue;
      const res = evaluatePokerHand(hand5);
      if (comparePokerResults(res, best) > 0) best = res;
    }
  }
  return best;
}

function comparePokerResults(a: PokerResult, b: PokerResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const maxLen = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < maxLen; i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function pokerCardLabel(card: number): string {
  const rank = ((card - 1) % 13) + 1;
  const rl = rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
  const suitIdx = Math.floor((card - 1) / 13);
  const ss = ['♠', '♥', '♦', '♣'][suitIdx] ?? '♠';
  return `${rl}${ss}`;
}

function isRedSuit(card: number): boolean {
  const suitIdx = Math.floor((card - 1) / 13);
  return suitIdx === 1 || suitIdx === 2;
}

/* ─── Small UI primitives ───────────────────────────────────────────────────── */

function Btn({
  label,
  active,
  color = S.gold,
  onClick,
  disabled,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: S.font,
        fontSize: 8,
        padding: '8px 16px',
        background: active ? color : 'rgba(30,20,50,0.85)',
        color: active ? '#000' : S.muted,
        border: `2px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '0.04em',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function BetChips<T extends number>({
  bets,
  selected,
  onSelect,
  color,
}: {
  bets: readonly T[];
  selected: number;
  onSelect: (idx: number) => void;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
      {bets.map((bet, idx) => (
        <button
          key={bet}
          onClick={() => onSelect(idx)}
          style={{
            fontFamily: S.font,
            fontSize: 7,
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: idx === selected ? color : 'rgba(20,10,30,0.9)',
            color: idx === selected ? '#000' : S.muted,
            border: `2px solid ${idx === selected ? S.gold : 'rgba(255,255,255,0.12)'}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {bet}
        </button>
      ))}
    </div>
  );
}

function ResultLine({ text, positive }: { text: string; positive?: boolean }) {
  const col = positive === true ? S.green : positive === false ? S.red : S.gold;
  return (
    <div style={{ fontFamily: S.font, fontSize: 8, color: col, textAlign: 'center', lineHeight: 1.8 }}>
      {text}
    </div>
  );
}

function CardFace({
  card,
  hidden,
  highlight,
}: {
  card: number | null;
  hidden?: boolean;
  highlight?: 'gold' | 'green' | 'purple' | 'none';
}) {
  const w = 40;
  const h = 56;
  const borderColor =
    highlight === 'gold'   ? S.gold :
    highlight === 'green'  ? S.green :
    highlight === 'purple' ? S.purple :
    'rgba(200,196,184,0.8)';

  if (hidden || card === null) {
    return (
      <div style={{
        width: w,
        height: h,
        background: '#1a0a40',
        border: '2px solid #3a2a60',
        borderRadius: 5,
        backgroundImage: 'repeating-linear-gradient(30deg, transparent, transparent 4px, rgba(42,26,80,0.5) 4px, rgba(42,26,80,0.5) 5px)',
        flexShrink: 0,
      }} />
    );
  }

  const label = pokerCardLabel(card);
  const red = isRedSuit(card);
  const tc = red ? '#c0392b' : '#111111';

  return (
    <div style={{
      width: w,
      height: h,
      background: '#faf8f2',
      border: `2px solid ${borderColor}`,
      borderRadius: 5,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      padding: '3px 4px',
      flexShrink: 0,
      position: 'relative',
      boxShadow: '1px 2px 4px rgba(0,0,0,0.35)',
    }}>
      <span style={{ fontFamily: S.font, fontSize: 7, color: tc, lineHeight: 1 }}>{label}</span>
      <span style={{
        fontFamily: 'serif',
        fontSize: 18,
        color: tc,
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        lineHeight: 1,
      }}>
        {label.slice(-1)}
      </span>
    </div>
  );
}

function BJCard({ card, hidden }: { card: number; hidden?: boolean }) {
  const w = 36;
  const h = 50;
  if (hidden) {
    return (
      <div style={{
        width: w,
        height: h,
        background: '#0E0E14',
        border: '2px solid rgba(245,200,66,0.8)',
        borderRadius: 5,
        backgroundImage: 'repeating-linear-gradient(30deg, transparent, transparent 4px, rgba(47,47,64,0.8) 4px, rgba(47,47,64,0.8) 5px)',
        flexShrink: 0,
      }} />
    );
  }
  const rank = formatBJCard(card);
  const suits = ['♠', '♥', '♦', '♣'];
  const suit = suits[card % 4];
  const isRed = suit === '♥' || suit === '♦';
  const tc = isRed ? '#FF006E' : '#111111';
  return (
    <div style={{
      width: w,
      height: h,
      background: '#fff',
      border: '1px solid #c7c7cf',
      borderRadius: 5,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      padding: '3px 4px',
      flexShrink: 0,
      boxShadow: '1px 2px 4px rgba(0,0,0,0.25)',
    }}>
      <span style={{ fontFamily: S.font, fontSize: 7, color: tc }}>{rank}{suit}</span>
    </div>
  );
}

/* ─── Slots panel ───────────────────────────────────────────────────────────── */

function SlotsPanel({ balance, onToast }: { balance: number; onToast: (msg: string) => void }) {
  const [state, setState] = useState<SlotsState>({
    betIndex: 0,
    reels: ['7', '7', '7'],
    resultText: 'ELEGI UNA APUESTA Y GIRA.',
    spinning: false,
  });
  const spinIdRef = useRef(0);

  const spin = useCallback(() => {
    if (state.spinning) return;
    const bet = SLOT_BETS[state.betIndex];
    if (!spendTenks(bet, 'casino_slots_bet')) {
      setState((s) => ({ ...s, resultText: 'NO TENES TENKS SUFICIENTES.' }));
      onToast('NO ALCANZA PARA GIRAR.');
      return;
    }
    const outcome = rollSlotsOutcome();
    const myToken = ++spinIdRef.current;
    setState((s) => ({ ...s, spinning: true, resultText: 'GIRANDO...' }));

    const totalTicks = 12;
    for (let tick = 0; tick < totalTicks; tick++) {
      const t = tick;
      window.setTimeout(() => {
        if (spinIdRef.current !== myToken) return;
        const isLast = t === totalTicks - 1;
        if (isLast) {
          const payout = Math.round(bet * outcome.payoutMultiplier);
          if (payout > 0) {
            addTenks(payout, 'casino_slots_payout');
            onToast(`+${payout} TENKS`);
          } else {
            onToast('SIN PAGO');
          }
          setState({
            betIndex: state.betIndex,
            reels: outcome.reels,
            resultText: payout > 0 ? `${outcome.label} COBRAS ${payout} TENKS.` : 'MALA SUERTE. OTRA MAS.',
            spinning: false,
          });
        } else {
          setState((s) =>
            s.spinning
              ? { ...s, reels: [randomSlotSymbol(), randomSlotSymbol(), randomSlotSymbol()] }
              : s
          );
        }
      }, 80 * t);
    }
  }, [state, onToast]);

  const bet = SLOT_BETS[state.betIndex];
  const isPositive = state.resultText.includes('COBRAS');
  const isNegative = state.resultText.includes('MALA SUERTE');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
      <div style={{ fontFamily: S.font, fontSize: 7, color: S.muted }}>SALDO: {balance} TENKS</div>

      <div style={{ display: 'flex', gap: 12 }}>
        {state.reels.map((symbol, i) => (
          <div key={i} style={{
            width: 64,
            height: 80,
            background: '#0a0316',
            border: `2px solid ${S.gold}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: S.font,
            fontSize: 14,
            color: S.gold,
          }}>
            {symbol}
          </div>
        ))}
      </div>

      <div style={{ fontFamily: S.font, fontSize: 7, color: S.muted }}>APUESTA: {bet} TENKS</div>

      <BetChips bets={SLOT_BETS} selected={state.betIndex} onSelect={(idx) => !state.spinning && setState((s) => ({ ...s, betIndex: idx }))} color={S.gold} />

      <ResultLine text={state.resultText} positive={isPositive ? true : isNegative ? false : undefined} />

      <div style={{ fontFamily: S.fontBody, fontSize: 8, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
        JACKPOT x8 | TRIPLE x4 | CASI x2.5 | PAREJA x1.25
      </div>

      <Btn label={state.spinning ? 'GIRANDO...' : 'GIRAR'} active={!state.spinning} disabled={state.spinning} onClick={spin} color={S.gold} />
    </div>
  );
}

/* ─── Roulette panel ────────────────────────────────────────────────────────── */

function RoulettePanel({ balance, onToast }: { balance: number; onToast: (msg: string) => void }) {
  const [state, setState] = useState<RouletteState>({
    betIndex: 0,
    optionIndex: 0,
    resultText: 'ELEGI APUESTA, TIPO Y GIRA.',
    spinning: false,
    lastNumber: null,
    lastColor: null,
  });
  const spinIdRef = useRef(0);

  const spin = useCallback(() => {
    if (state.spinning) return;
    const bet = ROULETTE_BETS[state.betIndex];
    if (!spendTenks(bet, 'casino_roulette_bet')) {
      setState((s) => ({ ...s, resultText: 'NO TENES TENKS SUFICIENTES.' }));
      onToast('NO ALCANZA PARA GIRAR.');
      return;
    }
    const winningNumber = Math.floor(Math.random() * 37);
    const myToken = ++spinIdRef.current;
    setState((s) => ({ ...s, spinning: true, resultText: 'LA BOLA ESTA GIRANDO...' }));

    const totalTicks = 14;
    for (let tick = 0; tick < totalTicks; tick++) {
      const t = tick;
      window.setTimeout(() => {
        if (spinIdRef.current !== myToken) return;
        const isLast = t === totalTicks - 1;
        const number = isLast ? winningNumber : Math.floor(Math.random() * 37);
        const color = getRouletteColor(number);
        if (isLast) {
          const option = ROULETTE_OPTIONS[state.optionIndex];
          const isEven = number !== 0 && number % 2 === 0;
          const won =
            (option.id === 'red'    && color === 'red')   ||
            (option.id === 'black'  && color === 'black') ||
            (option.id === 'even'   && isEven)             ||
            (option.id === 'odd'    && number !== 0 && !isEven) ||
            (option.id === 'lucky7' && number === 7);
          const payout = won ? bet * option.payout : 0;
          if (payout > 0) {
            addTenks(payout, 'casino_roulette_payout');
            onToast(`+${payout} TENKS`);
          } else {
            onToast('LA CASA GANA');
          }
          setState((s) => ({
            ...s,
            spinning: false,
            lastNumber: number,
            lastColor: color,
            resultText: payout > 0
              ? `SALIO ${number} ${color.toUpperCase()}. GANASTE ${payout} TENKS.`
              : `SALIO ${number} ${color.toUpperCase()}. NO COBRAS ESTA.`,
          }));
        } else {
          setState((s) => s.spinning ? { ...s, lastNumber: number, lastColor: color } : s);
        }
      }, 90 * t);
    }
  }, [state, onToast]);

  const { betIndex, optionIndex, spinning, lastNumber, lastColor, resultText } = state;
  const numColor = lastNumber === null ? S.muted : lastColor === 'red' ? S.red : lastColor === 'green' ? S.green : '#DDDDDD';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      <div style={{ fontFamily: S.font, fontSize: 7, color: S.muted }}>SALDO: {balance} TENKS</div>

      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: '#0d4a1c',
        border: `3px solid ${S.gold}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: S.font,
        fontSize: lastNumber !== null && String(lastNumber).length > 1 ? 14 : 20,
        color: numColor,
        boxShadow: spinning ? `0 0 16px ${S.gold}` : 'none',
        transition: 'box-shadow 0.3s ease',
      }}>
        {lastNumber !== null ? String(lastNumber) : '?'}
      </div>

      <div style={{ fontFamily: S.fontBody, fontSize: 8, color: numColor, textAlign: 'center' }}>
        {spinning ? 'GIRANDO...' : lastNumber !== null ? `${lastNumber} — ${(lastColor ?? '').toUpperCase()}` : 'ELEGÍ Y GIRA'}
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ fontFamily: S.font, fontSize: 6, color: S.muted, marginBottom: 6 }}>TIPO DE APUESTA</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ROULETTE_OPTIONS.map((opt, idx) => (
            <button
              key={opt.id}
              onClick={() => !spinning && setState((s) => ({ ...s, optionIndex: idx }))}
              style={{
                fontFamily: S.font,
                fontSize: 7,
                padding: '6px 12px',
                background: idx === optionIndex ? `${opt.color}22` : 'rgba(10,10,16,0.8)',
                color: idx === optionIndex ? opt.color : S.muted,
                border: `1px solid ${idx === optionIndex ? opt.color : 'rgba(255,255,255,0.08)'}`,
                cursor: spinning ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{opt.label}</span>
              <span style={{ color: S.muted }}>×{opt.payout}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ fontFamily: S.font, fontSize: 6, color: S.muted, marginBottom: 6 }}>APUESTA</div>
        <BetChips bets={ROULETTE_BETS} selected={betIndex} onSelect={(idx) => !spinning && setState((s) => ({ ...s, betIndex: idx }))} color={S.red} />
      </div>

      <ResultLine
        text={resultText}
        positive={resultText.includes('GANASTE') ? true : resultText.includes('NO COBRAS') || resultText.includes('NO TENES') ? false : undefined}
      />

      <Btn label={spinning ? 'ESPERÁ...' : 'GIRAR'} active={!spinning} disabled={spinning} onClick={spin} color={S.red} />
    </div>
  );
}

/* ─── Blackjack panel ───────────────────────────────────────────────────────── */

function BlackjackPanel({ balance, onToast }: { balance: number; onToast: (msg: string) => void }) {
  const [state, setState] = useState<BlackjackState>({
    phase: 'bet',
    betIndex: 0,
    playerCards: [],
    dealerCards: [],
    dealerHidden: true,
    actionIndex: 0,
    resultText: 'ELEGI UNA APUESTA Y REPARTE.',
    currentBet: 0,
    deck: [],
    settled: false,
  });

  const dealerStepRef = useRef<number | null>(null);

  const resolveBlackjack = useCallback((
    playerCards: number[],
    dealerCards: number[],
    currentBet: number,
    fromInitialDeal: boolean,
    settled: boolean,
    betIndex: number,
  ) => {
    if (settled && !fromInitialDeal) return null;
    const playerTotal = getHandTotal(playerCards);
    const dealerTotal = getHandTotal(dealerCards);
    const playerBJ = playerCards.length === 2 && playerTotal === 21;
    const dealerBJ = dealerCards.length === 2 && dealerTotal === 21;
    let payout = 0;
    let resultText = '';
    if (playerTotal > 21) resultText = 'TE PASASTE. LA CASA GANA.';
    else if (dealerTotal > 21) { payout = currentBet * 2; resultText = `LA CASA SE PASO. COBRAS ${payout} TENKS.`; }
    else if (playerBJ && !dealerBJ) { payout = currentBet * 3; resultText = `BLACKJACK! COBRAS ${payout} TENKS.`; }
    else if (dealerBJ && !playerBJ) resultText = 'BLACKJACK DE LA CASA.';
    else if (playerTotal > dealerTotal) { payout = currentBet * 2; resultText = `GANASTE. COBRAS ${payout} TENKS.`; }
    else if (playerTotal < dealerTotal) resultText = 'LA CASA GANA.';
    else { payout = currentBet; resultText = `EMPATE. TE DEVUELVEN ${payout} TENKS.`; }
    if (fromInitialDeal && playerBJ && dealerBJ) { payout = currentBet; resultText = `DOBLE BLACKJACK. EMPATE, ${currentBet} TENKS DEVUELTOS.`; }
    if (payout > 0) { addTenks(payout, 'casino_blackjack_payout'); onToast(`+${payout} TENKS`); }
    else onToast(resultText);
    return { payout, resultText, betIndex };
  }, [onToast]);

  const startHand = useCallback(() => {
    const bet = BLACKJACK_BETS[state.betIndex];
    if (!spendTenks(bet, 'casino_blackjack_bet')) {
      setState((s) => ({ ...s, resultText: 'NO TENES TENKS SUFICIENTES.' }));
      onToast('NO ALCANZA PARA JUGAR.');
      return;
    }
    const deckInit = createBlackjackDeck();
    const card1 = deckInit.pop()!;
    const deck1 = [...deckInit];
    const card2 = deck1.pop()!;
    const deck2 = [...deck1];
    const card3 = deck2.pop()!;
    const deck3 = [...deck2];
    const card4 = deck3.pop()!;
    const deck = [...deck3];
    const playerCards = [card1, card2];
    const dealerCards = [card3, card4];
    const playerTotal = getHandTotal(playerCards);
    const dealerTotal = getHandTotal(dealerCards);
    if (playerTotal === 21 || dealerTotal === 21) {
      const resolved = resolveBlackjack(playerCards, dealerCards, bet, true, false, state.betIndex);
      if (resolved) {
        setState({
          phase: 'result', betIndex: state.betIndex, playerCards, dealerCards,
          dealerHidden: false, actionIndex: 0, resultText: resolved.resultText,
          currentBet: bet, deck, settled: true,
        });
      }
      return;
    }
    setState({
      phase: 'player', betIndex: state.betIndex, playerCards, dealerCards,
      dealerHidden: true, actionIndex: 0, resultText: 'TU MANO. HIT O STAND.',
      currentBet: bet, deck, settled: false,
    });
  }, [state.betIndex, resolveBlackjack, onToast]);

  const hit = useCallback(() => {
    setState((s) => {
      if (s.phase !== 'player') return s;
      const [newCard, newDeck] = [s.deck.pop() ?? Math.ceil(Math.random() * 13), [...s.deck]];
      const playerCards = [...s.playerCards, newCard];
      const total = getHandTotal(playerCards);
      if (total > 21) {
        onToast('PERDISTE LA MANO');
        return { ...s, playerCards, deck: newDeck, dealerHidden: false, settled: true, phase: 'result', resultText: 'TE PASASTE. LA CASA GANA.' };
      }
      return { ...s, playerCards, deck: newDeck };
    });
  }, [onToast]);

  const stand = useCallback(() => {
    setState((s) => ({
      ...s,
      phase: 'dealer',
      dealerHidden: false,
      resultText: 'LA CASA JUEGA...',
    }));
  }, []);

  useEffect(() => {
    if (state.phase !== 'dealer') return;
    const tick = () => {
      setState((s) => {
        if (s.phase !== 'dealer') return s;
        if (getHandTotal(s.dealerCards) < 17) {
          const [newCard, newDeck] = [s.deck.pop() ?? Math.ceil(Math.random() * 13), [...s.deck]];
          return { ...s, dealerCards: [...s.dealerCards, newCard], deck: newDeck };
        }
        const resolved = resolveBlackjack(s.playerCards, s.dealerCards, s.currentBet, false, s.settled, s.betIndex);
        if (!resolved) return s;
        return { ...s, phase: 'result', settled: true, dealerHidden: false, resultText: resolved.resultText };
      });
    };
    dealerStepRef.current = window.setTimeout(tick, 320);
    return () => { if (dealerStepRef.current !== null) window.clearTimeout(dealerStepRef.current); };
  }, [state.phase, state.dealerCards, resolveBlackjack]);

  const playerTotal = getHandTotal(state.playerCards);
  const dealerVisibleTotal = state.dealerHidden
    ? getHandTotal(state.dealerCards.slice(0, 1))
    : getHandTotal(state.dealerCards);
  const bet = BLACKJACK_BETS[state.betIndex];

  const resultColor = state.resultText.includes('BLACKJACK') ? S.gold
    : (state.resultText.includes('GANASTE') || state.resultText.includes('COBRAS')) ? S.green
    : state.resultText.includes('EMPATE') ? '#46B3FF'
    : S.red;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontFamily: S.font, fontSize: 8, color: S.green }}>BLACKJACK</span>
        <span style={{ fontFamily: S.font, fontSize: 7, color: S.muted }}>TENKS: {balance}</span>
      </div>

      <div style={{
        background: '#1a5c2a',
        border: `2px solid rgba(245,200,66,0.35)`,
        borderRadius: 12,
        padding: '16px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ fontFamily: S.font, fontSize: 7, color: '#f0f0f0', textAlign: 'center' }}>
          DEALER ({state.dealerHidden ? '??' : dealerVisibleTotal})
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {state.dealerCards.length === 0
            ? <div style={{ fontFamily: S.fontBody, fontSize: 8, color: S.muted }}>—</div>
            : state.dealerCards.map((card, i) => <BJCard key={i} card={card} hidden={state.dealerHidden && i === 1} />)
          }
        </div>

        <div style={{ fontFamily: S.font, fontSize: 7, color: S.gold, textAlign: 'center' }}>
          APUESTA: {state.currentBet || bet} TENKS
        </div>

        <div style={{ fontFamily: S.font, fontSize: 7, color: S.white, textAlign: 'center' }}>
          TU MANO ({playerTotal || 0})
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {state.playerCards.length === 0
            ? <div style={{ fontFamily: S.fontBody, fontSize: 8, color: S.muted }}>—</div>
            : state.playerCards.map((card, i) => <BJCard key={i} card={card} />)
          }
        </div>
      </div>

      <div style={{ fontFamily: S.font, fontSize: 8, color: resultColor, textAlign: 'center', lineHeight: 1.8 }}>
        {state.resultText}
      </div>

      {state.phase === 'bet' && (
        <>
          <BetChips bets={BLACKJACK_BETS} selected={state.betIndex} onSelect={(idx) => setState((s) => ({ ...s, betIndex: idx }))} color="#46B3FF" />
          <Btn label="REPARTIR" active onClick={startHand} color="#46B3FF" />
        </>
      )}
      {state.phase === 'player' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn label="HIT" active={state.actionIndex === 0} onClick={() => { setState((s) => ({ ...s, actionIndex: 0 })); hit(); }} color={S.green} />
          <Btn label="STAND" active={state.actionIndex === 1} onClick={() => { setState((s) => ({ ...s, actionIndex: 1 })); stand(); }} color={S.gold} />
        </div>
      )}
      {state.phase === 'dealer' && (
        <div style={{ fontFamily: S.fontBody, fontSize: 8, color: S.muted }}>LA CASA ESTA JUGANDO...</div>
      )}
      {state.phase === 'result' && (
        <Btn label="JUGAR OTRA" active onClick={() => setState({ phase: 'bet', betIndex: state.betIndex, playerCards: [], dealerCards: [], dealerHidden: true, actionIndex: 0, resultText: 'ELEGI UNA APUESTA Y REPARTE.', currentBet: 0, deck: [], settled: false })} color={S.green} />
      )}
    </div>
  );
}

/* ─── Poker panel ───────────────────────────────────────────────────────────── */

function PokerPanel({ balance, onToast }: { balance: number; onToast: (msg: string) => void }) {
  const [state, setState] = useState<HoldemState>({
    phase: 'ante',
    anteIndex: 1,
    playerHole: [],
    cpuHole: [],
    community: [],
    pot: 0,
    playerPaid: 0,
    deck: [],
    resultText: 'ELEGÍ TU ANTE Y REPARTÍ.',
    actionIndex: 1,
    cpuLastAction: '',
  });

  const cpuDecideOnRaise = useCallback((cpuHole: number[], community: number[], phase: HoldemPhase): boolean => {
    const strength = bestAvailableHand(cpuHole, community);
    const weakHand = strength.rank <= 1;
    const bluff = Math.random() < 0.12;
    if (phase === 'river') return weakHand && !bluff;
    return weakHand && Math.random() < 0.45 && !bluff;
  }, []);

  const startHand = useCallback(() => {
    const ante = HOLDEM_ANTES[state.anteIndex];
    if (!spendTenks(ante, 'casino_holdem_ante')) {
      setState((s) => ({ ...s, resultText: 'NO TENÉS TENKS SUFICIENTES.' }));
      onToast('SIN TENKS PARA EL ANTE');
      return;
    }
    const deck = createShuffledDeck52();
    const playerHole = [deck.pop()!, deck.pop()!];
    const cpuHole    = [deck.pop()!, deck.pop()!];
    setState((s) => ({
      ...s, phase: 'preflop', playerHole, cpuHole, community: [],
      pot: ante * 2, playerPaid: ante, deck,
      resultText: 'TU TURNO — ELEGÍ UNA ACCIÓN.', actionIndex: 1, cpuLastAction: 'ENTRA',
    }));
  }, [state.anteIndex, onToast]);

  const advancePhase = useCallback((s: HoldemState): HoldemState => {
    const deck = [...s.deck];
    if (s.phase === 'preflop') {
      return { ...s, deck, community: [deck.pop()!, deck.pop()!, deck.pop()!], phase: 'flop', resultText: 'FLOP — ELEGÍ UNA ACCIÓN.', actionIndex: 1 };
    }
    if (s.phase === 'flop') {
      return { ...s, deck, community: [...s.community, deck.pop()!], phase: 'turn', resultText: 'TURN — SEGUÍ JUGANDO.', actionIndex: 1 };
    }
    if (s.phase === 'turn') {
      return { ...s, deck, community: [...s.community, deck.pop()!], phase: 'river', resultText: 'RIVER — ÚLTIMA RONDA.', actionIndex: 1 };
    }
    if (s.phase === 'river') {
      const playerBest = bestAvailableHand(s.playerHole, s.community);
      const cpuBest    = bestAvailableHand(s.cpuHole,    s.community);
      const cmp = comparePokerResults(playerBest, cpuBest);
      let resultText: string;
      if (cmp > 0) {
        addTenks(s.pot, 'casino_holdem_win');
        onToast(`+${s.pot} TENKS`);
        resultText = `GANASTE CON ${playerBest.label}! +${s.pot} TENKS`;
      } else if (cmp < 0) {
        onToast('LA CASA GANA');
        resultText = `CPU GANA CON ${cpuBest.label}. PERDÉS ${s.playerPaid} T.`;
      } else {
        addTenks(s.playerPaid, 'casino_holdem_tie');
        onToast('EMPATE');
        resultText = `EMPATE. TE DEVUELVEN ${s.playerPaid} TENKS.`;
      }
      return { ...s, phase: 'showdown', resultText };
    }
    return s;
  }, [onToast]);

  const playerAction = useCallback((action: 'fold' | 'check' | 'raise') => {
    setState((s) => {
      if (action === 'fold') {
        onToast('FOLD');
        return { ...s, phase: 'showdown', resultText: `TE FUISTE. PERDÉS ${s.playerPaid} TENKS.`, cpuLastAction: 'GANA' };
      }
      if (action === 'raise') {
        const ante = HOLDEM_ANTES[s.anteIndex];
        if (!spendTenks(ante, 'casino_holdem_raise')) {
          onToast('SIN TENKS PARA SUBIR');
          return { ...s, resultText: 'NO TENÉS TENKS PARA SUBIR.' };
        }
        const newPot = s.pot + ante * 2;
        const newPaid = s.playerPaid + ante;
        const cpuFolds = cpuDecideOnRaise(s.cpuHole, s.community, s.phase);
        if (cpuFolds) {
          addTenks(newPot, 'casino_holdem_win');
          onToast(`+${newPot} TENKS`);
          return { ...s, pot: newPot, playerPaid: newPaid, phase: 'showdown', resultText: `CPU FOLDEA. GANÁS ${newPot} TENKS!`, cpuLastAction: 'FOLD' };
        }
        return advancePhase({ ...s, pot: newPot, playerPaid: newPaid, cpuLastAction: 'CALL' });
      }
      return advancePhase({ ...s, cpuLastAction: 'CHECK' });
    });
  }, [cpuDecideOnRaise, onToast, advancePhase]);

  const HOLDEM_PHASES: HoldemPhase[] = ['ante', 'preflop', 'flop', 'turn', 'river', 'showdown'];
  const phaseLabels = ['ANTE', 'PRE-FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];
  const { phase, anteIndex, playerHole, cpuHole, community, pot, resultText, actionIndex, cpuLastAction } = state;
  const atShowdown = phase === 'showdown';
  const playerBest = phase !== 'ante' && playerHole.length === 2 ? bestAvailableHand(playerHole, community) : null;
  const cpuBest    = atShowdown && cpuHole.length === 2 ? bestAvailableHand(cpuHole, community) : null;
  const resultColor = atShowdown
    ? resultText.includes('GANASTE') ? S.green : resultText.includes('EMPATE') ? S.gold : S.red
    : S.gold;
  const winnerBorder = atShowdown && playerBest && cpuBest
    ? (comparePokerResults(playerBest, cpuBest) > 0 ? 'gold' : 'none') as 'gold' | 'none'
    : 'none';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontFamily: S.font, fontSize: 8, color: S.purple }}>POKER</span>
        <span style={{ fontFamily: S.font, fontSize: 7, color: S.gold }}>POT: {pot} T</span>
        <span style={{ fontFamily: S.font, fontSize: 7, color: S.muted }}>SALDO: {balance}</span>
      </div>

      <div style={{ display: 'flex', gap: 4, width: '100%' }}>
        {HOLDEM_PHASES.map((ph, idx) => (
          <div key={ph} style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: S.font,
            fontSize: 5,
            padding: '3px 0',
            background: ph === phase ? S.purple : 'rgba(10,10,16,0.8)',
            color: ph === phase ? S.white : 'rgba(255,255,255,0.25)',
            borderRadius: 2,
          }}>
            {phaseLabels[idx]}
          </div>
        ))}
      </div>

      <div style={{
        background: '#0b3d1f',
        border: '1px solid rgba(26,106,53,0.5)',
        borderRadius: 8,
        padding: 12,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ fontFamily: S.font, fontSize: 6, color: '#888', textAlign: 'center' }}>
          CPU {cpuLastAction ? `— ${cpuLastAction}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <CardFace card={cpuHole[0] ?? null} hidden={!atShowdown} highlight={atShowdown ? 'purple' : 'none'} />
          <CardFace card={cpuHole[1] ?? null} hidden={!atShowdown} highlight={atShowdown ? 'purple' : 'none'} />
        </div>
        {atShowdown && cpuBest && (
          <div style={{ fontFamily: S.font, fontSize: 5, color: '#9B6CF6', textAlign: 'center' }}>{cpuBest.label}</div>
        )}

        <div style={{ fontFamily: S.font, fontSize: 5, color: 'rgba(42,90,58,0.8)', textAlign: 'center' }}>COMUNIDAD</div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[0,1,2,3,4].map((i) => (
            <CardFace key={i} card={community[i] ?? null} hidden={false} highlight="none" />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: S.font, fontSize: 6, color: S.green }}>TU MANO</span>
          {playerBest && <span style={{ fontFamily: S.font, fontSize: 5, color: S.green }}>{playerBest.label}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <CardFace card={playerHole[0] ?? null} hidden={false} highlight={winnerBorder} />
          <CardFace card={playerHole[1] ?? null} hidden={false} highlight={winnerBorder} />
        </div>
      </div>

      <div style={{ fontFamily: S.font, fontSize: 8, color: resultColor, textAlign: 'center', lineHeight: 1.8 }}>
        {resultText}
      </div>

      {phase === 'ante' && (
        <>
          <div style={{ fontFamily: S.font, fontSize: 6, color: S.muted }}>ANTE</div>
          <BetChips bets={HOLDEM_ANTES} selected={anteIndex} onSelect={(idx) => setState((s) => ({ ...s, anteIndex: idx }))} color={S.purple} />
          <Btn label="REPARTIR" active onClick={startHand} color={S.purple} />
        </>
      )}
      {(phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river') && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {(['fold', 'check', 'raise'] as const).map((action, idx) => {
            const labels = ['FOLD', 'PASAR', `SUBIR +${HOLDEM_ANTES[anteIndex]}T`];
            const cols = [S.red, S.green, S.gold];
            return (
              <Btn
                key={action}
                label={labels[idx]}
                active={actionIndex === idx}
                color={cols[idx]}
                onClick={() => { setState((s) => ({ ...s, actionIndex: idx })); playerAction(action); }}
              />
            );
          })}
        </div>
      )}
      {phase === 'showdown' && (
        <Btn
          label="JUGAR OTRA"
          active
          onClick={() => setState({ phase: 'ante', anteIndex, playerHole: [], cpuHole: [], community: [], pot: 0, playerPaid: 0, deck: [], resultText: 'ELEGÍ TU ANTE Y REPARTÍ.', actionIndex: 1, cpuLastAction: '' })}
          color={S.purple}
        />
      )}
    </div>
  );
}

/* ─── Main overlay ──────────────────────────────────────────────────────────── */

export default function CasinoOverlay({ isMobile }: CasinoOverlayProps) {
  const [open, setOpen] = useState(false);
  const [activeGame, setActiveGame] = useState<GameId>('slots');
  const [balance, setBalance] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const off = eventBus.on(EVENTS.CASINO_OPEN, (payload: unknown) => {
      const p = payload as { game?: GameId } | null;
      const game: GameId = (p?.game && ['slots','roulette','blackjack','poker'].includes(p.game)) ? p.game : 'slots';
      setActiveGame(game);
      setBalance(getTenksBalance());
      setOpen(true);
    });
    const offClose = eventBus.on(EVENTS.CASINO_CLOSE, () => setOpen(false));
    return () => { off(); offClose(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const off = eventBus.on(EVENTS.TENKS_CHANGED, () => setBalance(getTenksBalance()));
    return off;
  }, [open]);

  const handleClose = useCallback(() => {
    setOpen(false);
    eventBus.emit(EVENTS.CASINO_CLOSE);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  if (!open) return null;

  const accent = GAME_ACCENT[activeGame];
  const GAMES: GameId[] = ['slots', 'roulette', 'blackjack', 'poker'];

  const maxW = isMobile ? '100%' : 540;

  return (
    <div
      className="ww-overlay absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)', zIndex: 800 }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {toast && (
        <div style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: S.font,
          fontSize: 9,
          color: '#000',
          background: S.gold,
          padding: '6px 16px',
          zIndex: 810,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}

      <div
        className="ww-modal"
        style={{
          width: maxW,
          maxHeight: isMobile ? '96vh' : '90vh',
          overflowY: 'auto',
          background: S.bg,
          border: `2px solid ${accent}`,
          boxShadow: `0 0 40px ${accent}33, 0 24px 60px rgba(0,0,0,0.8)`,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${accent}44`,
          background: 'rgba(0,0,0,0.4)',
          flexShrink: 0,
        }}>
          <div style={{ fontFamily: S.font, fontSize: 10, color: accent, letterSpacing: '0.06em' }}>
            CASINO
          </div>
          <div style={{ fontFamily: S.font, fontSize: 7, color: S.gold }}>
            {balance} TENKS
          </div>
          <button
            onClick={handleClose}
            style={{
              fontFamily: S.font,
              fontSize: 8,
              background: 'transparent',
              border: `1px solid rgba(255,255,255,0.2)`,
              color: S.muted,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          {GAMES.map((game) => (
            <button
              key={game}
              onClick={() => setActiveGame(game)}
              style={{
                flex: 1,
                fontFamily: S.font,
                fontSize: isMobile ? 5 : 7,
                padding: '10px 4px',
                background: activeGame === game ? `${GAME_ACCENT[game]}18` : 'transparent',
                color: activeGame === game ? GAME_ACCENT[game] : S.muted,
                border: 'none',
                borderBottom: `2px solid ${activeGame === game ? GAME_ACCENT[game] : 'transparent'}`,
                cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
            >
              {GAME_LABELS[game]}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px 16px', overflowY: 'auto', flex: 1 }}>
          {activeGame === 'slots'     && <SlotsPanel     balance={balance} onToast={showToast} />}
          {activeGame === 'roulette'  && <RoulettePanel  balance={balance} onToast={showToast} />}
          {activeGame === 'blackjack' && <BlackjackPanel balance={balance} onToast={showToast} />}
          {activeGame === 'poker'     && <PokerPanel     balance={balance} onToast={showToast} />}
        </div>

        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontFamily: S.fontBody,
          fontSize: 7,
          color: 'rgba(255,255,255,0.2)',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          ESC / ✕ PARA CERRAR
        </div>
      </div>
    </div>
  );
}
