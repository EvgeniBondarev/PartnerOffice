import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReturnIssueDialog } from '../returns/ReturnIssueDialog';
import dialogSource from '../returns/ReturnIssueDialog.tsx?raw';
import apiSource from '../api/returns.ts?raw';
import { json, mockApi, type Call } from './helpers';

/**
 * The dialog runs through the real API module over a stubbed transport (`fetch`), so the tests see what goes on the
 * wire. `put`/`del` are outcome plans consumed one request at a time ('ok' when the plan is exhausted).
 */
type Outcome = 'ok' | 'network' | 500 | 409;
interface Plan { put?: Outcome[]; del?: Outcome[]; photos?: { id: string }[] }
function server(plan: Plan = {}) {
  const outcome = (queue: Outcome[] | undefined, okBody: unknown) => {
    const next = queue?.shift() ?? 'ok';
    if (next === 'network') throw new TypeError('Failed to fetch');
    return next === 'ok' ? json(okBody) : json({ error: 'Сбой' }, next);
  };
  return mockApi({
    '/partner-api/returns/photos?*': () => json(plan.photos ?? []),
    'PUT /partner-api/returns/photos/*': (_init, url) => outcome(plan.put, { id: ref(url!).id, created: true }),
    'DELETE /partner-api/returns/photos/*': () => outcome(plan.del, null)
  });
}
const ref = (url: string) => {
  const parsed = new URL(url, 'https://example.test');
  return { key: parsed.searchParams.get('key')!, id: decodeURIComponent(parsed.pathname.split('/').pop()!) };
};
const sent = (calls: Call[], method: 'PUT' | 'DELETE') => calls.filter(call => call.method === method).map(call => ref(call.url));

const jpeg = (name: string) => new File(['image'], name, { type: 'image/jpeg' });
type User = ReturnType<typeof userEvent.setup>;
function open(keys: string[], onSave = vi.fn(async (_comment: string, _operationId: string) => true), onClose = vi.fn()) {
  render(<ReturnIssueDialog title="Брак" keys={keys} initialComment="" onClose={onClose} onSave={onSave} />);
  return { onSave, onClose, user: userEvent.setup() };
}
const addPhotos = async (user: User, ...files: File[]) => {
  await waitFor(() => expect(screen.getByLabelText('Фотографии возврата')).not.toBeDisabled());
  await user.upload(screen.getByLabelText('Фотографии возврата'), files);
};
const save = (user: User) => user.click(screen.getByRole('button', { name: 'Сохранить' }));
const partial = () => screen.findByText(/Отметка сохранена, но фотографии загружены не полностью/);

