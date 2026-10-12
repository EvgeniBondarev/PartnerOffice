import type { ReactNode } from 'react';
import { Icon } from './Icon';

const ICONS = { info: 'ui-info', warning: 'ui-warning', error: 'ui-error', success: 'ui-check' } as const;

interface InformerProps {
  kind: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: ReactNode;
  /** error и warning объявляются скринридеру сразу (role=alert), info — вежливо (role=status). */
  id?: string;
  /** Подробности списком, например причины отказа Ozon. */
  reasons?: string[];
  /** Кнопка или ссылка действия под текстом. */
  action?: ReactNode;
  /** Если задан, справа появляется кнопка «Закрыть». */
  onClose?: () => void;
  /** Компактная 3D-иллюстрация для объяснения конкретного сценария. */
  illustration?: string;
}

/** Информер дизайн-системы (design/components/ozon/informer.css): значок и текст, цвет — не единственный признак. */
export function Informer({ kind, title, children, id, reasons, action, onClose, illustration }: InformerProps) {
  return (
    <div
      id={id}
      className={`po-informer__informer ozi-body-500 po-informer__size-500 po-informer__${kind} po-informer__showAccentLine pa-informer`}
      role={kind === 'info' ? 'status' : 'alert'}
    >
      <Icon name={ICONS[kind]} size={24} className={`pa-informer__icon pa-informer__icon--${kind}`} />
      {illustration && <img className="pa-informer__illustration" src={illustration} alt="" />}
      <div className="pa-informer__text">
        {title && <b className="pa-informer__title">{title}</b>}
        <span>{children}</span>
        {reasons && reasons.length > 0 && (
          <ul className="pa-informer__reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {action && <div className="pa-informer__action">{action}</div>}
      </div>
      {onClose && (
        <button type="button" className="pa-informer__close" onClick={onClose} aria-label="Закрыть сообщение" title="Закрыть">
          <Icon name="ui-close" />
        </button>
      )}
    </div>
  );
}
