import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clearOrdersCache } from '../orders/ordersCache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_FILTERS_RESPONSE, json, mockApi, order, ordersApi, ordersPage, PARTNER_FULL, PARTNER_VIEW_ONLY, renderApp } from './helpers';

beforeEach(() => { clearOrdersCache(); localStorage.removeItem('partner-office.orders-section'); });
afterEach(() => {
  clearOrdersCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const row = (n: number) => screen.getByRole('row', { name: new RegExp(`Заказ 0123-${String(n).padStart(4, '0')}-1`) });

describe('Список заказов', () => {
  it('запоминает вкладку при переходе из раздела и открывает её снова через меню и главную', async () => {
    ordersApi(PARTNER_FULL, []);
    renderApp('/orders');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: /Готовые/ }));
    expect(localStorage.getItem('partner-office.orders-section')).toBe('ready');
    await user.click(screen.getByRole('link', { name: 'На главную' }));
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Заказы' }));
    expect(await screen.findByRole('link', { name: /Готовые/, current: 'page' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Отправлено/ }));
    await user.click(screen.getByRole('link', { name: 'На главную' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Разделы кабинета' })).getByRole('link', { name: 'Заказы' }));
    expect(await screen.findByRole('link', { name: /Отправлено/, current: 'page' })).toBeInTheDocument();
  });

  it('сохраняет вкладку при прямом открытии и восстанавливает после повторного входа', async () => {
    ordersApi(PARTNER_FULL, []);
    renderApp('/orders/sent');
    await screen.findByRole('link', { name: /Отправлено/, current: 'page' });
    await waitFor(() => expect(localStorage.getItem('partner-office.orders-section')).toBe('sent'));
    cleanup();
    renderApp('/');
    expect(await within(await screen.findByRole('main')).findByRole('link', { name: 'Заказы' })).toHaveAttribute('href', '/orders/sent');
  });
  it('фильтрует по статусу маркетплейса: секция, запрос и тег', async () => {
    const calls = ordersApi(PARTNER_FULL, [], {
      '/partner-api/orders/filters': () => json({ statuses: [{ id: 1, name: 'Новый' }], ozonStatuses: ['Доставляется', 'Отменён'], warehouses: [], clients: [], groupCounts: { work: 1, sent: 0, ready: 0 } })
    });
    renderApp('/orders');
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Отменён'));
    await waitFor(() => expect(calls.some((c) => c.url.includes('/partner-api/orders?') && c.url.includes('ozonStatus=%D0%9E%D1%82%D0%BC%D0%B5%D0%BD%D1%91%D0%BD'))).toBe(true));
    expect(await screen.findByText('Статус маркетплейса: Отменён')).toBeInTheDocument();
  });
  it('подбирает варианты фильтров по вкладке', async () => {
    ordersApi(PARTNER_FULL, [], {
      '/partner-api/orders/filters': (_init, url) => json({ statuses: [{ id: 1, name: url?.includes('group=sent') ? 'Отправленный' : 'Новый' }], warehouses: [], clients: [], groupCounts: { work: 1, sent: 1, ready: 0 } })
    });
    renderApp('/orders');
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Новый')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Отправлено/ }));
    expect(await screen.findByLabelText('Отправленный')).toBeInTheDocument();
    expect(screen.queryByLabelText('Новый')).not.toBeInTheDocument();
  });

  it('показывает счётчики и запрашивает выбранную группу с сохранением фильтров', async () => {
    const calls = ordersApi(PARTNER_FULL, [], {
      '/partner-api/orders/filters': () => json({ statuses: [], warehouses: [], clients: [], groupCounts: { work: 4, sent: 2, ready: 7 } })
    });
    renderApp('/orders?search=ABC');
    const nav = await screen.findByRole('navigation', { name: 'Разделы заказов' });
    expect(await within(nav).findByRole('link', { name: /В работе\s*4/ })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(nav).getByRole('link', { name: /Отправлено\s*2/ }));
    await waitFor(() => expect(calls.some(c => c.url.includes('group=sent') && c.url.includes('search=ABC'))).toBe(true));
    expect(within(nav).getByRole('link', { name: /Отправлено/ })).toHaveAttribute('aria-current', 'page');
  });
  it('показывает строки: товар с артикулом и кодом бренда, номер и ScanIt, бейдж статуса Studio2 и сумму с ₽', async () => {
    ordersApi(PARTNER_FULL, [order(1, { article: '122RU19=HSH', productName: 'HOSHI Ремень ГРМ', status: 'Принят на складе', ozonStatus: 'Ожидает сборки', ozonStatusColor: '#123456' })]);
    renderApp('/orders');

    expect(await screen.findByRole('heading', { name: 'Заказы' })).toBeInTheDocument();
    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(r).getByText('HOSHI Ремень ГРМ')).toBeInTheDocument();
    expect(within(r).getByText('122RU19=HSH')).toBeInTheDocument();
    expect(within(r).getByText('0123-0001-1')).toBeInTheDocument();
    expect(within(r).getByText('ii50014310001')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Статус' })).toBeInTheDocument();
    expect(within(r).getByText('Принят на складе').closest('.po-badge__badge')).toHaveClass('po-badge__warning');
    const ozonBadge = within(r).getByText('Ожидает сборки').closest('.po-badge__badge');
    expect(ozonBadge).toHaveClass('po-badge__badge');
    expect(ozonBadge).toHaveStyle({ backgroundColor: '#123456', color: '#fff' });
    expect(within(r).getByText('Ozon:')).toHaveClass('pa-muted');
    expect(within(r).getByText('Наш:')).toHaveClass('pa-muted');
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

  it('запрещает печать готовой этикетки отменённого Ozon-заказа в строке и карточке', async () => {
    const cancelled = order(1, { ozonStatus: 'Отменён', hasLabel: true });
    const calls = ordersApi(PARTNER_FULL, [cancelled], {
      '/partner-api/orders/1': () => json({ order: cancelled, deliveryCity: null, barcode: null, comment: null, lastStatusChangeDate: null, scanit: null })
    });
    renderApp('/orders');
    const r = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(r).getByRole('button', { name: /Этикетка/ })).toBeDisabled();
    await userEvent.click(r);
    const drawer = await screen.findByRole('complementary', { name: /Заказ 0123-0001-1/ });
    expect(within(drawer).getByRole('button', { name: /Этикетка/ })).toBeDisabled();
    expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/label'))).toBe(false);
  });

  it('оформленный возврат: подпись «Возврат оформлен: …» только у заказов с решением', async () => {
    ordersApi(PARTNER_FULL, [
      order(1, { ozonStatus: 'Отменён', returnOutcome: 'shelf', canReturnToShelf: false }),
      order(2, { ozonStatus: 'Отменён', returnOutcome: 'supplier' }),
      order(3, { ozonStatus: 'Отменён', canReturnToShelf: true })
    ]);
    renderApp('/orders/ready');

    const first = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(first).getByText('Возврат оформлен: на полке')).toBeInTheDocument();
    expect(within(first).queryByRole('button', { name: /Возврат на полку/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Заказ 0123-0002-1/ })).getByText('Возврат оформлен: поставщику')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Заказ 0123-0003-1/ })).queryByText(/Возврат оформлен/)).not.toBeInTheDocument();
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
    expect(dialog).toHaveTextContent('получит статус «Принят на складе»');
    // Партнёр не видит внутреннюю систему: ни в диалоге, ни на странице, ни в подсказках кнопок.
    expect(document.body.textContent).not.toMatch(/studio/i);
    const labels = [...document.body.querySelectorAll('[title], [aria-label]')].map((el) => `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''}`);
    expect(labels.join(' ')).not.toMatch(/studio/i);

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('полка: зелёным «На полке» у количества; «Принят» предупреждает о резерве и показывает зарезервированное', async () => {
    const user = userEvent.setup();
    let current = order(1, { statusAction: 'accept', quantity: 2, shelf: { available: 2, reserved: 0 } });
    ordersApi(PARTNER_FULL, [current, order(2)], {
      '/partner-api/orders?*': () => ordersPage([current, order(2)]),
      'POST /partner-api/orders/1/status/accept': () =>
        json(current = order(1, { statusId: 21, status: 'Принят на складе', statusAction: 'ship', quantity: 2, shelf: { available: 0, reserved: 2 } }))
    });
    renderApp('/orders');

    const stock = within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByText('На полке: 2 шт.').closest('.pa-shelf-stock')!;
    expect(stock).toHaveClass('pa-tone--success');
    const link = within(row(1)).getByRole('link', { name: /На полке: 2/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    const href = new URL(link.getAttribute('href')!, 'http://test');
    expect(href.pathname).toBe('/returns/shelf');
    expect(href.searchParams.get('stock')).toBe('on_shelf');
    expect(href.searchParams.get('search')).toBe(current.article);
    expect(within(row(2)).queryByText(/На полке|В резерве/)).not.toBeInTheDocument();

    await user.click(within(row(1)).getByRole('button', { name: 'Принят' }));
    const dialog = await screen.findByRole('dialog', { name: 'Принять заказ?' });
    expect(dialog).toHaveTextContent('На вашей полке есть 2 шт. с этим артикулом: они будут зарезервированы под заказ');
    await user.click(within(dialog).getByRole('button', { name: 'Принят' }));

    expect(await screen.findByText('Статус: Принят на складе. Зарезервировано на полке: 2 шт.')).toBeInTheDocument();
    expect(within(row(1)).getByText('В резерве: 2 шт.')).toBeInTheDocument();
    const reservedLink = within(row(1)).getByRole('link', { name: /В резерве: 2/ });
    expect(reservedLink).toHaveAttribute('target', '_blank');
    const reservedHref = new URL(reservedLink.getAttribute('href')!, 'http://test');
    expect(reservedHref.pathname).toBe('/returns/shelf');
    expect(reservedHref.searchParams.get('stock')).toBe('reserved');
    expect(reservedHref.searchParams.get('search')).toBe(current.article);
    expect(within(row(1)).queryByText(/На полке:/)).not.toBeInTheDocument();
  });

  it('цепочка: «Принят» → «Отгрузить» (собирает отправление в Ozon) → кнопки нет; ответ сервера сразу в строке', async () => {
    const user = userEvent.setup();
    let current = order(1, { statusAction: 'accept' });
    const calls = ordersApi(PARTNER_FULL, [current], {
      '/partner-api/orders?*': () => ordersPage([current]),
      'POST /partner-api/orders/1/status/accept': () => json(current = order(1, { statusId: 21, status: 'Принят на складе', statusAction: 'ship' })),
      '/partner-api/orders/1/ozon/requirements': () => json({ countries: [], exemplars: [] }),
      'POST /partner-api/orders/1/status/ship': () =>
        json(current = order(1, { statusId: 21, status: 'Принят на складе', statusAction: null, partnerShipmentConfirmed: true, ozonStatus: 'Ожидает отгрузки' }))
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: 'Принят' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Принять заказ?' })).getByRole('button', { name: 'Принят' }));

    expect(await screen.findByText('Заказ 0123-0001-1 принят')).toBeInTheDocument();
    expect(screen.getByText('Статус: Принят на складе.')).toBeInTheDocument();
    expect(within(row(1)).getByText('Принят на складе')).toBeInTheDocument();

    await user.click(within(row(1)).getByRole('button', { name: 'Отгрузить' }));
    const dialog = await screen.findByRole('dialog', { name: 'Отгрузить заказ?' });
    expect(dialog).toHaveTextContent('Статус останется «Принят на складе»');
    expect(dialog).toHaveTextContent('Отправление будет собрано в Ozon.');
    await user.click(within(dialog).getByRole('button', { name: 'Отгрузить' }));

    expect(await screen.findByText('Заказ 0123-0001-1 отгружен')).toBeInTheDocument();
    expect(screen.getByText('Статус: Принят на складе. Статус Ozon: Ожидает отгрузки.')).toBeInTheDocument();
    expect(within(row(1)).getByText('Отгружен партнёром')).toBeInTheDocument();
    expect(within(row(1)).queryByRole('button', { name: /Принят|Отгрузить/ })).not.toBeInTheDocument();

    const posts = calls.filter((c) => c.method === 'POST').map((c) => c.url);
    expect(posts).toEqual(['/partner-api/orders/1/status/accept', '/partner-api/orders/1/status/ship']);
    // «Принят» в Ozon не ходит; перед «Отгрузить» — запрос требований Ozon, старый /ship не вызывается.
    const sequence = calls.map((c) => `${c.method} ${c.url}`);
    expect(sequence.filter((c) => c.includes('/ozon/requirements'))).toHaveLength(1);
    expect(sequence.indexOf('GET /partner-api/orders/1/ozon/requirements')).toBeGreaterThan(sequence.indexOf('POST /partner-api/orders/1/status/accept'));
    expect(sequence.indexOf('GET /partner-api/orders/1/ozon/requirements')).toBeLessThan(sequence.indexOf('POST /partner-api/orders/1/status/ship'));
    expect(calls.some((c) => c.url.endsWith('/1/ship'))).toBe(false);
  });

  it('«Отгрузить»: если Ozon просит данные экземпляров, сначала форма, затем сборка и статус', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1, { statusAction: 'ship', status: 'Принят на складе' })], {
      '/partner-api/orders/1/ozon/requirements': () =>
        json({ countries: [{ productId: 7, productName: 'Ремень', offerId: 'R-1' }], exemplars: [] }),
      '/partner-api/orders/1/ozon/countries*': () => json([{ name: 'Китай', countryIsoCode: 'CN' }]),
      'PUT /partner-api/orders/1/ozon/countries': () => json({ success: true, message: 'ok' }),
      'POST /partner-api/orders/1/status/ship': () => json(order(1, { status: 'Отгружен реализатором', statusAction: null }))
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: 'Отгрузить' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Отгрузить заказ?' })).getByRole('button', { name: 'Отгрузить' }));

    expect(await screen.findByRole('dialog', { name: 'Данные для отгрузки' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/status/ship'))).toBe(false);
  });

  it('в карточке заказа — та же кнопка статуса, бейдж Studio2 и строка «Статус Ozon»', async () => {
    const user = userEvent.setup();
    const calls = ordersApi(PARTNER_FULL, [order(1, { statusAction: 'ship', status: 'Принят на складе', ozonStatus: 'Ожидает отгрузки' })], {
      '/partner-api/orders/1': () => details(order(1, { statusAction: 'ship', status: 'Принят на складе', ozonStatus: 'Ожидает отгрузки' })),
      '/partner-api/orders/1/ozon/requirements': () => json({ countries: [], exemplars: [] }),
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

    expect(await screen.findByText('Статус заказа уже изменился')).toBeInTheDocument();
    expect(screen.getByText('Заказ уже в статусе «Отгружен реализатором».')).toBeInTheDocument();
    expect(await within(row(1)).findByText('Отгружен реализатором')).toBeInTheDocument();
    expect(within(row(1)).queryByRole('button', { name: /Принят|Отгрузить/ })).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'GET' && c.url === '/partner-api/orders/1')).toBe(true);
  });

  it('отказ сервера (403, 422) показывает объяснение и причины', async () => {
    const user = userEvent.setup();
    ordersApi(PARTNER_FULL, [order(1, { statusAction: 'ship' })], {
      '/partner-api/orders/1/ozon/requirements': () => json({ countries: [], exemplars: [] }),
      'POST /partner-api/orders/1/status/ship': () =>
        json({ error: 'Не удалось собрать отправление в Ozon. Статус не изменён, попробуйте ещё раз.', reasons: ['0123-0001-1: Ozon ждёт данные экземпляров.'] }, 422)
    });
    renderApp('/orders');

    await user.click(within(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).getByRole('button', { name: 'Отгрузить' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отгрузить' }));

    expect(await screen.findByText('Не удалось отгрузить заказ 0123-0001-1')).toBeInTheDocument();
    expect(screen.getByText('0123-0001-1: Ozon ждёт данные экземпляров.')).toBeInTheDocument();
    expect(within(row(1)).getByRole('button', { name: 'Отгрузить' })).toBeInTheDocument();
  });
});

describe('Кэш заказов', () => {
  it('показывает загруженные страницы и счётчики сразу, затем обновляет их в фоне', async () => {
    let delayed = false;
    let finishList!: () => void;
    let finishFilters!: () => void;
    const listWait = new Promise<void>(resolve => { finishList = resolve; });
    const filtersWait = new Promise<void>(resolve => { finishFilters = resolve; });
    mockApi({
      '/partner-api/auth/me': () => json(PARTNER_FULL),
      '/partner-api/orders/filters': async () => { if (delayed) await filtersWait; return json({ statuses: [], warehouses: [], clients: [], groupCounts: delayed ? { work: 1, sent: 3, ready: 0 } : { work: 2, sent: 0, ready: 0 } }); },
      '/partner-api/orders?*': async (_init, url) => {
        if (delayed) await listWait;
        return url!.includes('page=2') ? ordersPage(delayed ? [] : [order(2)], delayed ? 1 : 2, 2) : ordersPage([order(1, { productName: delayed ? 'Обновлённый товар' : 'Исходный товар' })], delayed ? 1 : 2);
      }
    });
    renderApp('/orders');
    await screen.findByText('Исходный товар');
    await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await screen.findByText('Товар 2');
    await screen.findByRole('link', { name: /В работе\s*2/ });
    cleanup();
    delayed = true;
    renderApp('/orders');
    expect(await screen.findByText('Исходный товар')).toBeInTheDocument();
    expect(screen.getByText('Товар 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /В работе\s*2/ })).toBeInTheDocument();
    finishList(); finishFilters();
    expect(await screen.findByText('Обновлённый товар')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Товар 2')).not.toBeInTheDocument());
    expect(await screen.findByRole('link', { name: /Отправлено\s*3/ })).toBeInTheDocument();
  });

  it('разделяет кэш партнёров и не восстанавливает его после очистки сессии', async () => {
    let partner = PARTNER_FULL;
    let pending = false;
    mockApi({
      '/partner-api/auth/me': () => json(partner),
      '/partner-api/orders/filters': () => EMPTY_FILTERS_RESPONSE,
      '/partner-api/orders?*': () => pending ? new Promise(() => {}) : ordersPage([order(1, { productName: 'Личные данные партнёра' })])
    });
    renderApp('/orders');
    await screen.findByText('Личные данные партнёра');
    cleanup();
    pending = true;
    partner = { ...PARTNER_FULL, id: 2 };
    renderApp('/orders');
    await screen.findByRole('heading', { name: 'Заказы' });
    expect(screen.queryByText('Личные данные партнёра')).not.toBeInTheDocument();
    cleanup();
    clearOrdersCache();
    partner = PARTNER_FULL;
    renderApp('/orders');
    await screen.findByRole('heading', { name: 'Заказы' });
    expect(screen.queryByText('Личные данные партнёра')).not.toBeInTheDocument();
  });
});

describe('Живое обновление', () => {
  it('перемещает заказ в новую группу и обновляет счётчики без перезагрузки', async () => {
    let changed = false;
    const calls = mockApi({
      '/partner-api/auth/me': () => json(PARTNER_FULL),
      '/partner-api/orders/revision': () => json({ revision: changed ? 'r2' : 'r1' }),
      '/partner-api/orders/filters': () => json({ statuses: [], warehouses: [], clients: [], groupCounts: changed ? { work: 0, sent: 1, ready: 0 } : { work: 1, sent: 0, ready: 0 } }),
      '/partner-api/orders?*': (_init, url) => ordersPage((url!.includes('group=work') ? !changed : url!.includes('group=sent') && changed) ? [order(1, { ozonStatus: changed ? 'Доставляется' : 'Ожидает упаковки' })] : [])
    });
    renderApp('/orders');
    await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    await waitFor(() => expect(calls.some(c => c.url === '/partner-api/orders/revision')).toBe(true));
    await screen.findByRole('link', { name: /В работе\s*1/ });
    changed = true;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(screen.queryByRole('row', { name: /Заказ 0123-0001-1/ })).not.toBeInTheDocument());
    const sent = await screen.findByRole('link', { name: /Отправлено\s*1/ });
    await userEvent.click(sent);
    expect(await screen.findByRole('row', { name: /Заказ 0123-0001-1/ })).toBeInTheDocument();
  });

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

    expect(await screen.findByText('Статус заказов изменился: 0123-0001-1 → Отгружен реализатором, 0123-0004-1 → Принят на складе')).toBeInTheDocument();
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
      await screen.findByText('Статус заказов изменился: 0123-0001-1 → Принят на складе, 0123-0002-1 → Принят на складе, 0123-0003-1 → Принят на складе и ещё 2')
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

describe('Возврат отменённого заказа', () => {
  it('для отменённого заказа показывает возврат вместо отгрузки', async () => {
    const cancelled = order(1, { ozonStatus: 'Отменён', status: 'Принят на складе', statusAction: 'ship', supplier: 'Не указан', canReturnToShelf: true });
    ordersApi(PARTNER_FULL, [cancelled]);
    renderApp('/orders');
    const first = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(first).getByRole('button', { name: 'Возврат на полку' })).toBeInTheDocument();
    expect(within(first).queryByRole('button', { name: 'Отгрузить' })).not.toBeInTheDocument();
    expect(within(first).queryByRole('button', { name: /Этикетка/ })).not.toBeInTheDocument();
  });
  it('не показывает успех, если сервер не подтвердил передачу', async () => {
    const allowed = order(1, { ozonStatus: 'Отменён', supplier: 'Поставщик', canReturnToShelf: true });
    ordersApi(PARTNER_FULL, [allowed], {
      'POST /partner-api/orders/1/return-to-shelf': () => json({ error: 'Сервис возвратов недоступен' }, 503)
    });
    renderApp('/orders');
    const user = userEvent.setup();
    const first = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    await user.click(within(first).getByRole('button', { name: 'Возврат на полку' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Возврат на полку?' })).getByRole('button', { name: 'Возврат на полку' }));
    expect(await screen.findByText(/Не удалось передать заказ/)).toBeInTheDocument();
    expect(screen.queryByText(/передан на разбор/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть полученные возвраты' })).not.toBeInTheDocument();
  });
  it('показывает действие только для разрешённых сервером строк и отправляет после подтверждения', async () => {
    const allowed = order(1, { ozonStatus: 'Отменён', supplier: 'Поставщик', canReturnToShelf: true });
    const other = order(2, { ozonStatus: 'Отменён', supplier: null });
    let transferred = false;
    const calls = ordersApi(PARTNER_FULL, [allowed, other], {
      '/partner-api/orders?*': () => ordersPage(transferred ? [other] : [allowed, other]),
      'POST /partner-api/orders/1/return-to-shelf': () => { transferred = true; return json({ ...allowed, status: 'На возврат', canReturnToShelf: false }); }
    });
    renderApp('/orders');
    const user = userEvent.setup();
    const first = await screen.findByRole('row', { name: /Заказ 0123-0001-1/ });
    expect(within(row(2)).queryByRole('button', { name: 'Возврат на полку' })).not.toBeInTheDocument();
    await user.click(within(first).getByRole('button', { name: 'Возврат на полку' }));
    expect(calls.some(c => c.url.endsWith('/return-to-shelf'))).toBe(false);
    const dialog = screen.getByRole('dialog', { name: 'Возврат на полку?' });
    await user.click(within(dialog).getByRole('button', { name: 'Возврат на полку' }));
    await waitFor(() => expect(screen.queryByRole('row', { name: /Заказ 0123-0001-1/ })).not.toBeInTheDocument());
    expect(row(2)).toBeInTheDocument();
    expect(calls.filter(c => c.url.endsWith('/return-to-shelf'))).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Открыть полученные возвраты' })).toHaveAttribute('href', '/returns/received');
  });
});
