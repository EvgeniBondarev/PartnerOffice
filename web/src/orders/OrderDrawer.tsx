import { useEffect, useState, type ReactNode } from 'react';
import type { PartnerProfile } from '../api/auth';
import { ApiError } from '../api/client';
import { getOrder, type OrderDetails, type OrderListItem } from '../api/orders';
import { formatDateTime, formatMoney, formatQuantity, isOverdue, ozonStatusBadgeKind } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import { Badge } from '../ui/Badge';
import { Informer } from '../ui/Informer';
import { Overlay } from '../ui/Overlay';
import { Skeleton } from '../ui/Skeleton';
import { OrderRowActions, type ActionKind } from './OrderRowActions';
import { ProductImage } from './OrdersTable';

interface OrderDrawerProps {
  order: OrderListItem;
  partner: PartnerProfile | null;
  /** Меняется после действия над заказом: карточка перечитывается, чтобы показать новый статус. */
  refreshKey: number;
  busy: { id: number; kind: ActionKind } | null;
  onClose: () => void;
  onImage: (image: { url: string; alt: string }) => void;
  onShip: (order: OrderListItem) => void;
  onPrint: (order: OrderListItem) => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pa-details__term">{label}</dt>
      <dd className="pa-details__value">{children}</dd>
    </>
  );
}

const dash = (value: string | null | undefined) => (value && value.trim() ? value : '—');

/** Карточка заказа в боковой панели (drawer.css): всё, что API отдаёт партнёру, и действия над заказом. */
export function OrderDrawer({ order, partner, refreshKey, busy, onClose, onImage, onShip, onPrint }: OrderDrawerProps) {
  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    getOrder(order.id, controller.signal)
      .then(setDetails)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить карточку заказа.');
      });
    return () => controller.abort();
  }, [order.id, refreshKey]);

  // Пока карточка грузится, показываем то, что уже есть в строке списка.
  const current = details?.order ?? order;
  const overdue = isOverdue(current.shippingDate, current.ozonStatus);
  const canShip = hasPermission(partner, 'Assemble');
  const canPrint = hasPermission(partner, 'LabelPrint');

  return (
    <Overlay
      kind="drawer"
      title={`Заказ ${current.shipmentNumber ?? current.id}`}
      onClose={onClose}
      width={520}
      footer={
        <OrderRowActions
          order={current}
          canShip={canShip}
          canPrint={canPrint}
          busy={busy?.id === current.id ? busy.kind : null}
          size={500}
          primary
          onShip={onShip}
          onPrint={onPrint}
        />
      }
    >
      <div className="pa-drawer__head">
        <ProductImage url={current.imageUrl} alt={current.productName ?? 'Товар'} size={96} onOpen={onImage} />
        <div className="pa-drawer__product">
          <div className="pa-product">{current.productName ?? '—'}</div>
          <div className="pa-tags">
            {current.article && <Badge kind="secondary neutral" size={400}>{current.article}</Badge>}
            {current.brand && <span className="pa-sub pa-sub--inline">{current.brand}</span>}
          </div>
          <div className="pa-drawer__status">
            {current.ozonStatus && <Badge kind={ozonStatusBadgeKind(current.ozonStatus)}>{current.ozonStatus}</Badge>}
            {overdue && <span className="pa-tone pa-tone--negative">Просрочено</span>}
          </div>
        </div>
      </div>

      {error && <Informer kind="error">{error}</Informer>}

      {!details && !error ? (
        <div className="pa-drawer__skeleton" aria-busy="true">
          <Skeleton width="100%" height={24} />
          <Skeleton width="100%" height={24} />
          <Skeleton width="70%" height={24} />
        </div>
      ) : (
        <dl className="pa-details">
          <Row label="Номер отправления">{dash(current.shipmentNumber)}</Row>
          <Row label="ScanIt">{details?.scanit ? <span className="pa-mono">{details.scanit}</span> : <span className="pa-muted">Ozon ещё не отдал</span>}</Row>
          <Row label="Трек-номер">{dash(current.trackingNumber)}</Row>
          <Row label="Штрихкод товара">{details?.barcode ? <span className="pa-mono">{details.barcode}</span> : '—'}</Row>
          <Row label="Количество">{formatQuantity(current.quantity)}</Row>
          <Row label="Цена">{formatMoney(current.price)}</Row>
          <Row label="Склад">{dash(current.warehouse)}</Row>
          <Row label="Клиент">{dash(current.client)}</Row>
          <Row label="Маркетплейс">{dash(current.marketplace)}</Row>
          <Row label="Город доставки">{dash(details?.deliveryCity)}</Row>
          <Row label="Принят">{formatDateTime(current.processingDate)}</Row>
          <Row label="Отгрузить до">{formatDateTime(current.shippingDate)}</Row>
          <Row label="Статус изменён">{formatDateTime(details?.lastStatusChangeDate)}</Row>
          <Row label="Этикетка">{current.hasLabel ? 'Готова' : 'Ещё не получена'}</Row>
          {details?.comment && <Row label="Комментарий">{details.comment}</Row>}
        </dl>
      )}
    </Overlay>
  );
}
