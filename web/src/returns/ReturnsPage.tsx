import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { request } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ozonImage } from '../lib/images';
import { formatDate, formatDateTimeShort, formatQuantity } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DateRangeField } from '../ui/DateRangeField';
import { EmptyState } from '../ui/EmptyState';
import { Informer } from '../ui/Informer';
import { Lightbox } from '../ui/Lightbox';
import { ProductImage } from '../orders/OrdersTable';
import { SearchField } from '../ui/SearchField';
import { SelectField } from '../ui/SelectField';
import { TextField } from '../ui/TextField';
import emptyIllustration from '../assets/illustrations/returns-empty.webp';

interface ReturnRow {
  key?: string; return_type?: string; id: number | null; client_id: string; posting_number: string | null; barcode: string | null;
  box_id?: number | null; box_barcode?: string | null; sku?: number | null; name: string | null; offer_id: string | null; qty: number | null;
  status: string | null; status_name: string | null; target_place: string | null; target_place_addr: string | null; return_date: string | null;
  image_url?: string | null; batch_id?: string | null;
  mark?: string; defect?: boolean; missort?: boolean; comment?: string; marked_by?: string;
}
type ReturnMark = Pick<ReturnRow, 'mark' | 'defect' | 'missort' | 'comment' | 'marked_by'>;
type MarkPatch = { status?: 'pending' | 'accepted' | 'rejected'; defect?: boolean; missort?: boolean; comment?: string };
type Section = 'waiting' | 'received';
interface ReturnPage { items: ReturnRow[]; total: number; page: number; page_size: number; snapshot_at: string | null; fbo_snapshot_at?: string | null; partial: boolean; cabinets?: { id: number; name: string; ozonClientId: string }[] }
const TH = 'po-table-cell-base__cell po-table-cell-base__th ozi-table-400-true po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
const TD = 'po-table-cell-base__cell po-table-cell-base__td ozi-table-500 po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
const STATUS_OPTIONS = [
  { value: 'ArrivedAtReturnPlace', label: 'В пункте выдачи' }, { value: 'CheckAtPickupPoint', label: 'Проверка на ПВЗ' },
  { value: 'MovingToSeller', label: 'В пути к продавцу' }, { value: 'WaitingShipment', label: 'Ожидает отправки' }
];
const MARK_OPTIONS = [
  { value: 'pending', label: 'Ожидает' }, { value: 'accepted', label: 'Принят' }, { value: 'rejected', label: 'Не принят' },
  { value: 'defect', label: 'Брак' }, { value: 'missort', label: 'Пересорт' }
];
const EMPTY = { search: '', pvz: '', status: '', clientId: '', mark: '', dateFrom: '', dateTo: '' };

/** Выбираем именно совпавшее поле, чтобы выбор подсказки находил соответствующую строку. */
function suggestionLabel(row: ReturnRow, query: string): string {
  const fields = [row.posting_number, row.box_barcode, row.box_id?.toString(), row.barcode, row.offer_id, row.sku?.toString(), row.name];
  const search = query.toLocaleLowerCase();
  return fields.find(value => value?.toLocaleLowerCase().includes(search)) || row.name || 'Возврат';
}

