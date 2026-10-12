import { useMemo, useState, type KeyboardEvent } from 'react';
import type { OrderListItem } from '../api/orders';
import { formatDateTime, formatDateTimeShort, formatMoney, formatQuantity, isOverdue, ozonStatusBadgeKind } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import type { PartnerProfile } from '../api/auth';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import { Skeleton } from '../ui/Skeleton';
import { ozonImage } from '../lib/images';
import { OrderRowActions, type ActionKind } from './OrderRowActions';

interface OrdersTableProps {
  items: OrderListItem[];
  /** Первая загрузка набора: вместо строк скелетон. */
  loading: boolean;
  /** Подгрузка следующей порции: скелетон добавляется внизу. */
  loadingMore?: boolean;
  partner: PartnerProfile | null;
  busy: { id: number; kind: ActionKind } | null;
  onOpen: (order: OrderListItem) => void;
  /** Открыть просмотр фото товара. */
  onImage: (image: { url: string; alt: string }) => void;
  onShip: (order: OrderListItem) => void;
  onPrint: (order: OrderListItem) => void;
  onCopied: (value: string) => void;
}

const TH = 'po-table-cell-base__cell po-table-cell-base__th ozi-table-400-true po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder';
const TD = 'po-table-cell-base__cell po-table-cell-base__td ozi-table-500 po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__bottomBorder';
const align = (side: 'left' | 'right') => `po-table-cell-base__horizontal-align-${side}`;

/**
 * Картинка товара: в таблице миниатюра (c100/c200, а не оригинал), по клику открывается просмотр.
 * Нет картинки или она не загрузилась — нейтральная заглушка.
 */
export function ProductImage({ url, alt, size = 48, onOpen }: { url: string | null; alt: string; size?: number; onOpen?: (image: { url: string; alt: string }) => void }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!url || failed) {
    return (
      <div className="pa-photo pa-photo--empty" style={style} role="img" aria-label="Нет фото">
        <Icon name="ui-package" size={size >= 48 ? 24 : 16} />
      </div>
    );
  }
  const thumb = ozonImage(url, size > 56 ? 200 : 100) ?? url;
  const image = (
    <img
      className="pa-photo"
      style={style}
      src={thumb}
      srcSet={thumb === url ? undefined : `${thumb} 1x, ${ozonImage(url, size > 56 ? 400 : 200)} 2x`}
      alt={alt}
      loading="lazy"
      onError={(event) => {
        // Уменьшенной версии нет: пробуем оригинал, и только потом показываем заглушку.
        if (event.currentTarget.src !== url && thumb !== url) {
          event.currentTarget.removeAttribute('srcset');
          event.currentTarget.src = url;
        } else setFailed(true);
      }}
    />
  );
  if (!onOpen) return image;
  return (
    <button
      type="button"
      className="pa-photo__button"
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onOpen({ url, alt });
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={`Увеличить фото: ${alt}`}
      title="Посмотреть фото"
    >
      {image}
    </button>
  );
}

function Status({ order }: { order: OrderListItem }) {
  return (
    <>
      {order.ozonStatus ? <Badge kind={ozonStatusBadgeKind(order.ozonStatus)}>{order.ozonStatus}</Badge> : <span className="pa-muted">—</span>}
    </>
  );
}

function ShipBy({ order }: { order: OrderListItem }) {
  const overdue = isOverdue(order.shippingDate, order.ozonStatus);
  return (
    <>
      <div>{formatDateTime(order.shippingDate)}</div>
      {overdue ? (
        <div className="pa-sub pa-tone pa-tone--negative">Просрочено</div>
      ) : (
        <div className="pa-sub">Принят: {formatDateTimeShort(order.processingDate)}</div>
      )}
    </>
  );
}


/** Строки-скелетоны на время загрузки: те же колонки, что у таблицы. */
function skeletonRows(count: number, showActions: boolean) {
  return Array.from({ length: count }, (_, row) => (
    <tr key={`skeleton-${row}`} className="po-table-row__row" aria-hidden="true">
      <td className={`${TD} ${align('left')}`}><Skeleton width={48} height={48} /></td>
      <td className={`${TD} ${align('left')}`}><Skeleton width="80%" height={20} /><div className="pa-skeleton-gap" /><Skeleton width={90} height={20} /></td>
      <td className={`${TD} ${align('left')}`}><Skeleton width={150} height={20} /></td>
      <td className={`${TD} ${align('left')}`}><Skeleton width={120} height={24} /></td>
      <td className={`${TD} ${align('left')}`}><Skeleton width={110} height={20} /></td>
      <td className={`${TD} ${align('left')}`}><Skeleton width={130} height={20} /></td>
      <td className={`${TD} ${align('right')}`}><Skeleton width={70} height={20} /></td>
      {showActions && <td className={`${TD} ${align('left')}`}><Skeleton width={120} height={32} /></td>}
    </tr>
  ));
}

