import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrder, getOrderFilters, listOrders, type OrderFilters, type OrderListItem, type OrderQuery } from '../api/orders';
import { ApiError } from '../api/client';
import { ordersCacheEpoch, readOrderFilters, readOrders, rememberOrderFilters, rememberOrders } from './ordersCache';

export type OrdersQuery = Omit<OrderQuery, 'page' | 'pageSize'>;

interface State {
  cacheKey: string;
  items: OrderListItem[];
  total: number;
  /** Сколько страниц уже загружено. */
  pages: number;
  /** Первая загрузка набора (после смены фильтров). */
  loading: boolean;
  /** Подгрузка следующей порции при прокрутке. */
  loadingMore: boolean;
  error: string | null;
  moreError: string | null;
}

const INITIAL: State = { cacheKey: '', items: [], total: 0, pages: 0, loading: true, loadingMore: false, error: null, moreError: null };

const messageOf = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/** Заказ, у которого после тихого перечитывания сменился статус Studio2. */
export interface StatusChange {
  order: OrderListItem;
  previous: string | null;
}

/**
 * Заказы с подгрузкой: первая порция при смене фильтров, следующие по мере прокрутки.
 * Устаревший ответ не перезаписывает свежий; строки, пришедшие дважды (список сдвинулся), не дублируются.
 */
