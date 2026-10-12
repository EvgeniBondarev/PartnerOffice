import type { ReactNode } from 'react';

/** Пустое состояние (layout.css .po-empty): иконка, жирная строка, серая подсказка. */
export function EmptyState({ icon = '?', illustration, title, children, action }: { icon?: string; illustration?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="po-empty" role="status">
      {illustration ? <img className="pa-empty__illustration" src={illustration} alt="" /> : <div className="po-empty__icon" aria-hidden="true">{icon}</div>}
      <div className="po-empty__title">{title}</div>
      {children && <div className="po-empty__text">{children}</div>}
      {action && <div className="pa-empty__action">{action}</div>}
    </div>
  );
}
