import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { ApiError, request } from '../api/client';
import { API_BASE_URL, apiUrl } from '../config';
import { useAuth } from '../auth/AuthContext';
import { ozonImage } from '../lib/images';
import { formatDate, formatQuantity, formatRange, formatUtcDateTime } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import { Badge, type BadgeKind } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CopyValue } from '../ui/CopyValue';
import { EmptyState } from '../ui/EmptyState';
import { type FilterChip } from '../ui/FilterChips';
import { DateFilterSection, FilterPanel } from '../ui/FilterPanel';
import { FilterLayout } from '../ui/FilterLayout';
import { FilterSection } from '../ui/FilterSection';
import { CheckboxGroup } from '../ui/CheckboxGroup';
import { joinList, splitList, toggleValue } from '../lib/multi';
import { Skeleton } from '../ui/Skeleton';
import { useMediaQuery } from '../ui/useMediaQuery';
import { TextField } from '../ui/TextField';
import { Icon } from '../ui/Icon';
import { Informer } from '../ui/Informer';
import { Lightbox } from '../ui/Lightbox';
import { ProductImage } from '../orders/OrdersTable';
import { SearchField } from '../ui/SearchField';
import { usePopover } from '../ui/usePopover';
import { useReturnsQuery, type ReturnsSection } from './useReturnsQuery';
import { HistoryButton, LinkTag, SchemaBadge, type ReturnEvent, type ReturnPair } from './ReturnHistory';
import emptyIllustration from '../assets/illustrations/returns-empty.webp';

interface ReturnRow {
  key?: string; return_type?: string; id: number | null; client_id: string; posting_number: string | null; barcode: string | null;
  box_id?: number | null; box_barcode?: string | null; sku?: number | null; name: string | null; offer_id: string | null; qty: number | null;
  status: string | null; status_name: string | null; target_place: string | null; target_place_addr: string | null; return_date: string | null;
  image_url?: string | null; batch_id?: string | null; ii_code?: string | null;
  onec?: { status: 'accepted' | 'processing' | 'none'; number?: string | null; at?: string | null };
  /** Разбор после приёмки: «queue» — партнёр принял, сотрудники ещё решают, что с возвратом делать. */
  review?: 'queue' | null;
  /** «Полка»: решение сотрудников; перемещение в 1С на склад партнёра проведено. */
  decision?: { outcome?: string; status?: string; status_name?: string | null; status_at?: string | null; warehouse?: string | null; doc_number?: string | null; ttn?: { name: string; size: number } | null; onec?: { number?: string | null; at?: string | null }; partner_ack_at?: string | null };
  mark?: string; defect?: boolean; missort?: boolean; comment?: string; marked_by?: string;
  /** Штуки одного отправления, показанные одной строкой; у каждой свой key и отметки. */
  units?: ReturnRow[];
  /** Ключ свёрнутой строки, если это штука, показанная отдельно при разборе. */
  unitOf?: string;
  /** Схема: ['FBS'], ['FBO'], ['realFBS'] или пара ['FBS', 'FBO'] — коробка вывоза со стока с нашим возвратом. */
  schema?: string[] | null;
  /** Поставщик заказа в Studio2 (у коробки пары — поставщик её возврата). */
  supplier?: string | null;
  /** FBS-сторона пары у коробки: отправление, заказ, причина возврата. */
  pair?: ReturnPair | null;
  /** События позиции по времени. */
  history?: ReturnEvent[] | null;
}
type ReturnMark = Pick<ReturnRow, 'mark' | 'defect' | 'missort' | 'comment' | 'marked_by'>;
type MarkPatch = { status?: 'pending' | 'accepted' | 'rejected'; defect?: boolean; missort?: boolean };
type BatchMarkResult = { key: string; ok: boolean; changes?: ReturnMark; error?: string };
interface ReturnPage { items: ReturnRow[]; total: number; page: number; page_size: number; snapshot_at: string | null; fbo_snapshot_at?: string | null; partial: boolean; exact_search?: boolean; revision?: string | null; cabinets?: { id: number; name: string; ozonClientId: string }[] }
interface ReturnChanges { revision?: string | null; changed: boolean; reset: boolean; upsert: ReturnRow[]; remove: string[]; counts: Partial<Record<ReturnsSection, number>>; }
/** Разобранная строка заменяется своими штуками; картинка есть только у строки верхнего уровня. */
const displayedRows = (items: ReturnRow[], expanded: Set<string>): ReturnRow[] => items.flatMap(row =>
  row.units?.length && row.key && expanded.has(row.key) ? row.units.map(unit => ({ ...unit, image_url: row.image_url, unitOf: row.key })) : [row]);
const TH = 'po-table-cell-base__cell po-table-cell-base__th ozi-table-400-true po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
const TD = 'po-table-cell-base__cell po-table-cell-base__td ozi-table-500 po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
/** У каждого состояния приёмки свой цвет бейджа брендбука; брак и пересорт — подстатус внутри «Принят» (взаимоисключающий, ОК по умолчанию). */
const MARK_STATUSES: { value: 'pending' | 'accepted' | 'rejected'; label: string; kind: BadgeKind }[] = [
  { value: 'pending', label: 'Ожидает', kind: 'secondary warning' },
  { value: 'accepted', label: 'Принят', kind: 'primary success' },
  { value: 'rejected', label: 'Не принят', kind: 'primary negative' }
];
type MarkSub = 'ok' | 'defect' | 'missort';
const MARK_SUBS: { value: MarkSub; label: string }[] = [{ value: 'ok', label: 'ОК' }, { value: 'defect', label: 'Брак' }, { value: 'missort', label: 'Пересорт' }];
/** Подстатус есть только у «Принят»: флаги на других статусах (старые отметки) не показываем; если стоят оба, главнее брак. */
const markSub = (row: Pick<ReturnRow, 'mark' | 'defect' | 'missort'>): MarkSub => row.mark !== 'accepted' ? 'ok' : row.defect ? 'defect' : row.missort ? 'missort' : 'ok';
/** FBO-возврат повторной продажи: товар из FBS-возврата Ozon продал со своего склада ещё раз, и он вернулся снова.
 *  Заказ в Studio2 — по исходному FBS-отправлению, поэтому строка показывает его номер. */
const isResale = (row: ReturnRow) => row.pair?.link === 'resale';
const subPatch = (sub: MarkSub): MarkPatch => ({ status: 'accepted', defect: sub === 'defect', missort: sub === 'missort' });
const MENU_WIDTH = 200, MENU_HEIGHT = 150;
const STATUS_OPTIONS = [
  { value: 'ArrivedAtReturnPlace', label: 'В пункте выдачи' }, { value: 'CheckAtPickupPoint', label: 'Проверка на ПВЗ' },
  { value: 'MovingToSeller', label: 'В пути к продавцу' }, { value: 'WaitingShipment', label: 'Ожидает отправки' }
];
const MARK_OPTIONS = [{ value: 'pending', label: 'Ожидает' }, { value: 'accepted', label: 'Принят' }, { value: 'rejected', label: 'Не принят' }];
/** Уточнение внутри «Принят». На сервер уходит вместо «accepted»: defect / missort / ok — принятые с этим подстатусом. */
const MARK_SUB_OPTIONS = [{ value: 'ok', label: 'ОК (стандартно)' }, { value: 'defect', label: 'Брак' }, { value: 'missort', label: 'Пересорт' }];
const SUB_VALUES = MARK_SUB_OPTIONS.map(option => option.value);
const REVIEW_OPTIONS = [{ value: 'queue', label: 'На разборе' }];
const SHELF_COLUMNS = ['Товар', 'Отправление / коробка', 'Склад партнёра', 'Перемещено', 'Статус'];
const SUPPLIER_COLUMNS = ['Товар', 'Отправление / коробка', 'Склад и документ', 'ТТН', 'Статус'];
const WAREHOUSE_COLUMNS = ['Товар', 'Отправление / коробка', 'Склад и документ', 'Статус'];
/** «Возврат поставщику» и «Возврат на склад» — один раздел `outbound` в API, разделённый адресатом решения (`to`: supplier / us). */
const listParams = (name: ReturnsSection): Record<string, string> =>
  name === 'supplier' ? { section: 'outbound', to: 'supplier' } : name === 'warehouse' ? { section: 'outbound', to: 'us' } : { section: name };
