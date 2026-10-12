import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_FILTERS_RESPONSE, json, mockApi, order, ordersApi, ordersPage, PARTNER_FULL, PARTNER_VIEW_ONLY, renderApp } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const row = (n: number) => screen.getByRole('row', { name: new RegExp(`Заказ 0123-${String(n).padStart(4, '0')}-1`) });

describe('Список заказов', () => {
  it('показывает строки: товар с артикулом и кодом бренда, номер и ScanIt, только статус Ozon и сумму с ₽', async () => {
    ordersApi(PARTNER_FULL, [order(1, { article: '122RU19=HSH', productName: 'HOSHI Ремень ГРМ' })]);
    renderApp('/orders');

    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(r).getByText('HOSHI Ремень ГРМ')).toBeInTheDocument();
    expect(within(r).getByText('122RU19=HSH')).toBeInTheDocument();
    expect(within(r).getByText('0123-0001-1')).toBeInTheDocument();
    expect(within(r).getByText('ii50014310001')).toBeInTheDocument();
    expect(within(r).getByText('Ожидает сборки')).toBeInTheDocument();
    expect(within(r).queryByText('Новый')).not.toBeInTheDocument();
    expect(within(r).getByText(/1\s250,00\s₽/)).toBeInTheDocument();
    expect(screen.getByText('Найдено: 1')).toBeInTheDocument();
  });

  it('вместо трек-номера в подстрочнике ScanIt; пока Ozon его не отдал — понятная подсказка', async () => {
    ordersApi(PARTNER_FULL, [order(1, { scanit: null, trackingNumber: 'TRACK-777' })]);
    renderApp('/orders');

    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(r).getByText('ScanIt ещё не получен')).toBeInTheDocument();
    expect(within(r).queryByText('TRACK-777')).not.toBeInTheDocument();
  });

  it('без возможностей показывает таблицу без колонки действий', async () => {
    ordersApi(PARTNER_VIEW_ONLY, [order(1)]);
    renderApp('/orders');

    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(screen.queryByRole('button', { name: /Отгрузить/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Этикетка/ })).not.toBeInTheDocument();
  });

  it('действия только то, что разрешил владелец, и только для заказов Ozon', async () => {
    ordersApi({ ...PARTNER_FULL, permissions: [1] }, [order(1), order(2, { marketplace: 'YANDEX' })]);
    renderApp('/orders');

    const ozon = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(ozon).getByRole('button', { name: /Этикетка/ })).toBeInTheDocument();
    expect(within(ozon).queryByRole('button', { name: /Отгрузить/ })).not.toBeInTheDocument();
    const yandex = screen.getByRole('row', { name: /Заказ 0123-0002-1/ });
    expect(within(yandex).queryByRole('button', { name: /Отгрузить|Этикетка/ })).not.toBeInTheDocument();
  });

  it('блокирует отгрузку вне статуса «Ожидает сборки» и показывает подсказку над таблицей', async () => {
    const user = userEvent.setup();
    ordersApi(PARTNER_FULL, [order(1, { ozonStatus: 'Доставляется' })]);
    renderApp('/orders');

    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(r).getByRole('button', { name: /Отгрузить/ })).toBeDisabled();
    const hint = within(r).getByRole('img', { name: /только из статуса Ozon «Ожидает сборки»/ });
    await user.hover(hint);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Отгрузить заказ можно только из статуса Ozon «Ожидает сборки».');
  });

  it('выделяет готовую этикетку зелёной кнопкой', async () => {
    ordersApi(PARTNER_FULL, [order(1, { hasLabel: true })]);
    renderApp('/orders');

    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(r).getByRole('button', { name: /Этикетка/ })).toHaveClass('po-button__primary-success');
  });

  it('просрочку показывает красной подписью под датой, а не одним цветом', async () => {
    ordersApi(PARTNER_FULL, [order(1, { shippingDate: '2020-01-01T10:00:00', ozonStatus: 'Ожидает сборки' })]);
    renderApp('/orders');

    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(r).getByText('Просрочено')).toBeInTheDocument();
  });

  it('пустой набор: без фильтров и с фильтрами сообщения разные', async () => {
    ordersApi(PARTNER_FULL, []);
    renderApp('/orders');
    expect(await screen.findByText('Заказов пока нет')).toBeInTheDocument();
  });

  it('при ошибке загрузки показывает сообщение и «Повторить»', async () => {
    const user = userEvent.setup();
    let fail = true;
    mockApi({
      '/partner-api/auth/me': () => json(PARTNER_FULL),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders?*': () => (fail ? json({ error: 'Сервер временно недоступен. Попробуйте позже.' }, 503) : ordersPage([order(1)]))
    });
    renderApp('/orders');

    expect(await screen.findByText('Не удалось загрузить заказы')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).toBeInTheDocument();
  });
});

