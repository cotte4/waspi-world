import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { CatalogItem } from '@/src/game/config/catalog';
import { CATALOG } from '@/src/game/config/catalog';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { track } from '@/src/lib/analytics';
import { normalizePlayerState, type PlayerState } from '@/src/lib/playerState';
import { getInitialCheckoutState } from '@/app/play/lib/playPageStorage';
import type { OrderRow, ShopTab } from '@/app/play/types';

type UsePlayPageShopOptions = {
  tokenRef: MutableRefObject<string | null>;
  applyPlayerState: (player: PlayerState) => void;
  refreshPlayerState: () => Promise<void>;
  isAuthenticated: boolean;
  activeScene: string;
};

export function usePlayPageShop({
  tokenRef,
  applyPlayerState,
  refreshPlayerState,
  isAuthenticated,
  activeScene,
}: UsePlayPageShopOptions) {
  const initialCheckout = useMemo(() => getInitialCheckoutState(), []);
  const [shopOpen, setShopOpen] = useState(initialCheckout.open);
  const [shopSource, setShopSource] = useState(initialCheckout.open ? 'checkout_return' : '');
  const [shopTab, setShopTab] = useState<ShopTab>(initialCheckout.tab);
  const [shopItems, setShopItems] = useState<CatalogItem[]>([]);
  const [checkoutBusyId, setCheckoutBusyId] = useState<string | null>(null);
  const [shopStatus, setShopStatus] = useState(initialCheckout.status);
  const [selectedSize, setSelectedSize] = useState('');
  const [checkoutRedirecting, setCheckoutRedirecting] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  // Purchasable utility cosmetics (CIG, BALL) that appear in the virtual shop tab
  const PURCHASABLE_UTILITY_IDS = new Set(['UTIL-CIG-01', 'UTIL-BALL-01']);

  const clothingItems = useMemo(
    () => (shopItems.length ? shopItems : CATALOG).filter(
      (item) => item.priceTenks > 0 && (item.slot !== 'utility' || PURCHASABLE_UTILITY_IDS.has(item.id))
    ),
    [shopItems] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const openShop = useCallback((source = '') => {
    setShopSource(source);
    setShopOpen(true);
  }, []);

  const closeShop = useCallback(() => {
    setShopSource('');
    setShopOpen(false);
    setOrdersLoaded(false);
    setOrders([]);
    eventBus.emit(EVENTS.SHOP_CLOSE);
  }, []);

  const buyShopItem = useCallback(async (item: CatalogItem) => {
    if (!tokenRef.current) {
      setShopStatus('Inicia sesion para comprar ropa con TENKS.');
      return;
    }

    setCheckoutBusyId(item.id);
    setShopStatus('');

    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ itemId: item.id }),
    }).catch(() => null);

    if (!res?.ok) {
      const json = await res?.json().catch(() => null);
      setCheckoutBusyId(null);
      setShopStatus(json?.error ?? 'No pude completar la compra.');
      return;
    }

    const json = await res.json();
    if (json.player) {
      applyPlayerState(normalizePlayerState(json.player as PlayerState));
    }
    track('shop_purchase', { item_id: item.id, price_tenks: item.priceTenks });
    setCheckoutBusyId(null);
    setShopStatus(
      (json.notice as string | undefined)
      ?? `${item.name} comprado por ${item.priceTenks.toLocaleString('es-AR')} TENKS y equipado.`
    );
  }, [applyPlayerState, tokenRef]);

  const loadOrders = useCallback(async () => {
    if (!tokenRef.current || ordersLoading) return;
    setOrdersLoading(true);
    try {
      const res = await fetch('/api/player/orders', {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (!res.ok) return;
      const data = await res.json() as { orders?: OrderRow[] };
      setOrders(data.orders ?? []);
      setOrdersLoaded(true);
    } catch {
      // silent
    } finally {
      setOrdersLoading(false);
    }
  }, [ordersLoading, tokenRef]);

  const startStripeCheckout = useCallback(async (
    type: 'product' | 'tenks_pack',
    payload: { itemId?: string; size?: string; packId?: string }
  ) => {
    if (!tokenRef.current) {
      setShopStatus('Inicia sesion para comprar.');
      return;
    }
    setCheckoutRedirecting(true);
    setShopStatus('');

    const body = type === 'product'
      ? { type: 'product', itemId: payload.itemId, size: payload.size }
      : { type: 'tenks_pack', packId: payload.packId };

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!res?.ok) {
      const json = await res?.json().catch(() => null);
      setCheckoutRedirecting(false);
      setShopStatus((json as { error?: string } | null)?.error ?? 'No se pudo iniciar el checkout.');
      return;
    }

    const json = await res.json() as { url?: string };
    if (json.url) {
      window.location.href = json.url;
    } else {
      setCheckoutRedirecting(false);
      setShopStatus('Error al obtener la URL de pago.');
    }
  }, [tokenRef]);

  useEffect(() => {
    if (shopTab === 'orders' && !ordersLoaded && isAuthenticated) {
      void loadOrders();
    }
  }, [shopTab, ordersLoaded, isAuthenticated, loadOrders]);

  useEffect(() => {
    if (shopSource !== 'store_interior') return;
    if (activeScene === 'StoreInterior') return;
    const closeTimer = window.setTimeout(() => {
      closeShop();
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [activeScene, closeShop, shopSource]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await fetch('/api/shop').catch(() => null);
      if (!res?.ok) return;
      const json = await res.json();
      if (!active) return;
      const items = (json.items ?? []) as CatalogItem[];
      setShopItems(items);
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!initialCheckout.status) return;
    const delays = [1500, 5000, 12000];
    const timers = delays.map((delay) => window.setTimeout(() => {
      void refreshPlayerState();
    }, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [initialCheckout.status, refreshPlayerState]);

  return {
    buyShopItem,
    checkoutBusyId,
    checkoutRedirecting,
    closeShop,
    clothingItems,
    loadOrders,
    openShop,
    orders,
    ordersLoaded,
    ordersLoading,
    selectedSize,
    setCheckoutRedirecting,
    setSelectedSize,
    setShopOpen,
    setShopSource,
    setShopStatus,
    setShopTab,
    shopOpen,
    shopSource,
    shopStatus,
    shopTab,
    startStripeCheckout,
  };
}
