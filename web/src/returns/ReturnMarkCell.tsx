import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { MarkPatch, ReturnRow } from '../api/returns';
import { Badge, type BadgeKind } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import { usePopover } from '../ui/usePopover';
import { ReturnIssueDialog } from './ReturnIssueDialog';
import { markSub, subPatch, type MarkSub } from './returnsModel';

/** У каждого состояния приёмки свой цвет бейджа брендбука; брак и пересорт — подстатус внутри «Принят» (взаимоисключающий, ОК по умолчанию). */
const MARK_STATUSES: { value: 'pending' | 'accepted' | 'rejected'; label: string; kind: BadgeKind }[] = [
  { value: 'pending', label: 'Ожидает', kind: 'secondary warning' },
  { value: 'accepted', label: 'Принят', kind: 'primary success' },
  { value: 'rejected', label: 'Не принят', kind: 'primary negative' }
];
const MARK_SUBS: { value: MarkSub; label: string }[] = [{ value: 'ok', label: 'ОК' }, { value: 'defect', label: 'Брак' }, { value: 'missort', label: 'Пересорт' }];
const MENU_WIDTH = 200, MENU_HEIGHT = 150;
/**
 * Статус приёмки: бейдж открывает список из трёх статусов (Ожидает / Принят / Не принят). Правее у «Принят» стоят маленькие плашки
 * результата: ОК (светло-зелёная), Брак (красноватая), Пересорт (фиолетовая). Выбранная светится своим цветом, остальные серые;
 * выбор «Брак» или «Пересорт» открывает форму комментария. Плашка не меняет основной статус, уход из «Принят» сбрасывает её в ОК.
 * Без права на приёмку — только бейдж и плашка не-ОК результата.
 */
export function ReturnMarkCell({ row, canWork, busy, onChange }: { row: ReturnRow; canWork: boolean; busy: boolean; onChange: (patch: MarkPatch, operationId?: string) => Promise<boolean> }) {
  const status = MARK_STATUSES.find(item => item.value === (row.mark ?? 'pending')) ?? MARK_STATUSES[0];
  const sub = markSub(row);
  const [editing, setEditing] = useState<Exclude<MarkSub, 'ok'> | null>(null);
  const { open, setOpen, close, rootRef, buttonRef } = usePopover();
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = MARK_STATUSES.map(item => ({
    ...item, checked: item.value === status.value,
    apply: () => { if (item.value !== status.value) onChange(item.value === 'accepted' ? subPatch('ok') : { status: item.value, defect: false, missort: false }); }
  }));

  // Список рисуется поверх таблицы (fixed), иначе его обрежет прокрутка таблицы; у нижнего края открывается вверх.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) { setPosition(null); return; }
    const rect = buttonRef.current.getBoundingClientRect();
    const gap = 8, width = Math.min(MENU_WIDTH, window.innerWidth - gap * 2);
    const left = Math.min(Math.max(gap, rect.left), window.innerWidth - width - gap);
    const below = window.innerHeight - rect.bottom - gap - 4, above = rect.top - gap - 4;
    setPosition(below < MENU_HEIGHT && above > below ? { bottom: window.innerHeight - rect.top + 4, left, width, maxHeight: above } : { top: rect.bottom + 4, left, width, maxHeight: below });
    setActive(Math.max(0, items.findIndex(item => item.checked)));
    const hide = () => setOpen(false);
    window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { if (position) menuRef.current?.focus({ preventScroll: true }); }, [position]);

  const choose = (index: number) => { items[index]?.apply(); close(); };
  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(items.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); setActive(items.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    else if (event.key === 'Tab') setOpen(false);
  };
  const accepted = status.value === 'accepted';

  return <div className="pa-returns__mark-box" ref={rootRef}>
    {canWork
      ? <button type="button" ref={buttonRef} className="pa-badge-button" aria-haspopup="menu" aria-expanded={open} aria-label={`Статус приёмки: ${status.label}`} disabled={busy}
          onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
          <Badge kind={status.kind} chevron>{status.label}</Badge>
        </button>
      : <Badge kind={status.kind}>{status.label}</Badge>}
    {accepted && (canWork
      ? <div className="pa-subchips" role="radiogroup" aria-label="Результат приёмки">
        {MARK_SUBS.map(option => <Fragment key={option.value}>
          {/* ОК стоит в верхней строке рядом со статусом, «Брак» и «Пересорт» переносятся на строку ниже */}
          {option.value === 'defect' && <span className="pa-subchips__break" aria-hidden="true" />}
          <button type="button" role="radio" aria-checked={option.value === sub} disabled={busy}
            className={`pa-subchip pa-subchip--${option.value}${option.value === sub ? ' pa-subchip--active' : ''}`}
            onClick={() => {
              if (option.value === 'ok') { if (option.value !== sub) void onChange(subPatch(option.value)); }
              else setEditing(option.value);
            }}>{option.label}</button>
        </Fragment>)}
      </div>
      : sub !== 'ok' && <span className={`pa-subchip pa-subchip--${sub} pa-subchip--active`}>{MARK_SUBS.find(option => option.value === sub)?.label}</span>)}
    {editing && <ReturnIssueDialog title={editing === 'defect' ? 'Брак' : 'Пересорт'} keys={row.units?.length ? row.units.map(unit => unit.key!) : [row.key!]} initialComment={row.comment || ''} onClose={() => setEditing(null)} onSave={(comment, operationId) => onChange({ ...subPatch(editing), comment }, operationId)} />}
    {open && position && <div className="po-dropdown po-dropdown--500 pa-returns__menu" style={{ ...position, position: 'fixed' }}>
      <div className="po-dropdown__scroll"><div ref={menuRef} className="po-dropdown__list" role="menu" aria-label="Статус приёмки" tabIndex={-1} onKeyDown={onMenuKeyDown}>
        {items.map((item, index) => <div key={item.value} role="menuitemradio" aria-checked={item.checked}
          className={`po-dropdown-item${active === index ? ' po-dropdown-item--focused' : ''}`}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
          <div className="po-dropdown-item__block">
            <Badge kind={item.kind}>{item.label}</Badge>
            {item.checked && <span className="po-dropdown-item__check" aria-hidden="true"><Icon name="ui-check" /></span>}
          </div>
        </div>)}
      </div></div>
    </div>}
  </div>;
}
