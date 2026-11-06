import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { request } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ozonImage } from '../lib/images';
import { formatDate, formatQuantity, formatRange, formatUtcDateTime } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import { Badge, type BadgeKind } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CopyValue } from '../ui/CopyValue';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { type FilterChip } from '../ui/FilterChips';
import { DateFilterSection, FilterPanel } from '../ui/FilterPanel';
import { FilterLayout } from '../ui/FilterLayout';
import { FilterSection } from '../ui/FilterSection';
import { CheckboxGroup } from '../ui/CheckboxGroup';
import { splitList, toggleValue } from '../lib/multi';
import { Skeleton } from '../ui/Skeleton';
import { useMediaQuery } from '../ui/useMediaQuery';
import { TextField } from '../ui/TextField';
import { Informer } from '../ui/Informer';
import { Lightbox } from '../ui/Lightbox';
import { ProductImage } from '../orders/OrdersTable';
import { SearchField } from '../ui/SearchField';
import { usePopover } from '../ui/usePopover';
import { useReturnsQuery, type ReturnsSection } from './useReturnsQuery';
import emptyIllustration from '../assets/illustrations/returns-empty.webp';

interface ReturnRow {
  key?: string; return_type?: string; id: number | null; client_id: string; posting_number: string | null; barcode: string | null;
  box_id?: number | null; box_barcode?: string | null; sku?: number | null; name: string | null; offer_id: string | null; qty: number | null;
  status: string | null; status_name: string | null; target_place: string | null; target_place_addr: string | null; return_date: string | null;
  image_url?: string | null; batch_id?: string | null; ii_code?: string | null;
  mark?: string; defect?: boolean; missort?: boolean; comment?: string; marked_by?: string;
  /** Штуки одного отправления, показанные одной строкой; у каждой свой key и отметки. */
  units?: ReturnRow[];
  /** Ключ свёрнутой строки, если это штука, показанная отдельно при разборе. */
  unitOf?: string;
}
type ReturnMark = Pick<ReturnRow, 'mark' | 'defect' | 'missort' | 'comment' | 'marked_by'>;
type MarkPatch = { status?: 'pending' | 'accepted' | 'rejected'; defect?: boolean; missort?: boolean };
interface ReturnPage { items: ReturnRow[]; total: number; page: number; page_size: number; snapshot_at: string | null; fbo_snapshot_at?: string | null; partial: boolean; exact_search?: boolean; cabinets?: { id: number; name: string; ozonClientId: string }[] }
/** Разобранная строка заменяется своими штуками; картинка есть только у строки верхнего уровня. */
const displayedRows = (items: ReturnRow[], expanded: Set<string>): ReturnRow[] => items.flatMap(row =>
  row.units?.length && row.key && expanded.has(row.key) ? row.units.map(unit => ({ ...unit, image_url: row.image_url, unitOf: row.key })) : [row]);
const TH = 'po-table-cell-base__cell po-table-cell-base__th ozi-table-400-true po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
const TD = 'po-table-cell-base__cell po-table-cell-base__td ozi-table-500 po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
/** У каждого состояния приёмки свой цвет бейджа брендбука; брак и пересорт — флаги, их можно сочетать со статусом. */
const MARK_STATUSES: { value: 'pending' | 'accepted' | 'rejected'; label: string; kind: BadgeKind }[] = [
  { value: 'pending', label: 'Ожидает', kind: 'secondary warning' },
  { value: 'accepted', label: 'Принят', kind: 'primary success' },
  { value: 'rejected', label: 'Не принят', kind: 'primary negative' }
];
const MARK_FLAGS: { field: 'defect' | 'missort'; label: string; kind: BadgeKind }[] = [
  { field: 'defect', label: 'Брак', kind: 'secondary negative' },
  { field: 'missort', label: 'Пересорт', kind: 'secondary info' }
];
const MENU_WIDTH = 220, MENU_HEIGHT = 260;
const STATUS_OPTIONS = [
  { value: 'ArrivedAtReturnPlace', label: 'В пункте выдачи' }, { value: 'CheckAtPickupPoint', label: 'Проверка на ПВЗ' },
  { value: 'MovingToSeller', label: 'В пути к продавцу' }, { value: 'WaitingShipment', label: 'Ожидает отправки' }
];
const MARK_OPTIONS = [
  { value: 'pending', label: 'Ожидает' }, { value: 'accepted', label: 'Принят' }, { value: 'rejected', label: 'Не принят' },
  { value: 'defect', label: 'Брак' }, { value: 'missort', label: 'Пересорт' }
];

