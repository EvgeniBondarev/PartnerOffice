import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getOrderSuggestions, type OrderFilters, type OrderSuggestion } from '../api/orders';
import { Button } from '../ui/Button';
import { DateRangeField } from '../ui/DateRangeField';
import { SearchField } from '../ui/SearchField';
import { SelectField } from '../ui/SelectField';
import { hasActiveFilters, type OrderFilterState } from './params';

interface OrdersToolbarProps {
  draft: OrderFilterState;
  filters: OrderFilters | null;
  onChange: (next: OrderFilterState) => void;
  onApply: () => void;
  onReset: () => void;
  busy: boolean;
}

const toOptions = (items: Array<{ id: number; name: string }> = []) => items.map((item) => ({ value: String(item.id), label: item.name }));
const ozonStatusOptions = (items: string[] = []) => items.map((name) => ({ value: name, label: name }));

const suggestionLabel = (item: OrderSuggestion) => item.shipmentNumber ?? item.article ?? item.productName ?? 'Заказ';
const suggestionDetails = (item: OrderSuggestion) => [item.productName, item.article, item.scanit ?? item.trackingNumber].filter(Boolean).join(' · ');

/** Строка фильтров по брендбуку: поля в один ряд, «Найти» справа, сброс иконкой. */
export function OrdersToolbar({ draft, filters, onChange, onApply, onReset, busy }: OrdersToolbarProps) {
  const [suggestions, setSuggestions] = useState<OrderSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const appliedSearch = useRef(draft.search.trim());
  const set = (patch: Partial<OrderFilterState>) => onChange({ ...draft, ...patch });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onApply();
  };

  // Поиск применяем без кнопки после короткой паузы: ввод не создаёт поток запросов.
  useEffect(() => {
    const search = draft.search.trim();
    if (search === appliedSearch.current) return;
    const timer = window.setTimeout(() => {
      appliedSearch.current = search;
      onApply();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft.search, onApply]);

  useEffect(() => {
    const search = draft.search.trim();
    if (search.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getOrderSuggestions(search, controller.signal)
        .then((items) => {
          setSuggestions(items);
          setSuggestionsOpen(true);
        })
        .catch(() => !controller.signal.aborted && setSuggestions([]));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft.search]);

  return (
    <form className="po-page__toolbar pa-toolbar" role="search" aria-label="Фильтры заказов" onSubmit={onSubmit}>
      <div className="pa-toolbar__search">
        <SearchField
          label="Поиск по заказам"
          placeholder="Номер, товар, артикул или трек-номер"
          value={draft.search}
          onValueChange={(search) => {
            set({ search });
            setSuggestionsOpen(true);
          }}
          onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
          onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 150)}
          maxLength={100}
        />
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="po-dropdown po-dropdown--500 pa-popover pa-order-suggestions">
            <div className="po-dropdown__scroll">
              <div className="po-dropdown__list" role="listbox" aria-label="Подсказки по заказам">
                {suggestions.map((item) => (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={false}
                    className="po-dropdown-item"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      set({ search: suggestionLabel(item) });
                      setSuggestionsOpen(false);
                    }}
                  >
                    <div className="po-dropdown-item__block pa-order-suggestions__block">
                      <span className="po-dropdown-item__text pa-order-suggestions__title">{suggestionLabel(item)}</span>
                      {suggestionDetails(item) && <span className="pa-order-suggestions__detail">{suggestionDetails(item)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="pa-toolbar__field">
        <SelectField label="Статус Ozon" value={draft.ozonStatus} options={ozonStatusOptions(filters?.ozonStatuses)} onChange={(ozonStatus) => set({ ozonStatus })} />
      </div>
      <div className="pa-toolbar__field">
        <SelectField label="Склад" value={draft.warehouseId} options={toOptions(filters?.warehouses)} onChange={(warehouseId) => set({ warehouseId })} />
      </div>
      <div className="pa-toolbar__field">
        <SelectField label="Клиент" value={draft.clientId} options={toOptions(filters?.clients)} onChange={(clientId) => set({ clientId })} />
      </div>
      <div className="pa-toolbar__field pa-toolbar__field--period">
        <DateRangeField label="Дата заказа" from={draft.from} to={draft.to} onChange={(from, to) => set({ from, to })} />
      </div>
      <Button type="submit" variant="primary" size={500} loading={busy}>
        Найти
      </Button>
      <Button type="button" variant="secondary" size={500} icon="ui-clear-filters" iconOnly disabled={!hasActiveFilters(draft)} onClick={onReset}>
        Сбросить фильтры
      </Button>
    </form>
  );
}
