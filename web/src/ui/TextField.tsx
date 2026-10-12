import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Icon } from './Icon';

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size' | 'onChange' | 'value' | 'placeholder'> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Ошибка под полем. Показывается значком и текстом, не только цветом рамки. */
  error?: string | null;
  /** Подсказка под полем, пока нет ошибки. */
  hint?: ReactNode;
  /** Предупреждение (не блокирует ввод), например включённый Caps Lock. Ошибка важнее. */
  warning?: string | null;
  /** Красная рамка без текста: когда пояснение уже есть у соседнего поля. */
  invalid?: boolean;
  /** Кнопка справа внутри поля (например, «показать пароль»). */
  rightSlot?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  /** Высота контрола по брендбуку: 600 — 56px (вход), 500 — 44px (формы в диалогах). */
  size?: 500 | 600;
}

/**
 * Поле ввода дизайн-системы: размер 600 (56px, радиус 12), плавающая подпись внутри поля,
 * рамка 2px синяя при фокусе и красная при ошибке (design/components/ozon/input.css).
 */
export function TextField({ label, value, onValueChange, error, hint, warning, invalid, rightSlot, inputRef, id, onFocus, onBlur, disabled, size = 600, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const captionId = `${inputId}-caption`;
  const [focused, setFocused] = useState(false);

  const floated = focused || value.length > 0;
  const hasError = Boolean(error) || Boolean(invalid);
  const caption = error ?? warning ?? hint ?? null;

  const containerClasses = [
    'po-input__container',
    `po-input__size-${size}`,
    'po-input__leftRadius',
    'po-input__rightRadius',
    'pa-field__container',
    hasError ? 'po-input__containerIsError' : '',
    focused && !hasError ? 'po-input__containerIsActive' : '',
    focused && hasError ? 'po-input__containerIsActive' : '',
    disabled ? 'po-input__containerIsDisabled' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`po-input__root pa-field${disabled ? ' po-input__disabled' : ''}`}>
      <div className={containerClasses}>
        <div className="po-input__inputContainer po-input__withLabelInside">
          <label
            htmlFor={inputId}
            className={`po-input__label po-input__labelInside ${floated ? `ozi-body-300 po-input__labelTextFloated-${size}` : 'ozi-body-500'}`}
          >
            {label}
          </label>
          <div className="po-input__inputTokensWrapper">
            <div className={`po-input__inputTokensContainer po-input__size-${size} po-input__singleline po-input__withLabelInside`}>
              <input
                {...rest}
                id={inputId}
                ref={inputRef}
                value={value}
                disabled={disabled}
                className="po-input__input ozi-body-500"
                aria-invalid={hasError || undefined}
                aria-describedby={caption ? captionId : undefined}
                onChange={(event) => onValueChange(event.target.value)}
                onFocus={(event) => {
                  setFocused(true);
                  onFocus?.(event);
                }}
                onBlur={(event) => {
                  setFocused(false);
                  onBlur?.(event);
                }}
              />
            </div>
          </div>
        </div>
        {rightSlot}
      </div>
      <div
        id={captionId}
        className={`po-input__caption ozi-body-300 pa-field__caption${error ? ' po-input__validityError' : ''}${!error && warning ? ' pa-field__caption--warning' : ''}`}
        role={error ? 'alert' : undefined}
      >
        {caption && (error || warning) && <Icon name={error ? 'ui-error' : 'ui-warning'} size={16} className="pa-field__captionIcon" />}
        <span>{caption}</span>
      </div>
    </div>
  );
}
