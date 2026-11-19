import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MarkPatch, ReturnPage, ReturnRow } from '../api/returns';
import { ozonImage } from '../lib/images';
import { formatDate, formatQuantity, formatUtcDateTime } from '../lib/format';
import { Badge, type BadgeKind } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CopyValue } from '../ui/CopyValue';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { Informer } from '../ui/Informer';
import { Lightbox } from '../ui/Lightbox';
import { ProductImage } from '../orders/OrdersTable';
import { HistoryButton, LinkTag, SchemaBadge } from './ReturnHistory';
import { ReturnMarkCell } from './ReturnMarkCell';
import { displayedRows, isResale, rowKey } from './returnsModel';
import type { ScanResult } from './useReturnActions';
import type { ReturnsSection } from './useReturnsQuery';
import { GiveoutDialog, GiveoutThumbnail, useGiveouts } from './Giveout';
import emptyIllustration from '../assets/illustrations/returns-empty.webp';

const TH = 'po-table-cell-base__cell po-table-cell-base__th ozi-table-400-true po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
const TD = 'po-table-cell-base__cell po-table-cell-base__td ozi-table-500 po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder po-table-cell-base__horizontal-align-left';
const SHELF_COLUMNS = ['Товар', 'Отправление / коробка', 'Склад партнёра', 'Перемещено', 'Статус'];
const SUPPLIER_COLUMNS = ['Товар', 'Отправление / коробка', 'Склад и документ', 'ТТН', 'Статус'];
const WAREHOUSE_COLUMNS = ['Товар', 'Отправление / коробка', 'Склад и документ', 'Статус'];
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