describe('Фильтры и подгрузка', () => {
  it('«Найти» отправляет фильтры в API и кладёт их в адрес; сброс очищает', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1)]);
    renderApp('/orders');
    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });

    await user.type(screen.getByRole('searchbox', { name: 'Поиск по заказам' }), 'BX1=HSH');
    await user.click(screen.getByRole('combobox', { name: /Статус Ozon/ }));
    await user.click(await screen.findByRole('option', { name: 'Доставляется' }));
    await user.click(screen.getByRole('button', { name: 'Найти' }));

    await waitFor(() => {
      const last = calls.filter((c) => c.url.startsWith('/partner-api/orders?')).at(-1)!;
      const query = new URLSearchParams(last.url.split('?')[1]);
      expect(query.get('search')).toBe('BX1=HSH');
      expect(query.get('ozonStatus')).toBe('Доставляется');
      expect(query.get('page')).toBe('1');
    });

    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    await waitFor(() => {
      const last = calls.filter((c) => c.url.startsWith('/partner-api/orders?')).at(-1)!;
      expect(new URLSearchParams(last.url.split('?')[1]).get('search')).toBeNull();
    });
  });

  it('подгружает следующую порцию, не дублирует строки и в конце сообщает, что показаны все', async () => {
    const user = userEvent.setup();
    const first = Array.from({ length: 3 }, (_, i) => order(i + 1));
    const second = [order(3), order(4)]; // третий пришёл повторно: список сдвинулся
    mockApi({
      '/partner-api/auth/me': () => json(PARTNER_FULL),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders?*': (_init, url) => (url!.includes('page=2') ? ordersPage(second, 4, 2) : ordersPage(first, 4, 1))
    });
    renderApp('/orders');

    await screen.findByRole('row', { name: /Заказ 0123-0003-1/ });
    expect(screen.getByText('Найдено: 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));

    await screen.findByRole('row', { name: /Заказ 0123-0004-1/ });
    expect(screen.getAllByRole('row', { name: /Заказ 0123-0003-1/ })).toHaveLength(1);
    expect(screen.getByText('Показаны все заказы: 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument();
  });

  it('сбой подгрузки не стирает уже показанные заказы и даёт повторить', async () => {
    const user = userEvent.setup();
    let failSecond = true;
    mockApi({
      '/partner-api/auth/me': () => json(PARTNER_FULL),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders?*': (_init, url) =>
        url!.includes('page=2') ? (failSecond ? json({ error: 'Сервер временно недоступен.' }, 503) : ordersPage([order(2)], 2, 2)) : ordersPage([order(1)], 2, 1)
    });
    renderApp('/orders');

    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    expect(await screen.findByText('Сервер временно недоступен.')).toBeInTheDocument();
    expect(row(1)).toBeInTheDocument();

    failSecond = false;
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('row', { name: /Заказ 0123-0002-1/ })).toBeInTheDocument();
  });

  it('если сессия закончилась посреди работы, показывает форму входа', async () => {
    let expired = false;
    mockApi({
      '/partner-api/auth/me': () => (expired ? json({ error: 'x' }, 401) : json(PARTNER_FULL)),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders?*': () => {
        expired = true;
        return { status: 401 };
      }
    });
    renderApp('/orders');

    expect(await screen.findByRole('heading', { name: 'Вход в кабинет партнёра' })).toBeInTheDocument();
  });
});

