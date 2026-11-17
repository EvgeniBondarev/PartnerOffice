/**
 * Недавно открытые списки возвратов и счётчики вкладок, а также чистые правила обновления загруженных строк.
 * Вернувшись на вкладку (или кнопкой «Назад»), страница сразу показывает прежние строки, а свежие подтягивает в фоне.
 * Ключ включает партнёра и адрес запроса, но этого мало для безопасности сессии: при выходе и при 401 кэш очищается,
 * а «эпоха» не даёт ответу, запрошенному до очистки, снова наполнить кэш.
 */
export interface ListEntry<Page, Row> {
  data: Page;
  /** Все загруженные порции подряд, без повторов. */
  items: Row[];
  pagesLoaded: number;
}
type Counts = Record<'waiting' | 'received' | 'shelf' | 'supplier' | 'warehouse', number | null>;

const LIST_CACHE_LIMIT = 40;
const listCache = new Map<string, ListEntry<never, never>>();
const countsCache = new Map<number, Counts>();
let epoch = 0;

export const returnsCacheEpoch = () => epoch;
export const returnsCacheSize = () => ({ lists: listCache.size, counts: countsCache.size });

export function clearReturnsCache() {
  epoch++;
  listCache.clear();
  countsCache.clear();
}

export const readList = <Page, Row>(key: string) => listCache.get(key) as ListEntry<Page, Row> | undefined;

/** Запоминает список; ответ из прошлой эпохи (до выхода или 401) игнорируется. Возвращает, записано ли. */
export function rememberList<Page, Row>(fromEpoch: number, key: string, entry: ListEntry<Page, Row>): boolean {
  if (fromEpoch !== epoch) return false;
  listCache.delete(key);
  listCache.set(key, entry as unknown as ListEntry<never, never>);
  if (listCache.size > LIST_CACHE_LIMIT) listCache.delete(listCache.keys().next().value as string);
  return true;
}

export const readCounts = (partnerId: number) => countsCache.get(partnerId);
export function rememberCounts(fromEpoch: number, partnerId: number, counts: Counts): boolean {
  if (fromEpoch !== epoch) return false;
  countsCache.set(partnerId, counts);
  return true;
}

/**
 * Добавляет порцию к списку без повторов: за время прокрутки выгрузка могла сдвинуться, и запись попала бы в две порции.
 * Для тихого обновления первой порции вызывается как mergeRows(свежая первая, текущие): строки 2+ остаются на месте.
 */
export const mergeRows = <Row extends { key?: string }>(current: Row[], incoming: Row[]): Row[] => {
  const seen = new Set(current.map(row => row.key).filter(Boolean));
  return [...current, ...incoming.filter(row => !row.key || !seen.has(row.key) && seen.add(row.key))];
};

/**
 * Тихое обновление первой порции: строки прежней первой порции заменяются свежими (то, чего в свежей порции нет, уже не принадлежит
 * списку), а загруженные порции 2+ остаются на месте; повторы убираются (строка могла подняться из второй порции в первую).
 */
export function replaceFirstPage<Row extends { key?: string }>(current: Row[], previousFirst: Row[], fresh: Row[]): Row[] {
  const keys = new Set(previousFirst.map(row => row.key).filter((key): key is string => Boolean(key)));
  const keyless = new Set(previousFirst.filter(row => !row.key));
  return mergeRows(fresh, current.filter(row => row.key ? !keys.has(row.key) : !keyless.has(row)));
}

/**
 * Применяет дельту к загруженным строкам. Известные строки заменяются на месте, удалённые убираются.
 * Всё, что мы не можем уверенно положить в загруженный список (новая строка, строка без ключа, штука внутри свёрнутой строки),
 * не теряется молча: refresh просит обычное обновление списка.
 */
export function applyReturnsDelta<Row extends { key?: string; units?: Row[] }>(items: Row[], delta: { upsert: Row[]; remove: string[] }): { items: Row[]; refresh: boolean } {
  const top = new Set(items.map(row => row.key).filter((key): key is string => Boolean(key)));
  const units = new Set(items.flatMap(row => row.units ?? []).map(unit => unit.key).filter((key): key is string => Boolean(key)));
  const removed = new Set(delta.remove);
  const upserts = new Map<string, Row>();
  let refresh = false;
  for (const row of delta.upsert) {
    if (row.key && top.has(row.key)) upserts.set(row.key, row); else refresh = true;
  }
  if (delta.remove.some(key => !top.has(key) && units.has(key))) refresh = true;
  return {
    items: items.filter(row => !row.key || !removed.has(row.key)).map(row => (row.key && upserts.get(row.key)) || row),
    refresh
  };
}