export function ReturnsPage({ section = 'waiting' }: { section?: Section }) {
  const { partner } = useAuth();
  const allowed = hasPermission(partner, 'ViewReturns');
  const canWork = hasPermission(partner, 'ReturnsWork');
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReturnPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [image, setImage] = useState<{ url: string; alt: string } | null>(null);
  const [saving, setSaving] = useState<string[]>([]);
  const [markError, setMarkError] = useState('');
  const [suggestions, setSuggestions] = useState<ReturnRow[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const focused = useRef(false);
  const currentSearch = useRef('');
  const suggestionSearch = useRef('');
  const suppressedSearch = useRef<string | null>(null);
  const blurTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const search = draft.search.trim();
    currentSearch.current = search;
    setSuggestions([]);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    if (search === filters.search) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      setFilters(previous => ({ ...previous, search }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft.search, filters.search]);

  // Пункт выдачи набирают текстом: применяем после паузы, как поиск. Списки и даты применяются сразу (pick).
  useEffect(() => {
    const pvz = draft.pvz.trim();
    if (pvz === filters.pvz) return;
    const timer = window.setTimeout(() => { setPage(1); setFilters(previous => ({ ...previous, pvz })); }, 350);
    return () => window.clearTimeout(timer);
  }, [draft.pvz, filters.pvz]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ section, page: String(page), pageSize: '50', ...filters });
    setLoading(true); setError('');
    request<ReturnPage>(`/partner-api/returns?${query}`, { signal: controller.signal })
      .then(result => {
        if (filters.search !== currentSearch.current) return;
        setData(result);
        if (filters.search.length >= 2 && filters.search !== suppressedSearch.current) {
          suggestionSearch.current = filters.search;
          setSuggestions(result.items.slice(0, 10));
          setActiveSuggestion(-1);
          setSuggestionsOpen(focused.current);
        }
      })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Не удалось загрузить возвраты.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, section, filters, page, retry]);

  /** Отметка приёмки: сервер возвращает итоговое состояние, им и заменяем строку (без угадывания на клиенте). */
  const mark = async (row: ReturnRow, patch: MarkPatch) => {
    if (!row.key || saving.includes(row.key)) return;
    setMarkError(''); setSaving(keys => [...keys, row.key!]);
    try {
      const result = await request<ReturnMark>('/partner-api/returns/mark', { method: 'POST', body: JSON.stringify({ key: row.key, ...patch }) });
      setData(previous => previous && { ...previous, items: previous.items.map(item => item.key === row.key ? { ...item, ...result } : item) });
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : 'Не удалось сохранить отметку.');
    } finally { setSaving(keys => keys.filter(key => key !== row.key)); }
  };
  const set = (values: Partial<typeof EMPTY>) => setDraft(previous => ({ ...previous, ...values }));
  const pick = (values: Partial<typeof EMPTY>) => { setDraft(previous => ({ ...previous, ...values })); setPage(1); setFilters(previous => ({ ...previous, ...values })); };
  const apply = (event: FormEvent) => { event.preventDefault(); setSuggestionsOpen(false); setPage(1); setFilters({ ...draft, search: draft.search.trim() }); };
  const reset = () => { currentSearch.current = ''; setSuggestions([]); setSuggestionsOpen(false); setDraft(EMPTY); setPage(1); setFilters(EMPTY); };
  const chooseSuggestion = (row: ReturnRow) => {
    const search = suggestionLabel(row, draft.search.trim());
    currentSearch.current = search;
    suppressedSearch.current = search;
    setDraft(previous => ({ ...previous, search }));
    setSuggestionsOpen(false);
    setPage(1);
    setFilters(previous => ({ ...previous, search }));
  };
  const searchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setSuggestionsOpen(false); setActiveSuggestion(-1); }
    else if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault(); setSuggestionsOpen(true); setActiveSuggestion(value => Math.min(value + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp' && suggestionsOpen && suggestions.length) {
      event.preventDefault(); setActiveSuggestion(value => Math.max(value - 1, 0));
    } else if (event.key === 'Enter' && suggestionsOpen && activeSuggestion >= 0) {
      event.preventDefault(); chooseSuggestion(suggestions[activeSuggestion]);
    }
  };
  if (!allowed) return <Informer kind="warning" title="Нет доступа">Обратитесь к владельцу кабинета.</Informer>;
  return <div className="pa-orders">
    <h1 className="po-page__title">Возвраты</h1>
    <nav className="pa-returns__tabs" aria-label="Разделы возвратов">
      <NavLink to="/returns/waiting" className={({ isActive }) => `pa-returns__tab ozi-body-500-true${isActive ? ' is-active' : ''}`}>Ждёт получения</NavLink>
      <NavLink to="/returns/received" className={({ isActive }) => `pa-returns__tab ozi-body-500-true${isActive ? ' is-active' : ''}`}>Получено</NavLink>
    </nav>
    <p className="pa-returns__description">{section === 'waiting'
      ? 'В списке есть возвраты в пути и ожидающие отправки. Проверяйте статус перед поездкой на ПВЗ.'
      : 'Возвраты, которые Ozon уже передал продавцу и которые ещё не закрыты в архив.'}</p>
    <form className="po-page__toolbar pa-toolbar pa-returns__toolbar" role="search" aria-label="Фильтры возвратов" onSubmit={apply}>
      <div className="pa-toolbar__search">
        <SearchField label="Поиск возвратов" placeholder="Товар, артикул, отправление или коробка" value={draft.search}
          onValueChange={search => { suppressedSearch.current = null; currentSearch.current = search.trim(); set({ search }); }}
          onFocus={() => { focused.current = true; window.clearTimeout(blurTimer.current); if (suggestionSearch.current === draft.search.trim() && suggestions.length) setSuggestionsOpen(true); }}
          onBlur={() => { focused.current = false; blurTimer.current = window.setTimeout(() => setSuggestionsOpen(false), 150); }}
          onKeyDown={searchKeyDown} aria-autocomplete="list" aria-controls={suggestionsOpen && suggestions.length ? 'return-suggestions' : undefined}
          aria-activedescendant={suggestionsOpen && activeSuggestion >= 0 ? `return-suggestion-${activeSuggestion}` : undefined} maxLength={100} />
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="po-dropdown po-dropdown--500 pa-popover pa-order-suggestions">
            <div className="po-dropdown__scroll"><div id="return-suggestions" className="po-dropdown__list" role="listbox" aria-label="Подсказки по возвратам">
              {suggestions.map((row, index) => <div id={`return-suggestion-${index}`} key={row.key || `${row.client_id}:${row.id}`} role="option"
                aria-selected={activeSuggestion === index} className={`po-dropdown-item${activeSuggestion === index ? ' po-dropdown-item--focused' : ''}`}
                onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveSuggestion(index)} onClick={() => chooseSuggestion(row)}>
                <div className="po-dropdown-item__block pa-order-suggestions__block">
                  <span className="po-dropdown-item__text pa-order-suggestions__title">{suggestionLabel(row, filters.search)}</span>
                  <span className="pa-order-suggestions__detail">{[row.name, row.offer_id, row.return_type === 'fbo' ? 'Коробка FBO' : row.posting_number].filter(Boolean).join(' · ')}</span>
                </div>
              </div>)}
            </div></div>
          </div>
        )}
      </div>
      <div className="pa-toolbar__field"><TextField label="Пункт выдачи" value={draft.pvz} onValueChange={pvz => set({ pvz })} size={500} /></div>
      <div className="pa-toolbar__field"><SelectField label="Кабинет" value={draft.clientId} onChange={clientId => pick({ clientId })} options={(data?.cabinets ?? []).map(c => ({ value: String(c.id), label: c.name }))} /></div>
      {section === 'received'
        ? <div className="pa-toolbar__field"><SelectField label="Статус приёмки" value={draft.mark} onChange={mark => pick({ mark })} options={MARK_OPTIONS} /></div>
        : <div className="pa-toolbar__field"><SelectField label="Статус Ozon" value={draft.status} onChange={status => pick({ status })} options={STATUS_OPTIONS} /></div>}
      <div className="pa-toolbar__field"><DateRangeField label={section === 'received' ? 'Дата получения' : 'Дата возврата'} from={draft.dateFrom} to={draft.dateTo} onChange={(dateFrom, dateTo) => pick({ dateFrom, dateTo })} /></div>
      <Button type="submit" size={500}>Найти</Button>
      <Button variant="secondary" size={500} icon="ui-clear-filters" iconOnly onClick={reset} disabled={!Object.values(draft).some(Boolean)}>Сбросить фильтры</Button>
    </form>
    {error && <div className="pa-notice"><Informer kind="error" title="Не удалось загрузить возвраты" action={<Button variant="action-secondary" size={400} onClick={() => setRetry(n => n + 1)}>Повторить</Button>}>{error}</Informer></div>}
    {markError && <div className="pa-notice"><Informer kind="error" title="Отметка не сохранена">{markError}</Informer></div>}
    {data?.partial && !error && <div className="pa-notice"><Informer kind="warning">Не все кабинеты обновились. Некоторые данные могут быть устаревшими.</Informer></div>}
    {data && !error && <div className="pa-returns__summary"><div className="po-page__count">Найдено: {data.total.toLocaleString('ru-RU')}</div><span>Время выгрузки (UTC): {formatDateTimeShort(data.snapshot_at)}{data.fbo_snapshot_at ? ` · FBO: ${formatDateTimeShort(data.fbo_snapshot_at)}` : ''}</span></div>}
    {loading && <p role="status" className="pa-muted">Загружаем возвраты…</p>}
    {!loading && !error && data && (data.items.length === 0 ? <EmptyState illustration={emptyIllustration} title={Object.values(filters).some(Boolean) ? 'Ничего не найдено' : 'Возвратов пока нет'}>{Object.values(filters).some(Boolean) ? 'Попробуйте изменить или сбросить фильтры.' : 'Возвраты появятся здесь, когда Ozon передаст данные.'}</EmptyState> :
      <div className="pa-scroll" tabIndex={0} role="region" aria-label="Возвраты, ожидающие получения"><div className="pa-table"><table className="po-table__table"><thead><tr className="po-table-row__row">{['Товар', 'Отправление / коробка', 'Статус Ozon', 'Пункт выдачи', 'Кабинет', 'Дата возврата', 'Количество', ...(canWork || section === 'received' ? ['Приёмка'] : [])].map(x => <th className={TH} key={x}>{x}</th>)}</tr></thead>
        <tbody>{data.items.map(row => <tr className="po-table-row__row" key={row.key || `${row.client_id}:${row.id}`}>
          <td className={`${TD} pa-col-product`}><div className="pa-returns__product">
            <ProductImage url={row.image_url ?? null} alt={row.name || 'Товар'} onOpen={setImage} />
            <div>{row.name || '—'}<div className="pa-sub">{row.offer_id || '—'}</div></div></div></td>
          <td className={TD}>{row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? `boxId ${row.box_id}` : 'Коробка FBO')) : (row.posting_number || '—')}<div className="pa-sub">{row.return_type === 'fbo' ? 'Коробка FBO' : (row.barcode || 'Возврат')}</div></td>
          <td className={TD}><Badge kind={row.status === 'ArrivedAtReturnPlace' ? 'primary success' : 'secondary info'}>{row.status_name || '—'}</Badge></td>
          <td className={TD}>{row.target_place || '—'}<div className="pa-sub">{row.target_place_addr}</div></td>
          <td className={TD}>{data.cabinets?.find(c => c.ozonClientId === row.client_id)?.name || '—'}</td>
          <td className={TD}>{formatDate(row.return_date)}</td><td className={TD}>{formatQuantity(row.qty)}</td>
          {(canWork || section === 'received') && <td className={`${TD} pa-returns__mark`}><MarkCell row={row} canWork={canWork} busy={!!row.key && saving.includes(row.key)} onChange={patch => mark(row, patch)} /></td>}
        </tr>)}</tbody></table></div></div>)}
    {data && data.total > data.page_size && !error && <div className="pa-returns-pagination"><Button variant="secondary" size={400} disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Назад</Button>
      <span>Страница {page}</span><Button variant="secondary" size={400} disabled={loading || page * data.page_size >= data.total} onClick={() => setPage(page + 1)}>Далее</Button></div>}
    {image && <Lightbox src={ozonImage(image.url, 800) ?? image.url} fallbackSrc={image.url} alt={image.alt} onClose={() => setImage(null)} />}
  </div>;
}

