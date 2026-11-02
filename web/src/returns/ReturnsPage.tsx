import { useEffect, useState, type FormEvent } from 'react';
import { request } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../lib/permissions';
import { Button } from '../ui/Button';
import { Informer } from '../ui/Informer';
import { TextField } from '../ui/TextField';

interface ReturnRow {
  id: number; client_id: string; posting_number: string | null; barcode: string | null;
  name: string | null; offer_id: string | null; qty: number | null; status_name: string | null;
  target_place: string | null; target_place_addr: string | null; return_date: string | null;
}
interface ReturnPage { items: ReturnRow[]; total: number; page: number; page_size: number; snapshot_at: string | null; partial: boolean; cabinets?: { id: number; name: string; ozonClientId: string }[] }
const TH = 'po-table-cell-base__cell po-table-cell-base__th ozi-table-400-true po-table-cell-base__size-500 po-table-cell-base__bottomBorder';
const TD = 'po-table-cell-base__cell po-table-cell-base__td ozi-table-500 po-table-cell-base__size-500 po-table-cell-base__bottomBorder';

export function ReturnsPage() {
  const { partner } = useAuth();
  const allowed = hasPermission(partner, 'ViewReturns');
  const [search, setSearch] = useState('');
  const [pvz, setPvz] = useState('');
  const [status, setStatus] = useState('');
  const [clientId, setClientId] = useState('');
  const [filters, setFilters] = useState({ search: '', pvz: '', status: '', clientId: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReturnPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
  }, [allowed, filters, page]);

  const apply = (event: FormEvent) => { event.preventDefault(); setPage(1); setFilters({ search, pvz, status, clientId }); };
  if (!allowed) return <Informer kind="warning" title="Нет доступа">Обратитесь к владельцу кабинета.</Informer>;
  return <div className="pa-orders">
    <h1 className="po-page__title">Возвраты</h1>
    <h2>Ждёт получения</h2>
    <p className="pa-muted">В списке также есть возвраты в пути и ожидающие отправки. Проверяйте статус перед поездкой на ПВЗ.</p>
    <form className="pa-returns-filters" onSubmit={apply}>
      <TextField label="Товар, артикул, отправление" value={search} onValueChange={setSearch} size={500} />
      <TextField label="Пункт выдачи" value={pvz} onValueChange={setPvz} size={500} />
      <label>Кабинет <select value={clientId} onChange={e => setClientId(e.target.value)}>
        <option value="">Все кабинеты</option>{(data?.cabinets ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <label>Статус <select value={status} onChange={e => setStatus(e.target.value)}>
        <option value="">Все статусы</option><option value="ArrivedAtReturnPlace">В пункте выдачи</option>
        <option value="CheckAtPickupPoint">Проверка на ПВЗ</option><option value="MovingToSeller">В пути к продавцу</option>
        <option value="WaitingShipment">Ожидает отправки</option>
      </select></label>
      <Button type="submit">Найти</Button>
    </form>
    {error && <Informer kind="error" title="Не удалось загрузить возвраты">{error}</Informer>}
    {data?.partial && <Informer kind="warning">Не все кабинеты обновились. Некоторые данные могут быть устаревшими.</Informer>}
    {data && <p className="pa-muted">Найдено строк: {data.total}. Снимок сформирован: {data.snapshot_at || 'неизвестно'}.</p>}
    {loading && <p role="status">Загружаем возвраты…</p>}
    {!loading && !error && data && <div className="pa-scroll" tabIndex={0} role="region" aria-label="Возвраты, ожидающие получения">
      <table className="po-table__table"><thead><tr>{['Товар', 'Отправление', 'Статус Ozon', 'ПВЗ', 'Кабинет', 'Дата возврата', 'Кол-во'].map(x => <th className={TH} key={x}>{x}</th>)}</tr></thead>
        <tbody>{data.items.map(row => <tr key={`${row.client_id}:${row.id}`}>
          <td className={TD}>{row.name || '—'}<div className="pa-muted">{row.offer_id}</div></td>
          <td className={TD}>{row.posting_number || '—'}<div className="pa-muted">{row.barcode}</div></td>
          <td className={TD}>{row.status_name || '—'}</td><td className={TD}>{row.target_place || '—'}<div className="pa-muted">{row.target_place_addr}</div></td>
          <td className={TD}>{data.cabinets?.find(c => c.ozonClientId === row.client_id)?.name || '—'}</td>
          <td className={TD}>{row.return_date?.slice(0, 10) || '—'}</td><td className={TD}>{row.qty ?? '—'}</td>
        </tr>)}</tbody></table>
      {!data.items.length && <p>Возвраты не найдены.</p>}
    </div>}
    {data && <div className="pa-returns-pagination"><Button variant="secondary" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Назад</Button>
      <span>Страница {page}</span><Button variant="secondary" disabled={loading || page * data.page_size >= data.total} onClick={() => setPage(page + 1)}>Далее</Button></div>}
  </div>;
}
