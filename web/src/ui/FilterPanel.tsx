import type { ReactNode } from 'react';
import { toIsoDate } from '../lib/format';
import { Button } from './Button';
import { DateRangeField } from './DateRangeField';
import { FilterSection } from './FilterSection';

/**
 * Панель фильтров слева от списка (шаблон «список с панелью фильтров», брендбук). Разделы собирает страница
 * из FilterSection, RadioGroup и т.п.: все фильтры применяются сразу, без «Найти».
 * Одно и то же содержимое показывается в колонке, в боковой панели планшета и в шторке телефона.
 */
export function FilterPanel({ activeCount, hideTitle, onClear, children }: { activeCount: number; /** В шторке и боковой панели заголовок «Фильтры» уже есть у окна. */ hideTitle?: boolean; onClear: () => void; children: ReactNode }) {
  return (
    <div className="pa-filters">
      <div className={`pa-filters__head${hideTitle ? ' pa-filters__head--end' : ''}`}>
        {!hideTitle && <h2 className="pa-filters__title ozi-heading-300">Фильтры</h2>}
        {activeCount > 0 && <button type="button" className="pa-link ozi-body-400-true" onClick={onClear}>Сбросить</button>}
      </div>
      {children}
    </div>
  );
}

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
/** Быстрый выбор периода, включая сегодняшний день: 7 дней — это сегодня и шесть предыдущих. */
const QUICK_DATES = [{ label: 'Сегодня', days: 0 }, { label: '7 дней', days: 6 }, { label: '30 дней', days: 29 }];

/** Раздел «Дата …»: период с календарём и быстрые кнопки. Значения — yyyy-MM-dd. */
export function DateFilterSection({ title, from, to, onChange }: { title: string; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const todayIso = toIsoDate(new Date());
  return (
    <FilterSection title={title} active={!!(from || to)}>
      <DateRangeField label="Период" from={from} to={to} onChange={onChange} floating />
      <div className="pa-filters__quick">
        {QUICK_DATES.map(item => {
          const start = toIsoDate(addDays(new Date(), -item.days));
          return <Button key={item.label} variant="secondary" size={400} aria-pressed={to === todayIso && from === start} onClick={() => onChange(start, todayIso)}>{item.label}</Button>;
        })}
      </div>
    </FilterSection>
  );
}