/** Состояние приёмки и кнопки отметок. Повторное нажатие на активную кнопку снимает отметку. */
function MarkCell({ row, canWork, busy, onChange }: { row: ReturnRow; canWork: boolean; busy: boolean; onChange: (patch: MarkPatch) => void }) {
  const status = row.mark ?? 'pending';
  const [comment, setComment] = useState(row.comment ?? '');
  useEffect(() => setComment(row.comment ?? ''), [row.comment]);
  return <div className="pa-returns__mark-box">
    <div className="pa-returns__mark-state">
      <Badge kind={status === 'accepted' ? 'primary success' : status === 'rejected' ? 'primary negative' : 'secondary neutral'} size={400}>{status === 'accepted' ? 'Принят' : status === 'rejected' ? 'Не принят' : 'Ожидает'}</Badge>
      {row.defect && <Badge kind="primary negative" size={400}>Брак</Badge>}
      {row.missort && <Badge kind="secondary warning" size={400}>Пересорт</Badge>}
    </div>
    {canWork && <div className="pa-returns__mark-actions" role="group" aria-label="Отметка приёмки">
      <Button size={400} variant={status === 'accepted' ? 'primary-success' : 'secondary'} aria-pressed={status === 'accepted'} disabled={busy} onClick={() => onChange({ status: status === 'accepted' ? 'pending' : 'accepted' })}>Принять</Button>
      <Button size={400} variant={status === 'rejected' ? 'primary' : 'secondary'} aria-pressed={status === 'rejected'} disabled={busy} onClick={() => onChange({ status: status === 'rejected' ? 'pending' : 'rejected' })}>Не принят</Button>
      <Button size={400} variant={row.defect ? 'primary' : 'secondary'} aria-pressed={!!row.defect} disabled={busy} onClick={() => onChange({ defect: !row.defect })}>Брак</Button>
      <Button size={400} variant={row.missort ? 'primary' : 'secondary'} aria-pressed={!!row.missort} disabled={busy} onClick={() => onChange({ missort: !row.missort })}>Пересорт</Button>
      <input className="pa-returns__comment" aria-label="Комментарий приёмки" placeholder="Комментарий" maxLength={500} value={comment} disabled={busy}
        onChange={event => setComment(event.target.value)} onBlur={() => { if (comment !== (row.comment ?? '')) onChange({ comment }); }} />
    </div>}
  </div>;
}
