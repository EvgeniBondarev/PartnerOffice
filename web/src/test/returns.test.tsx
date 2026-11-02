import { screen } from '@testing-library/react';
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

  it('не запрашивает возвраты без разрешения', async () => {
    const calls = mockApi({ '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [] }) });
    renderApp('/returns/waiting');
    expect(await screen.findByText('Нет доступа')).toBeInTheDocument();
    expect(calls.some(c => c.url.startsWith('/partner-api/returns'))).toBe(false);
  });
});
