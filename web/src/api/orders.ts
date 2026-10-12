import { request, requestFile } from './client';

export interface FilterOption {
  id: number;
  name: string;
}

export interface OrderFilters {
  statuses: FilterOption[];
  /** Статусы, которые партнёр реально видит в колонке Ozon. */
  ozonStatuses: string[];
  warehouses: FilterOption[];
  clients: FilterOption[];
}

export interface OrderSuggestion {
  id: number;
  shipmentNumber: string | null;
  productName: string | null;
  article: string | null;
  trackingNumber: string | null;
  scanit: string | null;
  ozonStatus: string | null;
}

/** Строка списка заказов. Закупочные цены, поставщик, себестоимость и прибыль партнёру не отдаются. */
export interface OrderListItem {
  id: number;
  shipmentNumber: string | null;
  productName: string | null;
  article: string | null;
  brand: string | null;
  quantity: number | null;
  price: number | null;
  imageUrl: string | null;
  statusId: number | null;
  status: string | null;
  ozonStatus: string | null;
  warehouseId: number | null;
  warehouse: string | null;
  clientId: number | null;
  client: string | null;
  /** OZON, YANDEX… Действия (отгрузка, этикетка) есть только у заказов Ozon. */
  marketplace: string | null;
  processingDate: string | null;
  shippingDate: string | null;
  trackingNumber: string | null;
  hasLabel: boolean;
  /** Штрихкод ScanIt новой этикетки FBS Ozon; null, пока Ozon его не отдал. */
  scanit: string | null;
}

export interface OrderPage {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderDetails {
  order: OrderListItem;
  deliveryCity: string | null;
  barcode: string | null;
  comment: string | null;
  lastStatusChangeDate: string | null;
  /** Штрихкод ScanIt новой этикетки FBS Ozon. */
  scanit: string | null;
}

export interface OrderQuery {
  search?: string;
  ozonStatus?: string;
  warehouseId?: number;
  clientId?: number;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface CountryRequirement {
  productId: number;
  productName: string;
  offerId: string;
}

export interface ExemplarRequirement {
  shipmentNumber: string;
  productId: number;
  productName: string;
  offerId: string;
  exemplarId: number;
  index: number;
  quantity: number;
  needsMandatoryMark: boolean;
  needsGtd: boolean;
  needsRnpt: boolean;
  /** Требования, которые форма не закрывает (вес, IMEI, УИН): заполняются в кабинете Ozon. */
  unsupported: string[];
}

export interface ShipRequirements {
  countries: CountryRequirement[];
  exemplars: ExemplarRequirement[];
}

export interface CountryOption {
  name: string;
  countryIsoCode: string;
}

export interface ExemplarInput {
  productId: number;
  exemplarId: number;
  mandatoryMark?: string | null;
  gtd?: string | null;
  isGtdAbsent: boolean;
  rnpt?: string | null;
  isRnptAbsent: boolean;
}

export interface ActionResult {
  success: boolean;
  message: string;
  reasons?: string[] | null;
  ozonStatus?: string | null;
  ozonStatusName?: string | null;
}

const base = '/partner-api/orders';

export function buildOrdersQuery(query: OrderQuery): string {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.ozonStatus) params.set('ozonStatus', query.ozonStatus);
  if (query.warehouseId) params.set('warehouseId', String(query.warehouseId));
  if (query.clientId) params.set('clientId', String(query.clientId));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  return params.toString();
}

export const listOrders = (query: OrderQuery, signal?: AbortSignal) =>
  request<OrderPage>(`${base}?${buildOrdersQuery(query)}`, { signal });

export const getOrderFilters = (signal?: AbortSignal) => request<OrderFilters>(`${base}/filters`, { signal });

export const getOrderSuggestions = (query: string, signal?: AbortSignal) =>
  request<OrderSuggestion[]>(`${base}/suggestions?q=${encodeURIComponent(query)}&limit=10`, { signal });

export const getOrder = (id: number, signal?: AbortSignal) => request<OrderDetails>(`${base}/${id}`, { signal });

export const getRequirements = (id: number) => request<ShipRequirements>(`${base}/${id}/ozon/requirements`);

export const getCountries = (id: number, search?: string) =>
  request<CountryOption[]>(`${base}/${id}/ozon/countries${search ? `?search=${encodeURIComponent(search)}` : ''}`);

export const saveCountries = (id: number, selections: Array<{ productId: number; countryIsoCode: string }>) =>
  request<ActionResult>(`${base}/${id}/ozon/countries`, { method: 'PUT', body: JSON.stringify({ selections }) });

export const saveExemplars = (id: number, exemplars: ExemplarInput[]) =>
  request<ActionResult>(`${base}/${id}/ozon/exemplars`, { method: 'PUT', body: JSON.stringify({ exemplars }) });

/** Отгрузка: вызов Ozon API по заказу. */
export const shipOrder = (id: number) => request<ActionResult>(`${base}/${id}/ship`, { method: 'POST' });

/** Печать этикетки: PDF, готовая из хранилища либо полученная у Ozon. */
export async function printLabel(id: number): Promise<{ blob: Blob; generated: boolean; autoShipped: boolean }> {
  const { blob, headers } = await requestFile(`${base}/${id}/label`, { method: 'POST' });
  return { blob, generated: headers.get('X-Label-Generated') === 'true', autoShipped: headers.get('X-Auto-Shipped') === 'true' };
}
