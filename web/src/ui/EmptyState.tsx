import type { ReactNode } from 'react';

/** Пустое состояние (layout.css .po-empty): иконка, жирная строка, серая подсказка. */
export function EmptyState({ icon = '?', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="po-empty" role="status">
      <div className="po-empty__icon" aria-hidden="true">{icon}</div>
      <div className="po-empty__title">{title}</div>
      {children && <div className="po-empty__text">{children}</div>}
      {action && <div className="pa-empty__action">{action}</div>}
    </div>
  );
}
