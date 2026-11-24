import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { ReturnRow } from '../api/returns';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../lib/permissions';
import { Informer } from '../ui/Informer';
import { useMediaQuery } from '../ui/useMediaQuery';
import { ReturnsControls } from './ReturnsControls';
import { ReturnsResults } from './ReturnsResults';
import { looksLikeCode, suggestionLabel } from './returnsModel';
import { useReturnActions, type ScanResult } from './useReturnActions';
import { useReturnsData } from './useReturnsData';
import { useReturnsQuery, type ReturnsSection } from './useReturnsQuery';

/**
 * Недавно открытые списки и счётчики вкладок (returnsCache.ts): вернувшись на вкладку, страница сразу показывает прежние
 * строки всех загруженных порций, а свежие подтягивает в фоне. Кэш очищается при выходе и 401 (AuthContext).
 */
export { clearReturnsCache } from './returnsCache';
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
  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [reviewNotice, setReviewNotice] = useState('');
  useEffect(() => {
    if (!reviewNotice) return;
    const timer = window.setTimeout(() => setReviewNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [reviewNotice]);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const scanQueue = useRef<Promise<void>>(Promise.resolve());
  const typing = useRef({ at: 0, fast: 0, length: 0, prefix: 0 });
  const autoTried = useRef('');
  const formRef = useRef<HTMLFormElement>(null);
  const [suggestions, setSuggestions] = useState<ReturnRow[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const focused = useRef(false);
  const currentSearch = useRef('');
  const suggestionSearch = useRef('');
  const suppressedSearch = useRef<string | null>(null);
  const blurTimer = useRef<number | undefined>(undefined);

  const { data, facetData, items, setItems, supplierNames, counts, loading, error, retryList, loadingMore,
    moreError, hasMore, observable, scrollRef, sentinelRef, loadMore, refreshQuietly, savingNow } = useReturnsData({
    allowed, section, filters, partnerId: partner?.id ?? 0, phone,
    currentSearch, suppressedSearch, suggestionSearch, focused, setSuggestions, setActiveSuggestion, setSuggestionsOpen
  });

  useEffect(() => {
    const typed = searchDraft.trim();
    currentSearch.current = typed;
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    const timer = window.setTimeout(() => {
      // Сканер может дописать код к уже введённому поиску. Проверяем только новый быстрый фрагмент.
      const scanned = scanCode(typed);
      if (section === 'received' && canWork && looksLikeCode(scanned) && scanned !== autoTried.current && looksScanned(typed)) { scan(scanned); return; }
      if (typed !== search) setSearch(typed);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const { ttnError, ttnBusy, downloadTtn, saving, markError, mark, processScan } = useReturnActions({
    setItems, savingNow, refreshQuietly, setScanResult, setHighlighted, setReviewNotice
  });

  /** Сканер вводит код как очень быстрый набор и завершает его Enter: так отличаем скан от ручного ввода.
   *  Если скан дописался к уже введённому поиску, машиной набранной считаем только новую часть. */
  const noteInput = (value: string) => {
    const now = performance.now(), t = typing.current;
    const added = value.length - t.length;
    if (!value || added <= 0) { t.fast = 0; t.prefix = 0; }
    else {
      if (t.length > 0 && now - t.at >= 350 && search && t.length === search.length && value.startsWith(search))
        t.prefix = search.length;
      else if (now - t.at >= 350) t.prefix = 0;
      t.fast = added > 1 ? value.length - t.prefix : now - t.at < 100 ? t.fast + 1 : 0;
    }
    t.at = now; t.length = value.length;
  };
  const scanCode = (value: string) => value.slice(typing.current.prefix).trim();
  const looksScanned = (value: string) => {
    const code = scanCode(value);
    return code.length >= 4 && typing.current.fast >= code.length - 1;
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
    typing.current = { at: 0, fast: 0, length: 0, prefix: 0 };
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
      event.preventDefault(); scan(scanCode(event.currentTarget.value));
    }
  };
  if (!allowed) return <Informer kind="warning" title="Нет доступа">Обратитесь к владельцу кабинета.</Informer>;
  const received = section === 'received';
  /** Сканер вводит код в поиск: щелчок мышью по фильтру не должен забирать у него фокус. Текстовые поля и клавиатура работают как обычно. */
  const keepSearchFocus = received && canWork ? (event: MouseEvent<HTMLElement>) => {
    if (!(event.target as HTMLElement).closest('input[type="text"], input[type="search"], textarea')) event.preventDefault();
  } : undefined;
    return <div className="pa-orders pa-list">
    <ReturnsControls section={section} canWork={canWork} counts={counts} data={data} facetData={facetData} supplierNames={supplierNames}
      query={{ panelFilters, pvzDraft, setPvzDraft, change, clear, activeCount }} search={search} searchDraft={searchDraft}
      formRef={formRef} suggestions={suggestions} suggestionsOpen={suggestionsOpen} activeSuggestion={activeSuggestion}
      onSearchValue={value => { setScanResult(null); if (value !== autoTried.current) autoTried.current = ''; noteInput(value); setHighlighted(null); suppressedSearch.current = null; currentSearch.current = value.trim(); setSearchDraft(value); }}
      onSearchFocus={() => { focused.current = true; window.clearTimeout(blurTimer.current); if (suggestionSearch.current === searchDraft.trim() && suggestions.length) setSuggestionsOpen(true); }}
      onSearchBlur={() => { focused.current = false; blurTimer.current = window.setTimeout(() => setSuggestionsOpen(false), 150); }}
      onSuggestionHover={setActiveSuggestion} chooseSuggestion={chooseSuggestion} apply={apply} searchKeyDown={searchKeyDown} keepSearchFocus={keepSearchFocus}>
    <ReturnsResults section={section} canWork={canWork} phone={phone} data={data} items={items} loading={loading} error={error}
      retryList={retryList} scanResult={scanResult} ttnError={ttnError} markError={markError} saving={saving}
      reviewNotice={reviewNotice} loadedSearch={search}
      ttnBusy={ttnBusy} downloadTtn={downloadTtn} mark={mark} highlighted={highlighted} searching={activeCount > 0 || !!search}
      loadingMore={loadingMore} moreError={moreError} hasMore={hasMore} observable={observable}
      scrollRef={scrollRef} sentinelRef={sentinelRef} loadMore={loadMore} />
    </ReturnsControls>
  </div>;
}
