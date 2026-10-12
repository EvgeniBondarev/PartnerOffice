import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** primary — основная синяя, primary-success — готовое успешное действие, action-secondary — второстепенная, secondary — нейтральная. */
  variant?: 'primary' | 'primary-success' | 'action-secondary' | 'secondary';
  /** Высота контрола по брендбуку: 600 — 56px, 500 — 44px, 400 — 32px. */
  size?: 600 | 500 | 400;
  fill?: boolean;
  loading?: boolean;
  /** Иконка из спрайта слева от текста. */
  icon?: string;
  /** Только иконка (текст уходит в aria-label и подсказку). Размер контрола становится квадратным. */
  iconOnly?: boolean;
  children: ReactNode;
}

/** Кнопка дизайн-системы (design/components/ozon/button.css). Во время загрузки блокируется и показывает индикатор. */
export function Button({ variant = 'primary', size = 500, fill = false, loading = false, icon, iconOnly = false, disabled, children, type = 'button', onClick, ...rest }: ButtonProps) {
  const classes = [
    'po-button__button',
    `po-button__size-${size}`,
    'ozi-body-500-true',
    `po-button__${variant}`,
    fill ? 'po-button__fill' : 'po-button__hug',
    icon ? 'po-button__hasLeftIcon' : '',
    iconOnly ? 'po-button__noContent' : '',
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
      aria-label={iconOnly && typeof children === 'string' ? children : rest['aria-label']}
      title={iconOnly && typeof children === 'string' ? children : rest.title}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
    >
      <div className="po-button__overlay" />
      <div className="po-button__content">
        {icon && <Icon name={icon} />}
        {iconOnly ? null : <div className="po-truncate__truncate po-button__text">{children}</div>}
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