/** Статусы решений «К отправке»: «Оформлен» ждёт отправки, остальные — движение товара уже произошло. */
const OUTBOUND_STATUS_KINDS: Record<string, BadgeKind> = { registered: 'secondary warning', sent: 'primary success', transfer_created: 'secondary info', received: 'primary success' };

/** Строки-заглушки по форме настоящих: таблица не прыгает, когда приходят данные. */
const skeletonRows = (count: number, hasMark: boolean) => Array.from({ length: count }, (_, i) => <tr key={`sk-${i}`} className="po-table-row__row" aria-hidden="true">
  <td className={`${TD} pa-col-product`}><div className="pa-returns__product"><Skeleton width={40} height={40} /><div className="pa-skeleton-stack"><Skeleton width="75%" height={16} /><Skeleton width="45%" height={12} /></div></div></td>
  <td className={TD}><div className="pa-skeleton-stack"><Skeleton width={130} height={16} /><Skeleton width={80} height={12} /></div></td>
  <td className={TD}><Skeleton width={90} height={16} /></td>
  <td className={TD}><Skeleton width={110} height={22} radius={11} /></td>
  <td className={TD}><div className="pa-skeleton-stack"><Skeleton width={110} height={16} /><Skeleton width={90} height={12} /></div></td>
  <td className={TD}><Skeleton width={80} height={16} /></td>
  <td className={TD}><Skeleton width={36} height={16} /></td>
  {hasMark && <td className={TD}><Skeleton width={84} height={22} radius={11} /></td>}
</tr>);
const skeletonCards = (count: number) => Array.from({ length: count }, (_, i) => <li key={`sk-${i}`} className="pa-returns-card" aria-hidden="true">
  <div className="pa-returns__product"><Skeleton width={40} height={40} /><div className="pa-skeleton-stack"><Skeleton width="70%" height={16} /><Skeleton width="40%" height={12} /></div></div>
  <div className="pa-skeleton-stack"><Skeleton width="90%" height={14} /><Skeleton width="60%" height={14} /><Skeleton width="75%" height={14} /></div>
</li>);

/** Сколько возвратов подгружается за раз, и за сколько пикселей до конца списка начинаем подгрузку следующей порции. */
const PAGE_SIZE = 50, LOAD_AHEAD_PX = 400;
/** Добавляет порцию к списку без повторов: за время прокрутки выгрузка могла сдвинуться, и запись попала бы в две порции. */
const mergeRows = (current: ReturnRow[], incoming: ReturnRow[]): ReturnRow[] => {
  const seen = new Set(current.map(row => row.key).filter(Boolean));
  return [...current, ...incoming.filter(row => !row.key || !seen.has(row.key) && seen.add(row.key))];
};

/** «1 возврат, 2 возврата, 5 возвратов». */
const plural = (n: number, one: string, few: string, many: string) => {
  const tail = n % 100, last = n % 10;
  return tail >= 11 && tail <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
};

/** Похоже на код этикетки или отправление: ii…/bx… с цифрами, длинное число (в том числе искажённое сканером) или номер отправления. */
const looksLikeCode = (value: string) => /^(?:(?:ii|bx)\d{6,}|\d{10,}|\d{6,}-\d{3,}(?:-\d+)?)$/i.test(value);

/** Выбираем именно совпавшее поле, чтобы выбор подсказки находил соответствующую строку. */
function suggestionLabel(row: ReturnRow, query: string): string {
  const fields = [row.posting_number, row.pair?.posting_number, row.box_barcode, row.box_id?.toString(), row.barcode, row.ii_code, row.onec?.number, row.offer_id, row.sku?.toString(), row.name];
  const search = query.toLocaleLowerCase();
  return fields.find(value => value?.toLocaleLowerCase().includes(search)) || row.name || 'Возврат';
}

/**
 * Недавно открытые списки и счётчики вкладок. Вернувшись на вкладку (или кнопкой «Назад»), страница сразу показывает
 * прежние строки, а свежие подтягивает в фоне: без скелетона и без «нуля» в счётчиках. Ключ включает партнёра и адрес запроса
 * (раздел, фильтры, поиск), поэтому чужие данные после смены учётной записи не покажутся.
 */
const LIST_CACHE_LIMIT = 40;
const COUNTS_REFRESH_MS = 60_000;
const EMPTY_COUNTS: Record<ReturnsSection, number | null> = { waiting: null, received: null, shelf: null, supplier: null, warehouse: null };
const listCache = new Map<string, { data: ReturnPage; items: ReturnRow[] }>();
const countsCache = new Map<number, Record<ReturnsSection, number | null>>();
export function clearReturnsCache() { listCache.clear(); countsCache.clear(); }
const rememberList = (key: string, entry: { data: ReturnPage; items: ReturnRow[] }) => {
  listCache.delete(key); listCache.set(key, entry);
  if (listCache.size > LIST_CACHE_LIMIT) listCache.delete(listCache.keys().next().value as string);
};
const listUrlFor = (section: ReturnsSection, filters: Record<string, string>, page: number) =>
  `/partner-api/returns?${new URLSearchParams({ ...listParams(section), page: String(page), pageSize: String(PAGE_SIZE), ...filters })}`;

