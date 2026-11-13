import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { joinList, splitList } from '../lib/multi';

export type ReturnsSection = 'waiting' | 'received' | 'shelf' | 'supplier' | 'warehouse';
export interface ReturnFilters { pvz: string; supplier: string; status: string; clientId: string; mark: string; review: string; dateFrom: string; dateTo: string }

export const NO_FILTERS: ReturnFilters = { pvz: '', supplier: '', status: '', clientId: '', mark: '', review: '', dateFrom: '', dateTo: '' };
export const STATUS_VALUES = ['ArrivedAtReturnPlace', 'CheckAtPickupPoint', 'MovingToSeller', 'WaitingShipment'];
export const MARK_VALUES = ['pending', 'accepted', 'rejected', 'ok', 'defect', 'missort'];
export const PVZ_DELAY_MS = 350;

/** Имя параметра в адресной строке: ?mark=pending&client=3. Остальные имена совпадают с параметрами API. */
const URL_KEYS: Record<keyof ReturnFilters, string> = { pvz: 'pvz', supplier: 'supplier', status: 'status', clientId: 'client', mark: 'mark', review: 'review', dateFrom: 'from', dateTo: 'to' };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Значения из адресной строки приходят от кого угодно (ссылка от коллеги, закладка): неизвестное отбрасываем, а не отправляем на сервер. */
export function parseFilters(params: URLSearchParams, section: ReturnsSection): ReturnFilters {
  const get = (field: keyof ReturnFilters) => params.get(URL_KEYS[field]) ?? '';
  /** Несколько значений через запятую («mark=pending,accepted»): остаются только известные, без повторов. */
  const list = (field: keyof ReturnFilters, valid: (item: string) => boolean) => joinList([...new Set(splitList(get(field)).filter(valid))]);
  const date = (field: keyof ReturnFilters) => (ISO_DATE.test(get(field)) ? get(field) : '');
  return {
    pvz: get('pvz').trim().slice(0, 100),
    supplier: section === 'received' ? get('supplier').trim().slice(0, 100) : '',
    clientId: list('clientId', item => /^\d{1,10}$/.test(item)),
    status: section === 'waiting' ? list('status', item => STATUS_VALUES.includes(item)) : '',
    mark: section === 'received' ? list('mark', item => MARK_VALUES.includes(item)) : '',
    review: section === 'received' ? list('review', item => item === 'queue') : '',
    dateFrom: date('dateFrom'),
    dateTo: date('dateTo')
  };
}

/**
 * Фильтры возвратов, кроме поиска, живут в адресной строке: ссылку можно отправить коллеге, «Назад» возвращает
 * прошлый набор, обновление страницы фильтры не теряет. Пункт выдачи набирают текстом: он попадает в адрес после паузы.
 * Поиск в адрес не пишется: в него попадают коды со сканера, а «Очистить всё» поиск не трогает.
 */
export function useReturnsQuery(section: ReturnsSection) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params, section), [params, section]);
  const [pvzDraft, setPvzDraft] = useState(filters.pvz);
  const [supplierDraft, setSupplierDraft] = useState(filters.supplier);
  // Значения, которые страница сама записала в адрес: отличие от адреса значит, что сменили его снаружи («Назад»).
  const written = useRef({ pvz: filters.pvz, supplier: filters.supplier });

  const change = useCallback((values: Partial<ReturnFilters>, replace = false) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const [field, value] of Object.entries(values) as [keyof ReturnFilters, string][]) {
        if (value) next.set(URL_KEYS[field], value); else next.delete(URL_KEYS[field]);
      }
      return next;
    }, { replace });
  }, [setParams]);

  const clear = useCallback(() => {
    written.current = { pvz: '', supplier: '' };
    setPvzDraft('');
    setSupplierDraft('');
    change(NO_FILTERS);
  }, [change]);

  const useDelayedTextFilter = (field: 'pvz' | 'supplier', draft: string, setDraft: (value: string) => void) => {
    const filterValue = filters[field];
    useEffect(() => {
      const value = draft.trim();
      if (value === filterValue) return;
      const timer = window.setTimeout(() => { written.current = { ...written.current, [field]: value }; change({ [field]: value }, true); }, PVZ_DELAY_MS);
      return () => window.clearTimeout(timer);
    }, [field, draft, filterValue, change]);

    useEffect(() => {
      if (filterValue === written.current[field]) return;
      written.current = { ...written.current, [field]: filterValue };
      setDraft(filterValue);
    }, [field, filterValue, setDraft]);
  };
  useDelayedTextFilter('pvz', pvzDraft, setPvzDraft);
  useDelayedTextFilter('supplier', supplierDraft, setSupplierDraft);

  const activeCount = Object.values(filters).filter(Boolean).length;
  return { filters, pvzDraft, setPvzDraft, supplierDraft, setSupplierDraft, change, clear, activeCount };
}
