import type { ReactNode } from 'react';

/** Бейдж дизайн-системы (badge.css): статус всегда подписан текстом, цвет только усиливает. */
export type BadgeKind = 'secondary info' | 'secondary warning' | 'secondary neutral' | 'primary success' | 'primary negative' | 'primary neutral';

export function Badge({ children, kind = 'secondary info', size = 500, title }: { children: ReactNode; kind?: BadgeKind; size?: 400 | 500; title?: string }) {
  const classes = ['po-badge__badge', `po-badge__size-${size}`, 'ozi-body-400-true', ...kind.split(' ').map((k) => `po-badge__${k}`)].join(' ');
  return (
    <div className={classes} title={title}>
      <div className="po-badge__overlay" />
      <div className="po-truncate__truncate po-badge__label">{children}</div>
    </div>
  );
}
