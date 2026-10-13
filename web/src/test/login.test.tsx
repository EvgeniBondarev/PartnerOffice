import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { EMPTY_FILTERS_RESPONSE, json, mockApi, ordersPage, PARTNER_VIEW_ONLY, renderApp as renderAt, type Handler } from './helpers';

const renderApp = () => renderAt('/login');

const anonymous: Handler = () => ({ status: 401 });

const firstCell = () => screen.findByLabelText('Цифра 1 из 6');
const codeValue = () => [1, 2, 3, 4, 5, 6].map((n) => (screen.getByLabelText(`Цифра ${n} из 6`) as HTMLInputElement).value).join('');

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Страница входа', () => {
  it('показывает шаг почты с подсказкой и фокусом в поле', async () => {
    mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Вход в кабинет партнёра' })).toBeInTheDocument();
    expect(screen.getByLabelText('Почта')).toHaveFocus();
    expect(screen.getByText('Например, name@company.ru')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Получить код' })).toBeEnabled();
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Логин')).not.toBeInTheDocument();
  });

  it('проверяет почту при уходе с поля и снимает ошибку, как только значение исправлено', async () => {
    const user = userEvent.setup();
    mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    const email = await screen.findByLabelText('Почта');
    await user.type(email, 'boss@acme');
    await user.tab();
    expect(screen.getByText('Домен указан неполностью, например company.ru')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');

    await user.click(email);
    await user.type(email, '.ru');
    expect(screen.queryByText('Домен указан неполностью, например company.ru')).not.toBeInTheDocument();
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('при отправке пустой почты показывает ошибку, ставит фокус и не ходит в API', async () => {
    const user = userEvent.setup();
    const calls = mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    await screen.findByLabelText('Почта');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    expect(screen.getByText('Введите почту')).toBeInTheDocument();
    expect(screen.getByLabelText('Почта')).toHaveFocus();
    expect(calls.some((c) => c.url === '/partner-api/auth/code/request')).toBe(false);
  });

  it('при вводе почты название партнёра не показывает и не запрашивает', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: 'ООО Казань' })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru');
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(screen.queryByText(/Партнёр:/)).not.toBeInTheDocument();
    expect(screen.queryByText('ООО Казань')).not.toBeInTheDocument();
    expect(calls.some((c) => c.url === '/partner-api/auth/lookup')).toBe(false);
  });

  it('после запроса кода показывает «Партнёр: …» для подтверждения', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: 'ООО Казань' }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');

    expect(await screen.findByText('ООО Казань')).toBeInTheDocument();
    expect(screen.getByText(/Партнёр:/)).toBeInTheDocument();
    expect(screen.queryByText(/Организация:/)).not.toBeInTheDocument();
    const lookups = calls.filter((c) => c.url === '/partner-api/auth/lookup');
    expect(lookups).toHaveLength(1);
    expect(lookups[0].body).toEqual({ email: 'boss@acme.ru' });
  });

  it('для незнакомой почты на шаге кода название не показывает и ошибок не выдаёт', async () => {
    const user = userEvent.setup();
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'stranger@acme.ru{Enter}');
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/lookup'), expect.anything()));

    expect(screen.queryByText(/Партнёр:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('отправляет код и переходит на шаг ввода кода', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: 'ООО Казань' }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), '  boss@acme.ru  ');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));

    expect(await firstCell()).toHaveFocus();
    expect(screen.getByText('boss@acme.ru')).toBeInTheDocument();
    expect(await screen.findByText('ООО Казань')).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/partner-api/auth/code/request')!.body).toEqual({ email: 'boss@acme.ru' });
    expect(screen.getByRole('button', { name: /Отправить код ещё раз через \d+ с/ })).toBeDisabled();
  });

  it('вход по коду: после шести цифр отправляет сам и открывает кабинет', async () => {
    const user = userEvent.setup();
    let signedIn = false;
    const calls = mockApi({
      '/partner-api/auth/me': () => (signedIn ? json(PARTNER_VIEW_ONLY) : { status: 401 }),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders?*': () => ordersPage([]),
      'POST /partner-api/auth/lookup': () => json({ name: 'ООО Казань' }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 }),
      'POST /partner-api/auth/code/verify': () => {
        signedIn = true;
        return json({ id: 1, name: 'ООО Казань', email: 'boss@acme.ru' });
      }
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');
    await user.type(await firstCell(), '123456');

    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/partner-api/auth/code/verify')!.body).toEqual({ email: 'boss@acme.ru', code: '123456' });
  });

  it('вставленный из письма код с пробелом принимается', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 }),
      'POST /partner-api/auth/code/verify': () => ({ status: 401, body: { error: 'Неверный или просроченный код.' } })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');
    await user.click(await firstCell());
    await user.paste('123 456');

    await waitFor(() => expect(calls.some((c) => c.url === '/partner-api/auth/code/verify')).toBe(true));
    expect(calls.find((c) => c.url === '/partner-api/auth/code/verify')!.body).toEqual({ email: 'boss@acme.ru', code: '123456' });
  });

  it('при неверном коде пишет об этом, очищает поле и возвращает в него фокус', async () => {
    const user = userEvent.setup();
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 }),
      'POST /partner-api/auth/code/verify': () => ({ status: 401, body: { error: 'Неверный или просроченный код.' } })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');
    await user.type(await firstCell(), '000000');

    expect(await screen.findByText('Неверный или просроченный код')).toBeInTheDocument();
    await waitFor(() => expect(codeValue()).toBe(''));
    await waitFor(() => expect(screen.getByLabelText('Цифра 1 из 6')).toHaveFocus());
    expect(screen.getByLabelText('Цифра 1 из 6')).toHaveAttribute('aria-invalid', 'true');

    await user.keyboard('1');
    expect(screen.queryByText('Неверный или просроченный код')).not.toBeInTheDocument();
  });

  it('пока введено меньше шести цифр, ничего не отправляет и кнопки «Войти» нет', async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');
    await user.type(await firstCell(), '123');
    await user.keyboard('{Enter}');

    expect(codeValue()).toBe('123');
    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url === '/partner-api/auth/code/verify')).toBe(false);
  });

  it('при блокировке показывает до какого времени и отключает поле кода', async () => {
    const user = userEvent.setup();
    const until = new Date(Date.now() + 15 * 60_000).toISOString();
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 }),
      'POST /partner-api/auth/code/verify': () => ({ status: 429, body: { error: 'Слишком много неверных кодов.', lockedUntilUtc: until } })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');
    await user.type(await firstCell(), '000000');

    expect(await screen.findByText('Слишком много неверных кодов')).toBeInTheDocument();
    expect(screen.getByText(/Вход откроется в \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByLabelText('Цифра 1 из 6')).toBeDisabled();
  });

  it('если код уже отправляли минуту назад, всё равно показывает ввод кода и ждёт паузу', async () => {
    const user = userEvent.setup();
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 429, body: { error: 'Код уже отправлен.', retryAfterSeconds: 42 } })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');

    expect(await firstCell()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Отправить код ещё раз через (4[12]|3\d) с/ })).toBeDisabled();
  });

  it('если письмо не отправилось, остаётся на шаге почты с сообщением', async () => {
    const user = userEvent.setup();
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 503, body: { error: 'Не удалось отправить письмо. Попробуйте позже.' } })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');

    expect(await screen.findByText('Не удалось отправить письмо. Попробуйте позже.')).toBeInTheDocument();
    expect(screen.getByLabelText('Почта')).toBeInTheDocument();
    expect(screen.queryByLabelText('Цифра 1 из 6')).not.toBeInTheDocument();
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

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');

    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Получить код' })).toBeEnabled();
  });

  it('«Изменить почту» возвращает на первый шаг с введённой почтой', async () => {
    const user = userEvent.setup();
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Изменить почту' }));

    expect(await screen.findByLabelText('Почта')).toHaveValue('boss@acme.ru');
    expect(screen.queryByLabelText('Цифра 1 из 6')).not.toBeInTheDocument();
  });

  it('повторная отправка кода доступна после паузы', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: null }),
      'POST /partner-api/auth/code/request': () => ({ status: 202 })
    });
    renderApp();

    await user.type(await screen.findByLabelText('Почта'), 'boss@acme.ru{Enter}');
    const resend = await screen.findByRole('button', { name: /Отправить код ещё раз через/ });
    expect(resend).toBeDisabled();

    await vi.advanceTimersByTimeAsync(61_000);
    const ready = await screen.findByRole('button', { name: 'Отправить код ещё раз' });
    expect(ready).toBeEnabled();
    await user.click(ready);

    await waitFor(() => expect(calls.filter((c) => c.url === '/partner-api/auth/code/request')).toHaveLength(2));
  });

  it('ссылка из приглашения сразу входит по коду из неё и убирает почту и код из адреса', async () => {
    let signedIn = false;
    const calls = mockApi({
      '/partner-api/auth/me': () => (signedIn ? json(PARTNER_VIEW_ONLY) : { status: 401 }),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders?*': () => ordersPage([]),
      'POST /partner-api/auth/lookup': () => json({ name: 'ООО Казань' }),
      'POST /partner-api/auth/code/verify': () => {
        signedIn = true;
        return json({ id: 1, name: 'ООО Казань', email: 'boss@acme.ru' });
      }
    });
    renderAt('/login?email=boss%40acme.ru&code=482913');

    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
    const verifies = calls.filter((c) => c.url === '/partner-api/auth/code/verify');
    expect(verifies).toHaveLength(1);
    expect(verifies[0].body).toEqual({ email: 'boss@acme.ru', code: '482913' });
    expect(calls.some((c) => c.url === '/partner-api/auth/code/request')).toBe(false);
  });

  it('если код из ссылки не подошёл, показывает ошибку и пустое поле для нового кода', async () => {
    mockApi({
      '/partner-api/auth/me': anonymous,
      'POST /partner-api/auth/lookup': () => json({ name: 'ООО Казань' }),
      'POST /partner-api/auth/code/verify': () => ({ status: 401, body: { error: 'Неверный или просроченный код.' } })
    });
    renderAt('/login?email=boss%40acme.ru&code=482913');

    expect(await screen.findByText('Неверный или просроченный код')).toBeInTheDocument();
    await waitFor(() => expect(codeValue()).toBe(''));
    expect(screen.getByText('boss@acme.ru')).toBeInTheDocument();
  });

  it('ссылка только с почтой подставляет её на первом шаге', async () => {
    mockApi({ '/partner-api/auth/me': anonymous, 'POST /partner-api/auth/lookup': () => json({ name: null }) });
    renderAt('/login?email=boss%40acme.ru');

    expect(await screen.findByLabelText('Почта')).toHaveValue('boss@acme.ru');
    expect(screen.queryByLabelText('Цифра 1 из 6')).not.toBeInTheDocument();
  });

  it('«Не могу войти» объясняет, что приглашение отправляет владелец', async () => {
    const user = userEvent.setup();
    mockApi({ '/partner-api/auth/me': anonymous });
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Не могу войти' }));
    expect(screen.getByText('Доступ выдаёт владелец')).toBeInTheDocument();
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
      '/partner-api/auth/me': () => ({ status: 200, body: { id: 1, name: 'ООО Казань', email: 'boss@acme.ru' } }),
      '/partner-api/orders/filters': () => ({ status: 200, body: { statuses: [], warehouses: [], clients: [] } }),
      '/partner-api/orders?*': () => ({ status: 200, body: { items: [], total: 0, page: 1, pageSize: 50 } }),
    });
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
  });
});
