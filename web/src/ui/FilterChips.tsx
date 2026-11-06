import { Icon } from './Icon';

export interface FilterChip {
  id: string;
  /** Подпись тега: «Приёмка: Принят». */
  label: string;
  onRemove: () => void;
}

/** Теги выбранных фильтров над списком: крестик убирает один, «Очистить всё» — все. Без выбранных фильтров ничего не рисуется. */
export function FilterChips({ chips, onClear }: { chips: FilterChip[]; onClear: () => void }) {
  if (chips.length === 0) return null;
  return (
    <ul className="pa-chips" aria-label="Выбранные фильтры">
      {chips.map(chip => (
        <li key={chip.id} className="pa-chip ozi-body-400-true">
          <span className="pa-chip__label">{chip.label}</span>
          <button type="button" className="pa-chip__remove" onClick={chip.onRemove} aria-label={`Убрать фильтр: ${chip.label}`} title="Убрать фильтр">
            <Icon name="ui-close" size={16} />
          </button>
        </li>
      ))}
      <li className="pa-chips__clear">
        <button type="button" className="pa-link pa-chips__clear-button ozi-body-400-true" onClick={onClear}>Очистить всё</button>
      </li>
    </ul>
  );
}
