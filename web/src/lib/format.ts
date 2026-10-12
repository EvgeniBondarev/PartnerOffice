const NBSP = ' ';

/** Сумма: неразрывный пробел в тысячах, запятая, знак ₽ (правило брендбука). */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const text = value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // toLocaleString отдаёт узкий неразрывный пробел: приводим к обычному неразрывному, чтобы число не переносилось.
  return `${text.replace(/[   ]/g, NBSP)}${NBSP}₽`;
}

export function formatQuantity(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}${NBSP}шт.`;
}

/** Даты от сервера приходят без часового пояса (местное время склада): разбираем как местные. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** «13 октября, 18:00». Год добавляем, если он не текущий. */
export function formatDateTime(value: string | null | undefined, now: Date = new Date()): string {
  const date = parseDate(value);
  if (!date) return '—';
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

/** «12.10.2026, 08:23»: короткая запись для подстрочников таблицы, где «12 октября, 08:23» не помещается. */
export function formatDateTimeShort(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';
  return `${date.toLocaleDateString('ru-RU')}, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('ru-RU') : '—';
}

/** Дата в виде yyyy-MM-dd по местному времени: так её ждёт API партнёра. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 ? date : null;
}

/** «12.04.2026 – 12.10.2026» для поля периода. Одна граница даёт «с …» или «по …». */
export function formatRange(from: string | null | undefined, to: string | null | undefined): string {
  const a = fromIsoDate(from);
  const b = fromIsoDate(to);
  const f = (d: Date) => d.toLocaleDateString('ru-RU');
  if (a && b) return `${f(a)} – ${f(b)}`;
  if (a) return `с ${f(a)}`;
  if (b) return `по ${f(b)}`;
  return '';
}

/** Статусы Ozon, в которых заказ ещё не собран и не отгружен: по ним считается просрочка. */
const NOT_SHIPPED = ['ожидает сборки', 'ожидает упаковки', 'ожидает отгрузки', 'ожидает комплектации', 'ожидает регистрации'];
/** /v4/posting/fbs/ship принимает отправление только в статусе Ozon awaiting_packaging («Ожидает сборки»). */
const READY_TO_SHIP = ['ожидает сборки', 'awaiting_packaging'];

export function isOverdue(shippingDate: string | null | undefined, ozonStatus: string | null | undefined, now: Date = new Date()): boolean {
  const date = parseDate(shippingDate);
  if (!date || !ozonStatus) return false;
  return date.getTime() < now.getTime() && NOT_SHIPPED.includes(ozonStatus.trim().toLowerCase());
}

/** Фронтенд не предлагает отгрузку в статусах, которые Seller API всё равно отклонит. Сервер остаётся источником истины. */
export function canShipOzonOrder(ozonStatus: string | null | undefined): boolean {
  return READY_TO_SHIP.includes((ozonStatus ?? '').trim().toLowerCase());
}

export type Tone = 'negative' | 'success' | 'warning' | 'neutral';
export type StatusBadgeKind = 'primary negative' | 'primary success' | 'secondary warning' | 'secondary neutral';

/** Цвет подписи статуса Ozon: отмена красным, доставка зелёным, ожидание жёлтым. Всегда вместе с текстом. */
export function ozonStatusTone(ozonStatus: string | null | undefined): Tone {
  const text = (ozonStatus ?? '').trim().toLowerCase();
  if (/^отмен|невыкуп|утерян/.test(text)) return 'negative';
  if (/^(доставлен|получен|заказ выполнен|заказ получен)/.test(text)) return 'success';
  if (/^ожидает|^в обработке|^новый/.test(text)) return 'warning';
  return 'neutral';
}

/** Семантический бейдж для статуса Ozon: используем только публичный статус, не внутренний статус Studio2. */
export function ozonStatusBadgeKind(ozonStatus: string | null | undefined): StatusBadgeKind {
  switch (ozonStatusTone(ozonStatus)) {
    case 'negative': return 'primary negative';
    case 'success': return 'primary success';
    case 'warning': return 'secondary warning';
    default: return 'secondary neutral';
  }
}
