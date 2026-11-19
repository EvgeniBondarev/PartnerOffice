import { useEffect, useState } from 'react';
import { request, requestFile } from '../api/client';
import { Button } from '../ui/Button';
import { Informer } from '../ui/Informer';
import { Overlay } from '../ui/Overlay';

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
  return <button type="button" className="pa-giveout-thumb" onClick={onClick} title="Открыть штрихкод" aria-label="Открыть штрихкод получения возвратов"><img src={`data:image/png;base64,${data.image}`} alt="" /></button>;
}
export function GiveoutDialog({ id, name, data, canWork, reload, onClose }: { id: number; name: string; data: Giveout; canWork: boolean; reload: (id: number) => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
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
    popup.document.body.style.cssText = 'margin:0;display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px;font-family:sans-serif';
    const img = popup.document.createElement('img');
    img.alt = 'Штрихкод получения возвратов Ozon';
    img.style.maxWidth = '100%';
    img.onload = () => { popup.focus(); popup.print(); };
    img.src = `data:image/png;base64,${data.image}`;
    popup.document.body.appendChild(img);
    if (data.barcode) {
      const code = popup.document.createElement('p');
      code.style.cssText = 'margin:0;font-size:18px;font-weight:700;letter-spacing:.08em';
      code.textContent = data.barcode;
      popup.document.body.appendChild(code);
    }
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
  return <Overlay kind="dialog" title="Получение возвратов" width={480} busy={busy} onClose={onClose}
    footer={<>
      <Button size={400} disabled={busy || !data.image} onClick={print}>Печать</Button>
      <Button variant="action-secondary" size={400} disabled={busy} onClick={pdf}>Скачать PDF</Button>
      {canWork && <Button variant="action-secondary" size={400} disabled={busy} onClick={share}>Поделиться</Button>}
      {canWork && !confirm && <Button variant="secondary" size={400} disabled={busy} onClick={() => setConfirm(true)}>Выпустить новый</Button>}
    </>}>
    <span className="pa-sub pa-giveout-cabinet">{name}</span>
    {data.image && <div className="pa-giveout-image-box"><img className="pa-giveout-image" src={`data:image/png;base64,${data.image}`} alt="Штрихкод для получения возвратов Ozon" /></div>}
    {data.barcode && <p className="pa-giveout-code">{data.barcode}</p>}
    <p className="pa-sub">Покажите штрихкод сотруднику пункта выдачи. Он относится ко всем возвратам кабинета Ozon.</p>
    {error && <Informer kind="error">{error}</Informer>}
    {notice && <Informer kind="success">{notice}</Informer>}
    {confirm && <Informer kind="warning" size={400} title="Выпустить новый штрихкод?" action={<div className="pa-giveout-confirm-actions">
      <Button size={400} disabled={busy} onClick={reset}>Подтвердить выпуск</Button>
      <Button variant="secondary" size={400} disabled={busy} onClick={() => setConfirm(false)}>Отмена</Button>
    </div>}>Старый штрихкод и ссылки перестанут действовать.</Informer>}
  </Overlay>;
}
