import iconsUrl from '../../../design/icons/icons.svg?url';

/** Иконка из спрайта дизайн-системы (design/icons/icons.svg). Цвет — currentColor. */
export function Icon({ name, size = 24, className = '' }: { name: string; size?: 16 | 20 | 24; className?: string }) {
  return (
    <svg
      className={`po-icon ${className}`.trim()}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`${iconsUrl}#${name}`} />
    </svg>
  );
}
