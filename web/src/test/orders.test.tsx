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
  it('показывает строки: товар с артикулом и кодом бренда, номер и ScanIt, бейдж статуса Studio2 и сумму с ₽', async () => {
    ordersApi(PARTNER_FULL, [order(1, { article: '122RU19=HSH', productName: 'HOSHI Ремень ГРМ', status: 'Принят на складе', ozonStatus: 'Ожидает сборки' })]);
    renderApp('/orders');

    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(r).getByText('HOSHI Ремень ГРМ')).toBeInTheDocument();
    expect(within(r).getByText('122RU19=HSH')).toBeInTheDocument();
    expect(within(r).getByText('0123-0001-1')).toBeInTheDocument();
    expect(within(r).getByText('ii50014310001')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Статус' })).toBeInTheDocument();
    expect(within(r).getByText('Принят на складе').closest('.po-badge__badge')).toHaveClass('po-badge__warning');
    expect(within(r).queryByText('Ожидает сборки')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: /Принят|Отгрузить/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Этикетка/ })).not.toBeInTheDocument();
  });

  it('действия только то, что разрешил владелец; этикетка только для заказов Ozon', async () => {
    ordersApi({ ...PARTNER_FULL, permissions: [1] }, [order(1, { statusAction: 'ship' }), order(2, { marketplace: 'YANDEX' })]);
    renderApp('/orders');

    const ozon = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(ozon).getByRole('button', { name: /Этикетка/ })).toBeInTheDocument();
    expect(within(ozon).queryByRole('button', { name: /Отгрузить/ })).not.toBeInTheDocument();
    const yandex = screen.getByRole('row', { name: /Заказ 0123-0002-1/ });
    expect(within(yandex).queryByRole('button', { name: /Отгрузить|Этикетка/ })).not.toBeInTheDocument();
  });

  it('кнопку статуса выбирает сервер: «Принят», «Отгрузить» или никакой', async () => {
    ordersApi(PARTNER_FULL, [order(1, { statusAction: 'accept' }), order(2, { statusAction: 'ship' }), order(3, { statusAction: null }), order(4, { marketplace: 'YANDEX', statusAction: 'accept' })]);
    renderApp('/orders');

    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(row(1)).getByRole('button', { name: 'Принят' })).toBeEnabled();
    expect(within(row(1)).queryByRole('button', { name: 'Отгрузить' })).not.toBeInTheDocument();
    expect(within(row(2)).getByRole('button', { name: 'Отгрузить' })).toBeEnabled();
    expect(within(row(3)).queryByRole('button', { name: /Принят|Отгрузить/ })).not.toBeInTheDocument();
    // статус Studio2 ведётся и у заказов других маркетплейсов, этикетка — только у Ozon
    expect(within(row(4)).getByRole('button', { name: 'Принят' })).toBeInTheDocument();
    expect(within(row(4)).queryByRole('button', { name: /Этикетка/ })).not.toBeInTheDocument();
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
  it('подсказки поиска: от двух символов, выбор подставляет номер отправления', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1)], {
      '/partner-api/orders/suggestions?*': () =>
        json([{ id: 7, shipmentNumber: '0123-0007-1', productName: 'Ремень ГРМ', article: '113YU19=HSH', trackingNumber: null, scanit: 'ii500', ozonStatus: 'Ожидает сборки' }])
    });
    renderApp('/orders');
    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });

    const search = screen.getByRole('searchbox', { name: 'Поиск по заказам' });
    await user.type(search, '1');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(calls.some((c) => c.url.includes('/suggestions'))).toBe(false);

    await user.type(search, '1');
    await user.click(await screen.findByRole('option', { name: /0123-0007-1/ }));
    expect(search).toHaveValue('0123-0007-1');
    expect(calls.some((c) => c.url.includes('/suggestions?q=11'))).toBe(true);
  });

  it('фильтры панели и поиск применяются сразу, лежат в адресе; теги и «Очистить всё» их снимают, поиск остаётся', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1)]);
    renderApp('/orders');
    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    const last = () => new URLSearchParams(calls.filter((c) => c.url.startsWith('/partner-api/orders?')).at(-1)!.url.split('?')[1]);

    await user.type(screen.getByRole('searchbox', { name: 'Поиск по заказам' }), 'BX1=HSH');
    await waitFor(() => expect(last().get('search')).toBe('BX1=HSH'));
    await user.click(within(screen.getByRole('group', { name: 'Статус' })).getByRole('checkbox', { name: /Принят на складе/ }));
    await user.click(within(screen.getByRole('group', { name: 'Склад' })).getByRole('checkbox', { name: 'Москва' }));
    await waitFor(() => {
      expect(last().get('statusId')).toBe('21');
      expect(last().get('warehouseId')).toBe('1');
      expect(last().get('search')).toBe('BX1=HSH');
      expect(last().get('page')).toBe('1');
    });

    const chips = screen.getByRole('list', { name: 'Выбранные фильтры' });
    expect(within(chips).getByText('Склад: Москва')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Убрать фильтр: Склад: Москва' }));
    await waitFor(() => expect(last().get('warehouseId')).toBeNull());
    expect(last().get('statusId')).toBe('21');

    await user.click(within(chips).getByRole('button', { name: 'Очистить всё' }));
    await waitFor(() => expect(last().get('statusId')).toBeNull());
    expect(last().get('search')).toBe('BX1=HSH');
  });

  it('фильтр «Статус»: статусы Studio2 со счётчиками, несколько значений через запятую, адрес ?status=, теги', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1)]);
    renderApp('/orders?status=1');
    const last = () => new URLSearchParams(calls.filter((c) => c.url.startsWith('/partner-api/orders?')).at(-1)!.url.split('?')[1]);

    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(last().get('statusId')).toBe('1');
    expect(screen.queryByRole('group', { name: 'Статус Ozon' })).not.toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Статус' });
    const accepted = within(group).getByRole('checkbox', { name: /Принят на складе/ });
    expect(accepted.closest('label')).toHaveTextContent('Принят на складе2');
    expect(within(group).getByRole('checkbox', { name: /Новый/ })).toBeChecked();

    await user.click(accepted);
    await waitFor(() => expect(last().get('statusId')).toBe('1,21'));
    const chips = screen.getByRole('list', { name: 'Выбранные фильтры' });
    expect(within(chips).getByText('Статус: Новый')).toBeInTheDocument();
    expect(within(chips).getByText('Статус: Принят на складе')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Убрать фильтр: Статус: Новый' }));
    await waitFor(() => expect(last().get('statusId')).toBe('21'));
    await user.click(within(chips).getByRole('button', { name: 'Очистить всё' }));
    await waitFor(() => expect(last().get('statusId')).toBeNull());
  });

  it('поставщик: колонка в строке, строка в карточке и фильтр в панели (несколько значений через запятую)', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1, { supplier: 'Автоевро' }), order(2, { supplier: null })], {
      '/partner-api/orders/1': () => json({ order: order(1, { supplier: 'Автоевро' }), deliveryCity: null, barcode: null, comment: null, lastStatusChangeDate: null, scanit: null })
    });
    renderApp('/orders');
    const last = () => new URLSearchParams(calls.filter((c) => c.url.startsWith('/partner-api/orders?')).at(-1)!.url.split('?')[1]);

    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(screen.getByRole('columnheader', { name: 'Поставщик' })).toBeInTheDocument();
    expect(within(row(1)).getByText('Автоевро')).toBeInTheDocument();
    expect(within(row(2)).getByText('—')).toBeInTheDocument();

    const group = screen.getByRole('group', { name: 'Поставщик' });
    await user.click(within(group).getByRole('checkbox', { name: 'Автоевро' }));
    await user.click(within(group).getByRole('checkbox', { name: 'Берг' }));
    await waitFor(() => expect(last().get('supplierId')).toBe('5,7'));
    expect(within(screen.getByRole('list', { name: 'Выбранные фильтры' })).getByText('Поставщик: Берг')).toBeInTheDocument();

    await user.click(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ }));
    const drawer = await screen.findByRole('complementary', { name: /Заказ 0123-0001-1/ });
    expect(await within(drawer).findByText('Поставщик')).toBeInTheDocument();
    expect(within(drawer).getByText('Автоевро')).toBeInTheDocument();
  });

  it('«Найти» и Enter применяют поиск сразу, без паузы', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1)]);
    renderApp('/orders');
    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по заказам' }), 'A');
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    expect(new URLSearchParams(calls.filter((c) => c.url.startsWith('/partner-api/orders?')).at(-1)!.url.split('?')[1]).get('search')).toBe('A');
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

