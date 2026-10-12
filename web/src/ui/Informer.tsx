import type { ReactNode } from 'react';
import { Icon } from './Icon';

const ICONS = { info: 'ui-info', warning: 'ui-warning', error: 'ui-error' } as const;

interface InformerProps {
  kind: 'info' | 'warning' | 'error';
  title?: string;
  children: ReactNode;
  /** error и warning объявляются скринридеру сразу (role=alert), info — вежливо (role=status). */
  id?: string;
}

/** Информер дизайн-системы (design/components/ozon/informer.css): значок и текст, цвет — не единственный признак. */
export function Informer({ kind, title, children, id }: InformerProps) {
  return (
    <div
      id={id}
      className={`po-informer__informer ozi-body-500 po-informer__size-500 po-informer__${kind} po-informer__showAccentLine pa-informer`}
      role={kind === 'info' ? 'status' : 'alert'}
    >
      <Icon name={ICONS[kind]} size={24} className={`pa-informer__icon pa-informer__icon--${kind}`} />
      <div className="pa-informer__text">
        {title && <b className="pa-informer__title">{title}</b>}
        <span>{children}</span>
      </div>
    </div>
  );
}
