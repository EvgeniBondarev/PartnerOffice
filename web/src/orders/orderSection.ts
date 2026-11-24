import type { OrderGroup } from '../api/orders';

const KEY = 'partner-office.orders-section';

export function saveOrderSection(group: OrderGroup) {
  try { window.localStorage.setItem(KEY, group); } catch { /* storage may be unavailable */ }
}

export function lastOrderSectionPath(): string {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'sent' || saved === 'ready') return `/orders/${saved}`;
  } catch { /* storage may be unavailable */ }
  return '/orders';
}
