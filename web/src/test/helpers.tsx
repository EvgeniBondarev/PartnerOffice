import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthContext';
import type { OrderListItem } from '../api/orders';

export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Файл вместо JSON (PDF этикетки). */
  blob?: Blob;
}
export type Handler = (init?: RequestInit, url?: string) => MockResponse | Promise<MockResponse>;

export interface Call {
  url: string;
  method: string;
  body: unknown;
}

/**
 * Подменяет fetch. Ключ обработчика — точный адрес или префикс со звёздочкой на конце ('/partner-api/orders?*').
 * Возвращает журнал вызовов: по нему тесты проверяют, что и с какими данными ушло на сервер.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const exact = `${method} ${url}`;
      // Ключ без метода относится только к GET: иначе GET и PUT одного адреса путались бы.
      const key = Object.keys(handlers).find((k) => k === exact || (method === 'GET' && k === url) || (k.endsWith('*') && (method === 'GET' ? url.startsWith(k.slice(0, -1)) : exact.startsWith(k.slice(0, -1)))));
      const handler: Handler = (key ? handlers[key] : undefined) ?? (() => ({ status: 404 }));
      const { status, body, headers, blob } = await handler(init, url);
      if (blob) return new Response(blob, { status, headers });
      return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers });
    })
  );
  return calls;
}

export const json = (body: unknown, status = 200): MockResponse => ({ status, body });

export function renderApp(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}

export const PARTNER_FULL = { id: 1, name: 'ООО Казань', login: 'kazan', permissions: [1, 2] }; // печать + отгрузка
export const PARTNER_VIEW_ONLY = { id: 1, name: 'ООО Казань', login: 'kazan', permissions: [] };

export function order(id: number, patch: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id,
    shipmentNumber: `0123-${String(id).padStart(4, '0')}-1`,
    productName: `Товар ${id}`,
    article: `ART${id}`,
    brand: 'Bosch',
    quantity: 2,
    price: 1250,
    imageUrl: null,
    statusId: 1,
    status: 'Новый',
    ozonStatus: 'Ожидает отгрузки',
    warehouseId: 1,
    warehouse: 'Москва',
    clientId: 1,
    client: 'Interparts RU',
    marketplace: 'OZON',
    processingDate: '2026-10-10T08:00:00',
    shippingDate: '2099-10-12T11:00:00',
    trackingNumber: null,
    hasLabel: false,
    scanit: `ii5001431${String(id).padStart(4, '0')}`,
    ...patch
  };
}

export const ordersPage = (items: OrderListItem[], total = items.length, page = 1) => json({ items, total, page, pageSize: 50 });

export const EMPTY_FILTERS_RESPONSE = json({
  statuses: [{ id: 1, name: 'Новый' }, { id: 2, name: 'Отгружен' }],
  warehouses: [{ id: 1, name: 'Москва' }],
  clients: [{ id: 1, name: 'Interparts RU' }]
});

/** Минимальный набор ответов для открытой страницы заказов под партнёром с заданными правами. */
export function ordersApi(partner: typeof PARTNER_FULL, items: OrderListItem[], extra: Record<string, Handler> = {}, total = items.length) {
  return mockApi({
    '/partner-api/auth/me': () => json(partner),
    '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
    '/partner-api/orders?*': () => ordersPage(items, total),
    ...extra
  });
}
