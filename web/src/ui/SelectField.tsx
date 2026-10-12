import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { usePopover } from './usePopover';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  /** Пустая строка — ничего не выбрано (показывается «Все»). */
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  emptyLabel?: string;
  disabled?: boolean;
  /** Поиск по списку включается сам, когда пунктов больше этого числа. */
  searchFrom?: number;
}

/**
 * Селект дизайн-системы (dropdown.css: .po-select и .po-dropdown). Управляется с клавиатуры:
 * Enter, пробел или стрелка открывают список, стрелки и Home/End двигают выбор, Enter подтверждает, Esc закрывает.
 */
export function SelectField({ label, value, options, onChange, emptyLabel = 'Все', disabled, searchFrom = 8 }: SelectFieldProps) {
  const { open, setOpen, close, rootRef, buttonRef } = usePopover();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const all = useMemo<SelectOption[]>(() => [{ value: '', label: emptyLabel }, ...options], [options, emptyLabel]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : all;
  }, [all, options, query]);
  const searchable = options.length > searchFrom;
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, all.findIndex((o) => o.value === value)));
  }, [open, all, value]);

  // Без строки поиска фокус сразу уходит в список, чтобы работали стрелки.
  useEffect(() => {
    if (open && !searchable) listboxRef.current?.focus({ preventScroll: true });
  }, [open, searchable]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, visible]);

  const choose = (option: SelectOption) => {
    onChange(option.value);
    close();
  };

  const onButtonKeyDown = (event: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(visible.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(visible.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = visible[active];
      if (option) choose(option);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="pa-select" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`po-select pa-select__button${open ? ' po-select--active' : ''}${disabled ? ' po-select--disabled' : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? emptyLabel}`}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={onButtonKeyDown}
      >
        <span className="po-select__body">
          <span className={`po-select__label${selected ? '' : ' po-select__label--placeholder'}`}>{label}</span>
          {selected && <span className="po-select__value">{selected.label}</span>}
        </span>
        <Icon name="ui-chevron-updown" className="po-input-select__icon" />
      </button>

      {open && (
        <div className="po-dropdown po-dropdown--500 pa-popover" onKeyDown={onListKeyDown}>
          {searchable && (
            <div className="pa-popover__search">
              <input
                autoFocus
                type="search"
                className="po-input__input ozi-table-500 pa-popover__searchInput"
                placeholder="Найти в списке"
                aria-label={`Найти: ${label}`}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
              />
            </div>
          )}
          <div className="po-dropdown__scroll" ref={listRef}>
            <div
              id={listId}
              className="po-dropdown__list"
              role="listbox"
              aria-label={label}
              tabIndex={searchable ? -1 : 0}
              ref={listboxRef}
            >
              {visible.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <div
                    key={option.value || '__all'}
                    role="option"
                    aria-selected={isSelected}
                    data-active={index === active}
                    className={`po-dropdown-item${index === active ? ' po-dropdown-item--focused' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    <div className="po-dropdown-item__block">
                      <span className={`po-dropdown-item__text${isSelected ? ' pa-popover__selected' : ''}`}>{option.label}</span>
                      {isSelected && (
                        <span className="po-dropdown-item__check" aria-hidden="true">
                          <Icon name="ui-check" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && <div className="po-dropdown-empty">Ничего не найдено</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