export function useOrders(query: OrdersQuery, pageSize: number, partnerId: number) {
  const key = JSON.stringify(query);
  const cacheKey = JSON.stringify([partnerId, pageSize, key]);
  const session = useRef(ordersCacheEpoch());
  const fromCache = (id: string): State => {
    const hit = readOrders(id);
    return hit ? { ...INITIAL, ...hit, cacheKey: id, loading: false } : { ...INITIAL, cacheKey: id };
  };
  const [storedState, setState] = useState<State>(() => fromCache(cacheKey));
  const state = storedState.cacheKey === cacheKey ? storedState : fromCache(cacheKey);
  const [reloadKey, setReloadKey] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!storedState.loading && storedState.pages > 0 && !storedState.error)
      rememberOrders(session.current, storedState.cacheKey, { items: storedState.items, total: storedState.total, pages: storedState.pages });
  }, [storedState]);

  useEffect(() => {
    moreController.current?.abort();
    const controller = new AbortController();
    const current = ++generation.current;
    inFlight.current = true;
    const hit = readOrders(cacheKey);
    setState(fromCache(cacheKey));
    const pages = hit?.pages ?? 1;
    Promise.all(Array.from({ length: pages }, (_, index) =>
      listOrders({ ...(JSON.parse(key) as OrdersQuery), page: index + 1, pageSize }, controller.signal)))
      .then((results) => {
        if (controller.signal.aborted || generation.current !== current || session.current !== ordersCacheEpoch()) return;
        const seen = new Set<number>();
        const items = results.flatMap(page => page.items).filter(item => !seen.has(item.id) && !!seen.add(item.id));
        setState({ cacheKey, items, total: results[0].total, pages, loading: false, loadingMore: false, error: null, moreError: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation.current !== current || session.current !== ordersCacheEpoch()) return;
        if (!hit) setState({ ...INITIAL, cacheKey, loading: false, error: messageOf(error, 'Не удалось загрузить заказы. Попробуйте ещё раз.') });
      })
      .finally(() => {
        if (generation.current === current) inFlight.current = false;
      });
    return () => { controller.abort(); moreController.current?.abort(); generation.current++; };
  }, [cacheKey, key, reloadKey, pageSize]);

  const hasMore = state.items.length < state.total;

  const loadMore = useCallback(() => {
    const snapshot = stateRef.current;
    if (inFlight.current || snapshot.loading || snapshot.error || snapshot.items.length >= snapshot.total) return;
    const current = generation.current;
    const controller = new AbortController();
    moreController.current = controller;
    inFlight.current = true;
    setState((previous) => ({ ...previous, loadingMore: true, moreError: null }));
    listOrders({ ...(JSON.parse(key) as OrdersQuery), page: snapshot.pages + 1, pageSize }, controller.signal)
      .then((page) => {
        if (generation.current !== current) return;
        setState((previous) => {
          const seen = new Set(previous.items.map((item) => item.id));
          return {
            ...previous,
            items: [...previous.items, ...page.items.filter((item) => !seen.has(item.id))],
            total: page.total,
            pages: previous.pages + 1,
            loadingMore: false
          };
        });
      })
      .catch((error: unknown) => {
        if (generation.current !== current) return;
        setState((previous) => ({ ...previous, loadingMore: false, moreError: messageOf(error, 'Не удалось подгрузить заказы.') }));
      })
      .finally(() => {
        if (generation.current === current) inFlight.current = false;
      });
  }, [key, pageSize]);

  /** Заказ изменился (отгрузка, этикетка): перечитываем только его строку, прокрутка и подгруженные страницы остаются. */
  const refreshOrder = useCallback(async (id: number) => {
    const current = generation.current;
    try {
      const details = await getOrder(id);
      if (generation.current !== current || session.current !== ordersCacheEpoch()) return null;
      setState((previous) => ({ ...previous, items: previous.items.map((item) => (item.id === id ? details.order : item)) }));
      return details.order;
    } catch (error) {
      // Заказ больше не подходит под правила (или в архиве): убираем его из списка.
      if (generation.current === current && session.current === ordersCacheEpoch() && error instanceof ApiError && error.status === 404) {
        setState((previous) => ({ ...previous, items: previous.items.filter((item) => item.id !== id), total: Math.max(0, previous.total - 1) }));
      }
      return null;
    }
  }, []);

  /** Сервер вернул обновлённую строку (смена статуса): подставляем её как есть. */
  const replaceOrder = useCallback((order: OrderListItem) => {
    setState((previous) => ({ ...previous, items: previous.items.map((item) => (item.id === order.id ? order : item)) }));
  }, []);

  /**
   * Тихо перечитать уже загруженные порции: без скелетона, прокрутка и число порций сохраняются.
   * Если за это время сменились фильтры или подгрузилась ещё порция, ответ отбрасывается (следующий опрос повторит).
   * Возвращает заказы, у которых сменился статус Studio2; null — перечитать не удалось или ответ устарел.
   */
  const refreshQuietly = useCallback(async (): Promise<StatusChange[] | null> => {
    const snapshot = stateRef.current;
    if (inFlight.current || snapshot.loading || snapshot.error || snapshot.pages === 0) return null;
    const current = generation.current;
    const pages = snapshot.pages;
    const query = JSON.parse(key) as OrdersQuery;
    let results;
    try {
      results = await Promise.all(Array.from({ length: pages }, (_, index) => listOrders({ ...query, page: index + 1, pageSize })));
    } catch {
      return null; // сеть моргнула: список остаётся как был, следующий опрос попробует снова
    }
    const latest = stateRef.current;
    if (generation.current !== current || latest.pages !== pages || inFlight.current) return null;

    const seen = new Set<number>();
    const items = results.flatMap((page) => page.items).filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
    const before = new Map(latest.items.map((item) => [item.id, item]));
    const changes: StatusChange[] = [];
    for (const item of items) {
      const old = before.get(item.id);
      if (old && (old.statusId !== item.statusId || old.status !== item.status)) changes.push({ order: item, previous: old.status });
    }
    const total = results.at(-1)?.total ?? latest.total;
    setState((previous) => ({ ...previous, items, total, moreError: null }));
    return changes;
  }, [key, pageSize]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  return { ...state, hasMore, loadMore, refreshOrder, replaceOrder, refreshQuietly, reload };
}

/**
 * Значения для фильтров: только статусы, склады, клиенты и поставщики среди видимых партнёру заказов.
 * refreshKey меняется при смене ревизии заказов: счётчики статусов перечитываются, прежние значения остаются на экране.
 */
export function useOrderFilters(partnerId: number, refreshKey = 0) {
  const session = useRef(ordersCacheEpoch());
  const [stored, setStored] = useState<{ partnerId: number; value: OrderFilters | null }>(() => ({ partnerId, value: readOrderFilters(partnerId) ?? null }));
  const filters = stored.partnerId === partnerId ? stored.value : readOrderFilters(partnerId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    getOrderFilters(controller.signal)
      .then(value => {
        if (controller.signal.aborted || session.current !== ordersCacheEpoch()) return;
        rememberOrderFilters(session.current, partnerId, value);
        setStored({ partnerId, value });
      })
      // Без справочников фильтры просто пустые: поиск и таблица продолжают работать. Уже загруженные при сбое не стираем.
      .catch(() => {
        if (!controller.signal.aborted && session.current === ordersCacheEpoch()) setStored((previous) => previous.partnerId === partnerId && previous.value ? previous : { partnerId, value: readOrderFilters(partnerId) ?? { statuses: [], warehouses: [], clients: [], suppliers: [] } });
      });
    return () => controller.abort();
  }, [partnerId, refreshKey]);

  return filters;
}
