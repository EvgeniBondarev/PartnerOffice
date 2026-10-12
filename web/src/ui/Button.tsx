import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** primary — основная синяя (одна на экране), action-secondary — второстепенная, secondary — нейтральная. */
  variant?: 'primary' | 'action-secondary' | 'secondary';
  /** Высота контрола по брендбуку: 600 — 56px, 500 — 44px, 400 — 32px. */
  size?: 600 | 500 | 400;
  fill?: boolean;
  loading?: boolean;
  children: ReactNode;
}

/** Кнопка дизайн-системы (design/components/ozon/button.css). Во время загрузки блокируется и показывает индикатор. */
export function Button({ variant = 'primary', size = 500, fill = false, loading = false, disabled, children, type = 'button', onClick, ...rest }: ButtonProps) {
  const classes = [
    'po-button__button',
    `po-button__size-${size}`,
    'ozi-body-500-true',
    `po-button__${variant}`,
    fill ? 'po-button__fill' : 'po-button__hug',
    loading ? 'po-button__hasLoading' : '',
    disabled && !loading ? 'po-button__disabled' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    // Во время загрузки кнопку не отключаем (:disabled перекрасил бы её в серую): повторные нажатия просто игнорируем.
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
    >
      <div className="po-button__overlay" />
      <div className="po-button__content">
        <div className="po-truncate__truncate po-button__text">{children}</div>
      </div>
      {loading && (
        <div className="po-button__loading" role="status">
          <span className="pa-spinner" aria-hidden="true" />
          <span className="pa-visually-hidden">Подождите</span>
        </div>
      )}
    </button>
  );
}
