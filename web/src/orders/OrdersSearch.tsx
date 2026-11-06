import { useEffect, useState, type FormEvent } from 'react';
import { getOrderSuggestions, type OrderSuggestion } from '../api/orders';
import { Button } from '../ui/Button';
import { SearchField } from '../ui/SearchField';

interface OrdersSearchProps {
  /** Текст в поле: он может опережать применённый поиск на время паузы. */
  value: string;
  onValueChange: (value: string) => void;
  /** Поиск, уже применённый к списку (из адреса). */
  applied: string;
  onApply: (value: string) => void;
}

const suggestionLabel = (item: OrderSuggestion) => item.shipmentNumber ?? item.article ?? item.productName ?? 'Заказ';
const suggestionDetails = (item: OrderSuggestion) => [item.productName, item.article, item.scanit ?? item.trackingNumber].filter(Boolean).join(' · ');

/** Поиск по заказам сверху на всю ширину (капсула по брендбуку): применяется при вводе с паузой, по Enter и «Найти»; подсказки по номеру, товару, артикулу. */
export function OrdersSearch({ value, onValueChange, applied, onApply }: OrdersSearchProps) {
  const [suggestions, setSuggestions] = useState<OrderSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const set = (patch: { search: string }) => onValueChange(patch.search);
  const draft = { search: value };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSuggestionsOpen(false);
    onApply(value.trim());
  };

  // Поиск применяем без кнопки после короткой паузы: ввод не создаёт поток запросов.
  useEffect(() => {
    const search = value.trim();
    if (search === applied) return;
    const timer = window.setTimeout(() => onApply(search), 350);
    return () => window.clearTimeout(timer);
  }, [value, applied, onApply]);

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
          setActiveSuggestion(-1);
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
    <form className="pa-list__search" role="search" aria-label="Поиск заказов" onSubmit={onSubmit}>
      <div className="pa-list__search-field">
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
          aria-autocomplete="list"
          aria-controls={suggestionsOpen && suggestions.length ? 'orders-suggestions' : undefined}
          aria-activedescendant={suggestionsOpen && activeSuggestion >= 0 ? `order-suggestion-${activeSuggestion}` : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { setSuggestionsOpen(false); setActiveSuggestion(-1); }
            else if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setSuggestionsOpen(true); setActiveSuggestion(value => Math.min(value + 1, suggestions.length - 1)); }
            else if (event.key === 'ArrowUp' && suggestionsOpen && suggestions.length) { event.preventDefault(); setActiveSuggestion(value => Math.max(value - 1, 0)); }
            else if (event.key === 'Enter' && suggestionsOpen && activeSuggestion >= 0) { event.preventDefault(); set({ search: suggestionLabel(suggestions[activeSuggestion]) }); setSuggestionsOpen(false); }
          }}
          maxLength={100}
        />
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="po-dropdown po-dropdown--500 pa-popover pa-order-suggestions">
            <div className="po-dropdown__scroll">
              <div id="orders-suggestions" className="po-dropdown__list" role="listbox" aria-label="Подсказки по заказам">
                {suggestions.map((item, index) => (
                  <div
                    id={`order-suggestion-${index}`}
                    key={item.id}
                    role="option"
                    aria-selected={activeSuggestion === index}
                    className={`po-dropdown-item${activeSuggestion === index ? ' po-dropdown-item--focused' : ''}`}
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
      <Button type="submit" variant="primary" size={500}>
        Найти
      </Button>
    </form>
  );
}
