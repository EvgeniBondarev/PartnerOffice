import { useEffect, useRef, useState } from 'react';
import { apiUrl, API_BASE_URL } from '../config';
import { Button } from '../ui/Button';
import { Informer } from '../ui/Informer';
import { Overlay } from '../ui/Overlay';

interface Photo { key: string; id: string }
interface Props { title: string; keys: string[]; initialComment: string; onClose: () => void; onSave: (comment: string) => Promise<boolean> }
const credentials: RequestCredentials = API_BASE_URL ? 'include' : 'same-origin';
const photoPath = (key: string, id = '') => apiUrl(`/partner-api/returns/photos${id ? `/${encodeURIComponent(id)}` : ''}?key=${encodeURIComponent(key)}`);

export function ReturnIssueDialog({ title, keys, initialComment, onClose, onSave }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState(initialComment);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [removed, setRemoved] = useState<Photo[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [error, setError] = useState('');
  const keyList = JSON.stringify(keys);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const all = await Promise.all((JSON.parse(keyList) as string[]).map(async key => {
          const response = await fetch(photoPath(key), { credentials, signal: controller.signal });
          if (!response.ok) throw new Error();
          const items: { id: string }[] = await response.json();
          return items.map(item => ({ key, id: item.id }));
        }));
        setPhotos(all.flat());
      } catch { if (!controller.signal.aborted) setError('Не удалось загрузить фотографии. Закройте окно и попробуйте снова.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [keyList]);

  const save = async () => {
    setBusy(true); setError('');
    let markSaved = false;
    try {
      if (!(await onSave(comment))) throw new Error('Не удалось сохранить отметку.');
      markSaved = true;
      // Каждая штука группы получает собственную копию: при разделении строки фото не теряются.
      for (const file of pending) {
        for (const key of keys) {
          const form = new FormData(); form.append('file', file);
          const response = await fetch(photoPath(key), { method: 'POST', credentials, body: form });
          if (!response.ok) { setReopen(true); throw new Error('Отметка сохранена, но не все фотографии загружены. Откройте окно снова и проверьте их.'); }
        }
      }
      for (const photo of removed) {
        const response = await fetch(photoPath(photo.key, photo.id), { method: 'DELETE', credentials });
        if (!response.ok) { setReopen(true); throw new Error('Отметка сохранена, но не все фотографии удалены. Откройте окно снова и проверьте их.'); }
      }
      onClose();
    } catch (e) {
      if (markSaved) { setReopen(true); setError('Отметка сохранена, но фотографии могли сохраниться не полностью. Откройте окно снова и проверьте их.'); }
      else setError(e instanceof Error ? e.message : 'Не удалось сохранить данные.');
    }
    finally { setBusy(false); }
  };
  return <Overlay kind="dialog" title={title} width={560} busy={busy} onClose={onClose}
    footer={<><Button loading={busy} disabled={loading || reopen || !!error && error.startsWith('Не удалось загрузить')} onClick={save}>Сохранить</Button><Button variant="action-secondary" disabled={busy} onClick={onClose}>Отмена</Button></>}>
    {error && <Informer kind="error">{error}</Informer>}
    <label className="po-textarea__label po-textarea__labelOutside ozi-body-500" htmlFor="return-issue-comment">Комментарий</label>
    <div className="po-textarea__root po-textarea__size-500"><div className="po-textarea__container">
      <textarea id="return-issue-comment" className="po-textarea__textarea ozi-body-500" rows={4} maxLength={500} value={comment} onChange={e => setComment(e.target.value)} />
    </div></div>
    <div className="pa-return-photos">
      <label htmlFor="return-issue-photos">Фотографии возврата</label>
      <p className="pa-sub">JPEG или PNG, до 10 МБ на фото.</p>
      {loading && <p>Загружаем фотографии…</p>}
      <div className="pa-return-photos__grid">{photos.map(photo => <div key={`${photo.key}:${photo.id}`} className="pa-return-photos__item">
        {keys.length > 1 && <span className="pa-sub">Штука {keys.indexOf(photo.key) + 1}</span>}
        <a href={photoPath(photo.key, photo.id)} target="_blank" rel="noreferrer"><img src={photoPath(photo.key, photo.id)} alt="Фото возврата" /></a>
        <Button variant="action-secondary" size={400} disabled={busy} onClick={() => { setPhotos(items => items.filter(x => x !== photo)); setRemoved(items => [...items, photo]); }}>Удалить</Button>
      </div>)}</div>
      {pending.map((file, index) => <div key={`${file.name}-${index}`}>{file.name} <Button variant="action-secondary" size={400} disabled={busy} onClick={() => setPending(items => items.filter((_, i) => i !== index))}>Удалить</Button></div>)}
      <Button variant="action-secondary" size={400} disabled={busy || loading} onClick={() => uploadRef.current?.click()}>Добавить фото</Button>
      <input ref={uploadRef} className="pa-visually-hidden" id="return-issue-photos" type="file" accept="image/jpeg,image/png" multiple disabled={busy || loading} onChange={e => {
        const selected = Array.from(e.target.files || []); e.target.value = '';
        if (selected.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size)) { setError('Выберите фотографии JPEG или PNG размером до 10 МБ.'); return; }
        setError(''); setPending(items => [...items, ...selected]);
      }} />
    </div>
  </Overlay>;
}