describe('ReturnIssueDialog idempotent save', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('uploads each selected file under one generated id and uses it for every key of a group', async () => {
    const calls = server();
    const { user, onClose } = open(['fbs:1', 'fbs:2']);
    await addPhotos(user, jpeg('a.jpg'));
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const puts = sent(calls, 'PUT');
    expect(puts.map(item => item.key)).toEqual(['fbs:1', 'fbs:2']);
    expect(puts[0].id).toBeTruthy();
    expect(puts[1].id).toBe(puts[0].id);
    expect(calls.some(call => call.method === 'POST')).toBe(false);
    expect((calls.find(call => call.method === 'PUT')!.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('photo ids match Studio2 format: 32 hex + extension from the real file type', async () => {
    const calls = server();
    const { user, onClose } = open(['fbs:1']);
    await addPhotos(user, jpeg('a.jpg'), new File(['image'], 'b.png', { type: 'image/png' }));
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const ids = sent(calls, 'PUT').map(item => item.id);
    expect(ids[0]).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(ids[1]).toMatch(/^[0-9a-f]{32}\.png$/);
  });

  it('generates different ids for different files', async () => {
    const calls = server();
    const { user, onClose } = open(['fbs:1']);
    await addPhotos(user, jpeg('a.jpg'), jpeg('b.jpg'));
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(new Set(sent(calls, 'PUT').map(item => item.id)).size).toBe(2);
  });

  it('retries in the same dialog with the same photo ids and mark operation id, skipping finished uploads', async () => {
    // fbs:1 is stored in the first attempt, fbs:2 fails on the network
    const calls = server({ put: ['ok', 'network'] });
    const { user, onClose, onSave } = open(['fbs:1', 'fbs:2']);
    await addPhotos(user, jpeg('a.jpg'));
    await save(user);
    expect(await partial()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).not.toBeDisabled();

    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const puts = sent(calls, 'PUT');
    expect(puts.map(item => item.key)).toEqual(['fbs:1', 'fbs:2', 'fbs:2']);
    expect(new Set(puts.map(item => item.id)).size).toBe(1);
    // the mark succeeded in the first attempt, so it is neither repeated nor re-keyed
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toBeTruthy();
  });

  it('keeps ids across repeated failures of the same upload', async () => {
    const calls = server({ put: [500, 'network', 409] });
    const { user, onClose } = open(['fbs:1']);
    await addPhotos(user, jpeg('a.jpg'));
    await save(user); await partial();
    await save(user); await partial();
    await save(user); await partial();
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const puts = sent(calls, 'PUT');
    expect(puts).toHaveLength(4);
    expect(new Set(puts.map(item => item.id)).size).toBe(1);
  });

  it('tells an uncertain network/5xx failure from a definite rejection', async () => {
    server({ put: ['network'] });
    const first = open(['fbs:1']);
    await addPhotos(first.user, jpeg('a.jpg'));
    await save(first.user);
    expect(await screen.findByText(/часть данных могла сохраниться/)).toBeInTheDocument();
    cleanup();

    server({ put: [409] });
    const second = open(['fbs:1']);
    await addPhotos(second.user, jpeg('a.jpg'));
    await save(second.user);
    await partial();
    expect(screen.queryByText(/часть данных могла сохраниться/)).not.toBeInTheDocument();
  });

  it('does not upload when the mark is not saved and resends the same operation id on retry', async () => {
    const calls = server();
    const onSave = vi.fn(async (_c: string, _o: string) => false);
    const { user, onClose } = open(['fbs:1'], onSave);
    await addPhotos(user, jpeg('a.jpg'));
    await save(user);
    expect(await screen.findByText('Не удалось сохранить отметку.')).toBeInTheDocument();
    expect(sent(calls, 'PUT')).toHaveLength(0);
    onSave.mockResolvedValue(true);
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][1]).toBe(onSave.mock.calls[0][1]);
    expect(sent(calls, 'PUT')).toHaveLength(1);
  });

  it('treats a rejected onSave like an unsaved mark and still allows a retry', async () => {
    server();
    const onSave = vi.fn(async (_c: string, _o: string) => { throw new Error('offline'); });
    const { user, onClose } = open(['fbs:1'], onSave);
    await save(user);
    expect(await screen.findByText('Не удалось сохранить отметку.')).toBeInTheDocument();
    onSave.mockResolvedValue(true as never);
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[1][1]).toBe(onSave.mock.calls[0][1]);
  });

  it('takes a new operation id when the comment changes after a partial failure', async () => {
    server({ put: ['network'] });
    const { user, onClose, onSave } = open(['fbs:1']);
    await addPhotos(user, jpeg('b.jpg'));
    await save(user); await partial();
    await user.type(screen.getByLabelText('Комментарий'), 'Скол');
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave.mock.calls.map(call => call[0])).toEqual(['', 'Скол']);
    expect(onSave.mock.calls[1][1]).not.toBe(onSave.mock.calls[0][1]);
  });

  it('retries a failed delete without uploading again', async () => {
    const calls = server({ photos: [{ id: 'old.jpg' }], del: [500] });
    const { user, onClose } = open(['fbs:1']);
    await screen.findByAltText('Фото возврата');
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await addPhotos(user, jpeg('a.jpg'));
    await save(user);
    expect(await screen.findByText(/не удалено: 1/)).toBeInTheDocument();
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(sent(calls, 'PUT')).toHaveLength(1);
    expect(sent(calls, 'DELETE')).toEqual([{ key: 'fbs:1', id: 'old.jpg' }, { key: 'fbs:1', id: 'old.jpg' }]);
  });

  it('deletes an already stored copy when its pending file is dropped before the retry', async () => {
    const calls = server({ put: ['ok', 'network'] });
    const { user, onClose } = open(['fbs:1', 'fbs:2']);
    await addPhotos(user, jpeg('a.jpg'));
    await save(user); await partial();
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await save(user);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const puts = sent(calls, 'PUT');
    expect(puts).toHaveLength(2);
    expect(sent(calls, 'DELETE')).toEqual([{ key: 'fbs:1', id: puts[0].id }]);
  });

  it('has no direct fetch: the dialog goes through the API module', async () => {
    expect(dialogSource).not.toMatch(/\bfetch\s*\(/);
    expect(apiSource).not.toMatch(/\bfetch\s*\(/);
    expect(dialogSource).toMatch(/from '\.\.\/api\/returns'/);
    // the id belongs to the caller; the API wrapper must not invent one per call
    expect(apiSource).not.toMatch(/randomUUID/);
  });
});
