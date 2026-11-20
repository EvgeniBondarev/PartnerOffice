import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { acceptOrder, getRequirements, printLabel, shipOrderStatus, type OrderListItem, type ShipRequirements } from '../api/orders';
import { describeError } from '../lib/errors';
import { Button } from '../ui/Button';
import { Overlay } from '../ui/Overlay';
import { isOzonOrder } from '../lib/permissions';
import { STATUS_ACTION_LABEL, type ActionKind } from './OrderRowActions';
import { needsInput, RequirementsDialog } from './RequirementsDialog';

export interface Notice {
  kind: 'success' | 'error' | 'warning' | 'info';
  title: string;
  text?: string;
  reasons?: string[];
  link?: { href: string; label: string; download?: string };
}

type StatusAction = 'accept' | 'ship';

type Flow =
  | { kind: 'confirm-status'; order: OrderListItem; action: StatusAction }
  | { kind: 'requirements'; order: OrderListItem; requirements: ShipRequirements; then: () => Promise<void> };

interface Options {
  onNotice: (notice: Notice | null) => void;
  /** Заказ изменился (получена этикетка, статус сменили в Studio2): строка и карточка перечитываются. */
  onChanged: (orderId: number) => void;
  /** Сервер вернул обновлённую строку после смены статуса: она подставляется в список без перечитывания. */
  onUpdated: (order: OrderListItem) => void;
}

/** Текст диалога подтверждения и сообщений для каждой кнопки статуса Studio2. */
const STATUS_TEXT: Record<StatusAction, { title: string; target: string; done: string; failed: string }> = {
  accept: { title: 'Принять заказ?', target: 'Принят на складе', done: 'принят', failed: 'Не удалось принять заказ' },
  ship: { title: 'Отгрузить заказ?', target: 'Принят на складе', done: 'отгружен', failed: 'Не удалось отгрузить заказ' }
};

const BLOB_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Действия над заказом: смена статуса Studio2 («Принят» → «Отгрузить») и печать этикетки Ozon ([данные экземпляров и страна] → печать).
 * Хук держит диалоги и состояние «выполняется»; страница показывает результат в сообщении над таблицей.
 */
export function useOrderActions({ onNotice, onChanged, onUpdated }: Options) {
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

  const runStatus = useCallback(
    async (order: OrderListItem, action: StatusAction) => {
      const text = STATUS_TEXT[action];
      setBusy({ id: order.id, kind: 'status' });
      try {
        const updated = await (action === 'accept' ? acceptOrder(order.id) : shipOrderStatus(order.id));
        onUpdated(updated);
        // После «Отгрузить» отправление собрано в Ozon: показываем и его новый статус.
        const details = [
          updated.status ? `Статус: ${updated.status}.` : '',
          action === 'ship' && isOzonOrder(updated.marketplace) && updated.ozonStatus ? `Статус Ozon: ${updated.ozonStatus}.` : ''
        ].filter(Boolean).join(' ');
        onNotice({ kind: 'success', title: `Заказ ${order.shipmentNumber} ${text.done}`, text: details || undefined });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          // Статус успели сменить у владельца или в другой вкладке: показываем, что есть на самом деле, и перечитываем строку.
          const { message, reasons } = describeError(error);
          onNotice({ kind: 'warning', title: 'Статус заказа уже изменился', text: message, reasons });
          onChanged(order.id);
        } else fail(`${text.failed} ${order.shipmentNumber}`, error);
      } finally {
        setBusy(null);
      }
    },
    [fail, onChanged, onNotice, onUpdated]
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
   * Перед печатью новой этикетки и перед «Отгрузить» (оно собирает отправление в Ozon) спрашиваем у Ozon, чего ему не хватает
   * (страна, маркировка). Если не хватает — форма. Сбой самого запроса требований не блокирует: ответ сборки всё равно скажет,
   * чего нет. Отказ доступа и «не найден» — блокируют.
   */
  const prepare = useCallback(
    async (order: OrderListItem, then: () => Promise<void>, failTitle: string, kind: ActionKind) => {
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
          fail(failTitle, error);
          return;
        }
      }
      await then();
    },
    [fail]
  );

  /** Кнопка статуса: какую смену статуса предложить, говорит сервер (statusAction); перед сменой — короткое подтверждение. */
  const requestStatus = useCallback(
    (order: OrderListItem) => {
      if (!order.statusAction) return;
      onNotice(null);
      setFlow({ kind: 'confirm-status', order, action: order.statusAction });
    },
    [onNotice]
  );

  const requestPrint = useCallback(
    (order: OrderListItem) => {
      onNotice(null);
      // Готовая этикетка уже в хранилище: данных для Ozon не нужно, печатаем сразу.
      if (order.hasLabel) void runPrint(order);
      else void prepare(order, () => runPrint(order), `Не удалось получить этикетку заказа ${order.shipmentNumber}`, 'print');
    },
    [onNotice, prepare, runPrint]
  );

  let dialogs: ReactNode = null;
  if (flow?.kind === 'confirm-status') {
    const { order, action } = flow;
    const text = STATUS_TEXT[action];
    dialogs = (
      <Overlay
        kind="dialog"
        title={text.title}
        width={480}
        onClose={() => setFlow(null)}
        footer={
          <>
            <Button
              variant="primary"
              size={500}
              onClick={() => {
                setFlow(null);
                // «Отгрузить» у заказа Ozon собирает отправление: сначала данные, которых Ozon может не хватать.
                if (action === 'ship' && isOzonOrder(order.marketplace))
                  void prepare(order, () => runStatus(order, action), `${text.failed} ${order.shipmentNumber}`, 'status');
                else void runStatus(order, action);
              }}
            >
              {STATUS_ACTION_LABEL[action]}
            </Button>
            <Button variant="action-secondary" size={500} onClick={() => setFlow(null)}>
              Отмена
            </Button>
          </>
        }
      >
        <p className="pa-lead">
          {action === 'ship' ? <>Подтвердить отгрузку заказа <b>{order.shipmentNumber}</b>? Статус Studio2 останется «{order.status}».</> : <>Заказ <b>{order.shipmentNumber}</b> получит статус «{text.target}».</>}
          {action === 'ship' && isOzonOrder(order.marketplace) && ' Отправление будет собрано в Ozon.'}
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

  return { busy, requestStatus, requestPrint, dialogs };
}