export function ReturnsPage({ section = 'waiting' }: { section?: ReturnsSection }) {
  const { partner } = useAuth();
  useEffect(() => {
    try { window.localStorage.setItem('partner-office.returns-section', section); } catch { /* storage may be unavailable */ }
  }, [section]);
  const allowed = hasPermission(partner, 'ViewReturns');
  const canWork = hasPermission(partner, 'ReturnsWork');
  const phone = useMediaQuery('(max-width: 767px)', false);
  const { filters: panelFilters, pvzDraft, setPvzDraft, change, clear, activeCount } = useReturnsQuery(section);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const filters = useMemo(() => ({ search, ...panelFilters }), [search, panelFilters]);
  const partnerId = partner?.id ?? 0;
  const cacheKey = (url: string) => `${partnerId}|${url}`;
  // Уже открытый список показывается сразу, свежие данные приходят в фоне
  const [initialHit] = useState(() => listCache.get(cacheKey(listUrlFor(section, filters, 1))));
  const [data, setData] = useState<ReturnPage | null>(initialHit?.data ?? null);
  // Список подгружается при прокрутке: items копится порциями, pagesLoaded — сколько порций уже в нём.
  const [items, setItems] = useState<ReturnRow[]>(initialHit?.items ?? []);
  const [supplierNames, setSupplierNames] = useState<string[]>(() => [...new Set((initialHit?.items ?? []).map(row => row.supplier?.trim()).filter((value): value is string => Boolean(value)))]);
  const itemsRef = useRef<ReturnRow[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => setSupplierNames(previous => [...new Set([...previous, ...items.map(row => row.supplier?.trim()).filter((value): value is string => Boolean(value))])].sort((a, b) => a.localeCompare(b, 'ru'))), [items]);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const pagesRef = useRef(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const moreController = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  // Первый кадр уже со скелетоном: иначе список мигнул бы пустотой до начала загрузки (если списка нет в кэше).
  const [loading, setLoading] = useState(!initialHit);
  const [retry, setRetry] = useState(0);
  const [counts, setCounts] = useState<Record<ReturnsSection, number | null>>(() => countsCache.get(partnerId) ?? EMPTY_COUNTS);
  useEffect(() => { countsCache.set(partnerId, counts); }, [partnerId, counts]);
  const quietRefresh = useRef(false);
  const savingNow = useRef(false);
  const [image, setImage] = useState<{ url: string; alt: string } | null>(null);
  const [saving, setSaving] = useState<string[]>([]);
  const [markError, setMarkError] = useState('');
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const toggleUnits = (key: string) => setExpandedUnits(previous => {
    const next = new Set(previous);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  const [scanResult, setScanResult] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const scanQueue = useRef<Promise<void>>(Promise.resolve());
  const typing = useRef({ at: 0, fast: 0, length: 0 });
  const autoTried = useRef('');
  const formRef = useRef<HTMLFormElement>(null);
  const highlightedRow = useRef<HTMLTableRowElement>(null);
  const highlightedCard = useRef<HTMLLIElement>(null);
  const [suggestions, setSuggestions] = useState<ReturnRow[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const focused = useRef(false);
  const currentSearch = useRef('');
  const suggestionSearch = useRef('');
  const suppressedSearch = useRef<string | null>(null);
  const blurTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const typed = searchDraft.trim();
    currentSearch.current = typed;
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    if (typed === search) return;
    const timer = window.setTimeout(() => {
      // Сканер без Enter: код набран машинной скоростью и похож на код этикетки — принимаем, не дожидаясь Enter.
      if (section === 'received' && canWork && looksLikeCode(typed) && typed !== autoTried.current && looksScanned(typed)) { scan(typed); return; }
      setSearch(typed);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const listUrl = (page: number) => listUrlFor(section, filters, page);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    moreController.current?.abort();
    // Фоновое обновление не прячет таблицу, не трогает подсказки и не показывает ошибку.
    // Оно не перечитывает все ранее загруженные страницы: это превращало обновление в N запросов.
    const background = quietRefresh.current;
    quietRefresh.current = false;
    // Такой список уже открывали: показываем прежние строки сразу и обновляем их тихо, без скелетона
    const hit = background ? undefined : listCache.get(cacheKey(listUrl(1)));
    const quiet = background || !!hit;
    const upto = 1;
    if (hit) {
      setData(hit.data); setItems(hit.items); pagesRef.current = upto; setPagesLoaded(upto);
      setLoading(false); setError(''); setMoreError(''); setLoadingMore(false);
    } else if (!quiet) { setLoading(true); setError(''); setMoreError(''); setLoadingMore(false); }
    Promise.all(Array.from({ length: upto }, (_, index) => request<ReturnPage>(listUrl(index + 1), { signal: controller.signal })))
      .then(results => {
        if (filters.search !== currentSearch.current) return;
        const result = results[0];
        const rows = mergeRows([], results.flatMap(item => item.items));
        rememberList(cacheKey(listUrl(1)), { data: result, items: rows });
        setData(result);
        setCounts(previous => ({ ...previous, [section]: result.total }));
        setItems(rows);
        pagesRef.current = upto; setPagesLoaded(upto);
        if (!background && filters.search.length >= 2 && filters.search !== suppressedSearch.current) {
          suggestionSearch.current = filters.search;
          setSuggestions(result.items.slice(0, 10));
          setActiveSuggestion(-1);
          setSuggestionsOpen(focused.current);
        }
      })
      .catch((err: unknown) => { if (!controller.signal.aborted && !quiet) setError(err instanceof Error ? err.message : 'Не удалось загрузить возвраты.'); })
      .finally(() => { if (!controller.signal.aborted && !quiet) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, section, filters, retry]);

  const hasMore = !!data && pagesLoaded * data.page_size < data.total;
  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    const next = pagesLoaded + 1;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true); setMoreError('');
    request<ReturnPage>(listUrl(next), { signal: controller.signal })
      .then(result => { setItems(previous => mergeRows(previous, result.items)); pagesRef.current = next; setPagesLoaded(next); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setMoreError(err instanceof Error ? err.message : 'Не удалось подгрузить возвраты.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingMore(false); });
  };
  // Подгрузка при прокрутке: следим за меткой в конце списка (в таблице — внутри её прокрутки, на телефоне — в окне).
  const observable = typeof IntersectionObserver !== 'undefined';
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!observable || !sentinel || !hasMore || loading || loadingMore || moreError) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadMore(); },
      { root: phone ? null : scrollRef.current, rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px` });
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observable, hasMore, loading, loadingMore, moreError, pagesLoaded, phone]);

  // Счётчики всех разделов приходят одним агрегированным запросом, без list-запросов на каждую вкладку. Обновляются реже списка
  // (раз в минуту): опрос списка каждые 15 с не должен каждый раз заставлять сервер пересчитывать все разделы.
  useEffect(() => {
    if (!allowed) return;
    let controller = new AbortController();
    const loadCounts = (names: ReturnsSection[]) => {
      for (const other of names.filter(name => name !== section)) {
        request<ReturnPage>(`/partner-api/returns?${new URLSearchParams({ ...listParams(other), page: '1', pageSize: '1' })}`, { signal: controller.signal })
          .then(result => setCounts(previous => ({ ...previous, [other]: result.total })))
          .catch(() => undefined);
      }
    };
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      controller.abort(); controller = new AbortController();
      request<{ counts: Partial<Record<string, number>> }>('/partner-api/returns/counts', { signal: controller.signal })
        .then(result => {
          const all = result?.counts;
          if (!all) { loadCounts(['waiting', 'received', 'shelf', 'supplier', 'warehouse']); return; }
          setCounts(previous => ({
            ...previous,
            ...Object.fromEntries((['waiting', 'received', 'shelf'] as const).filter(name => all[name] !== undefined).map(name => [name, all[name]])),
            // «Возврат поставщику» и «Возврат на склад» — части раздела outbound по адресату (`supplier` и `us` в ответе)
            ...(all.supplier !== undefined ? { supplier: all.supplier } : {}),
            ...(all.us !== undefined ? { warehouse: all.us } : {})
          }));
          // Compatible rollout: ozon-returns без разбивки по адресату — счётчики этих двух вкладок отдельными запросами
          loadCounts([...(all.supplier === undefined ? ['supplier' as const] : []), ...(all.us === undefined ? ['warehouse' as const] : [])]);
        })
        // Compatible rollout: an already deployed Studio2 may not yet expose /counts.
        .catch(() => { if (!controller.signal.aborted) loadCounts(['waiting', 'received', 'shelf', 'supplier', 'warehouse']); });
    };
    load();
    const timer = window.setInterval(load, COUNTS_REFRESH_MS);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [allowed, section]);

  // Выгрузка из Ozon и отметки из ozon-returns приходят без участия страницы: подтягиваем их по таймеру
  // и при возврате на вкладку, пока открыта вкладка и нет несохранённой отметки. Пока жив поток событий (SSE),
  // таймер молчит: поток сам сообщает о каждой новой ревизии, а полный список каждые 15 с гонял бы лишние данные.
  const streamAlive = useRef(false);
  useEffect(() => {
    if (!allowed) return;
    const refresh = (event?: Event) => {
      if (document.visibilityState !== 'visible' || savingNow.current) return;
      if (!event && streamAlive.current) return;
      quietRefresh.current = true;
      setRetry(n => n + 1);
    };
    const timer = window.setInterval(() => refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [allowed]);

  // Поток передаёт только revision. Сами строки берём защищённым delta endpoint;
  // при потере потока остаётся 15-секундный опрос выше.
  useEffect(() => {
    if (!allowed || !data?.revision || typeof EventSource === 'undefined') return;
    let closed = false;
    let busy = false;
    const source = new EventSource(apiUrl('/partner-api/returns/events'), { withCredentials: Boolean(API_BASE_URL) });
    source.onopen = () => { streamAlive.current = true; };
    source.onerror = () => { streamAlive.current = false; };
    const update = async () => {
      if (busy || closed) return;
      busy = true;
      try {
        const query = new URLSearchParams({ since: data.revision! });
        itemsRef.current.map(row => row.key).filter((key): key is string => Boolean(key)).forEach(key => query.append('loaded_key', key));
        const delta = await request<ReturnChanges>(`/partner-api/returns/changes?${query}`);
        if (closed || !delta.changed) return;
        setCounts(previous => ({ ...previous, ...delta.counts }));
        if (delta.reset) { refreshQuietly(); return; }
        const removed = new Set(delta.remove);
        const upsert = new Map(delta.upsert.filter(row => row.key).map(row => [row.key!, row]));
        setItems(previous => previous.filter(row => !row.key || !removed.has(row.key)).map(row => upsert.get(row.key || '') || row));
      } catch { /* fallback poll will retry; do not disrupt an open list */ }
      finally { busy = false; }
    };
    source.addEventListener('revision', update);
    return () => { closed = true; streamAlive.current = false; source.close(); };
  }, [allowed, data?.revision]);

  /** Перечитать уже показанные порции, не прячась за скелетон: после отметки и скана список остаётся на месте. */
  const refreshQuietly = () => { quietRefresh.current = true; setRetry(n => n + 1); };

  const [ttnError, setTtnError] = useState('');
  const [ttnBusy, setTtnBusy] = useState<string[]>([]);
  /** «Скачать ТТН»: файл отдаёт Studio2 потоком (прямой ссылки нет), поэтому качаем запросом с сессией и сохраняем сами,
   *  чтобы показать понятную ошибку, если файл недоступен. */
  const downloadTtn = async (row: ReturnRow) => {
    if (!row.key || ttnBusy.includes(row.key)) return;
    setTtnError(''); setTtnBusy(keys => [...keys, row.key!]);
    try {
      const response = await fetch(apiUrl(`/partner-api/returns/ttn?key=${encodeURIComponent(row.key)}`), { credentials: API_BASE_URL ? 'include' : 'same-origin' });
      if (!response.ok) {
        throw new Error(response.status === 404 ? 'ТТН не найдена: возможно, позиция уже изменилась. Обновите список.'
          : response.status === 401 ? 'Сессия закончилась. Войдите заново.' : 'Файл ТТН сейчас недоступен. Попробуйте позже.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = row.decision?.ttn?.name || 'ТТН';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setTtnError(err instanceof TypeError ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.' : err instanceof Error ? err.message : 'Не удалось скачать ТТН.');
    } finally { setTtnBusy(keys => keys.filter(key => key !== row.key)); }
  };
  /** Отметка приёмки: сервер возвращает итоговое состояние, им и заменяем строку (без угадывания на клиенте). */
  const mark = async (row: ReturnRow, patch: MarkPatch) => {
    if (!row.key || saving.includes(row.key)) return;
    // свёрнутая строка — это несколько записей: отметка пишется на каждую штуку
    const keys = row.units?.length ? row.units.map(unit => unit.key!) : [row.key];
    savingNow.current = true;
    setMarkError(''); setSaving(keys => [...keys, row.key!]);
    try {
      let results: BatchMarkResult[];
      try {
        const response = await request<{ results: BatchMarkResult[] }>('/partner-api/returns/marks', {
          method: 'POST', body: JSON.stringify({ operationId: crypto.randomUUID(), keys, ...patch })
        });
        results = response.results;
      } catch (error) {
        // Совместимый rollout: до выката Studio2 batch endpoint ещё отсутствует.
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        results = await Promise.all(keys.map(async key => ({ key, ok: true, changes: await request<ReturnMark>(
          '/partner-api/returns/mark', { method: 'POST', body: JSON.stringify({ key, ...patch }) }) })));
      }
      const changes = new Map(results.filter(result => result.ok && result.changes).map(result => [result.key, result.changes!]));
      const failures = results.filter(result => !result.ok);
      setItems(previous => previous.map(item =>
        row.unitOf ? (item.key === row.unitOf ? { ...item, units: item.units?.map(unit => changes.get(unit.key || '') ? { ...unit, ...changes.get(unit.key || '') } : unit) } : item)
          : item.key === row.key ? {
            ...item, ...(changes.get(row.key || '') || {}),
            units: item.units?.map(unit => changes.get(unit.key || '') ? { ...unit, ...changes.get(unit.key || '') } : unit)
          } : item));
      if (failures.length) setMarkError(`Не сохранено: ${failures.map(result => result.key).join(', ')}.`);
      // отметка одной штуки могла разделить строку: как их показывать, решает сервер
      if (row.unitOf || failures.length) refreshQuietly();
    } catch (err) {
      // 404/409: возврат уже закрыт сотрудниками, изменился или по нему принято решение — список устарел
      const stale = err instanceof ApiError && (err.status === 404 || err.status === 409);
      setMarkError(stale
        ? (err.status === 409 ? err.message : 'Возврат уже изменился или закрыт сотрудниками. Список обновлён, проверьте статус.')
        : err instanceof Error ? err.message : 'Не удалось сохранить отметку.');
      if (stale || keys.length > 1) refreshQuietly();   // часть штук могла сохраниться
    } finally { savingNow.current = false; setSaving(keys => keys.filter(key => key !== row.key)); }
  };
  useEffect(() => { if (highlighted) (highlightedRow.current ?? highlightedCard.current)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [highlighted, items]);

  /** Сканер вводит код как очень быстрый набор и завершает его Enter: так отличаем скан от ручного ввода. */
  const noteInput = (value: string) => {
    const now = performance.now(), t = typing.current;
    t.fast = !value || value.length < t.length ? 0 : value.length - t.length > 1 ? value.length : now - t.at < 100 ? t.fast + 1 : 0;
    t.at = now; t.length = value.length;
  };
  const looksScanned = (value: string) => value.length >= 4 && typing.current.fast >= value.length - 1;

  /** true — позиция принята (или уже была принята); false — ничего не принято, поиск остаётся в поле. */
  const processScan = async (code: string): Promise<boolean> => {
    setScanResult(null); setHighlighted(null);
    try {
      const query = new URLSearchParams({ section: 'received', page: '1', pageSize: '50', search: code, exact: 'true' });
      const result = await request<ReturnPage>(`/partner-api/returns?${query}`);
      if (!result.exact_search) { setScanResult({ kind: 'warning', text: 'Точный поиск недоступен. Проверьте возврат вручную.' }); return false; }
      if (result.partial) { setScanResult({ kind: 'warning', text: 'Данные обновлены не полностью. Проверьте возврат вручную.' }); return false; }
      if (result.total !== 1 || result.items.length !== 1 || !result.items[0].key) {
        setScanResult(result.total ? { kind: 'warning', text: `Код ${code}: найдено несколько позиций. Выберите нужную вручную.` } : { kind: 'warning', text: `Код ${code}: возврат не найден.` });
        return false;
      }
      const row = result.items[0];
      const title = row.name || row.posting_number || code;
      setHighlighted(row.key!);
      if (row.mark === 'accepted') { setScanResult({ kind: 'success', text: `Уже принят: ${title}` }); return true; }
      await request<ReturnMark>('/partner-api/returns/mark', { method: 'POST', body: JSON.stringify({ key: row.key, ...subPatch('ok') }) });
      setScanResult({ kind: 'success', text: `Принят: ${title}` });
      refreshQuietly();
      return true;
    } catch (err) {
      setScanResult({ kind: 'error', text: err instanceof Error ? err.message : 'Не удалось обработать сканирование.' });
      return false;
    }
  };
  /** Код не принят: возвращаем его в поиск, чтобы список показал совпадения, и выделяем, чтобы следующий скан заменил его, а не дописался. */
  const keepSearch = (code: string) => {
    autoTried.current = code; currentSearch.current = code; suppressedSearch.current = code;
    setSearchDraft(code); setSearch(code);
    window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.select(), 0);
  };
  /** Скан сразу принимает найденную позицию; коды обрабатываются по очереди, чтобы быстрые сканы не терялись. */
  const scan = (value: string) => {
    const code = value.trim();
    if (!code) return;
    autoTried.current = '';
    currentSearch.current = ''; suppressedSearch.current = null;
    setSuggestions([]); setSuggestionsOpen(false); setActiveSuggestion(-1);
    setSearchDraft(''); setSearch('');
    typing.current = { at: 0, fast: 0, length: 0 };
    scanQueue.current = scanQueue.current.then(async () => { if (!await processScan(code)) keepSearch(code); });
  };
  // «Найти» и Enter применяют поиск сразу, не дожидаясь паузы; фильтры панели уже применены.
  const apply = (event: FormEvent) => { event.preventDefault(); setSuggestionsOpen(false); setSearch(searchDraft.trim()); };
  const chooseSuggestion = (row: ReturnRow) => {
    const chosen = suggestionLabel(row, searchDraft.trim());
    currentSearch.current = chosen;
    suppressedSearch.current = chosen;
    setSearchDraft(chosen);
    setSuggestionsOpen(false);
    setSearch(chosen);
  };
  const searchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setSuggestionsOpen(false); setActiveSuggestion(-1); }
    else if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault(); setSuggestionsOpen(true); setActiveSuggestion(value => Math.min(value + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp' && suggestionsOpen && suggestions.length) {
      event.preventDefault(); setActiveSuggestion(value => Math.max(value - 1, 0));
    } else if (event.key === 'Enter' && suggestionsOpen && activeSuggestion >= 0) {
      event.preventDefault(); chooseSuggestion(suggestions[activeSuggestion]);
    } else if (event.key === 'Enter' && section === 'received' && canWork && looksScanned(event.currentTarget.value)) {
      event.preventDefault(); scan(event.currentTarget.value);
    }
  };
  if (!allowed) return <Informer kind="warning" title="Нет доступа">Обратитесь к владельцу кабинета.</Informer>;
  const received = section === 'received';
  const shelf = section === 'shelf';
  const supplier = section === 'supplier';
  const warehouse = section === 'warehouse';
  const outbound = supplier || warehouse;
  const cabinets = data?.cabinets ?? [];
  const cabinetName = (row: ReturnRow) => cabinets.find(c => c.ozonClientId === row.client_id)?.name || '—';
  const label = (options: { value: string; label: string }[], value: string) => options.find(option => option.value === value)?.label ?? value;
  // Тег на каждое выбранное значение: крестик снимает только его.
  const valueChips = (id: 'mark' | 'status' | 'clientId' | 'review' | 'supplier', title: string, name: (value: string) => string): FilterChip[] =>
    splitList(panelFilters[id]).map(value => ({ id: `${id}:${value}`, label: `${title}: ${name(value)}`, onRemove: () => change({ [id]: toggleValue(panelFilters[id], value) }) }));
  const chips: FilterChip[] = [
    ...splitList(panelFilters.mark).map(value => ({
      id: `mark:${value}`, label: `Приёмка: ${SUB_VALUES.includes(value) ? `Принят · ${label(MARK_SUB_OPTIONS, value).replace(' (стандартно)', '')}` : label(MARK_OPTIONS, value)}`,
      // последнее снятое уточнение возвращает общий «Принят», а не стирает его
      onRemove: () => { const rest = splitList(panelFilters.mark).filter(item => item !== value); change({ mark: joinList(SUB_VALUES.includes(value) && !rest.some(item => SUB_VALUES.includes(item)) && !rest.includes('accepted') ? [...rest, 'accepted'] : rest) }); }
    })),
    ...valueChips('review', 'Разбор', value => label(REVIEW_OPTIONS, value)),
    ...valueChips('status', 'Статус Ozon', value => label(STATUS_OPTIONS, value)),
    ...valueChips('clientId', 'Кабинет', value => cabinets.find(c => String(c.id) === value)?.name ?? value),
    ...valueChips('supplier', 'Поставщик', value => value),
    ...(panelFilters.pvz ? [{ id: 'pvz', label: `Пункт выдачи: ${panelFilters.pvz}`, onRemove: () => change({ pvz: '' }) }] : []),
    ...(panelFilters.dateFrom || panelFilters.dateTo ? [{ id: 'date', label: `${received ? 'Получено' : 'Возврат'}: ${formatRange(panelFilters.dateFrom, panelFilters.dateTo)}`, onRemove: () => change({ dateFrom: '', dateTo: '' }) }] : [])
  ];
  const renderPanel = (hideTitle: boolean) => <FilterPanel activeCount={activeCount} hideTitle={hideTitle} onClear={clear}>
    {outbound || shelf
      ? null
      : received
      ? <FilterSection title="Приёмка" active={!!panelFilters.mark}><MarkFilter value={panelFilters.mark} onChange={value => change({ mark: value })} /></FilterSection>
      : <FilterSection title="Статус Ozon" active={!!panelFilters.status}><CheckboxGroup value={panelFilters.status} options={STATUS_OPTIONS} onChange={value => change({ status: value })} /></FilterSection>}
    {received && <FilterSection title="Разбор" active={!!panelFilters.review}><CheckboxGroup value={panelFilters.review} options={REVIEW_OPTIONS} onChange={value => change({ review: value })} /></FilterSection>}
    {received && <FilterSection title="Поставщик" active={!!panelFilters.supplier}>
      <CheckboxGroup value={panelFilters.supplier} options={supplierNames.map(value => ({ value, label: value }))} onChange={value => change({ supplier: value })} />
    </FilterSection>}
    {cabinets.length > 0 && <FilterSection title="Кабинет" active={!!panelFilters.clientId}>
      <CheckboxGroup value={panelFilters.clientId} options={cabinets.map(c => ({ value: String(c.id), label: c.name }))} onChange={value => change({ clientId: value })} />
    </FilterSection>}
    {!shelf && !outbound && <FilterSection title="Пункт выдачи" active={!!panelFilters.pvz}><TextField label="Название пункта" value={pvzDraft} onValueChange={setPvzDraft} size={500} maxLength={100} /></FilterSection>}
    <DateFilterSection title={outbound ? 'Дата решения' : shelf ? 'Дата перемещения' : received ? 'Дата получения' : 'Дата возврата'} from={panelFilters.dateFrom} to={panelFilters.dateTo} onChange={(dateFrom, dateTo) => change({ dateFrom, dateTo })} />
  </FilterPanel>;
  const rows = displayedRows(items, expandedUnits);
  const hasMark = !shelf && !outbound && (canWork || received);
  /** Колонка «Статус Ozon» есть в «Ждёт получения» и «Получено»; на полке и в отправке её нет. */
  const hasOzonStatus = !shelf && !outbound;
  const searching = activeCount > 0 || !!search;
  /** Кнопка «История позиции»: рядом со статусом Ozon, а где такой колонки нет (полка, отправка) — в товаре. */
  const historyButton = (row: ReturnRow) => <HistoryButton title={row.name || 'Товар'} history={row.history} schema={row.schema}
    posting={row.pair?.posting_number || (row.return_type === 'fbo' ? null : row.posting_number)} resalePosting={isResale(row) ? row.posting_number : null}
    box={row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? `bx${row.box_id}` : null)) : null} />;
  const productCell = (row: ReturnRow) => <div className="pa-returns__product">
    <ProductImage url={row.image_url ?? null} alt={row.name || 'Товар'} onOpen={setImage} />
    <div className="pa-returns__product-info"><div className="pa-product" title={row.name || undefined}>{row.name || '—'}</div><div className="pa-sub pa-returns__sub"><SchemaBadge schema={row.schema} resale={isResale(row)} />{row.offer_id ? <CopyValue value={row.offer_id} label="артикул" /> : '—'}{cabinets.length > 1 && cabinetName(row) !== '—' ? ` · ${cabinetName(row)}` : ''}
        <LinkTag link={row.pair?.link} />
        {!hasOzonStatus && historyButton(row)}</div>
      {(row.units?.length || row.unitOf) && <button type="button" className="pa-link pa-returns__units-toggle" onClick={() => toggleUnits((row.unitOf || row.key)!)}>{row.unitOf ? 'Свернуть' : `${row.units!.length} шт. · Разобрать по штукам`}</button>}</div></div>;
  const postingCell = (row: ReturnRow) => {
    if (isResale(row) && row.pair?.posting_number) return <>
      <CopyValue value={row.pair.posting_number} label="номер отправления FBS"><span className="pa-returns__side">FBS</span>{row.pair.posting_number}</CopyValue>
      <div className="pa-sub">FBO · {row.posting_number ? <CopyValue value={row.posting_number} label="номер отправления FBO" /> : '—'}</div></>;
    const main = row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? `boxId ${row.box_id}` : 'Коробка FBO')) : (row.posting_number || '—');
    const copyable = row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? String(row.box_id) : null)) : row.posting_number;
    return <><CopyValue value={copyable} label={row.return_type === 'fbo' ? 'код коробки' : 'номер отправления'}>{main}</CopyValue>
      <div className="pa-sub">{row.return_type === 'fbo'
        ? (row.pair?.posting_number ? <>{row.pair.schema || 'FBS'} · <CopyValue value={row.pair.posting_number} label="номер отправления" /></> : 'Коробка FBO')
        : row.barcode ? <CopyValue value={row.barcode} label="код этикетки" /> : 'Возврат'}</div></>;
  };
  const supplierCell = (row: ReturnRow) => row.supplier ? <>{row.supplier}{isResale(row) ? <div className="pa-sub">по заказу FBS</div> : row.return_type === 'fbo' && row.pair ? <div className="pa-sub">по заказу возврата</div> : null}</> : <span className="pa-sub">—</span>;
  const pairReason = (row: ReturnRow) => row.pair?.reason ? <div className="pa-sub" title={row.pair.reason}>{row.pair.reason}</div> : null;
  const statusBadge = (row: ReturnRow) => <div className="pa-returns__status-box"><Badge kind={row.status === 'ArrivedAtReturnPlace' ? 'primary success' : 'secondary info'}>{row.status_name || '—'}</Badge>{historyButton(row)}</div>;
  const placeCell = (row: ReturnRow) => <>{row.target_place || '—'}<div className="pa-sub">{row.target_place_addr}</div></>;
  const outboundDoc = (row: ReturnRow) => {
    const doc = row.decision?.outcome === 'us' ? (row.decision?.onec?.number ? `№${row.decision.onec.number}` : '') : row.decision?.doc_number || '';
    return <>{row.decision?.warehouse || '—'}<div className="pa-sub">{doc ? <CopyValue value={doc} label="номер документа">{doc}</CopyValue> : ''}</div></>;
  };
  const outboundTtn = (row: ReturnRow) => row.decision?.ttn
    ? <Button variant="secondary" size={400} disabled={!!row.key && ttnBusy.includes(row.key)} onClick={() => downloadTtn(row)}>Скачать ТТН</Button>
    : <span className="pa-sub">—</span>;
  const outboundStatus = (row: ReturnRow) => <Badge kind={OUTBOUND_STATUS_KINDS[row.decision?.status ?? ''] ?? 'secondary neutral'}>{row.decision?.status_name || '—'}</Badge>;
  const shelfWarehouse = (row: ReturnRow) => row.decision?.warehouse || '—';
  const shelfMoved = (row: ReturnRow) => <>{row.decision?.onec?.number ? <CopyValue value={row.decision.onec.number} label="номер документа 1С">{`№${row.decision.onec.number}`}</CopyValue> : '—'}
    <div className="pa-sub">{row.decision?.onec?.at ? formatUtcDateTime(row.decision.onec.at) : ''}</div></>;
  const shelfStatus = (row: ReturnRow) => <Badge kind="primary success">{row.decision?.status_name || 'На полке'}</Badge>;
  const markCell = (row: ReturnRow) => <MarkCell row={row} canWork={canWork} busy={!!row.key && saving.includes(row.key)} onChange={patch => mark(row, patch)} />;
  /** Сканер вводит код в поиск: щелчок мышью по фильтру не должен забирать у него фокус. Текстовые поля и клавиатура работают как обычно. */
  const keepSearchFocus = received && canWork ? (event: MouseEvent<HTMLElement>) => {
    if (!(event.target as HTMLElement).closest('input[type="text"], input[type="search"], textarea')) event.preventDefault();
  } : undefined;
  const rowKey = (row: ReturnRow) => row.key || `${row.client_id}:${row.id}`;
  const listEnd = <>
    <div ref={sentinelRef} className="pa-scroll__end" aria-hidden="true" />
    {moreError && <div className="pa-scroll__footer"><Informer kind="error" action={<Button variant="action-secondary" size={400} onClick={loadMore}>Повторить</Button>}>{moreError}</Informer></div>}
    {/* Запасной путь без автоподгрузки: клавиатура, старые браузеры. Обычно до этой кнопки не доходят. */}
    {hasMore && !loadingMore && !moreError && !loading && !observable && <div className="pa-scroll__footer"><Button variant="secondary" size={400} onClick={loadMore}>Показать ещё</Button></div>}
    {!hasMore && !loading && !error && items.length > 0 && data && data.total > data.page_size && <div className="pa-scroll__footer pa-muted" role="status">Показаны все возвраты: {data.total.toLocaleString('ru-RU')}</div>}
  </>;
  return <div className="pa-orders pa-list">
    <FilterLayout
      heading={<>
    <h1 className="pa-visually-hidden">Возвраты</h1>
    <p className="pa-returns__description">{section === 'waiting'
      ? 'В списке есть возвраты в пути и ожидающие отправки. Проверяйте статус перед поездкой на ПВЗ.'
      : supplier
        ? 'Возвраты, которые по решению сотрудников нужно отправить поставщику. Скачайте ТТН и передайте товар вместе с ней.'
        : warehouse
        ? 'Возвраты, которые по решению сотрудников возвращаются на наш склад: перемещение в 1С создано. Когда товар придёт к нам, статус станет «Получено нами».'
        : shelf
        ? 'Возвраты, которые по решению сотрудников остаются у вас: перемещение на ваш склад в 1С проведено.'
        : 'Возвраты и FBO-коробки, которые Ozon уже передал продавцу и которые ещё не закрыты в архив.'}</p>
      </>}
      top={
    <div className="pa-list__topbar">
    <nav className="po-tabs__tabs po-tabs__size-500 po-tabs__hug po-tabs__underline pa-returns__tabs" aria-label="Разделы возвратов">
      <ReturnsTab to="/returns/waiting" label="Ждёт получения" count={counts.waiting} />
      <ReturnsTab to="/returns/received" label="Получено" count={counts.received} />
      <ReturnsTab to="/returns/shelf" label="Полка" count={counts.shelf} />
      <ReturnsTab to="/returns/supplier" label="Возврат поставщику" count={counts.supplier} />
      <ReturnsTab to="/returns/warehouse" label="Возврат на склад" count={counts.warehouse} />
    </nav>
    <form ref={formRef} className="pa-list__search" role="search" aria-label="Поиск возвратов" onSubmit={apply}>
      <div className="pa-list__search-field">
        <SearchField label="Поиск возвратов" placeholder={received && canWork ? 'Товар, артикул, коробка, документ 1С или код со сканера' : received || shelf || outbound ? 'Товар, артикул, коробка или документ' : 'Товар, артикул, отправление или коробка'} value={searchDraft}
          onValueChange={value => { if (value !== autoTried.current) autoTried.current = ''; noteInput(value); setHighlighted(null); suppressedSearch.current = null; currentSearch.current = value.trim(); setSearchDraft(value); }}
          onFocus={() => { focused.current = true; window.clearTimeout(blurTimer.current); if (suggestionSearch.current === searchDraft.trim() && suggestions.length) setSuggestionsOpen(true); }}
          onBlur={() => { focused.current = false; blurTimer.current = window.setTimeout(() => setSuggestionsOpen(false), 150); }}
          onKeyDown={searchKeyDown} aria-autocomplete="list" aria-controls={suggestionsOpen && suggestions.length ? 'return-suggestions' : undefined}
          aria-activedescendant={suggestionsOpen && activeSuggestion >= 0 ? `return-suggestion-${activeSuggestion}` : undefined} maxLength={100}
          autoFocus={received && canWork} />
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="po-dropdown po-dropdown--500 pa-popover pa-order-suggestions">
            <div className="po-dropdown__scroll"><div id="return-suggestions" className="po-dropdown__list" role="listbox" aria-label="Подсказки по возвратам">
              {suggestions.map((row, index) => <div id={`return-suggestion-${index}`} key={rowKey(row)} role="option"
                aria-selected={activeSuggestion === index} className={`po-dropdown-item${activeSuggestion === index ? ' po-dropdown-item--focused' : ''}`}
                onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveSuggestion(index)} onClick={() => chooseSuggestion(row)}>
                <div className="po-dropdown-item__block pa-order-suggestions__block">
                  <span className="po-dropdown-item__text pa-order-suggestions__title">{suggestionLabel(row, search)}</span>
                  <span className="pa-order-suggestions__detail">{[row.name, row.offer_id, row.return_type === 'fbo' ? 'Коробка FBO' : row.posting_number].filter(Boolean).join(' · ')}</span>
                </div>
              </div>)}
            </div></div>
          </div>
        )}
      </div>
      {received && canWork && <span className="pa-returns__scanner ozi-body-400-true">Сканер готов</span>}
      <Button type="submit" size={500}>Найти</Button>
    </form>
    </div>
      }
      panel={renderPanel} chips={chips} activeCount={activeCount} onClear={clear} onMouseDown={keepSearchFocus}
      resultLabel={data ? `Показать ${data.total.toLocaleString('ru-RU')} ${plural(data.total, 'возврат', 'возврата', 'возвратов')}` : 'Показать'}>
    {received && !canWork && <Informer kind="info">Для изменения приёмки попросите владельца включить право «Приём возвратов».</Informer>}
        {error && <div className="pa-notice"><Informer kind="error" title="Не удалось загрузить возвраты" action={<Button variant="action-secondary" size={400} onClick={() => setRetry(n => n + 1)}>Повторить</Button>}>{error}</Informer></div>}
        {scanResult && <div className="pa-notice"><Informer kind={scanResult.kind}>{scanResult.text}</Informer></div>}
        {ttnError && <div className="pa-notice"><Informer kind="error" title="Не удалось скачать ТТН">{ttnError}</Informer></div>}
        {markError && <div className="pa-notice"><Informer kind="error" title="Отметка не сохранена">{markError}</Informer></div>}
        {data?.partial && !error && <div className="pa-notice"><Informer kind="warning">Не все кабинеты обновились. Некоторые данные могут быть устаревшими.</Informer></div>}
        {loading && !data && !error && <div className="pa-list__summary" role="status" aria-label="Загружаем возвраты"><Skeleton width={110} height={24} /><Skeleton width={190} height={16} /></div>}
        {data && !error && <div className="pa-list__summary"><div className="po-page__count" role="status" aria-live="polite">Найдено: {data.total.toLocaleString('ru-RU')}</div><span>Время выгрузки: {formatUtcDateTime(data.snapshot_at)}{data.fbo_snapshot_at ? ` · FBO: ${formatUtcDateTime(data.fbo_snapshot_at)}` : ''}</span></div>}
        {!loading && !error && data && items.length === 0 && <EmptyState illustration={emptyIllustration} title={searching ? 'Ничего не найдено' : 'Возвратов пока нет'}>{searching ? 'Попробуйте изменить или сбросить фильтры.' : 'Возвраты появятся здесь, когда Ozon передаст данные.'}</EmptyState>}
        {!error && (loading || items.length > 0) && (
          phone
            ? <ul className="pa-returns-cards" aria-label={supplier ? 'Возвраты поставщику' : warehouse ? 'Возвраты на склад' : shelf ? 'Возвраты на полке' : received ? 'Полученные возвраты' : 'Возвраты, ожидающие получения'} aria-busy={loading}>{loading ? skeletonCards(6) : [...rows.map(row => <li ref={row.key === highlighted ? highlightedCard : undefined} className={`pa-returns-card${row.key === highlighted ? ' pa-returns__row--highlight' : ''}`} key={rowKey(row)}>
                {productCell(row)}
                <dl className="pa-returns-card__details">
                  <dt>Отправление / коробка</dt><dd>{postingCell(row)}</dd>
                  {outbound ? <>
                    <dt>Склад и документ</dt><dd>{outboundDoc(row)}</dd>
                    <dt>Статус</dt><dd>{outboundStatus(row)}</dd>
                    <dt>Кабинет</dt><dd>{cabinetName(row)}</dd>
                    <dt>Количество</dt><dd>{formatQuantity(row.qty)}</dd>
                  </> : shelf ? <>
                    <dt>Склад партнёра</dt><dd>{shelfWarehouse(row)}</dd>
                    <dt>Перемещено</dt><dd>{shelfMoved(row)}</dd>
                    <dt>Статус</dt><dd>{shelfStatus(row)}</dd>
                    <dt>Кабинет</dt><dd>{cabinetName(row)}</dd>
                    <dt>Количество</dt><dd>{formatQuantity(row.qty)}</dd>
                  </> : <>
                  <dt>Поставщик</dt><dd>{supplierCell(row)}</dd>
                  <dt>Статус Ozon</dt><dd>{statusBadge(row)}{pairReason(row)}</dd>
                  <dt>Пункт выдачи</dt><dd>{placeCell(row)}</dd>
                  <dt>Кабинет</dt><dd>{cabinetName(row)}</dd>
                  <dt>Дата возврата</dt><dd>{formatDate(row.return_date)}</dd>
                  <dt>Количество</dt><dd>{formatQuantity(row.qty)}</dd></>}
                </dl>
                {supplier && <div className="pa-returns__mark-box pa-returns-card__mark">{outboundTtn(row)}</div>}
                {hasMark && <div className="pa-returns__mark-box pa-returns-card__mark">{markCell(row)}</div>}
              </li>), ...(loadingMore ? skeletonCards(3) : [])]}</ul>
            : <div className="pa-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={supplier ? 'Возвраты поставщику' : warehouse ? 'Возвраты на склад' : shelf ? 'Возвраты на полке' : received ? 'Полученные возвраты' : 'Возвраты, ожидающие получения'}><div className={`pa-table${outbound ? ` pa-table--outbound pa-table--${section}` : shelf ? ' pa-table--shelf' : ' pa-table--main'}`}><table className="po-table__table"><thead><tr className="po-table-row__row">{(supplier ? SUPPLIER_COLUMNS : warehouse ? WAREHOUSE_COLUMNS : shelf ? SHELF_COLUMNS : ['Товар', 'Отправление / коробка', 'Поставщик', 'Статус Ozon', 'Пункт выдачи', 'Дата', 'Кол-во', ...(hasMark ? ['Приёмка'] : [])]).map(x => <th className={TH} key={x}>{x}</th>)}</tr></thead>
              <tbody>{loading ? skeletonRows(8, hasMark) : [...rows.map(row => <tr ref={row.key === highlighted ? highlightedRow : undefined} className={`po-table-row__row${row.key === highlighted ? ' pa-returns__row--highlight' : ''}`} key={rowKey(row)}>
                <td className={`${TD} pa-col-product`}>{productCell(row)}</td>
                <td className={TD}>{postingCell(row)}</td>
                {outbound ? <>
                  <td className={TD}>{outboundDoc(row)}</td>
                  {supplier && <td className={TD}>{outboundTtn(row)}</td>}
                  <td className={TD}>{outboundStatus(row)}</td>
                </> : shelf ? <>
                  <td className={TD}>{shelfWarehouse(row)}<div className="pa-sub">{formatQuantity(row.qty)} шт.</div></td>
                  <td className={TD}>{shelfMoved(row)}</td>
                  <td className={TD}>{shelfStatus(row)}</td>
                </> : <>
                <td className={TD}>{supplierCell(row)}</td>
                <td className={TD}>{statusBadge(row)}{pairReason(row)}</td>
                <td className={TD}>{placeCell(row)}</td>
                <td className={TD}>{formatDate(row.return_date)}</td><td className={TD}>{formatQuantity(row.qty)}</td>
                {hasMark && <td className={`${TD} pa-returns__mark`}>{markCell(row)}</td>}
                </>}
              </tr>), ...(loadingMore ? skeletonRows(3, hasMark) : [])]}</tbody></table></div>{listEnd}</div>)}
        {phone && !loading && items.length > 0 && listEnd}
    </FilterLayout>
    {image && <Lightbox src={ozonImage(image.url, 800) ?? image.url} fallbackSrc={image.url} alt={image.alt} onClose={() => setImage(null)} />}
  </div>;
}

/** Вкладка раздела по брендбуку (tabs.css); количество серым, чтобы не спорить с названием и активным цветом. */
function ReturnsTab({ to, label, count }: { to: string; label: string; count: number | null }) {
  return <NavLink to={to} className="po-tab__tab" onClick={() => {
    try { window.localStorage.setItem('partner-office.returns-section', to.endsWith('/received') ? 'received' : to.endsWith('/shelf') ? 'shelf' : to.endsWith('/supplier') ? 'supplier' : to.endsWith('/warehouse') ? 'warehouse' : 'waiting'); } catch { /* storage may be unavailable */ }
  }}>
    {({ isActive }) => <div className={`po-data-cell__dataCell po-tab-content__tabContent po-tab-content__size-500${isActive ? ' po-tab-content__active' : ''}`} style={{ '--columns': '1fr' } as CSSProperties}>
      <div className="po-data-cell__content"><div className="po-data-content__dataContent po-data-content__size-500">
        <div className="po-data-content__label po-data-content__label-size-500 ozi-table-500">{label}{count !== null && <span className="pa-returns__tab-count">{count.toLocaleString('ru-RU')}</span>}</div>
      </div></div>
    </div>}
  </NavLink>;
}

/**
 * Фильтр «Приёмка»: Ожидает / Принят / Не принят; у «Принят» раскрывается уточнение ОК / Брак / Пересорт.
 * В адрес и на сервер уходят значения через запятую: «accepted» — все принятые, «defect» — принятые с браком (старые ссылки ?mark=defect
 * открываются как «Принят → Брак»). Выбор уточнения заменяет общий «accepted», снятие всех уточнений возвращает его.
 */
function MarkFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = splitList(value);
  const subs = selected.filter(item => SUB_VALUES.includes(item));
  const accepted = selected.includes('accepted') || subs.length > 0;
  const others = selected.filter(item => item !== 'accepted' && !SUB_VALUES.includes(item));
  const toggleStatus = (status: string) => {
    if (status !== 'accepted') { onChange(toggleValue(value, status)); return; }
    onChange(joinList(accepted ? others : [...others, 'accepted']));
  };
  const toggleSub = (sub: string) => {
    const next = subs.includes(sub) ? subs.filter(item => item !== sub) : [...subs, sub];
    onChange(joinList([...others, ...(next.length ? next : ['accepted'])]));
  };
  return <div className="pa-filter-options">
    {MARK_OPTIONS.map(option => {
      const checked = option.value === 'accepted' ? accepted : selected.includes(option.value);
      return <div key={option.value}>
        <label className="pa-filter-option ozi-table-500">
          <input type="checkbox" className="po-checkbox" checked={checked} onChange={() => toggleStatus(option.value)} />
          <span className="pa-filter-option__label">{option.label}</span>
        </label>
        {option.value === 'accepted' && accepted && <div className="pa-filter-sub" role="group" aria-label="Результат приёмки">
          {MARK_SUB_OPTIONS.map(sub => <label key={sub.value} className="pa-filter-option ozi-table-500">
            <input type="checkbox" className="po-checkbox" checked={subs.includes(sub.value)} onChange={() => toggleSub(sub.value)} />
            <span className="pa-filter-option__label">{sub.label}</span>
          </label>)}
        </div>}
      </div>;
    })}
  </div>;
}

/**
 * Статус приёмки: бейдж открывает список из трёх статусов (Ожидает / Принят / Не принят). Правее у «Принят» стоят маленькие плашки
 * результата: ОК (светло-зелёная), Брак (красноватая), Пересорт (фиолетовая). Выбранная светится своим цветом, остальные серые;
 * клик по плашке сохраняет сразу. Плашка не меняет основной статус, уход из «Принят» сбрасывает её в ОК.
 * Без права на приёмку — только бейдж и плашка не-ОК результата.
 */
function MarkCell({ row, canWork, busy, onChange }: { row: ReturnRow; canWork: boolean; busy: boolean; onChange: (patch: MarkPatch) => void }) {
  const status = MARK_STATUSES.find(item => item.value === (row.mark ?? 'pending')) ?? MARK_STATUSES[0];
  const sub = markSub(row);
  const { open, setOpen, close, rootRef, buttonRef } = usePopover();
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = MARK_STATUSES.map(item => ({
    ...item, checked: item.value === status.value,
    apply: () => { if (item.value !== status.value) onChange(item.value === 'accepted' ? subPatch('ok') : { status: item.value, defect: false, missort: false }); }
  }));

  // Список рисуется поверх таблицы (fixed), иначе его обрежет прокрутка таблицы; у нижнего края открывается вверх.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) { setPosition(null); return; }
    const rect = buttonRef.current.getBoundingClientRect();
    const gap = 8, width = Math.min(MENU_WIDTH, window.innerWidth - gap * 2);
    const left = Math.min(Math.max(gap, rect.left), window.innerWidth - width - gap);
    const below = window.innerHeight - rect.bottom - gap - 4, above = rect.top - gap - 4;
    setPosition(below < MENU_HEIGHT && above > below ? { bottom: window.innerHeight - rect.top + 4, left, width, maxHeight: above } : { top: rect.bottom + 4, left, width, maxHeight: below });
    setActive(Math.max(0, items.findIndex(item => item.checked)));
    const hide = () => setOpen(false);
    window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { if (position) menuRef.current?.focus({ preventScroll: true }); }, [position]);

  const choose = (index: number) => { items[index]?.apply(); close(); };
  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(items.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); setActive(items.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    else if (event.key === 'Tab') setOpen(false);
  };
  const accepted = status.value === 'accepted';

  return <div className="pa-returns__mark-box" ref={rootRef}>
    {canWork
      ? <button type="button" ref={buttonRef} className="pa-badge-button" aria-haspopup="menu" aria-expanded={open} aria-label={`Статус приёмки: ${status.label}`} disabled={busy}
          onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
          <Badge kind={status.kind} chevron>{status.label}</Badge>
        </button>
      : <Badge kind={status.kind}>{status.label}</Badge>}
    {accepted && (canWork
      ? <div className="pa-subchips" role="radiogroup" aria-label="Результат приёмки">
        {MARK_SUBS.map(option => <Fragment key={option.value}>
          {/* ОК стоит в верхней строке рядом со статусом, «Брак» и «Пересорт» переносятся на строку ниже */}
          {option.value === 'defect' && <span className="pa-subchips__break" aria-hidden="true" />}
          <button type="button" role="radio" aria-checked={option.value === sub} disabled={busy}
            className={`pa-subchip pa-subchip--${option.value}${option.value === sub ? ' pa-subchip--active' : ''}`}
            onClick={() => { if (option.value !== sub) onChange(subPatch(option.value)); }}>{option.label}</button>
        </Fragment>)}
      </div>
      : sub !== 'ok' && <span className={`pa-subchip pa-subchip--${sub} pa-subchip--active`}>{MARK_SUBS.find(option => option.value === sub)?.label}</span>)}
    {open && position && <div className="po-dropdown po-dropdown--500 pa-returns__menu" style={{ ...position, position: 'fixed' }}>
      <div className="po-dropdown__scroll"><div ref={menuRef} className="po-dropdown__list" role="menu" aria-label="Статус приёмки" tabIndex={-1} onKeyDown={onMenuKeyDown}>
        {items.map((item, index) => <div key={item.value} role="menuitemradio" aria-checked={item.checked}
          className={`po-dropdown-item${active === index ? ' po-dropdown-item--focused' : ''}`}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
          <div className="po-dropdown-item__block">
            <Badge kind={item.kind}>{item.label}</Badge>
            {item.checked && <span className="po-dropdown-item__check" aria-hidden="true"><Icon name="ui-check" /></span>}
          </div>
        </div>)}
      </div></div>
    </div>}
  </div>;
}
