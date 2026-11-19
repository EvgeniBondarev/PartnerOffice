import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { request, requestFile } from '../api/client';
import { Button } from '../ui/Button';
import { useModal } from '../ui/Overlay';

type Giveout = { enabled: boolean; image?: string; barcode?: string };
const path = (id: number) => `/partner-api/giveout/${id}`;
export function useGiveouts(ids: number[]) {
  const [items, setItems] = useState<Record<number, Giveout | null>>({});
  const idsKey = [...new Set(ids)].sort((a, b) => a - b).join(',');
  useEffect(() => {
    const controller = new AbortController();
    for (const id of idsKey.split(',').filter(Boolean).map(Number)) {
      request<Giveout>(path(id), { signal: controller.signal }).then(value => setItems(old => ({ ...old, [id]: value })))
        .catch(() => { if (!controller.signal.aborted) setItems(old => ({ ...old, [id]: null })); });
    }
    return () => controller.abort();
  }, [idsKey]);
  const reload = async (id: number) => {
    const value = await request<Giveout>(path(id));
    setItems(old => ({ ...old, [id]: value }));
  };
  return { items, reload };
}
export function GiveoutThumbnail({ data, onClick }: { data: Giveout | null | undefined; onClick: () => void }) {
  if (data === undefined) return <span className="pa-sub">Загрузка…</span>;
  if (!data?.enabled || !data.image) return <span className="pa-sub">Недоступен</span>;
  return <button type="button" className="pa-giveout-thumb" onClick={onClick} aria-label="Открыть штрихкод получения возвратов"><img src={`data:image/png;base64,${data.image}`} alt="" /></button>;
}
export function GiveoutDialog({ id, name, data, canWork, reload, onClose }: { id: number; name: string; data: Giveout; canWork: boolean; reload: (id: number) => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useModal(onClose, busy);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  };
  const pdf = () => run(async () => {
    const { blob } = await requestFile(`${path(id)}/pdf`);
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'ozon-return-barcode.pdf'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  const print = () => {
    if (!data.image) return;
    const popup = window.open('', '_blank');
    if (!popup) { setError('Браузер заблокировал окно печати. Разрешите всплывающие окна или скачайте PDF.'); return; }
    popup.document.title = 'Штрихкод получения возвратов Ozon';
    const img = popup.document.createElement('img');
    img.alt = 'Штрихкод получения возвратов Ozon';
    img.style.maxWidth = '100%';
    img.onload = () => { popup.focus(); popup.print(); };
    img.src = `data:image/png;base64,${data.image}`;
    popup.document.body.appendChild(img);
  };
  const share = () => run(async () => {
    const { url } = await request<{ url: string }>(`${path(id)}/share`, { method: 'POST' });
    if (navigator.share) {
      try { await navigator.share({ title: 'Получение возвратов Ozon', text: 'Штрихкод для получения возвратов Ozon', url }); return; }
      catch (e) { if (e instanceof Error && e.name === 'AbortError') return; }
    }
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(url); setNotice('Ссылка скопирована. Она действует 12 часов.'); return; } catch { /* Показываем ссылку для ручного копирования. */ }
    }
    setNotice(`Скопируйте ссылку: ${url}`);
  });
  const reset = () => run(async () => {
    try { await request(`${path(id)}/reset`, { method: 'POST' }); await reload(id); }
    catch { try { await reload(id); } catch { onClose(); } throw new Error('Не удалось подтвердить выпуск нового кода. Проверьте актуальный штрихкод перед получением.'); }
    setConfirm(false); setNotice('Новый штрихкод получен. Старые ссылки больше не действуют.');
  });
  return createPortal(<><div className="po-backdrop__backdrop" onMouseDown={() => !busy && onClose()} aria-hidden="true" />
    <div className="po-window__root pa-overlay__root" onMouseDown={e => !busy && e.target === e.currentTarget && onClose()}>
      <div className="po-window__window po-dialog__dialog po-dialog__size-500 pa-giveout-dialog" role="dialog" aria-modal="true" aria-label="Штрихкод получения возвратов" ref={ref} tabIndex={-1}>
        <h2>Получение возвратов</h2><p>{name}</p>
        {data.image && <img className="pa-giveout-image" src={`data:image/png;base64,${data.image}`} alt="Штрихкод для получения возвратов Ozon" />}
        {data.barcode && <p className="pa-giveout-code">{data.barcode}</p>}
        <p>Покажите штрихкод сотруднику пункта выдачи. Он относится ко всем возвратам кабинета Ozon.</p>
        {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        {confirm && <p role="alert">Старый штрихкод и ссылки перестанут действовать. <button type="button" disabled={busy} onClick={reset}>Подтвердить выпуск</button> <button type="button" onClick={() => setConfirm(false)}>Отмена</button></p>}
        <div className="pa-giveout-actions"><Button variant="secondary" size={400} disabled={busy} onClick={pdf}>Скачать PDF</Button>
          <Button variant="secondary" size={400} disabled={busy || !data.image} onClick={print}>Печать</Button>
          {canWork && <><Button variant="secondary" size={400} disabled={busy} onClick={share}>Поделиться</Button><Button variant="secondary" size={400} disabled={busy} onClick={() => setConfirm(true)}>Выпустить новый</Button></>}
          <Button variant="secondary" size={400} disabled={busy} onClick={onClose}>Закрыть</Button></div>
      </div></div></>, document.body);
}