type Props = {
  section: ReturnsSection; canWork: boolean; phone: boolean; data: ReturnPage | null; items: ReturnRow[];
  loading: boolean; error: string; retryList: () => void; scanResult: ScanResult;
  ttnError: string; markError: string; saving: string[]; ttnBusy: string[];
  downloadTtn: (row: ReturnRow) => Promise<void>; mark: (row: ReturnRow, patch: MarkPatch, operationId?: string) => Promise<boolean>;
  highlighted: string | null; searching: boolean; loadingMore: boolean; moreError: string;
  /** Тост о результате приёмки: показывается, только когда сервер подтвердил постановку на разбор. */
  reviewNotice: string;
  /** Поиск, по которому показан список: нужен для уточнения сообщения сканера. */
  loadedSearch: string;
  hasMore: boolean; observable: boolean; scrollRef: RefObject<HTMLDivElement | null>;
  sentinelRef: RefObject<HTMLDivElement | null>; loadMore: () => void;
};
export function ReturnsResults({ section, canWork, phone, data, items, loading, error, retryList, scanResult, ttnError, markError, saving, ttnBusy, downloadTtn, mark, highlighted, searching, loadingMore, moreError, reviewNotice, loadedSearch, hasMore, observable, scrollRef, sentinelRef, loadMore }: Props) {
  const [image, setImage] = useState<{ url: string; alt: string } | null>(null);
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const toggleUnits = (key: string) => setExpandedUnits(previous => {
    const next = new Set(previous);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  const highlightedRow = useRef<HTMLTableRowElement>(null);
  const highlightedCard = useRef<HTMLLIElement>(null);
  useEffect(() => { if (highlighted) (highlightedRow.current ?? highlightedCard.current)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [highlighted, items]);
  const received = section === 'received';
  const pickable = section === 'waiting' || received;
  const shelf = section === 'shelf';
  const supplier = section === 'supplier';
  const warehouse = section === 'warehouse';
  const outbound = supplier || warehouse;
  const cabinets = data?.cabinets ?? [];
  const cabinetName = (row: ReturnRow) => cabinets.find(c => c.ozonClientId === row.client_id)?.name || '—';
  const rows = displayedRows(items, expandedUnits);
  const giveoutIds = section === 'waiting' ? cabinets.filter(c => items.some(row => row.client_id === c.ozonClientId)).map(c => c.id) : [];
  const giveouts = useGiveouts(giveoutIds);
  const [giveoutId, setGiveoutId] = useState<number | null>(null);
  const giveoutCell = (row: ReturnRow) => {
    const cabinet = cabinets.find(c => c.ozonClientId === row.client_id);
    return cabinet ? <GiveoutThumbnail data={giveouts.items[cabinet.id]} onClick={() => setGiveoutId(cabinet.id)} /> : <span className="pa-sub">—</span>;
  };
  const hasMark = pickable && (canWork || received);
  /** Колонка «Статус Ozon» есть в «Ждёт получения» и «Получено»; на полке и в отправке её нет. */
  const hasOzonStatus = !shelf && !outbound;
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
  const barcodeLines = (row: ReturnRow) => {
    const alreadyShown = new Set([row.box_barcode, row.return_type === 'fbo' ? null : row.barcode].filter(Boolean));
    const codes = [...new Set([row.ii_code, row.pair?.barcode].filter((value): value is string => !!value && !alreadyShown.has(value)))];
    return codes.map(code => <div className="pa-sub" key={code}><CopyValue value={code} label="штрихкод возврата" /></div>);
  };
  const postingCell = (row: ReturnRow) => {
    if (isResale(row) && row.pair?.posting_number) return <>
      <CopyValue value={row.pair.posting_number} label="номер отправления FBS"><span className="pa-returns__side">FBS</span>{row.pair.posting_number}</CopyValue>
      <div className="pa-sub">FBO · {row.posting_number ? <CopyValue value={row.posting_number} label="номер отправления FBO" /> : '—'}</div>{barcodeLines(row)}</>;
    const main = row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? `boxId ${row.box_id}` : 'Коробка FBO')) : (row.posting_number || '—');
    const copyable = row.return_type === 'fbo' ? (row.box_barcode || (row.box_id ? String(row.box_id) : null)) : row.posting_number;
    return <><CopyValue value={copyable} label={row.return_type === 'fbo' ? 'код коробки' : 'номер отправления'}>{main}</CopyValue>
      <div className="pa-sub">{row.return_type === 'fbo'
        ? (row.pair?.posting_number ? <>{row.pair.schema || 'FBS'} · <CopyValue value={row.pair.posting_number} label="номер отправления" /></> : 'Коробка FBO')
        : row.barcode ? <CopyValue value={row.barcode} label="код этикетки" /> : 'Возврат'}</div>{barcodeLines(row)}</>;
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
  const markCell = (row: ReturnRow) => <ReturnMarkCell row={row} canWork={canWork} busy={!!row.key && saving.includes(row.key)} onChange={(patch, operationId) => mark(row, patch, operationId)} />;
  const listEnd = <>
    <div ref={sentinelRef} className="pa-scroll__end" aria-hidden="true" />
    {moreError && <div className="pa-scroll__footer"><Informer kind="error" action={<Button variant="action-secondary" size={400} onClick={loadMore}>Повторить</Button>}>{moreError}</Informer></div>}
    {/* Запасной путь без автоподгрузки: клавиатура, старые браузеры. Обычно до этой кнопки не доходят. */}
    {hasMore && !loadingMore && !moreError && !loading && !observable && <div className="pa-scroll__footer"><Button variant="secondary" size={400} onClick={loadMore}>Показать ещё</Button></div>}
    {!hasMore && !loading && !error && items.length > 0 && data && data.total > data.page_size && <div className="pa-scroll__footer pa-muted" role="status">Показаны все возвраты: {data.total.toLocaleString('ru-RU')}</div>}
  </>;
  return <>
    {reviewNotice && <div className="pa-copy-toast" role="status"><span aria-hidden="true">✓</span> {reviewNotice}</div>}
    {received && !canWork && <Informer kind="info">Для изменения приёмки попросите владельца включить право «Приём возвратов».</Informer>}
        {error && <div className="pa-notice"><Informer kind="error" title="Не удалось загрузить возвраты" action={<Button variant="action-secondary" size={400} onClick={() => retryList()}>Повторить</Button>}>{error}</Informer></div>}
        {scanResult && <div className="pa-notice"><Informer kind={scanResult.kind}>{scanResult.notFoundCode && loadedSearch === scanResult.notFoundCode && (data?.total ?? 0) > 0
          ? `Код ${scanResult.notFoundCode}: точное совпадение не найдено. Проверьте найденные позиции вручную — приёмка не выполнена.`
          : scanResult.text}</Informer></div>}
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
                  {section === 'waiting' && <><dt>Штрихкод получения</dt><dd>{giveoutCell(row)}</dd></>}
                  <dt>Кабинет</dt><dd>{cabinetName(row)}</dd>
                  <dt>Дата возврата</dt><dd>{formatDate(row.return_date)}</dd>
                  <dt>Количество</dt><dd>{formatQuantity(row.qty)}</dd></>}
                </dl>
                {supplier && <div className="pa-returns__mark-box pa-returns-card__mark">{outboundTtn(row)}</div>}
                {hasMark && <div className="pa-returns__mark-box pa-returns-card__mark">{markCell(row)}</div>}
              </li>), ...(loadingMore ? skeletonCards(3) : [])]}</ul>
            : <div className="pa-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={supplier ? 'Возвраты поставщику' : warehouse ? 'Возвраты на склад' : shelf ? 'Возвраты на полке' : received ? 'Полученные возвраты' : 'Возвраты, ожидающие получения'}><div className={`pa-table${outbound ? ` pa-table--outbound pa-table--${section}` : shelf ? ' pa-table--shelf' : ' pa-table--main'}`}><table className="po-table__table"><thead><tr className="po-table-row__row">{(supplier ? SUPPLIER_COLUMNS : warehouse ? WAREHOUSE_COLUMNS : shelf ? SHELF_COLUMNS : ['Товар', 'Отправление / коробка', 'Поставщик', 'Статус Ozon', 'Пункт выдачи', ...(section === 'waiting' ? ['Штрихкод получения'] : []), 'Дата', 'Кол-во', ...(hasMark ? ['Приёмка'] : [])]).map(x => <th className={TH} key={x}>{x}</th>)}</tr></thead>
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
                {section === 'waiting' && <td className={TD}>{giveoutCell(row)}</td>}
                <td className={TD}>{formatDate(row.return_date)}</td><td className={TD}>{formatQuantity(row.qty)}</td>
                {hasMark && <td className={`${TD} pa-returns__mark`}>{markCell(row)}</td>}
                </>}
              </tr>), ...(loadingMore ? skeletonRows(3, hasMark) : [])]}</tbody></table></div>{listEnd}</div>)}
        {phone && !loading && items.length > 0 && listEnd}
    {giveoutId !== null && giveouts.items[giveoutId]?.enabled && <GiveoutDialog id={giveoutId} name={cabinets.find(c => c.id === giveoutId)?.name ?? 'Ozon'} data={giveouts.items[giveoutId]!} canWork={canWork} reload={giveouts.reload} onClose={() => setGiveoutId(null)} />}
    {image && <Lightbox src={ozonImage(image.url, 800) ?? image.url} fallbackSrc={image.url} alt={image.alt} onClose={() => setImage(null)} />}
  </>;
}
