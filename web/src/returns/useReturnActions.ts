import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { ApiError } from '../api/client';
import { downloadReturnTtn, listReturns, markReturn, markReturns, type MarkPatch, type ReturnRow } from '../api/returns';
import { PAGE_SIZE, subPatch } from './returnsModel';

export type ScanResult = { kind: 'success' | 'warning' | 'error'; text: string; notFoundCode?: string } | null;
type Options = {
  setItems: Dispatch<SetStateAction<ReturnRow[]>>;
  savingNow: RefObject<boolean>; refreshQuietly: () => void;
  setScanResult: Dispatch<SetStateAction<ScanResult>>;
  setHighlighted: Dispatch<SetStateAction<string | null>>;
  setReviewNotice: Dispatch<SetStateAction<string>>;
};
export function useReturnActions({ setItems, savingNow, refreshQuietly, setScanResult, setHighlighted, setReviewNotice }: Options) {
  const [saving, setSaving] = useState<string[]>([]);
  const [markError, setMarkError] = useState('');
  const [ttnError, setTtnError] = useState('');
  const [ttnBusy, setTtnBusy] = useState<string[]>([]);
  /** «Скачать ТТН»: файл отдаёт Studio2 потоком (прямой ссылки нет), поэтому качаем запросом с сессией и сохраняем сами,
   *  чтобы показать понятную ошибку, если файл недоступен. */
  const downloadTtn = async (row: ReturnRow) => {
    if (!row.key || ttnBusy.includes(row.key)) return;
    setTtnError(''); setTtnBusy(keys => [...keys, row.key!]);
    try {
      const file = await downloadReturnTtn(row.key).catch((error: unknown) => {
        if (!(error instanceof ApiError)) throw error;
        throw new Error(error.status === 0 ? error.message
          : error.status === 404 ? 'ТТН не найдена: возможно, позиция уже изменилась. Обновите список.'
          : error.status === 401 ? 'Сессия закончилась. Войдите заново.' : 'Файл ТТН сейчас недоступен. Попробуйте позже.');
      });
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url; link.download = row.decision?.ttn?.name || 'ТТН';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setTtnError(err instanceof TypeError ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.' : err instanceof Error ? err.message : 'Не удалось скачать ТТН.');
    } finally { setTtnBusy(keys => keys.filter(key => key !== row.key)); }
  };
  /** Отметка приёмки: сервер возвращает итоговое состояние, им и заменяем строку (без угадывания на клиенте). */
  const mark = async (row: ReturnRow, patch: MarkPatch, operationId: string = crypto.randomUUID()) => {
    if (!row.key || saving.includes(row.key)) return false;
    // свёрнутая строка — это несколько записей: отметка пишется на каждую штуку
    const keys = row.units?.length ? row.units.map(unit => unit.key!) : [row.key];
    savingNow.current = true;
    setMarkError(''); setSaving(keys => [...keys, row.key!]);
    try {
      const { results } = await markReturns(keys, patch, operationId);
      const changes = new Map(results.filter(result => result.ok && result.changes).map(result => [result.key, result.changes!]));
      const failures = results.filter(result => !result.ok);
      setItems(previous => previous.map(item =>
        row.unitOf ? (item.key === row.unitOf ? { ...item, units: item.units?.map(unit => changes.get(unit.key || '') ? { ...unit, ...changes.get(unit.key || '') } : unit) } : item)
          : item.key === row.key ? {
            ...item, ...(changes.get(row.key || '') || {}),
            units: item.units?.map(unit => changes.get(unit.key || '') ? { ...unit, ...changes.get(unit.key || '') } : unit)
          } : item));
      if (failures.length) setMarkError(`Не сохранено: ${failures.map(result => result.key).join(', ')}.`);
      if (results.some(result => result.ok && result.changes?.review_submitted)) setReviewNotice('Возврат отправлен на рассмотрение');
      else if (!failures.length && patch.status === 'accepted' && row.mark !== 'accepted' && results.length && results.every(result => result.ok && result.changes?.mark === 'accepted')) setReviewNotice('Возврат принят');
      // отметка одной штуки могла разделить строку: как их показывать, решает сервер
      if (row.unitOf || failures.length) refreshQuietly();
      return failures.length === 0;
    } catch (err) {
      // 404/409: возврат уже закрыт сотрудниками, изменился или по нему принято решение — список устарел
      const stale = err instanceof ApiError && (err.status === 404 || err.status === 409);
      setMarkError(stale
        ? (err.status === 409 ? err.message : 'Возврат уже изменился или закрыт сотрудниками. Список обновлён, проверьте статус.')
        : err instanceof Error ? err.message : 'Не удалось сохранить отметку.');
      if (stale || keys.length > 1) refreshQuietly();   // часть штук могла сохраниться
      return false;
    } finally { savingNow.current = false; setSaving(keys => keys.filter(key => key !== row.key)); }
  };
  /** true — позиция принята (или уже была принята); false — ничего не принято, поиск остаётся в поле. */
  const processScan = async (code: string): Promise<boolean> => {
    setScanResult(null); setReviewNotice(''); setHighlighted(null);
    try {
      const result = await listReturns('received', { page: 1, pageSize: PAGE_SIZE, filters: { search: code, exact: 'true' } });
      if (!result.exact_search) { setScanResult({ kind: 'warning', text: 'Точный поиск недоступен. Проверьте возврат вручную.' }); return false; }
      if (result.partial) { setScanResult({ kind: 'warning', text: 'Данные обновлены не полностью. Проверьте возврат вручную.' }); return false; }
      if (result.total !== 1 || result.items.length !== 1 || !result.items[0].key) {
        setScanResult(result.total ? { kind: 'warning', text: `Код ${code}: найдено несколько позиций. Выберите нужную вручную.` } : { kind: 'warning', text: `Код ${code}: возврат не найден.`, notFoundCode: code });
        return false;
      }
      const row = result.items[0];
      const title = row.name || row.posting_number || code;
      setHighlighted(row.key!);
      if (row.mark === 'accepted') { setReviewNotice('Возврат уже принят'); setScanResult({ kind: 'success', text: `Уже принят: ${title}` }); return true; }
      const saved = await markReturn(row.key!, subPatch('ok'));
      if (saved.mark !== 'accepted') throw new Error('Сервер не подтвердил приёмку возврата.');
      setReviewNotice(saved.review_submitted ? 'Возврат отправлен на рассмотрение' : 'Возврат принят');
      setScanResult({ kind: 'success', text: `Принят: ${title}` });
      refreshQuietly();
      return true;
    } catch (err) {
      setScanResult({ kind: 'error', text: err instanceof Error ? err.message : 'Не удалось обработать сканирование.' });
      return false;
    }
  };
  return { ttnError, ttnBusy, downloadTtn, saving, markError, mark, processScan };
}
