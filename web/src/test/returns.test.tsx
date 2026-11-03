import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, renderApp } from './helpers';

describe('Возвраты', () => {
  it('показывает разрешённый раздел и отправляет фильтр', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: 'a@example.test', permissions: [4] }),
      '/partner-api/returns?*': () => json({ items: [{ id: 12, client_id: '1', name: 'Товар А', status_name: 'В пути', qty: 1 }], total: 1, page: 1, page_size: 50, snapshot_at: null, partial: true })
    });
    renderApp('/returns/waiting');
    expect(await screen.findByText('Товар А')).toBeInTheDocument();
    expect(screen.getByText(/Не все кабинеты обновились/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Пункт выдачи'), 'Минск');
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    expect(calls.some(c => c.url.includes('pvz=%D0%9C'))).toBe(true);
  });

  it('показывает миниатюру товара из Studio2', async () => {
    mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4] }),
      '/partner-api/returns?*': () => json({ items: [{ id: 12, client_id: '1', sku: 777, name: 'Товар А', image_url: 'https://cdn1.ozone.ru/s3/folder/pic.jpg', qty: 1 }], total: 1, page: 1, page_size: 50, snapshot_at: null, partial: false })
    });
    renderApp('/returns/waiting');
    const image = await screen.findByRole('img', { name: 'Товар А' });
    expect(image).toHaveAttribute('src', 'https://ir.ozone.ru/s3/folder/c100/pic.jpg');
  });

  it('не запрашивает возвраты без разрешения', async () => {
    const calls = mockApi({ '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [] }) });
    renderApp('/returns/waiting');
    expect(await screen.findByText('Нет доступа')).toBeInTheDocument();
    expect(calls.some(c => c.url.startsWith('/partner-api/returns'))).toBe(false);
  });

  it('показывает FBO-коробку и её идентификатор', async () => {
    mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4] }),
      '/partner-api/returns?*': () => json({ items: [{ key: 'fbo:one', return_type: 'fbo', id: null, client_id: '1', box_id: 42, name: 'Товар FBO', status: 'ArrivedAtReturnPlace', status_name: 'В пункте выдачи', qty: 1 }], total: 1, page: 1, page_size: 50, snapshot_at: null, partial: false })
    });
    renderApp('/returns/waiting');
    expect(await screen.findByText('Товар FBO')).toBeInTheDocument();
    expect(screen.getByText('boxId 42')).toBeInTheDocument();
    expect(screen.getByText('Коробка FBO')).toBeInTheDocument();
  });

  it('ищет при вводе и позволяет выбрать подсказку FBO клавиатурой', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4] }),
      '/partner-api/returns?*': () => json({ items: [{ key: 'fbo:one', return_type: 'fbo', id: null, client_id: '1', box_id: 424242, name: 'Фильтр', offer_id: 'FILTER-123', status: 'ArrivedAtReturnPlace', status_name: 'В пункте выдачи', qty: 1 }], total: 1, page: 1, page_size: 50, snapshot_at: null, partial: false })
    });
    renderApp('/returns/waiting');
    await screen.findByText('boxId 424242');
    const user = userEvent.setup();
    const search = screen.getByRole('searchbox', { name: 'Поиск возвратов' });
    await user.type(search, 'FIL');
    const list = await screen.findByRole('listbox', { name: 'Подсказки по возвратам' });
    expect(within(list).getByRole('option')).toHaveTextContent('FILTER-123');
    expect(calls.some(c => c.url.includes('search=FIL'))).toBe(true);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(search).toHaveValue('FILTER-123');
    await waitFor(() => expect(calls.some(c => c.url.includes('search=FILTER-123'))).toBe(true));
    expect(screen.queryByRole('listbox', { name: 'Подсказки по возвратам' })).not.toBeInTheDocument();
    await user.clear(search);
    await waitFor(() => {
      const url = calls.filter(c => c.url.startsWith('/partner-api/returns?')).at(-1)?.url;
      expect(new URLSearchParams(url?.split('?')[1]).get('search')).toBe('');
    });
  });

  const received = (extra = {}) => ({ items: [{ key: 'fbs:1:12', return_type: 'fbs', id: 12, client_id: '1', name: 'Товар А', status: 'ReceivedBySeller', status_name: 'Получен', qty: 1, mark: 'pending', ...extra }], total: 1, page: 1, page_size: 50, snapshot_at: null, partial: false });

  it('принимает однозначный результат сканирования и выделяет строку', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json({ ...received({ ii_code: 'ii15728645041' }), exact_search: true }),
      'POST /partner-api/returns/mark': () => json({ mark: 'accepted', defect: false, missort: false, comment: '' })
    });
    renderApp('/returns/received');
    const user = userEvent.setup();
    await screen.findByText('Товар А');
    expect(screen.queryByRole('button', { name: /сканер/i })).not.toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Поиск возвратов' });
    expect(search).toHaveFocus();
    await user.type(search, '2698515728645041{Enter}');
    expect(await screen.findByText('Принят: Товар А')).toBeInTheDocument();
    expect(search).toHaveValue('');
    expect(screen.queryByRole('listbox', { name: 'Подсказки по возвратам' })).not.toBeInTheDocument();
    expect(calls.find(c => c.method === 'POST')?.body).toEqual({ key: 'fbs:1:12', status: 'accepted' });
    expect(calls.some(c => c.url.includes('exact=true'))).toBe(true);
  });

  it('ручной ввод с Enter только ищет и ничего не принимает', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json({ ...received(), exact_search: true })
    });
    renderApp('/returns/received');
    const user = userEvent.setup({ delay: 120 });
    await screen.findByText('Товар А');
    await user.type(screen.getByRole('searchbox', { name: 'Поиск возвратов' }), '770158{Enter}');
    await waitFor(() => expect(calls.some(c => c.url.includes('search=770158'))).toBe(true));
    expect(calls.some(c => c.method === 'POST' || c.url.includes('exact=true'))).toBe(false);
  });

  it('в подписях вкладок серым показано количество возвратов раздела без фильтров', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4] }),
      '/partner-api/returns?*': (_init, url) => json({ ...received(), total: url?.includes('section=waiting') ? 28 : 603 })
    });
    renderApp('/returns/received');
    const waiting = await screen.findByRole('link', { name: /Ждёт получения/ });
    await waitFor(() => expect(waiting).toHaveTextContent('Ждёт получения28'));
    const done = screen.getByRole('link', { name: /Получено/ });
    await waitFor(() => expect(done).toHaveTextContent('Получено603'));
    expect(within(done).getByText('603')).toHaveClass('pa-returns__tab-count');
    expect(done).toHaveAttribute('aria-current', 'page');
    expect(calls.some(c => c.url.includes('section=waiting') && c.url.includes('pageSize=1') && !c.url.includes('search='))).toBe(true);
  });

  it('FBO-коробка «Получена» видна в «Получено», скан по коду коробки принимает её', async () => {
    const box = { key: 'fbo:abc:1', return_type: 'fbo', id: null, client_id: '1', box_id: 10230649418, box_barcode: 'ii14471039742', name: 'Подушка двигателя 11483 FEBI', offer_id: '11483=FEB', status: 'ReceivedBySeller', status_name: 'Получена', qty: 1, mark: 'pending' };
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json({ items: [box], total: 1, page: 1, page_size: 50, snapshot_at: null, partial: false, exact_search: true }),
      'POST /partner-api/returns/mark': () => json({ mark: 'accepted', defect: false, missort: false, comment: '' })
    });
    renderApp('/returns/received');
    expect(await screen.findByText('Подушка двигателя 11483 FEBI')).toBeInTheDocument();
    expect(screen.getByText('ii14471039742')).toBeInTheDocument();
    expect(screen.getByText('Получена')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: 'Поиск возвратов' }), 'ii14471039742{Enter}');
    expect(await screen.findByText('Принят: Подушка двигателя 11483 FEBI')).toBeInTheDocument();
    expect(calls.find(c => c.method === 'POST')?.body).toEqual({ key: 'fbo:abc:1', status: 'accepted' });
  });

  it('принимает позицию по быстро набранному коду и без Enter', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json({ ...received({ ii_code: 'ii14471039743' }), exact_search: true }),
      'POST /partner-api/returns/mark': () => json({ mark: 'accepted', defect: false, missort: false, comment: '' })
    });
    renderApp('/returns/received');
    const user = userEvent.setup();
    await screen.findByText('Товар А');
    const search = screen.getByRole('searchbox', { name: 'Поиск возвратов' });
    await user.type(search, 'ii14471039743');
    expect(await screen.findByText('Принят: Товар А')).toBeInTheDocument();
    expect(search).toHaveValue('');
    expect(calls.find(c => c.method === 'POST')?.body).toEqual({ key: 'fbs:1:12', status: 'accepted' });
    expect(calls.filter(c => c.url.includes('exact=true')).every(c => c.url.includes('search=ii14471039743'))).toBe(true);
  });

  it('медленно набранный номер не принимается сам: это обычный поиск', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json({ ...received(), exact_search: true })
    });
    renderApp('/returns/received');
    const user = userEvent.setup({ delay: 150 });
    await screen.findByText('Товар А');
    await user.type(screen.getByRole('searchbox', { name: 'Поиск возвратов' }), 'ii14471039');
    await waitFor(() => expect(calls.some(c => c.url.includes('search=ii14471039'))).toBe(true), { timeout: 3000 });
    expect(calls.some(c => c.method === 'POST' || c.url.includes('exact=true'))).toBe(false);
  });

  it('код не найден: остаётся в поле выделенным, чтобы следующий скан его заменил', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': (_init, url) => url?.includes('exact=true')
        ? json({ ...received(), items: [], total: 0, exact_search: true })
        : json(received())
    });
    renderApp('/returns/received');
    const user = userEvent.setup();
    await screen.findByText('Товар А');
    const search = screen.getByRole('searchbox', { name: 'Поиск возвратов' }) as HTMLInputElement;
    await user.type(search, '8053379083565{Enter}');
    expect(await screen.findByText(/возврат не найден/)).toBeInTheDocument();
    await waitFor(() => expect(search).toHaveValue('8053379083565'));
    await waitFor(() => expect(search.selectionStart === 0 && search.selectionEnd === 13).toBe(true));
    expect(calls.some(c => c.method === 'POST')).toBe(false);
    await user.keyboard('2698514471039743');
    expect(search).toHaveValue('2698514471039743');
  });

  it('не принимает возвраты при нескольких совпадениях', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json({ ...received(), total: 2, exact_search: true })
    });
    renderApp('/returns/received');
    const user = userEvent.setup();
    await user.type(await screen.findByRole('searchbox', { name: 'Поиск возвратов' }), '770158{Enter}');
    expect(await screen.findByText(/найдено несколько позиций/)).toBeInTheDocument();
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('не принимает результат, если сервер не подтвердил точный поиск', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json(received())
    });
    renderApp('/returns/received');
    const user = userEvent.setup();
    await user.type(await screen.findByRole('searchbox', { name: 'Поиск возвратов' }), '770158{Enter}');
    expect(await screen.findByText(/Точный поиск недоступен/)).toBeInTheDocument();
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('в разделе «Получено» просит нужный раздел и без права приёмки не показывает кнопки', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4] }),
      '/partner-api/returns?*': () => json(received())
    });
    renderApp('/returns/received');
    expect(await screen.findByText('Товар А')).toBeInTheDocument();
    expect(calls.some(c => c.url.includes('section=received'))).toBe(true);
    expect(screen.getByText('Ожидает')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Статус приёмки/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Комментарий приёмки')).not.toBeInTheDocument();
  });

  it('принимает возврат и показывает ответ сервера', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json(received()),
      'POST /partner-api/returns/mark': () => json({ mark: 'accepted', defect: true, missort: false, comment: '', marked_by: 'partner:1' })
    });
    renderApp('/returns/received');
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Принять' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Комментарий приёмки')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Статус приёмки: Ожидает' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Принят' }));
    expect(await screen.findByRole('button', { name: 'Статус приёмки: Принят' })).toBeInTheDocument();
    expect(screen.getByText('Брак')).toBeInTheDocument();
    expect(calls.find(c => c.method === 'POST')?.body).toEqual({ key: 'fbs:1:12', status: 'accepted' });
  });

  it('подтягивает свежие данные при возврате на вкладку, не прячет таблицу', async () => {
    let status = 'pending';
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json(received({ mark: status }))
    });
    renderApp('/returns/received');
    await screen.findByRole('button', { name: 'Статус приёмки: Ожидает' });
    const before = calls.filter(c => c.url.startsWith('/partner-api/returns?')).length;
    status = 'accepted';
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByRole('button', { name: 'Статус приёмки: Принят' })).toBeInTheDocument();
    expect(calls.filter(c => c.url.startsWith('/partner-api/returns?')).length).toBeGreaterThan(before);
    expect(screen.queryByText('Загружаем возвраты…')).not.toBeInTheDocument();
  });

  it('список статуса открывается с клавиатуры и закрывается по Esc', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json(received()),
      'POST /partner-api/returns/mark': () => json({ mark: 'rejected', defect: false, missort: false })
    });
    renderApp('/returns/received');
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: 'Статус приёмки: Ожидает' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menu', { name: 'Статус приёмки' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() => expect(calls.find(c => c.method === 'POST')?.body).toEqual({ key: 'fbs:1:12', status: 'rejected' }));
  });

  it('показывает ошибку, если отметка не сохранилась', async () => {
    mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4, 5] }),
      '/partner-api/returns?*': () => json(received()),
      'POST /partner-api/returns/mark': () => json({ error: 'Возврат не найден.' }, 404)
    });
    renderApp('/returns/received');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Статус приёмки: Ожидает' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Брак' }));
    expect(await screen.findByText('Возврат не найден.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Статус приёмки: Ожидает' })).toBeInTheDocument();
  });

  it('в разделе «Получено» фильтры по статусу приёмки и пункту выдачи применяются сразу, без кнопки «Найти»', async () => {
    const calls = mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4] }),
      '/partner-api/returns?*': () => json(received())
    });
    renderApp('/returns/received');
    await screen.findByText('Товар А');
    expect(screen.queryByRole('combobox', { name: /Статус Ozon/ })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: /Статус приёмки/ }));
    await user.click(await screen.findByRole('option', { name: 'Принят' }));
    await waitFor(() => expect(calls.some(c => c.url.includes('section=received') && c.url.includes('mark=accepted'))).toBe(true));
    await user.type(screen.getByLabelText('Пункт выдачи'), 'Истра');
    await waitFor(() => expect(calls.some(c => c.url.includes('pvz=%D0%98%D1%81%D1%82%D1%80%D0%B0'))).toBe(true));
  });
});

