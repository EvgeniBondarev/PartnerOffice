import { type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { NavLink } from 'react-router-dom';
import type { ReturnPage, ReturnRow } from '../api/returns';
import { formatRange } from '../lib/format';
import { joinList, splitList, toggleValue } from '../lib/multi';
import { Button } from '../ui/Button';
import { CheckboxGroup } from '../ui/CheckboxGroup';
import { type FilterChip } from '../ui/FilterChips';
import { DateFilterSection, FilterPanel } from '../ui/FilterPanel';
import { FilterLayout } from '../ui/FilterLayout';
import { FilterSection } from '../ui/FilterSection';
import { SearchField } from '../ui/SearchField';
import { TextField } from '../ui/TextField';
import { plural, rowKey, suggestionLabel } from './returnsModel';
import type { ReturnsSection } from './useReturnsQuery';

const STATUS_OPTIONS = [
  { value: 'ArrivedAtReturnPlace', label: 'В пункте выдачи' }, { value: 'CheckAtPickupPoint', label: 'Проверка на ПВЗ' }
];
const MARK_OPTIONS = [{ value: 'pending', label: 'Ожидает' }, { value: 'accepted', label: 'Принят' }, { value: 'rejected', label: 'Не принят' }];
/** Уточнение внутри «Принят». На сервер уходит вместо «accepted»: defect / missort / ok — принятые с этим подстатусом. */
const MARK_SUB_OPTIONS = [{ value: 'ok', label: 'ОК (стандартно)' }, { value: 'defect', label: 'Брак' }, { value: 'missort', label: 'Пересорт' }];
const SUB_VALUES = MARK_SUB_OPTIONS.map(option => option.value);
const REVIEW_OPTIONS = [{ value: 'queue', label: 'На разборе' }];
type Query = {
  panelFilters: Record<'mark' | 'status' | 'clientId' | 'review' | 'supplier' | 'pvz' | 'dateFrom' | 'dateTo', string>;
  pvzDraft: string; setPvzDraft: (value: string) => void;
  change: (next: Partial<Query['panelFilters']>) => void; clear: () => void; activeCount: number;
};
type Props = {
  section: ReturnsSection; canWork: boolean; counts: Record<ReturnsSection, number | null>;
  data: ReturnPage | null; supplierNames: string[]; query: Query; search: string; searchDraft: string;
  formRef: RefObject<HTMLFormElement | null>; suggestions: ReturnRow[]; suggestionsOpen: boolean; activeSuggestion: number;
  onSearchValue: (value: string) => void; onSearchFocus: () => void; onSearchBlur: () => void;
  onSuggestionHover: (index: number) => void; chooseSuggestion: (row: ReturnRow) => void;
  apply: (event: FormEvent) => void; searchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  keepSearchFocus?: (event: MouseEvent<HTMLElement>) => void; children: ReactNode;
};
export function ReturnsControls({ section, canWork, counts, data, supplierNames, query: { panelFilters, pvzDraft, setPvzDraft, change, clear, activeCount }, search, searchDraft, formRef, suggestions, suggestionsOpen, activeSuggestion, onSearchValue, onSearchFocus, onSearchBlur, onSuggestionHover, chooseSuggestion, apply, searchKeyDown, keepSearchFocus, children }: Props) {
  const received = section === 'received';
  const transit = section === 'transit';
  const shelf = section === 'shelf';
  const supplier = section === 'supplier';
  const warehouse = section === 'warehouse';
  const outbound = supplier || warehouse;
  const cabinets = data?.cabinets ?? [];
  const label = (options: { value: string; label: string }[], value: string) => options.find(option => option.value === value)?.label ?? value;
  // Тег на каждое выбранное значение: крестик снимает только его.
  const valueChips = (id: 'mark' | 'status' | 'clientId' | 'review' | 'supplier', title: string, name: (value: string) => string): FilterChip[] =>
    splitList(panelFilters[id]).map(value => ({ id: `${id}:${value}`, label: `${title}: ${name(value)}`, onRemove: () => change({ [id]: toggleValue(panelFilters[id], value) }) }));
  const chips: FilterChip[] = [
    ...splitList(panelFilters.mark).map(value => ({
      id: `mark:${value}`, label: `Приёмка: ${SUB_VALUES.includes(value) ? `Принят · ${label(MARK_SUB_OPTIONS, value).replace(' (стандартно)', '')}` : label(MARK_OPTIONS, value)}`,
      // последнее снятое уточнение возвращает общий «Принят», а не стирает его
      onRemove: () => { const rest = splitList(panelFilters.mark).filter(item => item !== value); change({ mark: joinList(SUB_VALUES.includes(value) && !rest.some(item => SUB_VALUES.includes(item)) && !rest.includes('accepted') ? [...rest, 'accepted'] : rest) }); }
    })),
    ...valueChips('review', 'Разбор', value => label(REVIEW_OPTIONS, value)),
    ...valueChips('status', 'Статус Ozon', value => label(STATUS_OPTIONS, value)),
    ...valueChips('clientId', 'Кабинет', value => cabinets.find(c => String(c.id) === value)?.name ?? value),
    ...valueChips('supplier', 'Поставщик', value => value),
    ...(panelFilters.pvz ? [{ id: 'pvz', label: `Пункт выдачи: ${panelFilters.pvz}`, onRemove: () => change({ pvz: '' }) }] : []),
    ...(panelFilters.dateFrom || panelFilters.dateTo ? [{ id: 'date', label: `${received ? 'Получено' : 'Возврат'}: ${formatRange(panelFilters.dateFrom, panelFilters.dateTo)}`, onRemove: () => change({ dateFrom: '', dateTo: '' }) }] : [])
  ];
  const renderPanel = (hideTitle: boolean) => <FilterPanel activeCount={activeCount} hideTitle={hideTitle} onClear={clear}>
    {outbound || shelf
      ? null
      : received
      ? <FilterSection title="Приёмка" active={!!panelFilters.mark}><MarkFilter value={panelFilters.mark} onChange={value => change({ mark: value })} /></FilterSection>
      : <FilterSection title="Статус Ozon" active={!!panelFilters.status}><CheckboxGroup value={panelFilters.status} options={STATUS_OPTIONS} onChange={value => change({ status: value })} /></FilterSection>}
    {received && <FilterSection title="Разбор" active={!!panelFilters.review}><CheckboxGroup value={panelFilters.review} options={REVIEW_OPTIONS} onChange={value => change({ review: value })} /></FilterSection>}
    {received && <FilterSection title="Поставщик" active={!!panelFilters.supplier}>
      <CheckboxGroup value={panelFilters.supplier} options={supplierNames.map(value => ({ value, label: value }))} onChange={value => change({ supplier: value })} />
    </FilterSection>}
    {cabinets.length > 0 && <FilterSection title="Кабинет" active={!!panelFilters.clientId}>
      <CheckboxGroup value={panelFilters.clientId} options={cabinets.map(c => ({ value: String(c.id), label: c.name }))} onChange={value => change({ clientId: value })} />
    </FilterSection>}
    {!shelf && !outbound && <FilterSection title="Пункт выдачи" active={!!panelFilters.pvz}><TextField label="Название пункта" value={pvzDraft} onValueChange={setPvzDraft} size={500} maxLength={100} /></FilterSection>}
    <DateFilterSection title={outbound ? 'Дата решения' : shelf ? 'Дата перемещения' : received ? 'Дата получения' : 'Дата возврата'} from={panelFilters.dateFrom} to={panelFilters.dateTo} onChange={(dateFrom, dateTo) => change({ dateFrom, dateTo })} />
  </FilterPanel>;
  return <FilterLayout
      heading={<>
    <h1 className="pa-visually-hidden">Возвраты</h1>
    <p className="pa-returns__description">{section === 'waiting'
      ? 'Возвраты, которые уже можно забрать в пункте выдачи.'
      : transit
        ? 'Возвраты, которые Ozon ещё везёт к вам или ожидает отправки. Забирать на ПВЗ их пока не нужно.'
      : supplier
        ? 'Возвраты, которые по решению сотрудников нужно отправить поставщику. Скачайте ТТН и передайте товар вместе с ней.'
        : warehouse
        ? 'Возвраты, которые по решению сотрудников возвращаются на наш склад: перемещение в 1С создано. Когда товар придёт к нам, статус станет «Получено нами».'
        : shelf
        ? 'Возвраты, которые по решению сотрудников остаются у вас: перемещение на ваш склад в 1С проведено.'
        : 'Возвраты и FBO-коробки, которые Ozon уже передал продавцу и которые ещё не закрыты в архив.'}</p>
      </>}
      top={
    <div className="pa-list__topbar">
    <nav className="po-tabs__tabs po-tabs__size-500 po-tabs__hug po-tabs__underline pa-returns__tabs" aria-label="Разделы возвратов">
      <ReturnsTab to="/returns/waiting" label="Ждёт получения" count={counts.waiting} />
      <ReturnsTab to="/returns/transit" label="В пути" count={counts.transit} />
      <ReturnsTab to="/returns/received" label="Получено" count={counts.received} />
      <ReturnsTab to="/returns/shelf" label="Полка" count={counts.shelf} />
      <ReturnsTab to="/returns/supplier" label="Возврат поставщику" count={counts.supplier} />
      <ReturnsTab to="/returns/warehouse" label="Возврат на склад" count={counts.warehouse} />
    </nav>
    <form ref={formRef} className="pa-list__search" role="search" aria-label="Поиск возвратов" onSubmit={apply}>
      <div className="pa-list__search-field">
        <SearchField label="Поиск возвратов" placeholder={received && canWork ? 'Товар, артикул, коробка, документ 1С или код со сканера' : received || shelf || outbound ? 'Товар, артикул, коробка или документ' : 'Товар, артикул, отправление или коробка'} value={searchDraft}
          onValueChange={onSearchValue}
          onFocus={onSearchFocus}
          onBlur={onSearchBlur}
          onKeyDown={searchKeyDown} aria-autocomplete="list" aria-controls={suggestionsOpen && suggestions.length ? 'return-suggestions' : undefined}
          aria-activedescendant={suggestionsOpen && activeSuggestion >= 0 ? `return-suggestion-${activeSuggestion}` : undefined} maxLength={100}
          autoFocus={received && canWork} />
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="po-dropdown po-dropdown--500 pa-popover pa-order-suggestions">
            <div className="po-dropdown__scroll"><div id="return-suggestions" className="po-dropdown__list" role="listbox" aria-label="Подсказки по возвратам">
              {suggestions.map((row, index) => <div id={`return-suggestion-${index}`} key={rowKey(row)} role="option"
                aria-selected={activeSuggestion === index} className={`po-dropdown-item${activeSuggestion === index ? ' po-dropdown-item--focused' : ''}`}
                onMouseDown={event => event.preventDefault()} onMouseEnter={() => onSuggestionHover(index)} onClick={() => chooseSuggestion(row)}>
                <div className="po-dropdown-item__block pa-order-suggestions__block">
                  <span className="po-dropdown-item__text pa-order-suggestions__title">{suggestionLabel(row, search)}</span>
                  <span className="pa-order-suggestions__detail">{[row.name, row.offer_id, row.return_type === 'fbo' ? 'Коробка FBO' : row.posting_number].filter(Boolean).join(' · ')}</span>
                </div>
              </div>)}
            </div></div>
          </div>
        )}
      </div>
      {received && canWork && <span className="pa-returns__scanner ozi-body-400-true">Сканер готов</span>}
      <Button type="submit" size={500}>Найти</Button>
    </form>
    </div>
      }
      panel={renderPanel} chips={chips} activeCount={activeCount} onClear={clear} onMouseDown={keepSearchFocus}
      resultLabel={data ? `Показать ${data.total.toLocaleString('ru-RU')} ${plural(data.total, 'возврат', 'возврата', 'возвратов')}` : 'Показать'}>
    {children}
  </FilterLayout>;
}

