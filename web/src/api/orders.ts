import { request, requestFile } from './client';

export interface FilterOption {
  id: number;
  name: string;
  /** Сколько видимых партнёру заказов в этом значении (для статусов). Старый сервер поле не отдаёт. */
  count?: number;
}

export interface OrderFilters {
  /** Статусы Studio2 среди видимых партнёру заказов, со счётчиками. */
  statuses: FilterOption[];
  groupCounts?: { work: number; sent: number; ready: number };
  /** Статусы Ozon: фильтр по ним больше не показывается, поле оставлено для совместимости. */
  ozonStatuses?: string[];
  warehouses: FilterOption[];
  clients: FilterOption[];
  /** Поставщики среди видимых партнёру заказов. Старый сервер поле не отдаёт. */
  suppliers?: FilterOption[];
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

/** Строка списка заказов. Из данных поставщика — только название; закупочные цены, себестоимость и прибыль партнёру не отдаются. */
export interface OrderListItem {
  id: number;
  shipmentNumber: string | null;
  productName: string | null;
  article: string | null;
  brand: string | null;
  quantity: number | null;
  price: number | null;
  imageUrl: string | null;
  /** Статус Studio2: id и человекочитаемое имя («Принят на складе», «Отгружен реализатором»…). */
  statusId: number | null;
  status: string | null;
  /** Статус Ozon для списка и карточки заказа. */
  ozonStatus: string | null;
  ozonStatusColor?: string | null;
  /** Какую кнопку статуса Studio2 показать: «Принят» (accept), «Отгрузить» (ship) или никакой. */
  statusAction?: 'accept' | 'ship' | null;
  partnerShipmentConfirmed?: boolean;
  /** Доступность действия определяется сервером с учётом прав и состояния заказа. */
  canReturnToShelf?: boolean;
  /**
   * Возвраты на «Полке» с тем же артикулом: свободно штук и зарезервировано под этот заказ.
   * Только у заказов в работе, которые не отменены; нет на полке — поля нет.
   */
  shelf?: { available: number; reserved: number } | null;
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
  /** Поставщик заказа в Studio2 (название), как в возвратах; null — не назначен. */
  supplier?: string | null;
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

export type OrderGroup = 'work' | 'sent' | 'ready';

export interface OrderQuery {
  group?: OrderGroup;
  search?: string;
  /** Статусы Studio2: одно число или несколько через запятую («21,24»). */
  statusId?: number | string;
  /** Несколько значений — строка через запятую: «1,2». */
  warehouseId?: number | string;
  clientId?: number | string;
  supplierId?: number | string;
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
  if (query.group) params.set('group', query.group);
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.statusId) params.set('statusId', String(query.statusId));
  if (query.warehouseId) params.set('warehouseId', String(query.warehouseId));
  if (query.clientId) params.set('clientId', String(query.clientId));
  if (query.supplierId) params.set('supplierId', String(query.supplierId));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  return params.toString();
}

export const listOrders = (query: OrderQuery, signal?: AbortSignal) =>
  request<OrderPage>(`${base}?${buildOrdersQuery(query)}`, { signal });

export const getOrderFilters = (signal?: AbortSignal, group?: OrderGroup) => request<OrderFilters>(`${base}/filters${group ? `?group=${group}` : ''}`, { signal });

export const getOrderSuggestions = (query: string, signal?: AbortSignal, group?: OrderGroup) =>
  request<OrderSuggestion[]>(`${base}/suggestions?q=${encodeURIComponent(query)}&limit=10${group ? `&group=${group}` : ''}`, { signal });

export const getOrder = (id: number, signal?: AbortSignal) => request<OrderDetails>(`${base}/${id}`, { signal });

export const getRequirements = (id: number) => request<ShipRequirements>(`${base}/${id}/ozon/requirements`);

export const getCountries = (id: number, search?: string) =>
  request<CountryOption[]>(`${base}/${id}/ozon/countries${search ? `?search=${encodeURIComponent(search)}` : ''}`);

export const saveCountries = (id: number, selections: Array<{ productId: number; countryIsoCode: string }>) =>
  request<ActionResult>(`${base}/${id}/ozon/countries`, { method: 'PUT', body: JSON.stringify({ selections }) });

export const saveExemplars = (id: number, exemplars: ExemplarInput[]) =>
  request<ActionResult>(`${base}/${id}/ozon/exemplars`, { method: 'PUT', body: JSON.stringify({ exemplars }) });

/** «Принят»: статус Studio2 → «Принят на складе». Ответ — обновлённая строка списка. */
export const acceptOrder = (id: number) => request<OrderListItem>(`${base}/${id}/status/accept`, { method: 'POST' });

/** «Отгрузить»: статус Studio2 → «Отгружен реализатором». В Ozon ничего не уходит. */
export const shipOrderStatus = (id: number) => request<OrderListItem>(`${base}/${id}/status/ship`, { method: 'POST' });

/** Ревизия видимых партнёру заказов: меняется при любом их изменении, по ней список тихо перечитывается. */
export const getOrdersRevision = (signal?: AbortSignal) => request<{ revision: string }>(`${base}/revision`, { signal });

/** Печать этикетки: PDF, готовая из хранилища либо полученная у Ozon. */
export async function printLabel(id: number): Promise<{ blob: Blob; generated: boolean; autoShipped: boolean }> {
  const { blob, headers } = await requestFile(`${base}/${id}/label`, { method: 'POST' });
  return { blob, generated: headers.get('X-Label-Generated') === 'true', autoShipped: headers.get('X-Auto-Shipped') === 'true' };
}

/** Передать отменённый заказ на разбор возвратов. */
export const returnOrderToShelf = (id: number) => request<OrderListItem>(`${base}/${id}/return-to-shelf`, { method: 'POST' });
