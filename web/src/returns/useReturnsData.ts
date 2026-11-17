import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { ApiError } from '../api/client';
import { API_BASE_URL } from '../config';
import { getReturnChanges, getReturnCounts, listReturns, returnEventsUrl, type ReturnPage, type ReturnRow } from '../api/returns';
import { applyReturnsDelta, mergeRows, readCounts, readList, rememberCounts, rememberList, replaceFirstPage, returnsCacheEpoch } from './returnsCache';
import { PAGE_SIZE, LOAD_AHEAD_PX } from './returnsModel';
import type { ReturnsSection } from './useReturnsQuery';

type Options = {
  allowed: boolean; section: ReturnsSection; filters: Record<string, string>; partnerId: number; phone: boolean;
  currentSearch: RefObject<string>; suppressedSearch: RefObject<string | null>; suggestionSearch: RefObject<string>;
  focused: RefObject<boolean>; setSuggestions: Dispatch<SetStateAction<ReturnRow[]>>;
  setActiveSuggestion: Dispatch<SetStateAction<number>>; setSuggestionsOpen: Dispatch<SetStateAction<boolean>>;
};
const COUNTS_REFRESH_MS = 60_000;
const EMPTY_COUNTS: Record<ReturnsSection, number | null> = { waiting: null, received: null, shelf: null, supplier: null, warehouse: null };
const ALL_SECTIONS: ReturnsSection[] = ['waiting', 'received', 'shelf', 'supplier', 'warehouse'];
/** Ключ кэша списка: партнёр, раздел, порция и фильтры. Адреса запросов знает только api/returns.ts. */
const listKeyFor = (partnerId: number, section: ReturnsSection, filters: Record<string, string>, page: number) =>
  `${partnerId}|${section}|${page}|${PAGE_SIZE}|${new URLSearchParams(filters)}`;


