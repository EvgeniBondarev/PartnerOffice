import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/** Открытые окна по порядку открытия: Esc и Tab обрабатывает только верхнее (диалог поверх панели). */
const stack: symbol[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface OverlayProps {
  kind: 'dialog' | 'drawer';
  title: string;
  onClose: () => void;
  /** Пока идёт действие, закрыть нельзя: иначе человек не увидит результат отгрузки. */
  busy?: boolean;
  /** Ширина диалога или панели, px. */
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Поведение любого модального окна: фокус внутри, Esc закрывает (если не занято), Tab не уходит за окно,
 * страница под окном недоступна (inert), при закрытии фокус возвращается на кнопку, с которой открывали.
 */
export function useModal(onClose: () => void, busy = false) {
  const windowRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = windowRef.current;
    const token = Symbol('overlay');
    stack.push(token);
    node?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.body.style.overflow = 'hidden';
    // Страница под окном недоступна ни мыши, ни клавиатуре, ни скринридеру (окно рисуется вне #root).
    document.getElementById('root')?.setAttribute('inert', '');
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      stack.splice(stack.indexOf(token), 1);
      if (stack.length === 0) {
        document.body.style.overflow = '';
        document.getElementById('root')?.removeAttribute('inert');
      }
      opener?.focus?.();
    };
  }, []);

  return windowRef;
}

/**
 * Диалог и боковая панель дизайн-системы (dialog.css, drawer.css, window.css): затемнение, Esc и клик по затемнению закрывают.
 */
export function Overlay({ kind, title, onClose, busy = false, width, children, footer }: OverlayProps) {
  const titleId = useId();
  const windowRef = useModal(onClose, busy);

  const windowClass =
    kind === 'dialog'
      ? 'po-window__window po-dialog__dialog po-dialog__size-500 pa-overlay__window pa-overlay__window--dialog'
      : 'po-window__window po-drawer__drawer po-drawer__size-500 po-drawer__right po-drawer__verticalLayoutFill pa-overlay__window pa-overlay__window--drawer';

  return createPortal(
    <>
      <div className="po-backdrop__backdrop" onMouseDown={() => !busy && onClose()} aria-hidden="true" />
      <div className="po-window__root pa-overlay__root">
        <div
          ref={windowRef}
          className={windowClass}
          role={kind === 'dialog' ? 'dialog' : 'complementary'}
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={width ? { width: `min(${width}px, 100%)` } : undefined}
        >
          <h2 id={titleId} className={`pa-overlay__title ${kind === 'dialog' ? 'ozi-heading-300' : 'ozi-heading-400'}`}>{title}</h2>
          <div className="pa-overlay__body">{children}</div>
          {footer && <div className="pa-overlay__footer">{footer}</div>}
          <button
            type="button"
            className={`po-window__closeIcon ${kind === 'dialog' ? 'po-dialog__closeIcon' : 'po-drawer__closeIcon'}`}
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <Icon name="ui-close" />
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