/** Вкладка раздела по брендбуку (tabs.css); количество серым, чтобы не спорить с названием и активным цветом. */
function ReturnsTab({ to, label, count }: { to: string; label: string; count: number | null }) {
  return <NavLink to={to} className="po-tab__tab" onClick={() => {
    try { window.localStorage.setItem('partner-office.returns-section', to.endsWith('/transit') ? 'transit' : to.endsWith('/received') ? 'received' : to.endsWith('/shelf') ? 'shelf' : to.endsWith('/supplier') ? 'supplier' : to.endsWith('/warehouse') ? 'warehouse' : 'waiting'); } catch { /* storage may be unavailable */ }
  }}>
    {({ isActive }) => <div className={`po-data-cell__dataCell po-tab-content__tabContent po-tab-content__size-500${isActive ? ' po-tab-content__active' : ''}`} style={{ '--columns': '1fr' } as CSSProperties}>
      <div className="po-data-cell__content"><div className="po-data-content__dataContent po-data-content__size-500">
        <div className="po-data-content__label po-data-content__label-size-500 ozi-table-500">{label}{count !== null && <span className="pa-returns__tab-count">{count.toLocaleString('ru-RU')}</span>}</div>
      </div></div>
    </div>}
  </NavLink>;
}

/**
 * Фильтр «Приёмка»: Ожидает / Принят / Не принят; у «Принят» раскрывается уточнение ОК / Брак / Пересорт.
 * В адрес и на сервер уходят значения через запятую: «accepted» — все принятые, «defect» — принятые с браком (старые ссылки ?mark=defect
 * открываются как «Принят → Брак»). Выбор уточнения заменяет общий «accepted», снятие всех уточнений возвращает его.
 */
function MarkFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = splitList(value);
  const subs = selected.filter(item => SUB_VALUES.includes(item));
  const accepted = selected.includes('accepted') || subs.length > 0;
  const others = selected.filter(item => item !== 'accepted' && !SUB_VALUES.includes(item));
  const toggleStatus = (status: string) => {
    if (status !== 'accepted') { onChange(toggleValue(value, status)); return; }
    onChange(joinList(accepted ? others : [...others, 'accepted']));
  };
  const toggleSub = (sub: string) => {
    const next = subs.includes(sub) ? subs.filter(item => item !== sub) : [...subs, sub];
    onChange(joinList([...others, ...(next.length ? next : ['accepted'])]));
  };
  return <div className="pa-filter-options">
    {MARK_OPTIONS.map(option => {
      const checked = option.value === 'accepted' ? accepted : selected.includes(option.value);
      return <div key={option.value}>
        <label className="pa-filter-option ozi-table-500">
          <input type="checkbox" className="po-checkbox" checked={checked} onChange={() => toggleStatus(option.value)} />
          <span className="pa-filter-option__label">{option.label}</span>
        </label>
        {option.value === 'accepted' && accepted && <div className="pa-filter-sub" role="group" aria-label="Результат приёмки">
          {MARK_SUB_OPTIONS.map(sub => <label key={sub.value} className="pa-filter-option ozi-table-500">
            <input type="checkbox" className="po-checkbox" checked={subs.includes(sub.value)} onChange={() => toggleSub(sub.value)} />
            <span className="pa-filter-option__label">{sub.label}</span>
          </label>)}
        </div>}
      </div>;
    })}
  </div>;
}

