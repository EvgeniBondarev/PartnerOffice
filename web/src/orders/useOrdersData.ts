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

  useEffect(() => {
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
    return () => controller.abort();
  }, [key, reloadKey, pageSize]);

  const hasMore = state.items.length < state.total;

  const loadMore = useCallback(() => {
    const snapshot = stateRef.current;
    if (inFlight.current || snapshot.loading || snapshot.error || snapshot.items.length >= snapshot.total) return;
    const current = generation.current;
    inFlight.current = true;
    setState((previous) => ({ ...previous, loadingMore: true, moreError: null }));
    listOrders({ ...(JSON.parse(key) as OrdersQuery), page: snapshot.pages + 1, pageSize })
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
    } catch (error) {
      // Заказ больше не подходит под правила (или в архиве): убираем его из списка.
      if (error instanceof ApiError && error.status === 404) {
        setState((previous) => ({ ...previous, items: previous.items.filter((item) => item.id !== id), total: Math.max(0, previous.total - 1) }));
      }
    }
  }, []);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  return { ...state, hasMore, loadMore, refreshOrder, reload };
}

/** Значения для фильтров: только статусы, склады и клиенты среди видимых партнёру заказов. */
export function useOrderFilters() {
  const [filters, setFilters] = useState<OrderFilters | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getOrderFilters(controller.signal)
      .then(setFilters)
      // Без справочников фильтры просто пустые: поиск и таблица продолжают работать.
      .catch(() => setFilters({ statuses: [], warehouses: [], clients: [] }));
    return () => controller.abort();
  }, []);

  return filters;
}
