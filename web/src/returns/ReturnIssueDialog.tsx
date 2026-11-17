import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { deleteReturnPhoto, listReturnPhotos, returnPhotoUrl, uploadReturnPhoto } from '../api/returns';
import { Button } from '../ui/Button';
import { Informer } from '../ui/Informer';
import { Overlay } from '../ui/Overlay';

interface Photo { key: string; id: string }
/** Выбранный файл получает id один раз: все повторы сохранения шлют его под тем же id, сервер не плодит дубли. */
interface PendingFile { file: File; id: string; url: string }
interface Props {
  title: string; keys: string[]; initialComment: string; onClose: () => void;
  /** operationId стабилен для повторов одной и той же отметки: родитель обязан передать его в markReturns. */
  onSave: (comment: string, operationId: string) => Promise<boolean>;
}
/** Studio2 принимает id вида ^[0-9a-f]{32}\.(jpg|png)$, расширение должно совпадать с реальным типом файла. */
const newPhotoId = (file: File) => `${crypto.randomUUID().replace(/-/g, '')}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
const stored = (photo: Photo) => `${photo.key}\n${photo.id}`;
const isUncertain = (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status >= 500);

export function ReturnIssueDialog({ title, keys, initialComment, onClose, onSave }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState(initialComment);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [removed, setRemoved] = useState<Photo[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Состояние незавершённого сохранения живёт в ref: повтор в том же окне не повторяет то, что уже выполнено.
  const mark = useRef<{ comment: string; operationId: string; done: boolean } | null>(null);
  const uploaded = useRef(new Set<string>());
  const deleted = useRef(new Set<string>());
  /** Адреса предпросмотра выбранных файлов: освобождаем при удалении и при закрытии окна. */
  const previewUrls = useRef(new Set<string>());
  const keyList = JSON.stringify(keys);
  useEffect(() => () => { previewUrls.current.forEach(url => URL.revokeObjectURL(url)); previewUrls.current.clear(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const all = await Promise.all((JSON.parse(keyList) as string[]).map(async key => {
          const items = await listReturnPhotos(key, controller.signal);
          return items.map(item => ({ key, id: item.id }));
        }));
        setPhotos(all.flat());
      } catch { if (!controller.signal.aborted) setError('Не удалось загрузить фотографии. Закройте окно и попробуйте снова.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [keyList]);

  const dropPending = (item: PendingFile) => {
    setPending(items => items.filter(x => x !== item));
    URL.revokeObjectURL(item.url); previewUrls.current.delete(item.url);
    // Уже загруженные в прошлой попытке копии нужно удалить: иначе на сервере останется фото, которое пользователь убрал.
    const orphans = keys.map(key => ({ key, id: item.id })).filter(photo => uploaded.current.has(stored(photo)));
    orphans.forEach(photo => uploaded.current.delete(stored(photo)));
    if (orphans.length) setRemoved(items => [...items, ...orphans]);
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      // Новый текст — новая отметка (другое тело нельзя слать под прежним operationId); тот же текст — повтор с тем же id.
      if (mark.current?.comment !== comment) mark.current = { comment, operationId: crypto.randomUUID(), done: false };
      const current = mark.current;
      if (!current.done) {
        let saved = false;
        try { saved = await onSave(comment, current.operationId); } catch { saved = false; }
        if (!saved) { setError('Не удалось сохранить отметку.'); return; }
        current.done = true;
      }
      // Каждая штука группы получает собственную копию под тем же id: при разделении строки фото не теряются.
      const wanted = pending.flatMap(item => keys.map(key => ({ photo: { key, id: item.id }, file: item.file })));
      let failed = 0, uncertain = false;
      for (const { photo, file } of wanted) {
        if (uploaded.current.has(stored(photo))) continue;
        try { await uploadReturnPhoto(photo.key, file, photo.id); uploaded.current.add(stored(photo)); }
        catch (e) { failed++; uncertain ||= isUncertain(e); }
      }
      let notRemoved = 0;
      for (const photo of removed) {
        if (deleted.current.has(stored(photo))) continue;
        try { await deleteReturnPhoto(photo.key, photo.id); deleted.current.add(stored(photo)); }
        catch (e) { notRemoved++; uncertain ||= isUncertain(e); }
      }
      if (!failed && !notRemoved) { onClose(); return; }
      const done = wanted.length - failed;
      setError(`Отметка сохранена, но фотографии загружены не полностью${failed ? ` (${done} из ${wanted.length})` : ''}${notRemoved ? `, не удалено: ${notRemoved}` : ''}. `
        + (uncertain ? 'Связь с сервером прервалась, часть данных могла сохраниться. ' : '')
        + 'Нажмите «Сохранить», чтобы повторить: уже сохранённое повторно не отправляется.');
    } finally { setBusy(false); }
  };
  return <Overlay kind="dialog" title={title} width={560} busy={busy} onClose={onClose}
    footer={<><Button loading={busy} disabled={loading || !!error && error.startsWith('Не удалось загрузить')} onClick={save}>Сохранить</Button><Button variant="action-secondary" disabled={busy} onClick={onClose}>Отмена</Button></>}>
    {error && <Informer kind="error">{error}</Informer>}
    <label className="po-textarea__label po-textarea__labelOutside ozi-body-500" htmlFor="return-issue-comment">Комментарий</label>
    <div className="po-textarea__root po-textarea__size-500"><div className="po-textarea__container">
      <textarea id="return-issue-comment" className="po-textarea__textarea ozi-body-500" rows={4} maxLength={500} value={comment} onChange={e => setComment(e.target.value)} />
    </div></div>
    <div className="pa-return-photos">
      <label htmlFor="return-issue-photos">Фотографии возврата</label>
      <p className="pa-sub">JPEG или PNG, до 10 МБ на фото.</p>
      {loading && <p>Загружаем фотографии…</p>}
      {(photos.length > 0 || pending.length > 0) && <div className="pa-return-photos__grid">{photos.map(photo => <div key={`${photo.key}:${photo.id}`} className="pa-return-photos__item">
        {keys.length > 1 && <span className="pa-sub">Штука {keys.indexOf(photo.key) + 1}</span>}
        <a href={returnPhotoUrl(photo.key, photo.id)} target="_blank" rel="noreferrer"><img src={returnPhotoUrl(photo.key, photo.id)} alt="Фото возврата" /></a>
        <Button variant="action-secondary" size={400} disabled={busy} onClick={() => { setPhotos(items => items.filter(x => x !== photo)); setRemoved(items => [...items, photo]); }}>Удалить</Button>
      </div>)}{pending.map(item => <div key={item.url} className="pa-return-photos__item">
        <img src={item.url} alt={`Выбранное фото: ${item.file.name}`} />
        <span className="pa-return-photos__name" title={item.file.name}>{item.file.name}</span>
        <Button variant="action-secondary" size={400} disabled={busy} onClick={() => dropPending(item)}>Удалить</Button>
      </div>)}</div>}
      <div className="pa-return-photos__add"><Button variant="action-secondary" size={400} disabled={busy || loading} onClick={() => uploadRef.current?.click()}>Добавить фото</Button></div>
      <input ref={uploadRef} className="pa-visually-hidden" id="return-issue-photos" type="file" accept="image/jpeg,image/png" multiple disabled={busy || loading} onChange={e => {
        const selected = Array.from(e.target.files || []); e.target.value = '';
        if (selected.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size)) { setError('Выберите фотографии JPEG или PNG размером до 10 МБ.'); return; }
        setError(''); setPending(items => [...items, ...selected.map(file => {
          const url = URL.createObjectURL(file); previewUrls.current.add(url);
          return { file, id: newPhotoId(file), url };
        })]);
      }} />
    </div>
  </Overlay>;
}