describe('Статус Studio2: «Принят» → «Отгрузить»', () => {
  const details = (o: ReturnType<typeof order>) => json({ order: o, deliveryCity: null, barcode: null, comment: null, lastStatusChangeDate: null, scanit: null });

  it('просит подтверждение, и до подтверждения ничего не уходит на сервер', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1, { statusAction: 'accept' })]);
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: 'Принят' }));
    const dialog = await screen.findByRole('dialog', { name: 'Принять заказ?' });
    expect(dialog).toHaveTextContent('«Принят на складе»');

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('цепочка: «Принят» → «Отгрузить» → кнопки нет; ответ сервера сразу в строке, Ozon не трогается', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1, { statusAction: 'accept' })], {
      'POST /partner-api/orders/1/status/accept': () => json(order(1, { statusId: 21, status: 'Принят на складе', statusAction: 'ship' })),
      'POST /partner-api/orders/1/status/ship': () => json(order(1, { statusId: 24, status: 'Отгружен реализатором', statusAction: null }))
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: 'Принят' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Принять заказ?' })).getByRole('button', { name: 'Принят' }));

    expect(await screen.findByText('Заказ 0123-0001-1 принят')).toBeInTheDocument();
    expect(screen.getByText('Статус в Studio2: Принят на складе.')).toBeInTheDocument();
    expect(within(row(1)).getByText('Принят на складе')).toBeInTheDocument();

    await user.click(within(row(1)).getByRole('button', { name: 'Отгрузить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Отгрузить заказ?' });
    expect(dialog).toHaveTextContent('«Отгружен реализатором»');
    expect(dialog).toHaveTextContent('В Ozon при этом ничего не отправляется');
    await user.click(within(dialog).getByRole('button', { name: 'Отгрузить' }));

    expect(await screen.findByText('Заказ 0123-0001-1 отгружен')).toBeInTheDocument();
    expect(within(row(1)).getByText('Отгружен реализатором').closest('.po-badge__badge')).toHaveClass('po-badge__success');
    expect(within(row(1)).queryByRole('button', { name: /Принят|Отгрузить/ })).not.toBeInTheDocument();

    const posts = calls.filter((c) => c.method === 'POST').map((c) => c.url);
    expect(posts).toEqual(['/partner-api/orders/1/status/accept', '/partner-api/orders/1/status/ship']);
    expect(calls.some((c) => c.url.includes('/ozon/') || c.url.endsWith('/1/ship'))).toBe(false);
  });

  it('в карточке заказа — та же кнопка статуса, бейдж Studio2 и строка «Статус Ozon»', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1, { statusAction: 'ship', status: 'Принят на складе', ozonStatus: 'Ожидает отгрузки' })], {
      '/partner-api/orders/1': () => details(order(1, { statusAction: 'ship', status: 'Принят на складе', ozonStatus: 'Ожидает отгрузки' })),
      'POST /partner-api/orders/1/status/ship': () => json(order(1, { status: 'Отгружен реализатором', statusAction: null, ozonStatus: 'Ожидает отгрузки' }))
    });
    renderApp('/orders');

    await user.click(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ }));
    const drawer = await screen.findByRole('complementary', { name: /Заказ 0123-0001-1/ });
    expect(await within(drawer).findByText('Статус Ozon')).toBeInTheDocument();
    expect(within(drawer).getByText('Ожидает отгрузки')).toBeInTheDocument();
    expect(within(drawer).getByText('Принят на складе').closest('.po-badge__badge')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Отгрузить' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Отгрузить заказ?' })).getByRole('button', { name: 'Отгрузить' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/partner-api/orders/1/status/ship')).toBe(true));
  });

  it('409: статус уже сменили в Studio2 — предупреждение и строка перечитывается', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1, { statusAction: 'accept' })], {
      'POST /partner-api/orders/1/status/accept': () => json({ error: 'Заказ уже в статусе «Отгружен реализатором».' }, 409),
      '/partner-api/orders/1': () => details(order(1, { statusId: 24, status: 'Отгружен реализатором', statusAction: null }))
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: 'Принят' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Принят' }));

    expect(await screen.findByText('Статус уже изменён в Studio2')).toBeInTheDocument();
    expect(screen.getByText('Заказ уже в статусе «Отгружен реализатором».')).toBeInTheDocument();
    expect(await within(row(1)).findByText('Отгружен реализатором')).toBeInTheDocument();
    expect(within(row(1)).queryByRole('button', { name: /Принят|Отгрузить/ })).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'GET' && c.url === '/partner-api/orders/1')).toBe(true);
  });

  it('отказ сервера (403, 422) показывает объяснение и причины', async () => {
    const user = userEvent.setup();
    ordersApi(PARTNER_FULL, [order(1, { statusAction: 'ship' })], {
      'POST /partner-api/orders/1/status/ship': () => json({ error: 'Нельзя отгрузить заказ.', reasons: ['Заказ ещё не принят на складе'] }, 422)
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: 'Отгрузить' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отгрузить' }));

    expect(await screen.findByText('Не удалось отгрузить заказ 0123-0001-1')).toBeInTheDocument();
    expect(screen.getByText('Заказ ещё не принят на складе')).toBeInTheDocument();
    expect(within(row(1)).getByRole('button', { name: 'Отгрузить' })).toBeInTheDocument();
  });
});

