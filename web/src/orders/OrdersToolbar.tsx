import type { FormEvent } from 'react';
import type { OrderFilters } from '../api/orders';
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

/** Строка фильтров по брендбуку: поля в один ряд, «Найти» справа, сброс иконкой. */
export function OrdersToolbar({ draft, filters, onChange, onApply, onReset, busy }: OrdersToolbarProps) {
  const set = (patch: Partial<OrderFilterState>) => onChange({ ...draft, ...patch });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onApply();
  };

  return (
    <form className="po-page__toolbar pa-toolbar" role="search" aria-label="Фильтры заказов" onSubmit={onSubmit}>
      <div className="pa-toolbar__search">
        <SearchField
          label="Поиск по заказам"
          placeholder="Номер, товар, артикул или трек-номер"
          value={draft.search}
          onValueChange={(search) => set({ search })}
          maxLength={100}
        />
      </div>
      <div className="pa-toolbar__field">
        <SelectField label="Статус" value={draft.statusId} options={toOptions(filters?.statuses)} onChange={(statusId) => set({ statusId })} />
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