/** Строки-заглушки по форме настоящих: таблица не прыгает, когда приходят данные. */
const skeletonRows = (count: number, hasMark: boolean) => Array.from({ length: count }, (_, i) => <tr key={`sk-${i}`} className="po-table-row__row" aria-hidden="true">
  <td className={`${TD} pa-col-product`}><div className="pa-returns__product"><Skeleton width={40} height={40} /><div className="pa-skeleton-stack"><Skeleton width="75%" height={16} /><Skeleton width="45%" height={12} /></div></div></td>
  <td className={TD}><div className="pa-skeleton-stack"><Skeleton width={130} height={16} /><Skeleton width={80} height={12} /></div></td>
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
  const fields = [row.posting_number, row.box_barcode, row.box_id?.toString(), row.barcode, row.ii_code, row.offer_id, row.sku?.toString(), row.name];
  const search = query.toLocaleLowerCase();
  return fields.find(value => value?.toLocaleLowerCase().includes(search)) || row.name || 'Возврат';
}

export function ReturnsPage({ section = 'waiting' }: { section?: ReturnsSection }) {
  const { partner } = useAuth();
  const allowed = hasPermission(partner, 'ViewReturns');
  const canWork = hasPermission(partner, 'ReturnsWork');
  const phone = useMediaQuery('(max-width: 767px)', false);
  const { filters: panelFilters, pvzDraft, setPvzDraft, change, clear, activeCount } = useReturnsQuery(section);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const filters = useMemo(() => ({ search, ...panelFilters }), [search, panelFilters]);
  const [data, setData] = useState<ReturnPage | null>(null);
  // Список подгружается при прокрутке: items копится порциями, pagesLoaded — сколько порций уже в нём.
  const [items, setItems] = useState<ReturnRow[]>([]);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const pagesRef = useRef(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const moreController = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  // Первый кадр уже со скелетоном: иначе список мигнул бы пустотой до начала загрузки.
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [counts, setCounts] = useState<{ waiting: number | null; received: number | null }>({ waiting: null, received: null });
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

  const listUrl = (page: number) => `/partner-api/returns?${new URLSearchParams({ section, page: String(page), pageSize: String(PAGE_SIZE), ...filters })}`;
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    moreController.current?.abort();
    // Фоновое обновление не прячет таблицу, не трогает подсказки и не показывает ошибку: остаётся прежний список;
    // уже подгруженные порции обновляются все, чтобы список не «откатывался» к первой.
    const quiet = quietRefresh.current;
    quietRefresh.current = false;
    const upto = quiet ? pagesRef.current : 1;
    if (!quiet) { setLoading(true); setError(''); setMoreError(''); setLoadingMore(false); }
    Promise.all(Array.from({ length: upto }, (_, index) => request<ReturnPage>(listUrl(index + 1), { signal: controller.signal })))
      .then(results => {
        if (filters.search !== currentSearch.current) return;
        const result = results[0];
        setData(result);
        setItems(mergeRows([], results.flatMap(item => item.items)));
        pagesRef.current = upto; setPagesLoaded(upto);
        if (!quiet && filters.search.length >= 2 && filters.search !== suppressedSearch.current) {
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

  // Количество в подписях вкладок — все возвраты раздела без фильтров; недоступное число просто не показываем.
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    (['waiting', 'received'] as const).forEach(name => {
      request<ReturnPage>(`/partner-api/returns?${new URLSearchParams({ section: name, page: '1', pageSize: '1' })}`, { signal: controller.signal })
        .then(result => setCounts(previous => ({ ...previous, [name]: result.total })))
        .catch(() => undefined);
    });
    return () => controller.abort();
  }, [allowed, retry]);

  // Выгрузка из Ozon и отметки из ozon-returns приходят без участия страницы: подтягиваем их раз в минуту
  // и при возврате на вкладку, пока открыта вкладка и нет несохранённой отметки.
  useEffect(() => {
    if (!allowed) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || savingNow.current) return;
      quietRefresh.current = true;
      setRetry(n => n + 1);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, [allowed]);

  /** Перечитать уже показанные порции, не прячась за скелетон: после отметки и скана список остаётся на месте. */
  const refreshQuietly = () => { quietRefresh.current = true; setRetry(n => n + 1); };

  /** Отметка приёмки: сервер возвращает итоговое состояние, им и заменяем строку (без угадывания на клиенте). */
  const mark = async (row: ReturnRow, patch: MarkPatch) => {
    if (!row.key || saving.includes(row.key)) return;
    // свёрнутая строка — это несколько записей: отметка пишется на каждую штуку
    const keys = row.units?.length ? row.units.map(unit => unit.key!) : [row.key];
    savingNow.current = true;
    setMarkError(''); setSaving(keys => [...keys, row.key!]);
    try {
      let result: ReturnMark = {};
      for (const key of keys) result = await request<ReturnMark>('/partner-api/returns/mark', { method: 'POST', body: JSON.stringify({ key, ...patch }) });
      setItems(previous => previous.map(item =>
        row.unitOf ? (item.key === row.unitOf ? { ...item, units: item.units?.map(unit => unit.key === row.key ? { ...unit, ...result } : unit) } : item)
          : item.key === row.key ? { ...item, ...result, units: item.units?.map(unit => ({ ...unit, ...result })) } : item));
      // отметка одной штуки могла разделить строку: как их показывать, решает сервер
      if (row.unitOf) refreshQuietly();
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : 'Не удалось сохранить отметку.');
      if (keys.length > 1) refreshQuietly();   // часть штук могла сохраниться
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
      await request<ReturnMark>('/partner-api/returns/mark', { method: 'POST', body: JSON.stringify({ key: row.key, status: 'accepted' }) });
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
  const cabinets = data?.cabinets ?? [];
  const cabinetName = (row: ReturnRow) => cabinets.find(c => c.ozonClientId === row.client_id)?.name || '—';
  const label = (options: { value: string; label: string }[], value: string) => options.find(option => option.value === value)?.label ?? value;
  // Тег на каждое выбранное значение: крестик снимает только его.
  const valueChips = (id: 'mark' | 'status' | 'clientId', title: string, name: (value: string) => string): FilterChip[] =>
    splitList(panelFilters[id]).map(value => ({ id: `${id}:${value}`, label: `${title}: ${name(value)}`, onRemove: () => change({ [id]: toggleValue(panelFilters[id], value) }) }));
  const chips: FilterChip[] = [
    ...valueChips('mark', 'Приёмка', value => label(MARK_OPTIONS, value)),
    ...valueChips('status', 'Статус Ozon', value => label(STATUS_OPTIONS, value)),
    ...valueChips('clientId', 'Кабинет', value => cabinets.find(c => String(c.id) === value)?.name ?? value),
    ...(panelFilters.pvz ? [{ id: 'pvz', label: `Пункт выдачи: ${panelFilters.pvz}`, onRemove: () => change({ pvz: '' }) }] : []),
    ...(panelFilters.dateFrom || panelFilters.dateTo ? [{ id: 'date', label: `${received ? 'Получено' : 'Возврат'}: ${formatRange(panelFilters.dateFrom, panelFilters.dateTo)}`, onRemove: () => change({ dateFrom: '', dateTo: '' }) }] : [])
  ];
  const renderPanel = (hideTitle: boolean) => <FilterPanel activeCount={activeCount} hideTitle={hideTitle} onClear={clear}>
    {received
      ? <FilterSection title="Приёмка" active={!!panelFilters.mark}><CheckboxGroup value={panelFilters.mark} options={MARK_OPTIONS} onChange={value => change({ mark: value })} /></FilterSection>
      : <FilterSection title="Статус Ozon" active={!!panelFilters.status}><CheckboxGroup value={panelFilters.status} options={STATUS_OPTIONS} onChange={value => change({ status: value })} /></FilterSection>}
    {cabinets.length > 0 && <FilterSection title="Кабинет" active={!!panelFilters.clientId}>
      <CheckboxGroup value={panelFilters.clientId} options={cabinets.map(c => ({ value: String(c.id), label: c.name }))} onChange={value => change({ clientId: value })} />
    </FilterSection>}
    <FilterSection title="Пункт выдачи" active={!!panelFilters.pvz}><TextField label="Название пункта" value={pvzDraft} onValueChange={setPvzDraft} size={500} maxLength={100} /></FilterSection>
    <DateFilterSection title={received ? 'Дата получения' : 'Дата возврата'} from={panelFilters.dateFrom} to={panelFilters.dateTo} onChange={(dateFrom, dateTo) => change({ dateFrom, dateTo })} />
  </FilterPanel>;
  const rows = displayedRows(items, expandedUnits);
  const hasMark = canWork || received;
  const searching = activeCount > 0 || !!search;
  const productCell = (row: ReturnRow) => <div className="pa-returns__product">
    <ProductImage url={row.image_url ?? null} alt={row.name || 'Товар'} onOpen={setImage} />
    <div>{row.name || '—'}<div className="pa-sub">{row.offer_id ? <CopyValue value={row.offer_id} label="артикул" /> : '—'}{cabinets.length > 1 && cabinetName(row) !== '—' ? ` · ${cabinetName(row)}` : ''}</div>
      {(row.units?.length || row.unitOf) && <button type="button" className="pa-link pa-returns__units-toggle" onClick={() => toggleUnits((row.unitOf || row.key)!)}>{row.unitOf ? 'Свернуть' : `${row.units!.length} шт. · Разобрать по штукам`}</button>}</div></div>;
  const postingCell = (row: ReturnRow) => {
    const main = row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? `boxId ${row.box_id}` : 'Коробка FBO')) : (row.posting_number || '—');
    const copyable = row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? String(row.box_id) : null)) : row.posting_number;
    return <><CopyValue value={copyable} label={row.return_type === 'fbo' ? 'код коробки' : 'номер отправления'}>{main}</CopyValue>
      <div className="pa-sub">{row.return_type === 'fbo' ? 'Коробка FBO' : row.barcode ? <CopyValue value={row.barcode} label="код этикетки" /> : 'Возврат'}</div></>;
  };
  const statusBadge = (row: ReturnRow) => <Badge kind={row.status === 'ArrivedAtReturnPlace' ? 'primary success' : 'secondary info'}>{row.status_name || '—'}</Badge>;
  const placeCell = (row: ReturnRow) => <>{row.target_place || '—'}<div className="pa-sub">{row.target_place_addr}</div></>;
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
    <h1 className="po-page__title">Возвраты</h1>
    <nav className="po-tabs__tabs po-tabs__size-500 po-tabs__hug po-tabs__underline pa-returns__tabs" aria-label="Разделы возвратов">
      <ReturnsTab to="/returns/waiting" label="Ждёт получения" count={counts.waiting} />
      <ReturnsTab to="/returns/received" label="Получено" count={counts.received} />
    </nav>
    <p className="pa-returns__description">{section === 'waiting'
      ? 'В списке есть возвраты в пути и ожидающие отправки. Проверяйте статус перед поездкой на ПВЗ.'
      : 'Возвраты и FBO-коробки, которые Ozon уже передал продавцу и которые ещё не закрыты в архив.'}</p>
      </>}
      search={
    <form ref={formRef} className="pa-list__search" role="search" aria-label="Поиск возвратов" onSubmit={apply}>
      <div className="pa-list__search-field">
        <SearchField label="Поиск возвратов" placeholder={received && canWork ? 'Товар, артикул, коробка или код со сканера' : 'Товар, артикул, отправление или коробка'} value={searchDraft}
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
      }
      panel={renderPanel} chips={chips} activeCount={activeCount} onClear={clear} onMouseDown={keepSearchFocus}
      resultLabel={data ? `Показать ${data.total.toLocaleString('ru-RU')} ${plural(data.total, 'возврат', 'возврата', 'возвратов')}` : 'Показать'}>
    {received && !canWork && <Informer kind="info">Для изменения приёмки попросите владельца включить право «Приём возвратов».</Informer>}
        {error && <div className="pa-notice"><Informer kind="error" title="Не удалось загрузить возвраты" action={<Button variant="action-secondary" size={400} onClick={() => setRetry(n => n + 1)}>Повторить</Button>}>{error}</Informer></div>}
        {scanResult && <div className="pa-notice"><Informer kind={scanResult.kind}>{scanResult.text}</Informer></div>}
        {markError && <div className="pa-notice"><Informer kind="error" title="Отметка не сохранена">{markError}</Informer></div>}
        {data?.partial && !error && <div className="pa-notice"><Informer kind="warning">Не все кабинеты обновились. Некоторые данные могут быть устаревшими.</Informer></div>}
        {loading && !data && !error && <div className="pa-list__summary" role="status" aria-label="Загружаем возвраты"><Skeleton width={110} height={24} /><Skeleton width={190} height={16} /></div>}
        {data && !error && <div className="pa-list__summary"><div className="po-page__count" role="status" aria-live="polite">Найдено: {data.total.toLocaleString('ru-RU')}</div><span>Время выгрузки: {formatUtcDateTime(data.snapshot_at)}{data.fbo_snapshot_at ? ` · FBO: ${formatUtcDateTime(data.fbo_snapshot_at)}` : ''}</span></div>}
        {!loading && !error && data && items.length === 0 && <EmptyState illustration={emptyIllustration} title={searching ? 'Ничего не найдено' : 'Возвратов пока нет'}>{searching ? 'Попробуйте изменить или сбросить фильтры.' : 'Возвраты появятся здесь, когда Ozon передаст данные.'}</EmptyState>}
        {!error && (loading || items.length > 0) && (
          phone
            ? <ul className="pa-returns-cards" aria-label={received ? 'Полученные возвраты' : 'Возвраты, ожидающие получения'} aria-busy={loading}>{loading ? skeletonCards(6) : [...rows.map(row => <li ref={row.key === highlighted ? highlightedCard : undefined} className={`pa-returns-card${row.key === highlighted ? ' pa-returns__row--highlight' : ''}`} key={rowKey(row)}>
                {productCell(row)}
                <dl className="pa-returns-card__details">
                  <dt>Отправление / коробка</dt><dd>{postingCell(row)}</dd>
                  <dt>Статус Ozon</dt><dd>{statusBadge(row)}</dd>
                  <dt>Пункт выдачи</dt><dd>{placeCell(row)}</dd>
                  <dt>Кабинет</dt><dd>{cabinetName(row)}</dd>
                  <dt>Дата возврата</dt><dd>{formatDate(row.return_date)}</dd>
                  <dt>Количество</dt><dd>{formatQuantity(row.qty)}</dd>
                </dl>
                {hasMark && <div className="pa-returns__mark-box pa-returns-card__mark">{markCell(row)}</div>}
              </li>), ...(loadingMore ? skeletonCards(3) : [])]}</ul>
            : <div className="pa-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={received ? 'Полученные возвраты' : 'Возвраты, ожидающие получения'}><div className="pa-table"><table className="po-table__table"><thead><tr className="po-table-row__row">{['Товар', 'Отправление / коробка', 'Статус Ozon', 'Пункт выдачи', 'Дата', 'Кол-во', ...(hasMark ? ['Приёмка'] : [])].map(x => <th className={TH} key={x}>{x}</th>)}</tr></thead>
              <tbody>{loading ? skeletonRows(8, hasMark) : [...rows.map(row => <tr ref={row.key === highlighted ? highlightedRow : undefined} className={`po-table-row__row${row.key === highlighted ? ' pa-returns__row--highlight' : ''}`} key={rowKey(row)}>
                <td className={`${TD} pa-col-product`}>{productCell(row)}</td>
                <td className={TD}>{postingCell(row)}</td>
                <td className={TD}>{statusBadge(row)}</td>
                <td className={TD}>{placeCell(row)}</td>
                <td className={TD}>{formatDate(row.return_date)}</td><td className={TD}>{formatQuantity(row.qty)}</td>
                {hasMark && <td className={`${TD} pa-returns__mark`}>{markCell(row)}</td>}
              </tr>), ...(loadingMore ? skeletonRows(3, hasMark) : [])]}</tbody></table></div>{listEnd}</div>)}
        {phone && !loading && items.length > 0 && listEnd}
    </FilterLayout>
    {image && <Lightbox src={ozonImage(image.url, 800) ?? image.url} fallbackSrc={image.url} alt={image.alt} onClose={() => setImage(null)} />}
  </div>;
}