describe('Живое обновление', () => {
  it('при смене ревизии тихо перечитывает загруженные порции и сообщает о смене статуса', async () => {
    let revision = 'r1';
    let changed = false;
    const calls = mockApi({
      '/partner-api/auth/me': () => json(PARTNER_FULL),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders/revision': () => json({ revision }),
      '/partner-api/orders?*': (_init, url) =>
        url!.includes('page=2')
          ? ordersPage([order(3), order(4, changed ? { statusId: 21, status: 'Принят на складе' } : {})], 5, 2)
          : ordersPage([order(1, changed ? { statusId: 24, status: 'Отгружен реализатором' } : {}), order(2)], 5, 1)
    });
    const user = userEvent.setup();
    renderApp('/orders');

    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await screen.findByRole('row', { name: /Заказ 0123-0004-1/ });
    await waitFor(() => expect(calls.some((c) => c.url === '/partner-api/orders/revision')).toBe(true));
    const listCalls = () => calls.filter((c) => c.url.startsWith('/partner-api/orders?')).length;
    const before = listCalls();

    // та же ревизия: ничего не перечитывается
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listCalls()).toBe(before);

    revision = 'r2';
    changed = true;
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByText('Статус изменён в Studio2: 0123-0001-1 → Отгружен реализатором, 0123-0004-1 → Принят на складе')).toBeInTheDocument();
    expect(within(row(1)).getByText('Отгружен реализатором')).toBeInTheDocument();
    expect(within(row(4)).getByText('Принят на складе')).toBeInTheDocument();
    // обе порции перечитаны, без скелетона: строки остались на месте
    expect(listCalls()).toBe(before + 2);
    expect(screen.queryByRole('status', { name: 'Загружаем заказы' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('row', { name: /Заказ 0123-/ })).toHaveLength(4);
  });

  it('больше трёх смен статуса: первые три номера и «и ещё N»', async () => {
    let revision = 'r1';
    let changed = false;
    const items = (shipped: boolean) => Array.from({ length: 5 }, (_, i) => order(i + 1, shipped ? { statusId: 21, status: 'Принят на складе' } : {}));
    mockApi({
      '/partner-api/auth/me': () => json(PARTNER_FULL),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders/revision': () => json({ revision }),
      '/partner-api/orders?*': () => ordersPage(items(changed))
    });
    renderApp('/orders');

    await screen.findByRole('row', { name: /Заказ 0123-0005-1/ });
    await new Promise((resolve) => setTimeout(resolve, 50));
    revision = 'r2';
    changed = true;
    document.dispatchEvent(new Event('visibilitychange'));

    expect(
      await screen.findByText('Статус изменён в Studio2: 0123-0001-1 → Принят на складе, 0123-0002-1 → Принят на складе, 0123-0003-1 → Принят на складе и ещё 2')
    ).toBeInTheDocument();
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
    expect(screen.getByText('Этикетка заказа 0123-0001-1 готова').closest('.pa-informer')?.querySelector('.pa-informer__icon')).not.toBeInTheDocument();
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