export function useReturnsData({ allowed, section, filters, partnerId, phone, currentSearch, suppressedSearch, suggestionSearch, focused, setSuggestions, setActiveSuggestion, setSuggestionsOpen }: Options) {
  const firstPageKey = listKeyFor(partnerId, section, filters, 1);
  // Уже открытый список показывается сразу, свежие данные приходят в фоне
  const [initialHit] = useState(() => readList<ReturnPage, ReturnRow>(firstPageKey));
  // Эпоха кэша на момент открытия страницы: после выхода или 401 кэш очищен, и эта страница в него больше не пишет.
  const sessionEpoch = useRef(returnsCacheEpoch());
  // Ключ кэша, которому принадлежат показанные сейчас data/items/pagesLoaded.
  const shownKey = useRef<string | null>(initialHit ? firstPageKey : null);
  /** Строки первой порции, как их отдал сервер в последний раз: именно они заменяются при тихом обновлении (порции 2+ остаются). */
  const firstPageRows = useRef<ReturnRow[]>(initialHit?.data.items ?? []);
  /** Поколение списка: растёт при смене списка (фильтры, раздел, reset). Ответы и дельты прежнего поколения отбрасываются. */
  const listGeneration = useRef(0);
  const deltaController = useRef<AbortController | null>(null);
  const [data, setData] = useState<ReturnPage | null>(initialHit?.data ?? null);
  // Список подгружается при прокрутке: items копится порциями, pagesLoaded — сколько порций уже в нём.
  const [items, setItems] = useState<ReturnRow[]>(initialHit?.items ?? []);
  const [supplierNames, setSupplierNames] = useState<string[]>(() => [...new Set((initialHit?.items ?? []).map(row => row.supplier?.trim()).filter((value): value is string => Boolean(value)))]);
  const itemsRef = useRef<ReturnRow[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    if (data?.suppliers) return;
    setSupplierNames(previous => [...new Set([...previous, ...items.map(row => row.supplier?.trim()).filter((value): value is string => Boolean(value))])].sort((a, b) => a.localeCompare(b, 'ru')));
  }, [items, data?.suppliers]);
  const [pagesLoaded, setPagesLoaded] = useState(initialHit?.pagesLoaded ?? 1);
  const pagesRef = useRef(initialHit?.pagesLoaded ?? 1);
  // Всё загруженное (все порции, актуальная ревизия) запоминаем для возврата на вкладку.
  useEffect(() => {
    if (data && shownKey.current) rememberList(sessionEpoch.current, shownKey.current, { data, items, pagesLoaded });
  }, [data, items, pagesLoaded]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const moreController = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  // Первый кадр уже со скелетоном: иначе список мигнул бы пустотой до начала загрузки (если списка нет в кэше).
  const [loading, setLoading] = useState(!initialHit);
  const [retry, setRetry] = useState(0);
  const [counts, setCounts] = useState<Record<ReturnsSection, number | null>>(() => readCounts(partnerId) ?? EMPTY_COUNTS);
  useEffect(() => { rememberCounts(sessionEpoch.current, partnerId, counts); }, [partnerId, counts]);
  const quietRefresh = useRef(false);
  /** Сервер сообщил reset: загруженные порции 2+ недействительны, список начинается с первой порции. */
  const resetRefresh = useRef(false);
  /** Основной список успешно загружен: только после этого допустимы запросы счётчиков по разделам (запасной путь без /counts). */
  const listOk = useRef(false);
  const runDeferredCounts = useRef<(() => void) | null>(null);
  /** Последняя известная ревизия: приходит со списком и растёт с каждой дельтой. */
  const revisionRef = useRef<string | null>(initialHit?.data.revision ?? null);
  const savingNow = useRef(false);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    // Фоновое обновление не прячет таблицу, не трогает подсказки и не показывает ошибку.
    // Оно перечитывает только первую порцию: порции 2+ остаются как были (иначе обновление превращалось бы в N запросов
    // и список «схлопывался» до первой порции). Сброс (reset) от сервера, наоборот, начинает список с первой порции.
    const background = quietRefresh.current;
    const reset = resetRefresh.current;
    quietRefresh.current = false; resetRefresh.current = false;
    const key = firstPageKey;
    // Такой список уже открывали: показываем прежние строки (все загруженные порции) сразу и обновляем их тихо, без скелетона
    const hit = background ? undefined : readList<ReturnPage, ReturnRow>(key);
    const quiet = background || !!hit;
    const keeping = background && !reset && shownKey.current === key;
    if (!keeping) {
      moreController.current?.abort();      // догрузка порции относилась к прежнему списку
      // Ревизия принадлежала прежнему списку: до ответа нового (или записи из кэша) дельты не запрашиваются
      revisionRef.current = hit?.data.revision ?? null;
    }
    // Дельта, запрошенная для прежнего списка или до этого обновления, больше не применяется и не двигает ревизию
    listGeneration.current++; deltaController.current?.abort();
    listOk.current = false;
    if (hit) {
      shownKey.current = key; firstPageRows.current = hit.data.items;
      setData(hit.data); setItems(hit.items); pagesRef.current = hit.pagesLoaded; setPagesLoaded(hit.pagesLoaded);
      setLoading(false); setError(''); setMoreError(''); setLoadingMore(false);
    } else if (!quiet) { setLoading(true); setError(''); setMoreError(''); setLoadingMore(false); }
    else if (!keeping) setLoadingMore(false);
    listReturns(section, { page: 1, pageSize: PAGE_SIZE, filters, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted || filters.search !== currentSearch.current) return;
        // Порции 2+ остаются, пока это тот же список; свежая первая порция заменяет прежнюю первую порцию целиком.
        const retain = quiet && !reset && shownKey.current === key;
        const previousFirst = firstPageRows.current;
        shownKey.current = key; firstPageRows.current = result.items; listOk.current = true;
        revisionRef.current = result.revision ?? null;
        setData(result);
        if (result.suppliers) setSupplierNames(result.suppliers);
        setCounts(previous => ({ ...previous, [section]: result.total }));
        if (retain) setItems(previous => replaceFirstPage(previous, previousFirst, result.items));
        else { setItems(mergeRows([], result.items)); pagesRef.current = 1; setPagesLoaded(1); }
        if (!background && filters.search.length >= 2 && filters.search !== suppressedSearch.current) {
          suggestionSearch.current = filters.search;
          setSuggestions(result.items.slice(0, 10));
          setActiveSuggestion(-1);
          setSuggestionsOpen(focused.current);
        }
      })
      .catch((err: unknown) => { if (!controller.signal.aborted && !quiet) setError(err instanceof Error ? err.message : 'Не удалось загрузить возвраты.'); })
      .finally(() => {
        if (controller.signal.aborted) return;
        if (!quiet) setLoading(false);
        // Только успешный список разрешает отложенные запросы счётчиков: при 503 и прочих ошибках они ждут следующего успеха
        if (listOk.current) { runDeferredCounts.current?.(); runDeferredCounts.current = null; }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, section, filters, retry]);

  const hasMore = !!data && pagesLoaded * data.page_size < data.total;
  const hasRevision = !!data?.revision;
  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    const next = pagesLoaded + 1;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true); setMoreError('');
    listReturns(section, { page: next, pageSize: PAGE_SIZE, filters, signal: controller.signal })
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
    // Запасной путь для Studio2 без /counts (404): по одному лёгкому запросу списка на раздел, по очереди.
    // Никогда не идёт параллельно основному списку и не запускается при 503 и прочих ошибках: это усиливало бы нагрузку на сервис, который и так не справляется.
    const loadCounts = async (names: ReturnsSection[], mine: AbortController) => {
      for (const other of names.filter(name => name !== section)) {
        if (mine.signal.aborted) return;
        try {
          const result = await listReturns(other, { page: 1, pageSize: 1, signal: mine.signal });
          if (!mine.signal.aborted) setCounts(previous => ({ ...previous, [other]: result.total }));
        } catch { /* счётчик вкладки не обязателен */ }
      }
    };
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      controller.abort(); controller = new AbortController();
      const mine = controller;
      runDeferredCounts.current = null;
      getReturnCounts(mine.signal)
        .then(result => {
          const all = result?.counts;
          if (!all) return;
          setCounts(previous => ({
            ...previous,
            ...Object.fromEntries((['waiting', 'received', 'shelf'] as const).filter(name => all[name] !== undefined).map(name => [name, all[name]])),
            // «Возврат поставщику» и «Возврат на склад» — части раздела outbound по адресату (`supplier` и `us` в ответе)
            ...(all.supplier !== undefined ? { supplier: all.supplier } : {}),
            ...(all.us !== undefined ? { warehouse: all.us } : {})
          }));
        })
        .catch((err: unknown) => {
          // Compatible rollout: уже развёрнутый Studio2 может ещё не отдавать /counts (404). Любая другая ошибка (503, сеть) — не повод
          // строить счётчики запросами списка; прежние числа остаются, следующая попытка по таймеру.
          if (mine.signal.aborted || !(err instanceof ApiError) || err.status !== 404) return;
          const run = () => { void loadCounts(ALL_SECTIONS, mine); };
          if (listOk.current) run(); else runDeferredCounts.current = run;   // только после успешного основного списка
        });
    };
    load();
    const timer = window.setInterval(load, COUNTS_REFRESH_MS);
    return () => { window.clearInterval(timer); controller.abort(); runDeferredCounts.current = null; };
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
    if (!allowed || !hasRevision || typeof EventSource === 'undefined') return;
    let closed = false;
    let busy = false;
    const source = new EventSource(returnEventsUrl(), { withCredentials: Boolean(API_BASE_URL) });
    source.onopen = () => { streamAlive.current = true; };
    source.onerror = () => { streamAlive.current = false; };
    const update = async () => {
      if (busy || closed || !revisionRef.current) return;
      busy = true;
      // Дельта принадлежит тому списку (и обновлению), для которого запрошена: смена фильтра или раздела, reset и перечитывание
      // списка отменяют её, а ответ, всё же пришедший позже, отбрасывается и не двигает ревизию.
      const generation = listGeneration.current;
      const controller = new AbortController();
      deltaController.current = controller;
      const stale = () => closed || controller.signal.aborted || generation !== listGeneration.current;
      try {
        const loadedKeys = itemsRef.current.map(row => row.key).filter((key): key is string => Boolean(key));
        const delta = await getReturnChanges(revisionRef.current, loadedKeys, controller.signal);
        if (stale() || !delta) return;
        // Ревизия растёт с каждой дельтой (в том числе пустой): иначе следующий запрос снова просил бы уже полученное.
        // Поток при этом не переподключается: эффект зависит только от наличия ревизии, а не от её значения.
        if (delta.revision) {
          revisionRef.current = delta.revision;
          setData(previous => previous && previous.revision !== delta.revision ? { ...previous, revision: delta.revision } : previous);
        }
        if (!delta.changed) return;
        setCounts(previous => ({ ...previous, ...delta.counts }));
        if (delta.reset) { resetRefresh.current = true; refreshQuietly(); return; }
        // Известные строки заменяются на месте; новая строка (мы не знаем, подходит ли она под фильтры и куда встаёт) — обычное обновление списка.
        const applied = applyReturnsDelta(itemsRef.current, delta);
        setItems(previous => applyReturnsDelta(previous, delta).items);
        if (applied.refresh) refreshQuietly();
      } catch { /* fallback poll will retry; do not disrupt an open list */ }
      finally { busy = false; if (deltaController.current === controller) deltaController.current = null; }
    };
    source.addEventListener('revision', update);
    return () => { closed = true; streamAlive.current = false; source.close(); deltaController.current?.abort(); };
  }, [allowed, hasRevision]);

  /** Перечитать уже показанные порции, не прячась за скелетон: после отметки и скана список остаётся на месте. */
  const refreshQuietly = () => { quietRefresh.current = true; setRetry(n => n + 1); };

  const retryList = () => setRetry(n => n + 1);
  return { data, items, setItems, supplierNames, counts, loading, error, retryList, loadingMore, moreError, hasMore, observable, scrollRef, sentinelRef, loadMore, refreshQuietly, savingNow };
}
