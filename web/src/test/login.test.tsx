import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { mockApi, renderApp as renderAt, type Handler } from './helpers';

const renderApp = () => renderAt('/login');

const anonymous: Handler = () => ({ status: 401 });

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Страница входа', () => {
  it('показывает форму с подсказками и фокусом на логине', async () => {
    mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Вход в кабинет партнёра' })).toBeInTheDocument();
    expect(screen.getByLabelText('Логин')).toHaveFocus();
    expect(screen.getByText('Его выдаёт владелец. Латиница, цифры и . _ @ -')).toBeInTheDocument();
    expect(screen.getByText('Не короче 8 символов')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
  });

  it('проверяет поле при уходе с него и снимает ошибку, как только значение исправлено', async () => {
    const user = userEvent.setup();
    mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    const login = await screen.findByLabelText('Логин');
    await user.type(login, 'ab');
    await user.tab();
    expect(screen.getByText('Логин не короче 3 символов')).toBeInTheDocument();
    expect(login).toHaveAttribute('aria-invalid', 'true');

    await user.click(login);
    await user.type(login, 'c');
    expect(screen.queryByText('Логин не короче 3 символов')).not.toBeInTheDocument();
    expect(login).not.toHaveAttribute('aria-invalid');
  });

  it('при отправке пустой формы показывает обе ошибки, ставит фокус на первое поле и не ходит в API', async () => {
    const user = userEvent.setup();
    const calls = mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    await screen.findByLabelText('Логин');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(screen.getByText('Введите логин')).toBeInTheDocument();
    expect(screen.getByText('Введите пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Логин')).toHaveFocus();
    expect(calls.some((c) => c.url === '/partner-api/auth/login')).toBe(false);
  });

  it('при неверных данных пишет об этом под паролем, очищает пароль и возвращает в него фокус', async () => {
    const user = userEvent.setup();
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/login': () => ({ status: 401, body: { error: 'Неверный логин или пароль.' } })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Логин'), 'kazan');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toHaveValue('');
    expect(screen.getByLabelText('Пароль')).toHaveFocus();
    expect(screen.getByLabelText('Логин')).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByLabelText('Пароль'), 'x');
    expect(screen.queryByText('Неверный логин или пароль')).not.toBeInTheDocument();
  });

  it('при блокировке показывает до какого времени и отключает кнопку', async () => {
    const user = userEvent.setup();
    const until = new Date(Date.now() + 15 * 60_000).toISOString();
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/login': () => ({ status: 429, body: { error: 'Слишком много неудачных попыток.', lockedUntilUtc: until } })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Логин'), 'kazan');
    await user.type(screen.getByLabelText('Пароль'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Слишком много неудачных попыток')).toBeInTheDocument();
    expect(screen.getByText(/Вход откроется в \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeDisabled();
  });

  it('сообщает, если сервер недоступен', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/partner-api/auth/me') return new Response('', { status: 401 });
        throw new TypeError('Failed to fetch');
      })
    );
    renderApp();

    await user.type(await screen.findByLabelText('Логин'), 'kazan');
    await user.type(screen.getByLabelText('Пароль'), 'password1');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
  });

  it('при успешном входе открывает главную с именем партнёра и отправляет логин без пробелов', async () => {
    const user = userEvent.setup();
    let signedIn = false;
    const calls = mockApi({
      '/partner-api/auth/me': () => (signedIn ? { status: 200, body: { id: 1, name: 'ООО Казань', login: 'kazan', permissions: [] } } : { status: 401 }),
      '/partner-api/orders/filters': () => ({ status: 200, body: { statuses: [], warehouses: [], clients: [] } }),
      '/partner-api/orders?*': () => ({ status: 200, body: { items: [], total: 0, page: 1, pageSize: 50 } }),
      'POST /partner-api/auth/login': () => {
        signedIn = true;
        return { status: 200, body: { id: 1, name: 'ООО Казань', login: 'kazan' } };
      }
    });
    renderApp();

    await user.type(await screen.findByLabelText('Логин'), '  kazan  ');
    await user.type(screen.getByLabelText('Пароль'), 'password1{Enter}');

    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
    expect(screen.getByText('ООО Казань')).toBeInTheDocument();
    const loginCall = calls.find((c) => c.url === '/partner-api/auth/login')!;
    expect(loginCall.body).toEqual({ login: 'kazan', password: 'password1' });
  });

  it('показывает и скрывает пароль', async () => {
    const user = userEvent.setup();
    mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    const password = await screen.findByLabelText('Пароль');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Показать пароль' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Скрыть пароль' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('предупреждает о Caps Lock в поле пароля', async () => {
    const user = userEvent.setup();
    mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    const password = await screen.findByLabelText('Пароль');
    await user.click(password);
    await user.keyboard('{CapsLock}');
    await waitFor(() => expect(screen.queryByText('Включён Caps Lock')).toBeInTheDocument());
  });

  it('«Не могу войти» объясняет, что учётную запись задаёт владелец', async () => {
    const user = userEvent.setup();
    mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Не могу войти' }));
    expect(screen.getByText('Логин и пароль задаёт владелец')).toBeInTheDocument();
  });
});

describe('Защита маршрутов', () => {
  it('невошедшего с главной отправляет на вход', async () => {
    mockApi({ '/partner-api/auth/me': anonymous });
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: 'Вход в кабинет партнёра' })).toBeInTheDocument();
  });

  it('уже вошедшего со страницы входа отправляет на главную', async () => {
    mockApi({
      '/partner-api/auth/me': () => ({ status: 200, body: { id: 1, name: 'ООО Казань', login: 'kazan' } }),
      '/partner-api/orders/filters': () => ({ status: 200, body: { statuses: [], warehouses: [], clients: [] } }),
      '/partner-api/orders?*': () => ({ status: 200, body: { items: [], total: 0, page: 1, pageSize: 50 } }),
    });
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
  });
});
