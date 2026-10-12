import type { OrderListItem } from '../api/orders';
import { Button } from '../ui/Button';
import { isOzonOrder } from '../lib/permissions';

export type ActionKind = 'ship' | 'print';

interface OrderRowActionsProps {
  order: OrderListItem;
  canShip: boolean;
  canPrint: boolean;
  /** Какое действие над этим заказом сейчас выполняется: оно показывает индикатор, второе блокируется. */
  busy: ActionKind | null;
  /** Размер кнопок: в таблице 32px, в панели заказа 44px. */
  size?: 400 | 500;
  /** В панели главная кнопка — основная синяя; в таблице все второстепенные (на экране одна основная — «Найти»). */
  primary?: boolean;
  onShip: (order: OrderListItem) => void;
  onPrint: (order: OrderListItem) => void;
}

/** Действия над заказом: отгрузка и печать этикетки. Только для заказов Ozon и только то, что разрешил владелец. */
export function OrderRowActions({ order, canShip, canPrint, busy, size = 400, primary = false, onShip, onPrint }: OrderRowActionsProps) {
  if (!isOzonOrder(order.marketplace)) return null;
  if (!canShip && !canPrint) return null;

  return (
    <div className="pa-actions">
      {canShip && (
        <Button
          variant={primary ? 'primary' : 'action-secondary'}
          size={size}
          icon="ui-package"
          loading={busy === 'ship'}
          disabled={busy !== null}
          onClick={() => onShip(order)}
          title="Отгрузить заказ: передать отправление в Ozon"
        >
          Отгрузить
        </Button>
      )}
      {canPrint && (
        <Button
          variant="action-secondary"
          size={size}
          icon="ui-print"
          loading={busy === 'print'}
          disabled={busy !== null}
          onClick={() => onPrint(order)}
          title={order.hasLabel ? 'Этикетка уже есть, откроется готовая' : 'Получить этикетку у Ozon и открыть PDF'}
        >
          Этикетка
        </Button>
      )}
    </div>
  );
}