describe('Карточка заказа и фото', () => {
  const details = (o = order(1)) => json({ order: o, deliveryCity: 'Казань', barcode: '4610171644482', comment: null, lastStatusChangeDate: '2026-10-12T15:32:00', scanit: 'ii50014459430' });

  it('открывается по клику на строку, показывает ScanIt и штрихкод, Esc закрывает и возвращает фокус на строку', async () => {
    const user = userEvent.setup();
    ordersApi(PARTNER_FULL, [order(1)], { '/partner-api/orders/1': () => details() });
    renderApp('/orders');

    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    await user.click(r);

    const drawer = await screen.findByRole('complementary');
    expect(await within(drawer).findByText('ii50014459430')).toBeInTheDocument();
    expect(within(drawer).getByText('4610171644482')).toBeInTheDocument();
    expect(within(drawer).getByText('Казань')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(r).toHaveFocus();
  });

  it('фото открывается крупно: уменьшенная версия c800, Esc и крестик закрывают', async () => {
    const user = userEvent.setup();
    ordersApi(PARTNER_FULL, [order(1, { imageUrl: 'https://cdn1.ozone.ru/s3/multimedia-1-h/9121075469.jpg' })]);
    renderApp('/orders');

    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    const thumb = within(r).getByRole('img', { name: 'Товар 1' });
    expect(thumb).toHaveAttribute('src', 'https://ir.ozone.ru/s3/multimedia-1-h/c100/9121075469.jpg');

    await user.click(within(r).getByRole('button', { name: /Увеличить фото/ }));
    const dialog = await screen.findByRole('dialog', { name: /Фото: Товар 1/ });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://ir.ozone.ru/s3/multimedia-1-h/c800/9121075469.jpg');
    // клик по фото не открывает карточку заказа
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(r).getByRole('button', { name: /Увеличить фото/ }));
    await user.click(await screen.findByRole('button', { name: 'Закрыть просмотр' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('если крупной версии нет, показывает оригинал, а затем сообщение', async () => {
    const user = userEvent.setup();
    ordersApi(PARTNER_FULL, [order(1, { imageUrl: 'https://cdn1.ozone.ru/s3/multimedia-1-h/9121075469.jpg' })]);
    renderApp('/orders');

    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    await user.click(within(r).getByRole('button', { name: /Увеличить фото/ }));
    const dialog = await screen.findByRole('dialog');
    const img = within(dialog).getByRole('img');

    img.dispatchEvent(new Event('error'));
    await waitFor(() => expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://cdn1.ozone.ru/s3/multimedia-1-h/9121075469.jpg'));
    within(dialog).getByRole('img').dispatchEvent(new Event('error'));
    expect(await within(dialog).findByText('Изображение не подгрузилось')).toBeInTheDocument();
  });
});

describe('Отгрузка', () => {
  const noRequirements = () => json({ countries: [], exemplars: [] });

  it('просит подтверждение, и до подтверждения ничего не уходит в Ozon', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1)]);
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: /Отгрузить/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Отгрузить заказ?' });
    expect(calls.some((c) => c.url.includes('/ship') || c.url.includes('/ozon/'))).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/ship'))).toBe(false);
  });

  it('после подтверждения проверяет требования Ozon, отгружает и показывает результат; строка обновляется', async () => {
    const user = userEvent.setup();
    let shipped = false;
    const calls = ordersApi(PARTNER_FULL, [order(1)], {
      '/partner-api/orders/1/ozon/requirements': noRequirements,
      'POST /partner-api/orders/1/ship': () => {
        shipped = true;
        return json({ success: true, message: 'Отправление передано в доставку.', ozonStatusName: 'Доставляется' });
      },
      '/partner-api/orders/1': () => json({ order: order(1, shipped ? { ozonStatus: 'Доставляется' } : {}), deliveryCity: null, barcode: null, comment: null, lastStatusChangeDate: null, scanit: null })
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: /Отгрузить/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отгрузить' }));

    expect(await screen.findByText('Заказ 0123-0001-1 отгружен')).toBeInTheDocument();
    expect(screen.getByText(/Статус Ozon: Доставляется/)).toBeInTheDocument();
    const sequence = calls.map((c) => `${c.method} ${c.url}`);
    expect(sequence.indexOf('GET /partner-api/orders/1/ozon/requirements')).toBeLessThan(sequence.indexOf('POST /partner-api/orders/1/ship'));
    expect(await within(row(1)).findByText('Доставляется')).toBeInTheDocument();
  });

  it('если Ozon просит страну и данные маркировки, показывает форму, проверяет поля и отгружает после сохранения', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1)], {
      '/partner-api/orders/1/ozon/requirements': () =>
        json({
          countries: [{ productId: 55, productName: 'Ремень ГРМ', offerId: '122RU19=HSH' }],
          exemplars: [{ shipmentNumber: '0123-0001-1', productId: 55, productName: 'Ремень ГРМ', offerId: '122RU19=HSH', exemplarId: 9, index: 1, quantity: 1, needsMandatoryMark: true, needsGtd: true, needsRnpt: false, unsupported: [] }]
        }),
      '/partner-api/orders/1/ozon/countries': () => json([{ name: 'Россия', countryIsoCode: 'RU' }, { name: 'Китай', countryIsoCode: 'CN' }]),
      'PUT /partner-api/orders/1/ozon/countries': () => json({ success: true, message: 'ok' }),
      'PUT /partner-api/orders/1/ozon/exemplars': () => json({ success: true, message: 'ok' }),
      'POST /partner-api/orders/1/ship': () => json({ success: true, message: 'Готово.' })
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: /Отгрузить/ }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Отгрузить заказ?' })).getByRole('button', { name: 'Отгрузить' }));

    const form = await screen.findByRole('dialog', { name: 'Данные для отгрузки' });
    // пустая форма не отправляется и подсказывает, что не так
    await user.click(within(form).getByRole('button', { name: 'Сохранить и продолжить' }));
    expect(within(form).getByText('Выберите страну')).toBeInTheDocument();
    expect(within(form).getByText('Введите код маркировки')).toBeInTheDocument();
    expect(within(form).getByText('Введите номер ГТД или отметьте, что его нет')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    await user.click(within(form).getByRole('combobox', { name: /Страна/ }));
    await user.click(await screen.findByRole('option', { name: 'Россия' }));
    await user.type(within(form).getByLabelText('Код маркировки (Честный ЗНАК)'), '0104600000000000');
    await user.click(within(form).getByRole('checkbox', { name: 'ГТД отсутствует' }));
    await user.click(within(form).getByRole('button', { name: 'Сохранить и продолжить' }));

    expect(await screen.findByText('Заказ 0123-0001-1 отгружен')).toBeInTheDocument();
    const countries = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/ozon/countries'))!;
    expect(countries.body).toEqual({ selections: [{ productId: 55, countryIsoCode: 'RU' }] });
    const exemplars = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/ozon/exemplars'))!;
    expect(exemplars.body).toEqual({
      exemplars: [{ productId: 55, exemplarId: 9, mandatoryMark: '0104600000000000', gtd: null, isGtdAbsent: true, rnpt: null, isRnptAbsent: false }]
    });
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/ship'))).toHaveLength(1);
  });

  it('отказ Ozon показывает причины и ничего не скрывает', async () => {
    const user = userEvent.setup();
    ordersApi(PARTNER_FULL, [order(1)], {
      '/partner-api/orders/1/ozon/requirements': noRequirements,
      'POST /partner-api/orders/1/ship': () => json({ error: 'Не удалось отгрузить.', reasons: ['Недостаточно остатков на складе'] }, 422)
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: /Отгрузить/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отгрузить' }));

    expect(await screen.findByText('Не удалось отгрузить заказ 0123-0001-1')).toBeInTheDocument();
    expect(screen.getByText('Недостаточно остатков на складе')).toBeInTheDocument();
  });
});

describe('Печать этикетки', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
    URL.createObjectURL = vi.fn(() => 'blob:label');
    URL.revokeObjectURL = vi.fn();
  });

  const pdf = (generated: boolean) => ({ status: 200, file: new TextEncoder().encode('%PDF-1.4'), headers: { 'Content-Type': 'application/pdf', 'X-Label-Generated': String(generated), 'X-Auto-Shipped': 'false' } });

  it('готовая этикетка печатается сразу, без запроса требований, и открывается по ссылке', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1, { hasLabel: true })], { 'POST /partner-api/orders/1/label': () => pdf(false) });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: /Этикетка/ }));

    expect(await screen.findByText('Этикетка заказа 0123-0001-1 готова')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть этикетку' })).toHaveAttribute('href', 'blob:label');
    expect(calls.some((c) => c.url.includes('/ozon/requirements'))).toBe(false);
    expect(window.open).toHaveBeenCalled();
  });

  it('новая этикетка: сначала проверка требований Ozon, потом печать', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1)], {
      '/partner-api/orders/1/ozon/requirements': () => json({ countries: [], exemplars: [] }),
      'POST /partner-api/orders/1/label': () => pdf(true)
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: /Этикетка/ }));

    expect(await screen.findByText(/Получена у Ozon и сохранена/)).toBeInTheDocument();
    const sequence = calls.map((c) => `${c.method} ${c.url}`);
    expect(sequence.indexOf('GET /partner-api/orders/1/ozon/requirements')).toBeLessThan(sequence.indexOf('POST /partner-api/orders/1/label'));
  });

  it('отказ по правам показывает объяснение сервера', async () => {
    const user = userEvent.setup();
    ordersApi(PARTNER_FULL, [order(1, { hasLabel: true })], {
      'POST /partner-api/orders/1/label': () => json({ error: 'Отправление ещё не собрано, а для печати его нужно отгрузить.' }, 403)
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: /Этикетка/ }));

    expect(await screen.findByText('Не удалось получить этикетку заказа 0123-0001-1')).toBeInTheDocument();
    expect(screen.getByText(/для печати его нужно отгрузить/)).toBeInTheDocument();
  });
});
