import type { OrderListItem } from '../api/orders';
import { Button } from '../ui/Button';
import { isCancelledOzonOrder, isOzonOrder } from '../lib/permissions';

/** status — смена статуса Studio2 («Принят» или «Отгрузить»), print — печать этикетки. */
export type ActionKind = 'status' | 'print' | 'return';

/** Подпись кнопки статуса Studio2 по тому, что разрешил сервер. */
export const STATUS_ACTION_LABEL = { accept: 'Принят', ship: 'Отгрузить' } as const;

interface OrderRowActionsProps {
  order: OrderListItem;
  /** Право «Сборка» (Assemble): партнёр ведёт статус заказа в Studio2. */
  canChangeStatus: boolean;
  canPrint: boolean;
  /** Какое действие над этим заказом сейчас выполняется: оно показывает индикатор, второе блокируется. */
  busy: ActionKind | null;
  /** Размер кнопок: в таблице 32px, в панели заказа 44px. */
  size?: 400 | 500;
  /** В панели главная кнопка — основная синяя; в таблице все второстепенные (на экране одна основная — «Найти»). */
  primary?: boolean;
  onStatus: (order: OrderListItem) => void;
  onPrint: (order: OrderListItem) => void;
  onReturn: (order: OrderListItem) => void;
}

/**
 * Действия над заказом: кнопка статуса Studio2 («Принят», затем «Отгрузить») и печать этикетки Ozon.
 * Какую кнопку статуса показать, решает сервер (statusAction); этикетка — только у заказов Ozon.
 */
export function OrderRowActions({ order, canChangeStatus, canPrint, busy, size = 400, primary = false, onStatus, onPrint, onReturn }: OrderRowActionsProps) {
  const cancelled = isCancelledOzonOrder(order.marketplace, order.ozonStatus);
  const action = canChangeStatus && !cancelled && order.statusAction ? order.statusAction : null;
  const label = isOzonOrder(order.marketplace) && canPrint && !(cancelled && order.canReturnToShelf);
  if (!action && !label && !order.partnerShipmentConfirmed && !order.canReturnToShelf) return null;

  return (
    <div className="pa-actions">
      {order.partnerShipmentConfirmed && <span>Отгружен партнёром</span>}
      {action && (
        <Button
          variant={primary ? 'primary' : 'action-secondary'}
          size={size}
          icon={action === 'accept' ? 'ui-check' : 'ui-package'}
          loading={busy === 'status'}
          disabled={busy !== null}
          onClick={() => onStatus(order)}
          title={action === 'accept' ? 'Отметить, что заказ принят на складе' : 'Отметить, что заказ отгружен'}
        >
          {STATUS_ACTION_LABEL[action]}
        </Button>
      )}
      {order.canReturnToShelf && (
        <Button variant="action-secondary" size={size} icon="ui-package" loading={busy === 'return'} disabled={busy !== null} onClick={() => onReturn(order)}>
          Возврат на полку
        </Button>
      )}
      {label && (
        <Button
          variant={order.hasLabel ? 'primary-success' : 'action-secondary'}
          size={size}
          icon="ui-print"
          loading={busy === 'print'}
          disabled={busy !== null || cancelled}
          onClick={() => onPrint(order)}
          title={cancelled ? 'Печать недоступна: заказ отменён в Ozon' : order.hasLabel ? 'Этикетка уже есть, откроется готовая' : 'Получить этикетку у Ozon и открыть PDF'}
        >
          Этикетка
        </Button>
      )}
    </div>
  );
}
