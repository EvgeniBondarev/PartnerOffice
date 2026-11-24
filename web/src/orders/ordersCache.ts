import type { OrderFilters, OrderListItem } from '../api/orders';

type CachedList = { items: OrderListItem[]; total: number; pages: number };
const lists = new Map<string, CachedList>();
const filters = new Map<number, OrderFilters>();
const LIMIT = 40;
let epoch = 0;

export const ordersCacheEpoch = () => epoch;
export function clearOrdersCache() {
  epoch++;
  lists.clear();
  filters.clear();
}
export const readOrders = (key: string) => lists.get(key);
export function rememberOrders(session: number, key: string, entry: CachedList) {
  if (session !== epoch) return;
  lists.delete(key);
  lists.set(key, entry);
  if (lists.size > LIMIT) lists.delete(lists.keys().next().value!);
}
export const readOrderFilters = (partnerId: number) => filters.get(partnerId);
export function rememberOrderFilters(session: number, partnerId: number, value: OrderFilters) {
  if (session === epoch) filters.set(partnerId, value);
}
