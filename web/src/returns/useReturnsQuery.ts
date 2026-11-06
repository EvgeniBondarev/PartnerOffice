import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { joinList, splitList } from '../lib/multi';

export type ReturnsSection = 'waiting' | 'received';
export interface ReturnFilters { pvz: string; status: string; clientId: string; mark: string; dateFrom: string; dateTo: string }

export const NO_FILTERS: ReturnFilters = { pvz: '', status: '', clientId: '', mark: '', dateFrom: '', dateTo: '' };
export const STATUS_VALUES = ['ArrivedAtReturnPlace', 'CheckAtPickupPoint', 'MovingToSeller', 'WaitingShipment'];
export const MARK_VALUES = ['pending', 'accepted', 'rejected', 'defect', 'missort'];
export const PVZ_DELAY_MS = 350;

/** Имя параметра в адресной строке: ?mark=pending&client=3. Остальные имена совпадают с параметрами API. */
const URL_KEYS: Record<keyof ReturnFilters, string> = { pvz: 'pvz', status: 'status', clientId: 'client', mark: 'mark', dateFrom: 'from', dateTo: 'to' };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Значения из адресной строки приходят от кого угодно (ссылка от коллеги, закладка): неизвестное отбрасываем, а не отправляем на сервер. */
export function parseFilters(params: URLSearchParams, section: ReturnsSection): ReturnFilters {
  const get = (field: keyof ReturnFilters) => params.get(URL_KEYS[field]) ?? '';
  /** Несколько значений через запятую («mark=pending,accepted»): остаются только известные, без повторов. */
  const list = (field: keyof ReturnFilters, valid: (item: string) => boolean) => joinList([...new Set(splitList(get(field)).filter(valid))]);
  const date = (field: keyof ReturnFilters) => (ISO_DATE.test(get(field)) ? get(field) : '');
  return {
    pvz: get('pvz').trim().slice(0, 100),
    clientId: list('clientId', item => /^\d{1,10}$/.test(item)),
    status: section === 'waiting' ? list('status', item => STATUS_VALUES.includes(item)) : '',
    mark: section === 'received' ? list('mark', item => MARK_VALUES.includes(item)) : '',
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
  // Какое значение «Пункта выдачи» страница сама записала в адрес: отличие от адреса значит, что сменили его снаружи («Назад»).
  const written = useRef(filters.pvz);

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
    written.current = '';
    setPvzDraft('');
    change(NO_FILTERS);
  }, [change]);

  useEffect(() => {
    const pvz = pvzDraft.trim();
    if (pvz === filters.pvz) return;
    const timer = window.setTimeout(() => { written.current = pvz; change({ pvz }, true); }, PVZ_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pvzDraft, filters.pvz, change]);

  useEffect(() => {
    if (filters.pvz === written.current) return;
    written.current = filters.pvz;
    setPvzDraft(filters.pvz);
  }, [filters.pvz]);

  const activeCount = Object.values(filters).filter(Boolean).length;
  return { filters, pvzDraft, setPvzDraft, change, clear, activeCount };
}
