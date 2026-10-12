import type { OrderQuery } from '../api/orders';

/** Сколько заказов подгружается за раз. */
export const PAGE_SIZE = 50;

/** Фильтры страницы заказов. Значения строками: так они лежат в адресе и в селектах. */
export interface OrderFilterState {
  search: string;
  ozonStatus: string;
  warehouseId: string;
  clientId: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: OrderFilterState = { search: '', ozonStatus: '', warehouseId: '', clientId: '', from: '', to: '' };

const KEYS: Array<[keyof OrderFilterState, string]> = [
  ['search', 'search'],
  ['ozonStatus', 'ozonStatus'],
  ['warehouseId', 'warehouse'],
  ['clientId', 'client'],
  ['from', 'from'],
  ['to', 'to']
];

/** Фильтры живут в адресе: ссылку можно отправить коллеге, «Назад» возвращает прежний вид. */
export function readFilters(params: URLSearchParams): OrderFilterState {
  const filters = { ...EMPTY_FILTERS };
  for (const [field, key] of KEYS) filters[field] = params.get(key) ?? '';
  return filters;
}

export function writeParams(filters: OrderFilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, key] of KEYS) {
    const value = filters[field].trim();
    if (value) params.set(key, value);
  }
  return params;
}

const toId = (value: string): number | undefined => {
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : undefined;
};

export function toQuery(filters: OrderFilterState): Omit<OrderQuery, 'page' | 'pageSize'> {
  return {
    search: filters.search.trim() || undefined,
    ozonStatus: filters.ozonStatus.trim() || undefined,
    warehouseId: toId(filters.warehouseId),
    clientId: toId(filters.clientId),
    from: filters.from || undefined,
    to: filters.to || undefined
  };
}

export const hasActiveFilters = (filters: OrderFilterState) => Object.values(filters).some((value) => value.trim() !== '');
