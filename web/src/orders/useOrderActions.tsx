import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { getRequirements, printLabel, shipOrder, type OrderListItem, type ShipRequirements } from '../api/orders';
import { describeError } from '../lib/errors';
import { Button } from '../ui/Button';
import { Overlay } from '../ui/Overlay';
import type { ActionKind } from './OrderRowActions';
import { needsInput, RequirementsDialog } from './RequirementsDialog';

export interface Notice {
  kind: 'success' | 'error' | 'warning' | 'info';
  title: string;
  text?: string;
  reasons?: string[];
  link?: { href: string; label: string; download?: string };
}

type Flow =
  | { kind: 'confirm-ship'; order: OrderListItem }
  | { kind: 'requirements'; order: OrderListItem; requirements: ShipRequirements; then: () => Promise<void> };

interface Options {
  onNotice: (notice: Notice | null) => void;
  /** Заказ изменился (отгружен, получена этикетка): список и карточка перечитываются. */
  onChanged: (orderId: number) => void;
}

const BLOB_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Действия над заказом Ozon, как в Studio2: [данные экземпляров и страна] → отгрузка → печать этикетки.
 * Хук держит диалоги и состояние «выполняется»; страница показывает результат в сообщении над таблицей.
 */
export function useOrderActions({ onNotice, onChanged }: Options) {
  const [busy, setBusy] = useState<{ id: number; kind: ActionKind } | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const urls = useRef<string[]>([]);

  // Ссылки на PDF живут недолго: потом освобождаем память.
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  const fail = useCallback(
    (title: string, error: unknown) => {
      const { message, reasons } = describeError(error);
      onNotice({ kind: 'error', title, text: message, reasons });
    },
    [onNotice]
  );

  const runShip = useCallback(
    async (order: OrderListItem) => {
      setBusy({ id: order.id, kind: 'ship' });
      try {
        const result = await shipOrder(order.id);
        onNotice({
          kind: 'success',
          title: `Заказ ${order.shipmentNumber} отгружен`,
          text: [result.message, result.ozonStatusName ? `Статус Ozon: ${result.ozonStatusName}.` : ''].filter(Boolean).join(' ')
        });
        onChanged(order.id);
      } catch (error) {
        fail(`Не удалось отгрузить заказ ${order.shipmentNumber}`, error);
      } finally {
        setBusy(null);
      }
    },
    [fail, onChanged, onNotice]
  );

  const runPrint = useCallback(
    async (order: OrderListItem) => {
      setBusy({ id: order.id, kind: 'print' });
      try {
        const { blob, generated, autoShipped } = await printLabel(order.id);
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        window.setTimeout(() => URL.revokeObjectURL(url), BLOB_LIFETIME_MS);
        // Браузер может не пустить окно после асинхронного запроса: ссылка в сообщении откроет этикетку в любом случае.
        window.open(url, '_blank', 'noopener');
        onNotice({
          kind: 'success',
          title: `Этикетка заказа ${order.shipmentNumber} готова`,
          text: autoShipped ? 'Перед печатью заказ был отгружен. ' : generated ? 'Получена у Ozon и сохранена. ' : 'Взята из хранилища. ',
          link: { href: url, label: 'Открыть этикетку', download: `${order.shipmentNumber ?? order.id}.pdf` }
        });
        onChanged(order.id);
      } catch (error) {
        fail(`Не удалось получить этикетку заказа ${order.shipmentNumber}`, error);
      } finally {
        setBusy(null);
      }
    },
    [fail, onChanged, onNotice]
  );

  /**
   * Перед отгрузкой и печатью спрашиваем у Ozon, чего ему не хватает (страна, маркировка). Если не хватает — форма.
   * Сбой самого запроса требований не блокирует: ответ на отгрузке всё равно скажет, чего нет. Отказ доступа и «не найден» — блокируют.
   */
  const prepare = useCallback(
    async (order: OrderListItem, kind: ActionKind, then: () => Promise<void>) => {
      setBusy({ id: order.id, kind });
      try {
        const requirements = await getRequirements(order.id);
        if (needsInput(requirements)) {
          setBusy(null);
          setFlow({ kind: 'requirements', order, requirements, then });
          return;
        }
      } catch (error) {
        if (error instanceof ApiError && [400, 403, 404, 409].includes(error.status)) {
          setBusy(null);
          fail(kind === 'ship' ? `Не удалось отгрузить заказ ${order.shipmentNumber}` : `Не удалось получить этикетку заказа ${order.shipmentNumber}`, error);
          return;
        }
      }
      await then();
    },
    [fail]
  );

  const requestShip = useCallback((order: OrderListItem) => {
    onNotice(null);
    setFlow({ kind: 'confirm-ship', order });
  }, [onNotice]);

  const requestPrint = useCallback(
    (order: OrderListItem) => {
      onNotice(null);
      // Готовая этикетка уже в хранилище: данных для Ozon не нужно, печатаем сразу.
      if (order.hasLabel) void runPrint(order);
      else void prepare(order, 'print', () => runPrint(order));
    },
    [onNotice, prepare, runPrint]
  );

  let dialogs: ReactNode = null;
  if (flow?.kind === 'confirm-ship') {
    const { order } = flow;
    dialogs = (
      <Overlay
        kind="dialog"
        title="Отгрузить заказ?"
        width={480}
        onClose={() => setFlow(null)}
        footer={
          <>
            <Button
              variant="primary"
              size={500}
              onClick={() => {
                setFlow(null);
                void prepare(order, 'ship', () => runShip(order));
              }}
            >
              Отгрузить
            </Button>
            <Button variant="action-secondary" size={500} onClick={() => setFlow(null)}>
              Отмена
            </Button>
          </>
        }
      >
        <p className="pa-lead">
          Заказ <b>{order.shipmentNumber}</b> будет отгружен: отправление уйдёт в Ozon. Отменить отгрузку отсюда нельзя.
          Если Ozon попросит страну-изготовителя или данные маркировки, мы покажем форму.
        </p>
      </Overlay>
    );
  } else if (flow?.kind === 'requirements') {
    const { order, requirements, then } = flow;
    dialogs = (
      <RequirementsDialog
        order={order}
        requirements={requirements}
        onCancel={() => setFlow(null)}
        onDone={() => {
          setFlow(null);
          void then();
        }}
      />
    );
  }

  return { busy, requestShip, requestPrint, dialogs };
}
