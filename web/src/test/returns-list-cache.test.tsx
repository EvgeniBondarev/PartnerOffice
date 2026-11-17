import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pageSource from '../returns/ReturnsPage.tsx?raw';
import dataSource from '../returns/useReturnsData.ts?raw';
import actionsSource from '../returns/useReturnActions.ts?raw';
import { clearReturnsCache, returnsCacheSize } from '../returns/returnsCache';
import { json, mockApi, renderApp, type Call } from './helpers';

const ME = '/partner-api/auth/me';
const me = () => json({ id: 1, name: 'Партнёр', email: 'a@example.test', permissions: [4] });
const row = (id: number, extra = {}) => ({ key: `fbs:1:${id}`, return_type: 'fbs', id, client_id: '1', name: `Товар ${id}`, status: 'ReceivedBySeller', status_name: 'Получен', qty: 1, mark: 'pending', ...extra });
const page = (items: unknown[], total = items.length, extra = {}) => json({ items, total, page: 1, page_size: 50, snapshot_at: null, partial: false, revision: 'r1', ...extra });
const param = (url: string, name: string) => new URLSearchParams(url.split('?')[1]).get(name);
const listCalls = (calls: Call[]) => calls.filter(c => c.url.startsWith('/partner-api/returns?') && param(c.url, 'pageSize') === '50');
const countCalls = (calls: Call[]) => calls.filter(c => c.url.startsWith('/partner-api/returns?') && param(c.url, 'pageSize') === '1');
const sleep = (ms: number) => act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));
const gate = () => { let open: () => void = () => undefined; const promise = new Promise<void>(resolve => { open = resolve; }); return { promise, open }; };

/** 50 строк на первой порции и 51-я на второй: итого 51. */
const big = async (_init: RequestInit | undefined, url?: string) => {
  const number = Number(param(url!, 'page'));
  const items = number === 1 ? Array.from({ length: 50 }, (_, i) => row(i + 1)) : [row(51)];
  return json({ items, total: 51, page: number, page_size: 50, snapshot_at: null, partial: false, revision: 'r1' });
};
let watchers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
const stubObserver = () => {
  watchers = [];
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) { watchers.push(callback); } observe() {} disconnect() {} });
};
const loadSecondPage = async () => {
  await screen.findByText('Товар 1', {}, { timeout: 4000 });
  act(() => watchers.at(-1)!([{ isIntersecting: true }]));
  await screen.findByText('Товар 51', {}, { timeout: 4000 });
};

beforeEach(() => clearReturnsCache());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('счётчики вкладок', () => {
  it('503 от /counts не запускает ни одного тяжёлого запроса списка на счётчики', async () => {
    const calls = mockApi({ [ME]: me, '/partner-api/returns/counts': () => ({ status: 503, body: { error: 'down' } }), '/partner-api/returns?*': () => page([row(1)]) });
    renderApp('/returns/waiting');
    await screen.findByText('Товар 1', {}, { timeout: 4000 });
    await waitFor(() => expect(calls.some(c => c.url === '/partner-api/returns/counts')).toBe(true));
    await sleep(150);
    expect(countCalls(calls)).toHaveLength(0);
    expect(listCalls(calls)).toHaveLength(1);
  });

  it('404 от /counts: запросы по разделам идут только после того, как основной список завершился', async () => {
    const list = gate();
    const calls = mockApi({
      [ME]: me, '/partner-api/returns/counts': () => ({ status: 404 }),
      '/partner-api/returns?*': async (_init, url) => { if (param(url!, 'pageSize') === '50') await list.promise; return page([row(1)], 7); }
    });
    renderApp('/returns/waiting');
    await waitFor(() => expect(calls.some(c => c.url === '/partner-api/returns/counts')).toBe(true));
    await sleep(150);
    expect(listCalls(calls)).toHaveLength(1);
    expect(countCalls(calls)).toHaveLength(0);            // список ещё грузится
    await act(async () => list.open());
    await screen.findByText('Товар 1', {}, { timeout: 4000 });
    await waitFor(() => expect(countCalls(calls).length).toBe(4));
  });

  it('404 от /counts и 503 основного списка: тяжёлые запросы на счётчики не запускаются', async () => {
    const calls = mockApi({
      [ME]: me, '/partner-api/returns/counts': () => ({ status: 404 }),
      '/partner-api/returns?*': (_init, url) => param(url!, 'pageSize') === '50' ? { status: 503, body: { error: 'x' } } : page([], 3)
    });
    renderApp('/returns/waiting');
    await screen.findByText('Не удалось загрузить возвраты');
    await waitFor(() => expect(calls.some(c => c.url === '/partner-api/returns/counts')).toBe(true));
    await sleep(200);
    expect(countCalls(calls)).toHaveLength(0);
    expect(listCalls(calls)).toHaveLength(1);
  });

  it('404 от /counts и ошибка списка: запросы на счётчики уходят после успешного «Повторить», а не раньше', async () => {
    let failing = true;
    const calls = mockApi({
      [ME]: me, '/partner-api/returns/counts': () => ({ status: 404 }),
      '/partner-api/returns?*': (_init, url) => param(url!, 'pageSize') === '50' ? (failing ? { status: 503, body: { error: 'x' } } : page([row(1)])) : page([], 3)
    });
    renderApp('/returns/waiting');
    await screen.findByText('Не удалось загрузить возвраты');
    await sleep(100);
    expect(countCalls(calls)).toHaveLength(0);
    failing = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }));
    await screen.findByText('Товар 1', {}, { timeout: 4000 });
    await waitFor(() => expect(countCalls(calls)).toHaveLength(4));
  });
});

