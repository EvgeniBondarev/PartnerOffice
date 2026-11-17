import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { request, setUnauthorizedHandler } from '../api/client';
import { deleteReturnPhoto, downloadReturnTtn, getReturnCounts, getReturnChanges, listReturnPhotos, listReturns, markReturn, markReturns, returnEventsUrl, returnPhotoUrl, uploadReturnPhoto } from '../api/returns';
import { apiUrl } from '../config';
import { ReturnIssueDialog } from '../returns/ReturnIssueDialog';
import { json, mockApi } from './helpers';

describe('returns API', () => {
  afterEach(() => { setUnauthorizedHandler(null); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
  it('lists supplier returns with outbound recipient, filters and pagination', async () => {
    const calls = mockApi({ '/partner-api/returns?*': () => json({ items: [], total: 0, page: 2, page_size: 25, snapshot_at: null, partial: false }) });
    const controller = new AbortController();
    const result = await listReturns('supplier', { page: 2, pageSize: 25, filters: { search: 'ii:42', supplier: 'ООО & Ко' }, signal: controller.signal });
    expect(result.page_size).toBe(25);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url, 'https://example.test');
    expect(url.pathname).toBe('/partner-api/returns');
    expect(Object.fromEntries(url.searchParams)).toEqual({ section: 'outbound', to: 'supplier', page: '2', pageSize: '25', search: 'ii:42', supplier: 'ООО & Ко' });
  });

  it('fetches aggregate counts without replacing the server keys', async () => {
    const counts = { waiting: 1, received: 2, shelf: 3, supplier: 4, us: 5 };
    const calls = mockApi({ '/partner-api/returns/counts': () => json({ counts }) });
    expect(await getReturnCounts()).toEqual({ counts });
    expect(calls.map(call => call.url)).toEqual(['/partner-api/returns/counts']);
  });

  it('requests changes with each loaded key repeated and encoded', async () => {
    const calls = mockApi({ '/partner-api/returns/changes?*': () => json({ changed: true, reset: false, upsert: [], remove: [], counts: {} }) });
    const result = await getReturnChanges('r:1', ['fbs:1', 'fbo & 2']);
    expect(result.changed).toBe(true);
    const url = new URL(calls[0].url, 'https://example.test');
    expect(url.pathname).toBe('/partner-api/returns/changes');
    expect(url.searchParams.get('since')).toBe('r:1');
    expect(url.searchParams.getAll('loaded_key')).toEqual(['fbs:1', 'fbo & 2']);
  });

  it('marks a single key with the legacy endpoint', async () => {
    const calls = mockApi({ 'POST /partner-api/returns/mark': () => json({ mark: 'accepted', defect: true }) });
    expect(await markReturn('fbs:1', { status: 'accepted', defect: true })).toEqual({ mark: 'accepted', defect: true });
    expect(calls).toEqual([{ url: '/partner-api/returns/mark', method: 'POST', body: { key: 'fbs:1', status: 'accepted', defect: true } }]);
  });

  it('batch marks with an operation id and preserves partial per-key failures', async () => {
    const results = [{ key: 'a', ok: true, changes: { mark: 'accepted' } }, { key: 'b', ok: false, error: 'Closed' }];
    const calls = mockApi({ 'POST /partner-api/returns/marks': () => json({ results }) });
    expect(await markReturns(['a', 'b'], { status: 'accepted' }, 'operation-1')).toEqual({ results });
    expect(calls).toEqual([{ url: '/partner-api/returns/marks', method: 'POST', body: { operationId: 'operation-1', keys: ['a', 'b'], status: 'accepted' } }]);
  });

  it('does not fall back to per-key legacy writes when the batch endpoint is missing', async () => {
    const calls = mockApi({
      'POST /partner-api/returns/marks': () => json({ error: 'Missing endpoint' }, 404),
      'POST /partner-api/returns/mark': () => json({ mark: 'accepted' })
    });
    await expect(markReturns(['a', 'b'], { status: 'accepted' }, 'operation-1')).rejects.toMatchObject({ status: 404 });
    expect(calls.map(call => call.url)).toEqual(['/partner-api/returns/marks']);
  });

  it('requires an explicit operation id: the client never invents one, so a retry reuses it', async () => {
    expect(markReturns.length).toBe(3);
    const calls = mockApi({ 'POST /partner-api/returns/marks': () => json({ results: [] }) });
    await markReturns(['a'], { defect: true }, 'op-stable');
    await markReturns(['a'], { defect: true }, 'op-stable');
    expect(calls.map(call => (call.body as { operationId: string }).operationId)).toEqual(['op-stable', 'op-stable']);
  });

  it('does not retry per-key marks for a batch conflict', async () => {
    const calls = mockApi({ 'POST /partner-api/returns/marks': () => json({ error: 'Conflict' }, 409) });
    await expect(markReturns(['a'], { status: 'accepted' }, 'operation-1')).rejects.toMatchObject({ status: 409, message: 'Conflict' });
    expect(calls).toHaveLength(1);
  });

  it('lists and deletes photos by encoded key and photo id', async () => {
    const calls = mockApi({
      '/partner-api/returns/photos?*': () => json([{ id: 'old.jpg' }]),
      'DELETE /partner-api/returns/photos/*': () => json(null)
    });
    expect(await listReturnPhotos('fbs:1 & 2')).toEqual([{ id: 'old.jpg' }]);
    await deleteReturnPhoto('fbs:1 & 2', 'old/a.jpg');
    expect(calls.map(call => [call.method, call.url])).toEqual([
      ['GET', '/partner-api/returns/photos?key=fbs%3A1%20%26%202'],
      ['DELETE', '/partner-api/returns/photos/old%2Fa.jpg?key=fbs%3A1%20%26%202']
    ]);
    expect(returnPhotoUrl('fbs:1 & 2', 'old/a.jpg')).toBe('/partner-api/returns/photos/old%2Fa.jpg?key=fbs%3A1%20%26%202');
  });

  it('uploads file by PUT with the client photo id as multipart without setting JSON Content-Type', async () => {
    const file = new File(['image'], 'return.jpg', { type: 'image/jpeg' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'new.jpg' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await uploadReturnPhoto('fbs:1', file, 'p-1')).toEqual({ id: 'new.jpg' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/partner-api/returns/photos/p-1?key=fbs%3A1');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers && new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(file);
  });

  it('includes session cookies on multipart uploads with a configured API base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
    vi.resetModules();
    const { uploadReturnPhoto: uploadWithBase } = await import('../api/returns');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'new.jpg' })));
    vi.stubGlobal('fetch', fetchMock);

    await uploadWithBase('fbs:1', new File(['image'], 'return.jpg', { type: 'image/jpeg' }), 'p/1');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/partner-api/returns/photos/p%2F1?key=fbs%3A1');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('reports whether the retry created the photo or hit an already stored id', async () => {
    const file = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const replies = [{ id: 'p-1', created: true }, { id: 'p-1', created: false }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(replies.shift()))));
    expect(await uploadReturnPhoto('fbs:1', file, 'p-1')).toEqual({ id: 'p-1', created: true });
    expect(await uploadReturnPhoto('fbs:1', file, 'p-1')).toEqual({ id: 'p-1', created: false });
  });

  it('preserves server errors for multipart uploads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Too large' }), { status: 413 })));
    await expect(uploadReturnPhoto('fbs:1', new File(['a'], 'a.jpg'), 'p-1')).rejects.toMatchObject({ status: 413, message: 'Too large' });
  });

  it('dispatches multipart 401 through the shared unauthorized handler', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Сессия истекла' }), { status: 401 })));
    await expect(uploadReturnPhoto('fbs:1', new File(['a'], 'a.jpg'), 'p-1')).rejects.toMatchObject({ status: 401, message: 'Сессия истекла' });
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it('does not dispatch an auth endpoint 401 to the unauthorized handler', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Неверный пароль' }), { status: 401 })));

    await expect(request('/partner-api/auth/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 401, message: 'Неверный пароль'
    });
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it('turns a multipart upload network failure into ApiError(0)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    await expect(uploadReturnPhoto('fbs:1', new File(['image'], 'return.jpg'), 'p-1')).rejects.toMatchObject({
      name: 'ApiError', status: 0, message: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
    });
  });

  it('keeps JSON content type for JSON requests but leaves FormData boundary to the browser', async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response('{}', { status: 200 });
    }));
    await request('/partner-api/returns/mark', { method: 'POST', body: JSON.stringify({ key: 'a' }) });
    const form = new FormData(); form.append('file', new File(['x'], 'a.jpg'));
    await request('/partner-api/returns/photos/p?key=a', { method: 'PUT', body: form });
    expect(new Headers(calls[0].headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(calls[1].headers).has('Content-Type')).toBe(false);
    expect(calls[1].credentials).toBe(calls[0].credentials);
  });

  it('uses the authenticated API transport for dialog photo list, upload and delete', async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (init?.method === 'PUT') return new Response(JSON.stringify({ id: 'new', created: true }));
      if (init?.method === 'DELETE') return new Response('', { status: 200 });
      return new Response(JSON.stringify([{ id: 'old.jpg' }]));
    }));
    const onClose = vi.fn();
    const onSave = vi.fn(async (_comment: string, _operationId: string) => true);
    render(createElement(ReturnIssueDialog, { title: 'Брак', keys: ['fbs:1'], initialComment: '', onClose, onSave }));
    await screen.findByAltText('Фото возврата');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.upload(screen.getByLabelText('Фотографии возврата'), new File(['image'], 'return.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const seen = requests.map(({ url, init }) => [init?.method ?? 'GET', url]);
    expect(seen[0]).toEqual(['GET', '/partner-api/returns/photos?key=fbs%3A1']);
    expect(seen[1][0]).toBe('PUT');
    expect(seen[1][1]).toMatch(/^\/partner-api\/returns\/photos\/[^/?]+\?key=fbs%3A1$/);
    expect(seen[2]).toEqual(['DELETE', '/partner-api/returns/photos/old.jpg?key=fbs%3A1']);
    expect(seen).toHaveLength(3);
    expect(requests.every(({ init }) => new Headers(init.headers).get('Accept') === 'application/json')).toBe(true);
    expect(new Headers(requests[1].init.headers).has('Content-Type')).toBe(false);
  });

  it('downloads TTN bytes through the file client with the encoded return key', async () => {
    const calls = mockApi({ '/partner-api/returns/ttn?*': () => ({ status: 200, file: new TextEncoder().encode('%PDF-1.4'), headers: { 'Content-Type': 'application/pdf' } }) });
    const result = await downloadReturnTtn('fbo:9 & 1');
    expect(calls.map(call => call.url)).toEqual(['/partner-api/returns/ttn?key=fbo%3A9%20%26%201']);
    expect(result.headers.get('Content-Type')).toBe('application/pdf');
    expect(await result.blob.text()).toBe('%PDF-1.4');
  });

  it('builds the event stream address from the API base, so pages do not own endpoint literals', () => {
    expect(returnEventsUrl()).toBe(apiUrl('/partner-api/returns/events'));
  });

  it('surfaces a missing TTN as an API error rather than an empty file', async () => {
    mockApi({ '/partner-api/returns/ttn?*': () => json({ error: 'ТТН не найдена.' }, 404) });
    await expect(downloadReturnTtn('fbo:9')).rejects.toMatchObject({ status: 404, message: 'ТТН не найдена.' });
  });
});
