import { splitList, toggleValue } from '../lib/multi';

export interface CheckboxOption {
  value: string;
  label: string;
  /** Сколько записей будет при выборе значения. Нулевое значение гасится, но остаётся видимым. */
  count?: number;
}

/**
 * Выбор нескольких значений (чекбоксы checkbox.css). Значение — строка через запятую (lib/multi), пустая — выбрано всё.
 * Группу подписывает fieldset раздела.
 */
export function CheckboxGroup({ value, options, onChange }: { value: string; options: CheckboxOption[]; onChange: (value: string) => void }) {
  const selected = splitList(value);
  return (
    <div className="pa-filter-options">
      {options.map(option => {
        const checked = selected.includes(option.value);
        const dim = option.count === 0 && !checked;
        return (
          <label key={option.value} className={`pa-filter-option ozi-table-500${dim ? ' pa-filter-option--dim' : ''}`}>
            <input type="checkbox" className="po-checkbox" checked={checked} onChange={() => onChange(toggleValue(value, option.value))} />
            <span className="pa-filter-option__label">{option.label}</span>
            {option.count !== undefined && <span className="pa-filter-option__count">{option.count.toLocaleString('ru-RU')}</span>}
          </label>
        );
      })}
    </div>
  );
}