/** Вкладка раздела по брендбуку (tabs.css); количество серым, чтобы не спорить с названием и активным цветом. */
function ReturnsTab({ to, label, count }: { to: string; label: string; count: number | null }) {
  return <NavLink to={to} className="po-tab__tab">
    {({ isActive }) => <div className={`po-data-cell__dataCell po-tab-content__tabContent po-tab-content__size-500${isActive ? ' po-tab-content__active' : ''}`} style={{ '--columns': '1fr' } as CSSProperties}>
      <div className="po-data-cell__content"><div className="po-data-content__dataContent po-data-content__size-500">
        <div className="po-data-content__label po-data-content__label-size-500 ozi-table-500">{label}{count !== null && <span className="pa-returns__tab-count">{count.toLocaleString('ru-RU')}</span>}</div>
      </div></div>
    </div>}
  </NavLink>;
}

/** Статус приёмки: бейдж открывает список. Статус выбирается один, брак и пересорт включаются и снимаются отдельно. */
function MarkCell({ row, canWork, busy, onChange }: { row: ReturnRow; canWork: boolean; busy: boolean; onChange: (patch: MarkPatch) => void }) {
  const status = MARK_STATUSES.find(item => item.value === (row.mark ?? 'pending')) ?? MARK_STATUSES[0];
  const flags = MARK_FLAGS.filter(flag => row[flag.field]);
  const { open, setOpen, close, rootRef, buttonRef } = usePopover();
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = [
    ...MARK_STATUSES.map(item => ({ id: item.value, label: item.label, kind: item.kind, role: 'menuitemradio', checked: item.value === status.value, apply: () => onChange({ status: item.value }) })),
    ...MARK_FLAGS.map(flag => ({ id: flag.field, label: flag.label, kind: flag.kind, role: 'menuitemcheckbox', checked: !!row[flag.field], apply: () => onChange({ [flag.field]: !row[flag.field] }) }))
  ];

  // Список рисуется поверх таблицы (fixed), иначе его обрежет прокрутка таблицы; у нижнего края открывается вверх.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) { setPosition(null); return; }
    const rect = buttonRef.current.getBoundingClientRect();
    const gap = 8, width = Math.min(MENU_WIDTH, window.innerWidth - gap * 2);
    const left = Math.min(Math.max(gap, rect.left), window.innerWidth - width - gap);
    const below = window.innerHeight - rect.bottom - gap - 4, above = rect.top - gap - 4;
    setPosition(below < MENU_HEIGHT && above > below ? { bottom: window.innerHeight - rect.top + 4, left, width, maxHeight: above } : { top: rect.bottom + 4, left, width, maxHeight: below });
    setActive(Math.max(0, items.findIndex(item => item.id === status.value)));
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

  return <div className="pa-returns__mark-box" ref={rootRef}>
    {canWork
      ? <button type="button" ref={buttonRef} className="pa-badge-button" aria-haspopup="menu" aria-expanded={open} aria-label={`Статус приёмки: ${status.label}`} disabled={busy}
          onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
          <Badge kind={status.kind} chevron>{status.label}</Badge>
        </button>
      : <Badge kind={status.kind}>{status.label}</Badge>}
    {flags.map(flag => <Badge key={flag.field} kind={flag.kind}>{flag.label}</Badge>)}
    {open && position && <div className="po-dropdown po-dropdown--500 pa-returns__menu" style={{ ...position, position: 'fixed' }}>
      <div className="po-dropdown__scroll"><div ref={menuRef} className="po-dropdown__list" role="menu" aria-label="Статус приёмки" tabIndex={-1} onKeyDown={onMenuKeyDown}>
        {items.map((item, index) => <div key={item.id}>
          {index === MARK_STATUSES.length && <div className="pa-returns__menu-sep" role="separator" />}
          <div role={item.role} aria-checked={item.checked} className={`po-dropdown-item${active === index ? ' po-dropdown-item--focused' : ''}`}
            onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
            <div className="po-dropdown-item__block">
              <Badge kind={item.kind}>{item.label}</Badge>
              {item.checked && <span className="po-dropdown-item__check" aria-hidden="true"><Icon name="ui-check" /></span>}
            </div>
          </div>
        </div>)}
      </div></div>
    </div>}
  </div>;
}
