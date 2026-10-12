import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { formatRange, fromIsoDate, toIsoDate } from '../lib/format';
import { Icon } from './Icon';
import { usePopover } from './usePopover';

interface DateRangeFieldProps {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** Сегодняшняя дата: позже неё выбрать нельзя. Параметром, чтобы поведение можно было проверить. */
  today?: Date;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const SHORTCUTS: Array<{ label: string; build: (today: Date) => [Date, Date] }> = [
  { label: 'За неделю', build: (t) => [addDays(t, -6), t] },
  { label: 'За месяц', build: (t) => [addDays(t, -29), t] },
  { label: 'За полгода', build: (t) => [new Date(t.getFullYear(), t.getMonth() - 6, t.getDate()), t] },
  { label: 'За год', build: (t) => [new Date(t.getFullYear() - 1, t.getMonth(), t.getDate()), t] }
];

/** Поле периода с календарём дизайн-системы (calendar.css): две панели месяцев, пресеты справа, выбор двумя кликами. */
export function DateRangeField({ label, from, to, onChange, today: todayProp }: DateRangeFieldProps) {
  const today = useMemo(() => startOfDay(todayProp ?? new Date()), [todayProp]);
  const { open, setOpen, close, rootRef, buttonRef } = usePopover();
  const [view, setView] = useState(() => addMonths(fromIsoDate(to) ?? today, 0));
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);

  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  const value = formatRange(from, to);

  useEffect(() => {
    if (!open) return;
    setAnchor(null);
    setHover(null);
    setView(addMonths(end ?? start ?? today, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const apply = (a: Date, b: Date) => {
    const [x, y] = a <= b ? [a, b] : [b, a];
    onChange(toIsoDate(x), toIsoDate(y));
    close();
  };

  const pick = (day: Date) => {
    if (day > today) return;
    if (!anchor) {
      setAnchor(day);
      return;
    }
    apply(anchor, day);
  };

  // Диапазон, который подсвечиваем: пока выбираем — от первого клика до наведённого дня.
  const shownStart = anchor ?? start;
  const shownEnd = anchor ? hover ?? anchor : end;
  const [lo, hi] = shownStart && shownEnd ? (shownStart <= shownEnd ? [shownStart, shownEnd] : [shownEnd, shownStart]) : [null, null];

  const leftMonth = addMonths(view, -1);
  const months = [leftMonth, view];

  return (
    <div className="pa-select" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`po-select pa-select__button${open ? ' po-select--active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value || 'не выбран'}`}
        onClick={() => setOpen(!open)}
      >
        <span className="po-select__body">
          <span className={`po-select__label${value ? '' : ' po-select__label--placeholder'}`}>{label}</span>
          {value && <span className="po-select__value">{value}</span>}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            className="pa-select__clear"
            aria-label="Сбросить период"
            title="Сбросить период"
            onClick={(event) => {
              event.stopPropagation();
              onChange('', '');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onChange('', '');
              }
            }}
          >
            <Icon name="ui-close" />
          </span>
        ) : (
          <Icon name="ui-calendar" className="po-input-date__icon" />
        )}
      </button>

      {open && (
        <div className="po-calendar pa-popover pa-popover--calendar" role="dialog" aria-label="Выбор периода">
          {months.map((month, index) => (
            <Month
              key={month.getTime()}
              month={month}
              today={today}
              lo={lo}
              hi={hi}
              anchor={anchor}
              showPrev={index === 0}
              showNext={index === 1 && addMonths(view, 1) <= today}
              onPrev={() => setView(addMonths(view, -1))}
              onNext={() => setView(addMonths(view, 1))}
              onPick={pick}
              onHover={setHover}
            />
          ))}
          <div className="po-calendar__right">
            <div className="po-calendar__shortcuts">
              {SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  className="po-calendar__shortcut pa-calendar__shortcut"
                  onClick={() => {
                    const [a, b] = shortcut.build(today);
                    apply(a, b);
                  }}
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pa-calendar__hint">{anchor ? 'Выберите вторую дату' : 'Выберите первую дату'}</div>
        </div>
      )}
    </div>
  );
}

interface MonthProps {
  month: Date;
  today: Date;
  lo: Date | null;
  hi: Date | null;
  anchor: Date | null;
  showPrev: boolean;
  showNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPick: (day: Date) => void;
  onHover: (day: Date | null) => void;
}

function Month({ month, today, lo, hi, anchor, showPrev, showNext, onPrev, onNext, onPick, onHover }: MonthProps) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const lead = (new Date(year, m, 1).getDay() + 6) % 7;
  const count = new Date(year, m + 1, 0).getDate();
  const title = month.toLocaleDateString('ru-RU', { month: 'long' });

  const cells: ReactElement[] = [];
  for (let i = 0; i < lead; i++) cells.push(<div key={`b${i}`} className="po-day" style={{ visibility: 'hidden' }} />);
  for (let d = 1; d <= count; d++) {
    const day = new Date(year, m, d);
    const col = (lead + d - 1) % 7;
    const cls = ['po-day'];
    if (col === 0) cls.push('po-day--first-in-row');
    if (col === 6) cls.push('po-day--last-in-row');
    if (col >= 5) cls.push('po-day--weekend');
    const disabled = day > today;
    if (disabled) cls.push('po-day--disabled');
    else if (lo && hi) {
      const isLo = day.getTime() === lo.getTime();
      const isHi = day.getTime() === hi.getTime();
      if (isLo && isHi) cls.push('po-day--single');
      else if (isLo) cls.push('po-day--in-range', 'po-day--start');
      else if (isHi) cls.push('po-day--in-range', 'po-day--end');
      else if (day > lo && day < hi) cls.push('po-day--in-range');
    } else if (anchor && day.getTime() === anchor.getTime()) cls.push('po-day--single');
    cells.push(
      <button
        key={d}
        type="button"
        className={cls.join(' ')}
        disabled={disabled}
        aria-label={day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        onClick={() => onPick(day)}
        onMouseEnter={() => onHover(day)}
        onMouseLeave={() => onHover(null)}
      >
        <span className="po-day__text">{d}</span>
      </button>
    );
  }

  return (
    <div className="po-cal-grid">
      <div className="po-cal-grid__header">
        {showPrev && (
          <button type="button" className="pa-calendar__arrow po-cal-grid__arrow po-cal-grid__arrow--prev" onClick={onPrev} aria-label="Предыдущий месяц">
            <Icon name="ui-chevron-right" className="pa-calendar__arrowFlip" />
          </button>
        )}
        <div className="po-cal-grid__caption">
          <span>{title}</span>
          <span className="po-cal-grid__year">{year}</span>
        </div>
        {showNext && (
          <button type="button" className="pa-calendar__arrow po-cal-grid__arrow po-cal-grid__arrow--next" onClick={onNext} aria-label="Следующий месяц">
            <Icon name="ui-chevron-right" />
          </button>
        )}
      </div>
      <div className="po-cal-grid__days">
        {WEEKDAYS.map((w) => (
          <div key={w} className="po-cal-grid__weekday">{w}</div>
        ))}
        {cells}
      </div>
    </div>
  );
}
