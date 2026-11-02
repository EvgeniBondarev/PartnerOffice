import { useEffect, useState, type FormEvent } from 'react';
import { request } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { formatDate, formatDateTimeShort, formatQuantity } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Informer } from '../ui/Informer';
import { SearchField } from '../ui/SearchField';
import { SelectField } from '../ui/SelectField';
import { TextField } from '../ui/TextField';
import emptyIllustration from '../assets/illustrations/orders-empty.png';

interface ReturnRow {
  key?: string; return_type?: string; id: number | null; client_id: string; posting_number: string | null; barcode: string | null;
  box_id?: number | null; box_barcode?: string | null; name: string | null; offer_id: string | null; qty: number | null;
  status: string | null; status_name: string | null; target_place: string | null; target_place_addr: string | null; return_date: string | null;
}
interface ReturnPage { items: ReturnRow[]; total: number; page: number; page_size: number; snapshot_at: string | null; fbo_snapshot_at?: string | null; partial: boolean; cabinets?: { id: number; name: string; ozonClientId: string }[] }
const TH = 'po-table-cell-base__cell po-table-cell-base__th ozi-table-400-true po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
const TD = 'po-table-cell-base__cell po-table-cell-base__td ozi-table-500 po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
const STATUS_OPTIONS = [
  { value: 'ArrivedAtReturnPlace', label: 'В пункте выдачи' }, { value: 'CheckAtPickupPoint', label: 'Проверка на ПВЗ' },
  { value: 'MovingToSeller', label: 'В пути к продавцу' }, { value: 'WaitingShipment', label: 'Ожидает отправки' }
];
const EMPTY = { search: '', pvz: '', status: '', clientId: '' };

export function ReturnsPage() {
  const { partner } = useAuth();
  const allowed = hasPermission(partner, 'ViewReturns');
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReturnPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), pageSize: '50', ...filters });
    setLoading(true); setError('');
    request<ReturnPage>(`/partner-api/returns?${query}`, { signal: controller.signal })
      .then(setData)
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Не удалось загрузить возвраты.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [allowed, filters, page, retry]);

  const set = (values: Partial<typeof EMPTY>) => setDraft(previous => ({ ...previous, ...values }));
  const apply = (event: FormEvent) => { event.preventDefault(); setPage(1); setFilters({ ...draft }); };
  const reset = () => { setDraft(EMPTY); setPage(1); setFilters(EMPTY); };
  if (!allowed) return <Informer kind="warning" title="Нет доступа">Обратитесь к владельцу кабинета.</Informer>;
  return <div className="pa-orders">
    <h1 className="po-page__title">Возвраты</h1>
    <div className="pa-returns__section ozi-body-500-true">Ждёт получения</div>
    <p className="pa-returns__description">В списке есть возвраты в пути и ожидающие отправки. Проверяйте статус перед поездкой на ПВЗ.</p>
    <form className="po-page__toolbar pa-toolbar pa-returns__toolbar" role="search" aria-label="Фильтры возвратов" onSubmit={apply}>
      <div className="pa-toolbar__search"><SearchField label="Поиск возвратов" placeholder="Товар, артикул, отправление или коробка" value={draft.search} onValueChange={search => set({ search })} maxLength={100} /></div>
      <div className="pa-toolbar__field"><TextField label="Пункт выдачи" value={draft.pvz} onValueChange={pvz => set({ pvz })} size={500} /></div>
      <div className="pa-toolbar__field"><SelectField label="Кабинет" value={draft.clientId} onChange={clientId => set({ clientId })} options={(data?.cabinets ?? []).map(c => ({ value: String(c.id), label: c.name }))} /></div>
      <div className="pa-toolbar__field"><SelectField label="Статус Ozon" value={draft.status} onChange={status => set({ status })} options={STATUS_OPTIONS} /></div>
      <Button type="submit" size={500}>Найти</Button>
      <Button variant="secondary" size={500} icon="ui-clear-filters" iconOnly onClick={reset} disabled={!Object.values(draft).some(Boolean)}>Сбросить фильтры</Button>
    </form>
    {error && <div className="pa-notice"><Informer kind="error" title="Не удалось загрузить возвраты" action={<Button variant="action-secondary" size={400} onClick={() => setRetry(n => n + 1)}>Повторить</Button>}>{error}</Informer></div>}
    {data?.partial && !error && <div className="pa-notice"><Informer kind="warning">Не все кабинеты обновились. Некоторые данные могут быть устаревшими.</Informer></div>}
    {data && !error && <div className="pa-returns__summary"><div className="po-page__count">Найдено: {data.total.toLocaleString('ru-RU')}</div><span>Время выгрузки (UTC): {formatDateTimeShort(data.snapshot_at)}{data.fbo_snapshot_at ? ` · FBO: ${formatDateTimeShort(data.fbo_snapshot_at)}` : ''}</span></div>}
    {loading && <p role="status" className="pa-muted">Загружаем возвраты…</p>}
    {!loading && !error && data && (data.items.length === 0 ? <EmptyState illustration={emptyIllustration} title={Object.values(filters).some(Boolean) ? 'Ничего не найдено' : 'Возвратов пока нет'}>{Object.values(filters).some(Boolean) ? 'Попробуйте изменить или сбросить фильтры.' : 'Возвраты появятся здесь, когда Ozon передаст данные.'}</EmptyState> :
      <div className="pa-scroll" tabIndex={0} role="region" aria-label="Возвраты, ожидающие получения"><div className="pa-table"><table className="po-table__table"><thead><tr className="po-table-row__row">{['Товар', 'Отправление / коробка', 'Статус Ozon', 'Пункт выдачи', 'Кабинет', 'Дата возврата', 'Количество'].map(x => <th className={TH} key={x}>{x}</th>)}</tr></thead>
        <tbody>{data.items.map(row => <tr className="po-table-row__row" key={row.key || `${row.client_id}:${row.id}`}>
          <td className={`${TD} pa-col-product`}>{row.name || '—'}<div className="pa-sub">{row.offer_id || '—'}</div></td>
          <td className={TD}>{row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? `boxId ${row.box_id}` : 'Коробка FBO')) : (row.posting_number || '—')}<div className="pa-sub">{row.return_type === 'fbo' ? 'Коробка FBO' : (row.barcode || 'Возврат')}</div></td>
          <td className={TD}><Badge kind={row.status === 'ArrivedAtReturnPlace' ? 'primary success' : 'secondary info'}>{row.status_name || '—'}</Badge></td>
          <td className={TD}>{row.target_place || '—'}<div className="pa-sub">{row.target_place_addr}</div></td>
          <td className={TD}>{data.cabinets?.find(c => c.ozonClientId === row.client_id)?.name || '—'}</td>
          <td className={TD}>{formatDate(row.return_date)}</td><td className={TD}>{formatQuantity(row.qty)}</td>
        </tr>)}</tbody></table></div></div>)}
    {data && data.total > data.page_size && !error && <div className="pa-returns-pagination"><Button variant="secondary" size={400} disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Назад</Button>
      <span>Страница {page}</span><Button variant="secondary" size={400} disabled={loading || page * data.page_size >= data.total} onClick={() => setPage(page + 1)}>Далее</Button></div>}
  </div>;
}
