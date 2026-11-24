import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrder, getOrderFilters, listOrders, type OrderFilters, type OrderListItem, type OrderQuery } from '../api/orders';
import { ApiError } from '../api/client';

export type OrdersQuery = Omit<OrderQuery, 'page' | 'pageSize'>;

interface State {
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

const INITIAL: State = { items: [], total: 0, pages: 0, loading: true, loadingMore: false, error: null, moreError: null };

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
export function useOrders(query: OrdersQuery, pageSize: number) {
  const [state, setState] = useState<State>(INITIAL);
  const [reloadKey, setReloadKey] = useState(0);
  const key = JSON.stringify(query);

  const stateRef = useRef(state);
  stateRef.current = state;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    moreController.current?.abort();
    const controller = new AbortController();
    const current = ++generation.current;
    inFlight.current = true;
    setState(INITIAL);
    listOrders({ ...(JSON.parse(key) as OrdersQuery), page: 1, pageSize }, controller.signal)
      .then((page) => {
        if (generation.current !== current) return;
        setState({ items: page.items, total: page.total, pages: 1, loading: false, loadingMore: false, error: null, moreError: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation.current !== current) return;
        setState({ ...INITIAL, loading: false, error: messageOf(error, 'Не удалось загрузить заказы. Попробуйте ещё раз.') });
      })
      .finally(() => {
        if (generation.current === current) inFlight.current = false;
      });
    return () => { controller.abort(); moreController.current?.abort(); generation.current++; };
  }, [key, reloadKey, pageSize]);

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
    try {
      const details = await getOrder(id);
      setState((previous) => ({ ...previous, items: previous.items.map((item) => (item.id === id ? details.order : item)) }));
      return details.order;
    } catch (error) {
      // Заказ больше не подходит под правила (или в архиве): убираем его из списка.
      if (error instanceof ApiError && error.status === 404) {
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
export function useOrderFilters(refreshKey = 0) {
  const [filters, setFilters] = useState<OrderFilters | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getOrderFilters(controller.signal)
      .then(setFilters)
      // Без справочников фильтры просто пустые: поиск и таблица продолжают работать. Уже загруженные при сбое не стираем.
      .catch(() => {
        if (!controller.signal.aborted) setFilters((previous) => previous ?? { statuses: [], warehouses: [], clients: [], suppliers: [] });
      });
    return () => controller.abort();
  }, [refreshKey]);

  return filters;
}
