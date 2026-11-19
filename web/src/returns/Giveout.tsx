import { useEffect, useRef, useState } from 'react';
import { request, requestFile } from '../api/client';
import { Button } from '../ui/Button';
import { Informer } from '../ui/Informer';
import { Overlay } from '../ui/Overlay';

type Giveout = { enabled: boolean; image?: string; barcode?: string };
const path = (id: number) => `/partner-api/giveout/${id}`;

const COPY_ICON = <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 10c0-4.941 1.059-6 6-6s6 1.059 6 6-1.059 6-6 6-6-1.059-6-6"/><path fill="currentColor" d="M10 17c-.5 0-1 .5-1 1 0 2 3.898 2 5 2 4.941 0 6-1.059 6-6 0-1.102 0-5-2-5-.53.042-1 .5-1 1 0 5.5-1.5 7-7 7"/></svg>;
const DONE_ICON = <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.55 17.3 4.8 12.55l1.4-1.4 3.35 3.35 8.25-8.25 1.4 1.4z"/></svg>;

/** base64 → Blob без fetch: connect-src страницы data: не разрешает. */
function pngBlob(image: string): Blob | null {
  try {
    const raw = atob(image);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  } catch { return null; }
}

/** Копирует в буфер картинку штрихкода (PNG), как кнопка «Скопировать» у значений. Браузеры без записи картинок получают подсказку скачать PDF. */
export function GiveoutImageCopy({ image, onUnsupported }: { image: string; onUnsupported?: () => void }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    let next: 'done' | 'failed' = 'failed';
    const blob = pngBlob(image);
    if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard && 'write' in navigator.clipboard) {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); next = 'done'; } catch { /* браузер не дал записать картинку */ }
    }
    if (next === 'failed') onUnsupported?.();
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  };
  const title = state === 'done' ? 'Картинка скопирована' : state === 'failed' ? 'Браузер не копирует картинки — скачайте PDF' : 'Скопировать картинку';
  return <button type="button" className={`pa-copy-value__button pa-giveout-copy${state === 'done' ? ' pa-giveout-copy--done' : ''}`}
    onClick={copy} onKeyDown={e => e.stopPropagation()} aria-label={state === 'done' ? 'Картинка скопирована' : 'Скопировать картинку штрихкода'} title={title}>
    {state === 'done' ? DONE_ICON : COPY_ICON}
  </button>;
}
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
  return <span className="pa-giveout-cell">
    <button type="button" className="pa-giveout-thumb" onClick={onClick} title="Открыть штрихкод" aria-label="Открыть штрихкод получения возвратов"><img src={`data:image/png;base64,${data.image}`} alt="" /></button>
    {data.barcode && <span className="pa-giveout-cell__code">{data.barcode}<GiveoutImageCopy image={data.image} /></span>}
  </span>;
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
    {data.barcode && <p className="pa-giveout-code">{data.barcode}{data.image && <GiveoutImageCopy image={data.image} onUnsupported={() => setError('Браузер не позволяет копировать картинки. Скачайте PDF или сфотографируйте экран.')} />}</p>}
    <p className="pa-sub">Покажите штрихкод сотруднику пункта выдачи. Он относится ко всем возвратам кабинета Ozon.</p>
    {error && <Informer kind="error">{error}</Informer>}
    {notice && <Informer kind="success">{notice}</Informer>}
    {confirm && <Informer kind="warning" size={400} title="Выпустить новый штрихкод?" action={<div className="pa-giveout-confirm-actions">
      <Button size={400} disabled={busy} onClick={reset}>Подтвердить выпуск</Button>
      <Button variant="secondary" size={400} disabled={busy} onClick={() => setConfirm(false)}>Отмена</Button>
    </div>}>Старый штрихкод и ссылки перестанут действовать.</Informer>}
  </Overlay>;
}
