import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Бейдж дизайн-системы (badge.css): статус всегда подписан текстом, цвет только усиливает. */
export type BadgeKind = 'secondary info' | 'secondary warning' | 'secondary neutral' | 'secondary negative' | 'primary success' | 'primary negative' | 'primary neutral';

/** chevron: бейдж открывает список (po-badge__clickable): справа стрелка, отступ как в дизайн-системе. */
export function Badge({ children, kind = 'secondary info', size = 500, title, chevron }: { children: ReactNode; kind?: BadgeKind; size?: 400 | 500; title?: string; chevron?: boolean }) {
  const classes = ['po-badge__badge', `po-badge__size-${size}`, 'ozi-body-400-true', ...(chevron ? ['po-badge__clickable'] : []), ...kind.split(' ').map((k) => `po-badge__${k}`)].join(' ');
  return (
    <div className={classes} title={title}>
      <div className="po-badge__overlay" />
      <div className="po-truncate__truncate po-badge__label">{children}</div>
      {chevron && <Icon name="ui-chevron-down" size={16} className="po-badge__chevron" />}
    </div>
  );
}
