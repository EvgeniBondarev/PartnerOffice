import type { InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size' | 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Подпись для скринридера: плейсхолдер её не заменяет. */
  label: string;
}

/** Поле поиска дизайн-системы (input.css, kind search): лупа слева, очистка справа, 44px. */
export function SearchField({ value, onValueChange, label, ...rest }: SearchFieldProps) {
  return (
    <div className="po-input__root pa-search">
      <div className="po-input__container po-input__size-500 po-input__leftRadius po-input__rightRadius pa-field__container">
        <div className="po-input-search__leftContent">
          <Icon name="ui-search" className="po-input-search__leftIcon po-input-search__icon" />
        </div>
        <div className="po-input__inputContainer">
          <div className="po-input__inputTokensWrapper">
            <div className="po-input__inputTokensContainer po-input__size-500 po-input__singleline">
              <input
                {...rest}
                type="search"
                className="po-input__input po-input__input-500 ozi-table-500"
                aria-label={label}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
              />
            </div>
          </div>
        </div>
        {value && (
          <button type="button" className="pa-field__toggle" onClick={() => onValueChange('')} aria-label="Очистить поиск" title="Очистить поиск">
            <Icon name="ui-close" />
          </button>
        )}
      </div>
    </div>
  );
}