describe('кэш списка', () => {
  it('первый заход идёт в сеть: пока ответа нет, строк нет', async () => {
    const list = gate();
    mockApi({ [ME]: me, '/partner-api/returns?*': async () => { await list.promise; return page([row(1)]); } });
    renderApp('/returns/waiting');
    await waitFor(() => expect(document.querySelector('tbody tr[aria-hidden="true"]')).not.toBeNull());
    expect(screen.queryByText('Товар 1')).not.toBeInTheDocument();
    await act(async () => list.open());
    expect(await screen.findByText('Товар 1', {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it('повторный заход показывает все загруженные порции сразу, пока свежая первая ещё в пути', async () => {
    stubObserver();
    mockApi({ [ME]: me, '/partner-api/returns?*': big });
    renderApp('/returns/waiting');
    await loadSecondPage();
    cleanup();
    const second = gate();
    const calls = mockApi({ [ME]: me, '/partner-api/returns?*': async (init, url) => { await second.promise; return big(init, url); } });
    renderApp('/returns/waiting');
    expect(await screen.findByText('Товар 51', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('Товар 1')).toBeInTheDocument();
    expect(document.querySelector('tbody tr[aria-hidden="true"]')).toBeNull();
    expect(listCalls(calls).filter(c => param(c.url, 'page') === '1')).toHaveLength(1);
    await act(async () => second.open());
  });

  it('тихое обновление перечитывает только первую порцию и не заменяет строки 2+', async () => {
    stubObserver();
    let firstName = 'Товар 1';
    const calls = mockApi({
      [ME]: me,
      '/partner-api/returns?*': async (init, url) => {
        const result = await big(init, url);
        if (param(url!, 'page') === '1') (result.body as { items: { name: string }[] }).items[0].name = firstName;
        return result;
      }
    });
    renderApp('/returns/waiting');
    await loadSecondPage();
    firstName = 'Товар 1 (новый)';
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText('Товар 1 (новый)')).toBeInTheDocument();
    expect(screen.getByText('Товар 51')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(52);
    expect(listCalls(calls).filter(c => param(c.url, 'page') === '2')).toHaveLength(1);
    expect(listCalls(calls).filter(c => param(c.url, 'page') === '1')).toHaveLength(2);
  });

  it('тихое обновление заменяет первую порцию: строки, которых в ней больше нет, не остаются, порции 2+ сохраняются', async () => {
    stubObserver();
    let fresh = false;
    mockApi({
      [ME]: me,
      '/partner-api/returns?*': async (init, url) => {
        if (!fresh) return big(init, url);
        // «Товар 1» удалён: первая порция теперь 2…51, всего 50, второй порции нет
        const number = Number(param(url!, 'page'));
        return json({ items: number === 1 ? Array.from({ length: 50 }, (_, i) => row(i + 2)) : [], total: 50, page: number, page_size: 50, snapshot_at: null, partial: false, revision: 'r2' });
      }
    });
    renderApp('/returns/waiting');
    await loadSecondPage();
    fresh = true;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(screen.queryByText('Товар 1')).not.toBeInTheDocument());
    expect(screen.getByText('Найдено: 50')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(51);   // 50 строк + заголовок
    expect(screen.getAllByText('Товар 51')).toHaveLength(1);
  });

  it('порции 2+ сохраняются при тихом обновлении, когда первая порция сменилась целиком', async () => {
    stubObserver();
    let fresh = false;
    mockApi({
      [ME]: me,
      '/partner-api/returns?*': async (init, url) => {
        if (!fresh) return big(init, url);
        // 50 новых строк в первой порции; прежняя вторая порция (Товар 51) по-прежнему там, где была
        const number = Number(param(url!, 'page'));
        return json({ items: number === 1 ? Array.from({ length: 50 }, (_, i) => row(i + 101)) : [row(51)], total: 51, page: number, page_size: 50, snapshot_at: null, partial: false, revision: 'r2' });
      }
    });
    renderApp('/returns/waiting');
    await loadSecondPage();
    fresh = true;
    window.dispatchEvent(new Event('focus'));
    await screen.findByText('Товар 101');
    expect(screen.queryByText('Товар 1')).not.toBeInTheDocument();
    expect(screen.getByText('Товар 51')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(52);
  });

  it('подгруженные порции попадают в кэш: после смены вкладки и возврата они на месте', async () => {
    stubObserver();
    mockApi({ [ME]: me, '/partner-api/returns?*': big });
    renderApp('/returns/waiting');
    await loadSecondPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /Получено/ }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Получено/ })).toHaveAttribute('aria-current', 'page'));
    await user.click(screen.getByRole('link', { name: /Ждёт получения/ }));
    expect(await screen.findByText('Товар 51', {}, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe('дельта по потоку событий', () => {
  type Stream = { listeners: Record<string, () => void> };
  const streams: Stream[] = [];
  const stubStream = () => {
    streams.length = 0;
    vi.stubGlobal('EventSource', class {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; listeners: Record<string, () => void> = {};
      constructor() { streams.push(this); }
      addEventListener(name: string, listener: () => void) { this.listeners[name] = listener; }
      close() { /* nothing */ }
    });
  };
  const fire = async () => { await act(async () => { streams.at(-1)!.listeners.revision?.(); }); };
  const changesCalls = (calls: Call[]) => calls.filter(c => c.url.startsWith('/partner-api/returns/changes?'));
  const delta = (extra = {}) => json({ revision: 'r2', changed: true, reset: false, upsert: [], remove: [], counts: {}, ...extra });

  it('ревизия растёт: следующий запрос идёт с последней полученной, даже если ничего не изменилось', async () => {
    stubStream();
    const answers = [delta({ upsert: [row(1, { name: 'Товар 1 (изм.)' })] }), delta({ revision: 'r3', changed: false }), delta({ revision: 'r4', changed: false })];
    const calls = mockApi({ [ME]: me, '/partner-api/returns?*': () => page([row(1)]), '/partner-api/returns/changes?*': () => answers.shift()! });
    renderApp('/returns/waiting');
    await screen.findByText('Товар 1', {}, { timeout: 4000 });
    await waitFor(() => expect(streams.length).toBeGreaterThan(0));
    await fire();
    expect(await screen.findByText('Товар 1 (изм.)')).toBeInTheDocument();
    await fire();
    await waitFor(() => expect(changesCalls(calls)).toHaveLength(2));
    await fire();
    await waitFor(() => expect(changesCalls(calls)).toHaveLength(3));
    expect(changesCalls(calls).map(c => param(c.url, 'since'))).toEqual(['r1', 'r2', 'r3']);
    expect(streams).toHaveLength(1);                       // переподключения потока из-за новой ревизии нет
  });

  it('неизвестная строка в дельте не теряется: запускается обычное обновление и строка появляется', async () => {
    stubStream();
    let fresh = false;
    const calls = mockApi({
      [ME]: me,
      '/partner-api/returns?*': () => fresh ? page([row(99), row(1)], 2, { revision: 'r2' }) : page([row(1)]),
      '/partner-api/returns/changes?*': () => { fresh = true; return delta({ upsert: [row(99)] }); }
    });
    renderApp('/returns/waiting');
    await screen.findByText('Товар 1', {}, { timeout: 4000 });
    await waitFor(() => expect(streams.length).toBeGreaterThan(0));
    await fire();
    expect(await screen.findByText('Товар 99')).toBeInTheDocument();
    expect(listCalls(calls).filter(c => param(c.url, 'page') === '1').length).toBe(2);
    expect(screen.queryByText('Загружаем возвраты…')).not.toBeInTheDocument();
  });

  it('дельта, запрошенная для прежнего списка, не применяется после смены фильтра и не откатывает ревизию', async () => {
    stubStream();
    const slow = gate();
    let first = true;
    const calls = mockApi({
      [ME]: me,
      '/partner-api/returns?*': (_init, url) => param(url!, 'search') ? page([row(1), row(2)], 2, { revision: 'rS' }) : page([row(1)]),
      '/partner-api/returns/changes?*': async () => {
        if (!first) return delta({ revision: 'rS2', changed: false });
        first = false;
        await slow.promise;
        return delta({ revision: 'r2', upsert: [row(1, { name: 'Товар 1 (старый список)' })], counts: { waiting: 99 } });
      }
    });
    renderApp('/returns/waiting');
    await screen.findByText('Товар 1', {}, { timeout: 4000 });
    await waitFor(() => expect(streams.length).toBeGreaterThan(0));
    await fire();
    await waitFor(() => expect(changesCalls(calls)).toHaveLength(1));
    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Поиск возвратов' }), 'ab');
    await screen.findByText('Найдено: 2', {}, { timeout: 4000 });
    await act(async () => slow.open());
    await sleep(80);
    expect(screen.queryByText('Товар 1 (старый список)')).not.toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    await fire();
    await waitFor(() => expect(changesCalls(calls)).toHaveLength(2));
    expect(param(changesCalls(calls)[1].url, 'since')).toBe('rS');     // ревизия нового списка не откатилась к r2 старого
  });

  it('сброс (reset) перечитывает список с первой порции: подгруженные строки 2+ больше не показываются', async () => {
    stubObserver(); stubStream();
    let reset = false;
    mockApi({
      [ME]: me,
      '/partner-api/returns?*': async (init, url) => {
        const result = await big(init, url);
        if (reset && param(url!, 'page') === '1') (result.body as { total: number }).total = 51;
        return result;
      },
      '/partner-api/returns/changes?*': () => { reset = true; return delta({ reset: true, upsert: [], remove: [] }); }
    });
    renderApp('/returns/waiting');
    await loadSecondPage();
    await waitFor(() => expect(streams.length).toBeGreaterThan(0));
    await fire();
    await waitFor(() => expect(screen.queryByText('Товар 51')).not.toBeInTheDocument());
    expect(screen.getByText('Товар 1')).toBeInTheDocument();
  });
});

describe('очистка кэша при завершении сессии', () => {
  it('выход очищает кэш списков и счётчиков', async () => {
    mockApi({ [ME]: me, '/partner-api/returns?*': () => page([row(1)]), 'POST /partner-api/auth/logout': () => ({ status: 200 }) });
    renderApp('/returns/waiting');
    await screen.findByText('Товар 1', {}, { timeout: 4000 });
    expect(returnsCacheSize().lists).toBeGreaterThan(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Партнёр/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Выйти' }));
    await waitFor(() => expect(screen.queryByText('Товар 1')).not.toBeInTheDocument());
    expect(returnsCacheSize()).toEqual({ lists: 0, counts: 0 });
  });

  it('401 от любого метода API очищает кэш, и ответ, который был в пути в этот момент, его не наполняет', async () => {
    const streams: Array<{ listeners: Record<string, () => void> }> = [];
    vi.stubGlobal('EventSource', class {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; listeners: Record<string, () => void> = {};
      constructor() { streams.push(this); }
      addEventListener(name: string, listener: () => void) { this.listeners[name] = listener; }
      close() { /* nothing */ }
    });
    let refreshing = false;
    let lateResolved = false;
    const late = gate();
    const calls = mockApi({
      [ME]: me,
      '/partner-api/returns?*': async () => {
        if (!refreshing) return page([row(1)]);
        await late.promise;                               // обновление списка в пути, пока приходит 401
        lateResolved = true;
        return page([row(1, { name: 'Товар 1 (поздний ответ)' }), row(2)], 2, { revision: 'late' });
      },
      '/partner-api/returns/changes?*': () => ({ status: 401, body: { error: 'expired' } })
    });
    renderApp('/returns/waiting');
    await screen.findByText('Товар 1', {}, { timeout: 4000 });
    await waitFor(() => expect(returnsCacheSize().lists).toBeGreaterThan(0));
    await waitFor(() => expect(streams.length).toBeGreaterThan(0));
    refreshing = true;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(listCalls(calls)).toHaveLength(2));
    expect(lateResolved).toBe(false);                     // запрос действительно ещё в пути
    await act(async () => { streams.at(-1)!.listeners.revision?.(); });
    await waitFor(() => expect(screen.queryByText('Товар 1')).not.toBeInTheDocument());
    expect(lateResolved).toBe(false);                     // и всё ещё в пути в момент очистки
    expect(returnsCacheSize()).toEqual({ lists: 0, counts: 0 });
    await act(async () => late.open());
    await waitFor(() => expect(lateResolved).toBe(true));
    await sleep(50);
    expect(returnsCacheSize()).toEqual({ lists: 0, counts: 0 });
    expect(screen.queryByText('Товар 2')).not.toBeInTheDocument();
  });
});

describe('ReturnsPage и типизированный API', () => {
  it('страница и хуки не ходят в сеть напрямую и не содержат адресов возвратов: всё через api/returns.ts', () => {
    for (const source of [pageSource, dataSource, actionsSource]) {
      expect(source).not.toMatch(/\bfetch\(/);
      expect(source).not.toMatch(/\brequest(?:<[^>]*>)?\(/);
      expect(source).not.toContain('/partner-api/');
      expect(source).not.toContain('requestFile');
    }
    const hooks = dataSource + actionsSource;
    for (const name of ['listReturns', 'getReturnCounts', 'getReturnChanges', 'markReturns', 'markReturn', 'downloadReturnTtn', 'returnEventsUrl']) expect(hooks).toContain(name);
  });
});