/** Таблица заказов по брендбуку (table.css): шапка, строки с подстрочником, hover и клик по строке открывают карточку. */
export function OrdersTable({ items, loading, loadingMore = false, partner, busy, onOpen, onImage, onShip, onPrint, onCopied }: OrdersTableProps) {
  const [sort, setSort] = useState<{ field: 'shippingDate' | 'processingDate'; desc: boolean }>({ field: 'shippingDate', desc: true });
  const canShip = hasPermission(partner, 'Assemble');
  const canPrint = hasPermission(partner, 'LabelPrint');
  const showActions = canShip || canPrint;
  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const left = new Date(a[sort.field] ?? 0).getTime();
    const right = new Date(b[sort.field] ?? 0).getTime();
    return sort.desc ? right - left : left - right;
  }), [items, sort]);
  const toggleSort = (field: 'shippingDate' | 'processingDate') =>
    setSort((current) => current.field === field ? { field, desc: !current.desc } : { field, desc: true });
  const copy = async (value: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    onCopied(value);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, order: OrderListItem) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(order);
    }
  };

  return (
    <div className="pa-table" aria-busy={loading}>
      <table className="po-table__table">
        <thead>
          <tr className="po-table-row__row">
            <th className={`${TH} ${align('left')}`} style={{ width: 72 }}>Фото</th>
            <th className={`${TH} ${align('left')} pa-col-product`}>
              Товар<div className="pa-sub">Артикул, бренд</div>
            </th>
            <th className={`${TH} ${align('left')}`}>
              Номер отправления<div className="pa-sub">ScanIt</div>
            </th>
            <th className={`${TH} ${align('left')}`}>
              Статус Ozon
            </th>
            <th className={`${TH} ${align('left')}`}>
              Склад<div className="pa-sub">Клиент</div>
            </th>
            <th className={`${TH} ${align('left')}`}>
              <button type="button" className="pa-sort" onClick={() => toggleSort('shippingDate')} aria-label="Сортировать по дате отгрузки">
                Отгрузить до <span aria-hidden="true">{sort.field === 'shippingDate' ? (sort.desc ? '↓' : '↑') : '↕'}</span>
              </button>
              <button type="button" className="pa-sort pa-sub" onClick={() => toggleSort('processingDate')} aria-label="Сортировать по дате принятия">
                Принят <span aria-hidden="true">{sort.field === 'processingDate' ? (sort.desc ? '↓' : '↑') : '↕'}</span>
              </button>
            </th>
            <th className={`${TH} ${align('right')}`}>
              Кол-во<div className="pa-sub">Цена</div>
            </th>
            {showActions && <th className={`${TH} ${align('left')}`} />}
          </tr>
        </thead>
        <tbody>
          {loading && items.length === 0
            ? skeletonRows(8, showActions)
            : sortedItems.map((order) => (
                <tr
                  key={order.id}
                  className="po-table-row__row po-table-row__hoverable po-table-row__pointer"
                  tabIndex={0}
                  onClick={() => onOpen(order)}
                  onKeyDown={(event) => onRowKeyDown(event, order)}
                  aria-label={`Заказ ${order.shipmentNumber ?? order.id}: открыть карточку`}
                >
                  <td className={`${TD} ${align('left')}`}>
                    <ProductImage url={order.imageUrl} alt={order.productName ?? 'Товар'} onOpen={onImage} />
                  </td>
                  <td className={`${TD} ${align('left')} pa-col-product`}>
                    <div className="pa-product" title={order.productName ?? undefined}>{order.productName ?? '—'}</div>
                    <div className="pa-tags">
                      {order.article && <CopyValue value={order.article} onCopy={copy}><Badge kind="secondary neutral" size={400}>{order.article}</Badge></CopyValue>}
                      {order.brand && <span className="pa-sub pa-sub--inline">{order.brand}</span>}
                    </div>
                  </td>
                  <td className={`${TD} ${align('left')} pa-nowrap`}>
                    <CopyValue value={order.shipmentNumber} onCopy={copy}><div className="pa-number">{order.shipmentNumber ?? '—'}</div></CopyValue>
                    <div className="pa-sub">{order.scanit ?? 'ScanIt ещё не получен'}</div>
                  </td>
                  <td className={`${TD} ${align('left')} pa-col-status`}><Status order={order} /></td>
                  <td className={`${TD} ${align('left')}`}>
                    <div>{order.warehouse ?? '—'}</div>
                    <div className="pa-sub">{order.client ?? '—'}</div>
                  </td>
                  <td className={`${TD} ${align('left')} pa-col-date`}><ShipBy order={order} /></td>
                  <td className={`${TD} ${align('right')} pa-nowrap`}>
                    <div>{formatQuantity(order.quantity)}</div>
                    <div className="pa-sub">{formatMoney(order.price)}</div>
                  </td>
                  {showActions && (
                    <td className={`${TD} ${align('left')} pa-col-actions`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                      <OrderRowActions order={order} canShip={canShip} canPrint={canPrint} busy={busy?.id === order.id ? busy.kind : null} onShip={onShip} onPrint={onPrint} />
                    </td>
                  )}
                </tr>
              ))}
          {loadingMore && skeletonRows(3, showActions)}
        </tbody>
      </table>
    </div>
  );
}

function CopyValue({ value, onCopy, children }: { value: string | null; onCopy: (value: string | null) => Promise<void>; children: React.ReactNode }) {
  return <span className="pa-copy-value">{children}{value && <button type="button" className="pa-copy-value__button" onClick={(event) => { event.stopPropagation(); void onCopy(value); }} aria-label={`Скопировать ${value}`} title="Скопировать">
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 10c0-4.941 1.059-6 6-6s6 1.059 6 6-1.059 6-6 6-6-1.059-6-6"/><path fill="currentColor" d="M10 17c-.5 0-1 .5-1 1 0 2 3.898 2 5 2 4.941 0 6-1.059 6-6 0-1.102 0-5-2-5-.53.042-1 .5-1 1 0 5.5-1.5 7-7 7"/></svg>
  </button>}</span>;
}
