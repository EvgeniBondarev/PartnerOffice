import { useId, useRef, type ClipboardEvent, type KeyboardEvent, type Ref } from 'react';
import { Icon } from './Icon';

interface CodeFieldProps {
  label: string;
  /** Введённые цифры без пропусков, не длиннее length. */
  value: string;
  onValueChange: (value: string) => void;
  length?: number;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  /** Ссылка на первую ячейку: через неё страница возвращает фокус в поле после ошибки. */
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
}

/**
 * Поле для кода из письма: по одной ячейке на цифру, как в банковских приложениях.
 * Цифры вводятся подряд с автопереходом, Backspace стирает назад, вставка раскладывает код по ячейкам,
 * автоподстановка кода из СМС и писем (autocomplete=one-time-code) тоже работает.
 * Рамка и цвета по токенам поля ввода дизайн-системы (design/components/ozon/input.css).
 */
export function CodeField({ label, value, onValueChange, length = 6, error, hint, disabled, inputRef, autoFocus }: CodeFieldProps) {
  const id = useId();
  const captionId = `${id}-caption`;
  const cells = useRef<Array<HTMLInputElement | null>>([]);
  // Актуальное значение между перерисовками: цифры могут прийти быстрее, чем React обновит props.
  const latest = useRef(value);
  latest.current = value;
  const commit = (next: string) => {
    latest.current = next;
    onValueChange(next);
  };

  const focusCell = (index: number) => {
    const cell = cells.current[Math.max(0, Math.min(index, length - 1))];
    cell?.focus();
    cell?.select();
  };

  const digitsOf = (text: string) => text.replace(/\D/g, '');

  const onChange = (index: number, raw: string) => {
    const digits = digitsOf(raw);
    if (digits.length === 0) return;
    // Новая цифра встаёт в свою ячейку или в первую свободную: пропусков в коде не бывает.
    const current = latest.current;
    const position = Math.min(index, current.length);
    // В первую ячейку браузер может подставить код целиком; в остальных берём последнюю набранную цифру.
    const typed = index === 0 ? digits : digits.slice(-1);
    const next =
      typed.length === 1 && position < current.length
        ? current.slice(0, position) + typed + current.slice(position + 1)
        : (current.slice(0, position) + typed).slice(0, length);
    commit(next);
    focusCell(position + typed.length < length ? Math.min(position + typed.length, next.length) : length - 1);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const current = latest.current;
      if (current.length === 0) return;
      const target = index < current.length ? index : current.length - 1;
      commit(current.slice(0, target) + current.slice(target + 1));
      focusCell(target);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      const current = latest.current;
      if (index < current.length) commit(current.slice(0, index) + current.slice(index + 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusCell(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusCell(Math.min(index + 1, latest.current.length));
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusCell(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusCell(Math.min(latest.current.length, length - 1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const digits = digitsOf(event.clipboardData.getData('text'));
    if (digits.length === 0) return;
    event.preventDefault();
    const next = digits.slice(0, length);
    commit(next);
    focusCell(next.length < length ? next.length : length - 1);
  };

  const caption = error ?? hint ?? null;

  return (
    <div className="pa-code" role="group" aria-labelledby={`${id}-label`} aria-describedby={caption ? captionId : undefined}>
      <span id={`${id}-label`} className="pa-code__label ozi-body-300">{label}</span>
      <div className="pa-code__cells">
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(node) => {
              cells.current[index] = node;
              if (index === 0 && inputRef) {
                if (typeof inputRef === 'function') inputRef(node);
                else (inputRef as { current: HTMLInputElement | null }).current = node;
              }
            }}
            className={`pa-code__cell${error ? ' pa-code__cell--error' : ''}${value[index] ? ' pa-code__cell--filled' : ''}`}
            value={value[index] ?? ''}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            // На первой ячейке разрешаем всю длину: так браузер подставляет код из письма целиком.
            maxLength={index === 0 ? length : 2}
            aria-label={`Цифра ${index + 1} из ${length}`}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            spellCheck={false}
            onChange={(event) => onChange(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={onPaste}
            onFocus={(event) => event.target.select()}
          />
        ))}
      </div>
      <div
        id={captionId}
        className={`po-input__caption ozi-body-300 pa-field__caption${error ? ' po-input__validityError' : ''}`}
        role={error ? 'alert' : undefined}
      >
        {error && <Icon name="ui-error" size={16} className="pa-field__captionIcon" />}
        <span>{caption}</span>
      </div>
    </div>
  );
}
