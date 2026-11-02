import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS_RESPONSE, json, mockApi, ordersPage, renderApp } from './helpers';

describe('Главная страница', () => {
  it('открывает разрешённые разделы и возвращается на главную по логотипу', async () => {
    mockApi({
      '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [4] }),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders?*': () => ordersPage([])
    });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Главная' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Заказы' })).toHaveAttribute('href', '/orders');
    expect(within(main).getByRole('link', { name: 'Возвраты' })).toHaveAttribute('href', '/returns');
    const user = userEvent.setup();
    await user.click(within(main).getByRole('link', { name: 'Заказы' }));
    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'На главную' }));
    expect(await screen.findByRole('heading', { name: 'Главная' })).toBeInTheDocument();
  });

  it('не показывает возвраты без разрешения', async () => {
    mockApi({ '/partner-api/auth/me': () => json({ id: 1, name: 'Партнёр', email: null, permissions: [] }) });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Главная' });
    expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Возвраты' })).not.toBeInTheDocument();
  });
});
