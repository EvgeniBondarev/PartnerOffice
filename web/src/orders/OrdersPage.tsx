import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { getOrdersRevision, type OrderGroup, type OrderListItem } from '../api/orders';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Informer } from '../ui/Informer';
import { Lightbox } from '../ui/Lightbox';
import { Skeleton } from '../ui/Skeleton';
import { ozonImage } from '../lib/images';
import emptyOrdersIllustration from '../assets/illustrations/orders-empty.webp';
import labelUnavailableIllustration from '../assets/illustrations/label-unavailable.webp';
import labelReadyIllustration from '../assets/illustrations/label-ready.webp';
import labelPrintErrorIllustration from '../assets/illustrations/label-print-error.webp';
import { OrderDrawer } from './OrderDrawer';
import { OrdersTable } from './OrdersTable';
import { OrdersSearch } from './OrdersSearch';
import { EMPTY_FILTERS, hasActiveFilters, PAGE_SIZE, readFilters, toQuery, writeParams, type OrderFilterState } from './params';
import { DateFilterSection, FilterPanel } from '../ui/FilterPanel';
import { FilterLayout } from '../ui/FilterLayout';
import { FilterSection } from '../ui/FilterSection';
import { CheckboxGroup } from '../ui/CheckboxGroup';
import { splitList, toggleValue } from '../lib/multi';
import type { FilterChip } from '../ui/FilterChips';
import { formatRange } from '../lib/format';
import { useOrderFilters, useOrders, type StatusChange } from './useOrdersData';
import { useOrderActions, type Notice } from './useOrderActions';
import { saveOrderSection } from './orderSection';

/** «1 заказ, 2 заказа, 5 заказов». */
const plural = (n: number) => {
  const tail = n % 100, last = n % 10;
  return tail >= 11 && tail <= 14 ? 'заказов' : last === 1 ? 'заказ' : last >= 2 && last <= 4 ? 'заказа' : 'заказов';
};

/** За сколько пикселей до конца списка начинаем подгружать следующую порцию. */
const LOAD_AHEAD_PX = 400;

/** Как часто спрашивать ревизию заказов: статус могут сменить в Studio2, пока страница открыта. */
const REVISION_POLL_MS = 15_000;

/** «Статус заказа изменился: 0123-0001-1 → Принят на складе, … и ещё 2». Откуда пришло изменение, партнёру не показываем. */
function statusChangeNotice(changes: StatusChange[]): Notice {
  const shown = changes.slice(0, 3).map(({ order }) => `${order.shipmentNumber ?? order.id} → ${order.status ?? '—'}`);
  const rest = changes.length - shown.length;
  return { kind: 'info', title: `${changes.length > 1 ? 'Статус заказов изменился' : 'Статус заказа изменился'}: ${shown.join(', ')}${rest > 0 ? ` и ещё ${rest}` : ''}` };
}

/**
 * Страница «Заказы» по шаблону брендбука: заголовок, фильтры, «Найдено: N», таблица.
 * Таблица прокручивается внутри страницы с закреплённой шапкой, заказы подгружаются по мере прокрутки.
 */
export function OrdersPage({ group }: { group: OrderGroup }) {
  useEffect(() => saveOrderSection(group), [group]);
  const { partner } = useAuth();
  const [params, setParams] = useSearchParams();
  const paramsKey = params.toString();
  const applied = useMemo(() => readFilters(new URLSearchParams(paramsKey)), [paramsKey]);

  const [searchDraft, setSearchDraft] = useState(applied.search);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [image, setImage] = useState<{ url: string; alt: string } | null>(null);

  // «Назад» и «Вперёд» в браузере меняют адрес: поля фильтров подстраиваются под него.
  useEffect(() => setSearchDraft(applied.search), [applied.search]);

  const [filtersKey, setFiltersKey] = useState(0);
  const filterOptions = useOrderFilters(partner?.id ?? 0, group, filtersKey);
  const orders = useOrders({ ...toQuery(applied), group }, PAGE_SIZE, partner?.id ?? 0);

  const actions = useOrderActions({
    onNotice: setNotice,
    onReturned: (id) => { orders.removeOrder(id); void orders.refreshQuietly(); },
    onChanged: (id) => {
      const previous = orders.items.find((item) => item.id === id);
      void orders.refreshOrder(id).then((updated) => {
        if (updated && previous && updated.ozonStatus !== previous.ozonStatus) void orders.refreshQuietly();
      });
      setRefreshKey((value) => value + 1);
      setFiltersKey((value) => value + 1);
    },
    onUpdated: (order) => {
      const previous = orders.items.find((item) => item.id === order.id);
      orders.replaceOrder(order);
      if (previous && previous.ozonStatus !== order.ozonStatus) void orders.refreshQuietly();
      setRefreshKey((value) => value + 1);
      setFiltersKey((value) => value + 1);
    }
  });

  // Живое обновление: статус могут сменить в Studio2. Раз в 15 с и при возврате на вкладку спрашиваем ревизию;
  // если она сменилась — тихо перечитываем загруженные порции (без скелетона, прокрутка на месте) и счётчики фильтра.
  const refreshQuietly = orders.refreshQuietly;
  const busyRef = useRef(actions.busy);
  busyRef.current = actions.busy;
  const revision = useRef<string | null>(null);
  useEffect(() => {
    let controller = new AbortController();
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState === 'hidden' || busyRef.current) return;
      checking = true;
      controller = new AbortController();
      try {
        const { revision: next } = await getOrdersRevision(controller.signal);
        const previous = revision.current;
        if (!next || next === previous) return;
        if (previous === null) {
          revision.current = next; // первый ответ: список только что загружен, перечитывать нечего
          return;
        }
        const changes = await refreshQuietly();
        if (changes === null) return; // не удалось или ответ устарел: ревизию не запоминаем, повторим на следующем опросе
        revision.current = next;
        setFiltersKey((value) => value + 1);
        setRefreshKey((value) => value + 1);
        if (changes.length > 0) setNotice(statusChangeNotice(changes));
      } catch {
        // Старый сервер без ревизии или сеть моргнула: список просто не обновляется сам.
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), REVISION_POLL_MS);
    const onWake = () => void check();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      controller.abort();
    };
  }, [refreshQuietly]);

  // Поиск и фильтры панели применяются сразу, без «Найти»; «Очистить всё» поиск не трогает.
  const applySearch = useCallback((search: string) => setParams(writeParams({ ...applied, search })), [applied, setParams]);
  const pick = (patch: Partial<OrderFilterState>) => setParams(writeParams({ ...applied, ...patch }));
  const clearFilters = () => setParams(writeParams({ ...EMPTY_FILTERS, search: applied.search }));
  const activeCount = [applied.statusId, applied.warehouseId, applied.clientId, applied.supplierId, applied.from || applied.to].filter(Boolean).length;
  const nameOf = (items: Array<{ id: number; name: string }> | undefined, id: string) => items?.find((item) => String(item.id) === id)?.name ?? id;
  const valueChips = (id: 'statusId' | 'warehouseId' | 'clientId' | 'supplierId', title: string, name: (value: string) => string): FilterChip[] =>
    splitList(applied[id]).map((value) => ({ id: `${id}:${value}`, label: `${title}: ${name(value)}`, onRemove: () => pick({ [id]: toggleValue(applied[id], value) }) }));
  const chips: FilterChip[] = [
    ...valueChips('statusId', 'Статус', (value) => nameOf(filterOptions?.statuses, value)),
    ...valueChips('warehouseId', 'Склад', (value) => nameOf(filterOptions?.warehouses, value)),
    ...valueChips('clientId', 'Клиент', (value) => nameOf(filterOptions?.clients, value)),
    ...valueChips('supplierId', 'Поставщик', (value) => nameOf(filterOptions?.suppliers, value)),
    ...(applied.from || applied.to ? [{ id: 'date', label: `Дата заказа: ${formatRange(applied.from, applied.to)}`, onRemove: () => pick({ from: '', to: '' }) }] : [])
  ];
  const toRadio = (items: Array<{ id: number; name: string }> = []) => items.map((item) => ({ value: String(item.id), label: item.name }));
  const renderPanel = (hideTitle: boolean) => (
    <FilterPanel activeCount={activeCount} hideTitle={hideTitle} onClear={clearFilters}>
      {(filterOptions?.statuses.length ?? 0) > 0 && (
        <FilterSection title="Статус" active={!!applied.statusId}>
          <CheckboxGroup
            value={applied.statusId}
            options={(filterOptions?.statuses ?? []).map((item) => ({ value: String(item.id), label: item.name, count: item.count }))}
            onChange={(statusId) => pick({ statusId })}
          />
        </FilterSection>
      )}
      {(filterOptions?.warehouses.length ?? 0) > 0 && (
        <FilterSection title="Склад" active={!!applied.warehouseId}>
          <CheckboxGroup value={applied.warehouseId} options={toRadio(filterOptions?.warehouses)} onChange={(warehouseId) => pick({ warehouseId })} />
        </FilterSection>
      )}
      {(filterOptions?.clients.length ?? 0) > 0 && (
        <FilterSection title="Клиент" active={!!applied.clientId}>
          <CheckboxGroup value={applied.clientId} options={toRadio(filterOptions?.clients)} onChange={(clientId) => pick({ clientId })} />
        </FilterSection>
      )}
      {(filterOptions?.suppliers?.length ?? 0) > 0 && (
        <FilterSection title="Поставщик" active={!!applied.supplierId}>
          <CheckboxGroup value={applied.supplierId} options={toRadio(filterOptions?.suppliers)} onChange={(supplierId) => pick({ supplierId })} />
        </FilterSection>
      )}
      <DateFilterSection title="Дата заказа" from={applied.from} to={applied.to} onChange={(from, to) => pick({ from, to })} />
    </FilterPanel>
  );

  // Подгрузка при прокрутке: следим за меткой в конце списка внутри прокручиваемой области.
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observable = typeof IntersectionObserver !== 'undefined';
  const { loadMore, hasMore, items } = orders;

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!observable || !root || !sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root, rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px` }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // items.length в зависимостях: после каждой порции метку нужно проверить заново (она могла остаться на виду).
  }, [observable, hasMore, loadMore, items.length]);

  const opened = openedId === null ? null : items.find((item) => item.id === openedId) ?? null;
  const filtered = hasActiveFilters(applied);
  const empty = !orders.loading && !orders.error && items.length === 0;
  const noticeIllustration = (item: Notice) => {
    if (item.title.startsWith('Этикетка заказа') && item.title.endsWith('готова')) return labelReadyIllustration;
    if (!item.title.startsWith('Не удалось получить этикетку')) return undefined;
    const details = [item.text, ...(item.reasons ?? [])].join(' ').toLowerCase();
    return /передан.*доставк|доставляется|больше не выда/.test(details) ? labelUnavailableIllustration : labelPrintErrorIllustration;
  };

  return (
    <div className="pa-orders pa-list">
      <FilterLayout
        heading={<h1 className="po-page__title">Заказы</h1>}
        top={<div className="pa-list__topbar">
          <nav className="po-tabs__tabs po-tabs__size-500 po-tabs__hug po-tabs__underline pa-returns__tabs" aria-label="Разделы заказов">
            {([['work', '/orders', 'В работе'], ['sent', '/orders/sent', 'Отправлено'], ['ready', '/orders/ready', 'Готовые']] as const).map(([key, path, label]) =>
              <NavLink key={key} to={{ pathname: path, search: paramsKey ? `?${paramsKey}` : '' }} onClick={() => saveOrderSection(key)} end className="po-tab__tab">
                {({ isActive }) => <div className={`po-data-cell__dataCell po-tab-content__tabContent po-tab-content__size-500${isActive ? ' po-tab-content__active' : ''}`} style={{ '--columns': '1fr' } as CSSProperties}>
                  <div className="po-data-cell__content"><div className="po-data-content__dataContent po-data-content__size-500"><div className="po-data-content__label po-data-content__label-size-500 ozi-table-500">{label}{filterOptions?.groupCounts && <span className="pa-returns__tab-count">{filterOptions.groupCounts[key].toLocaleString('ru-RU')}</span>}</div></div></div>
                </div>}
              </NavLink>)}
          </nav>
          <OrdersSearch group={group} value={searchDraft} onValueChange={setSearchDraft} applied={applied.search} onApply={applySearch} />
        </div>}
        panel={renderPanel}
        chips={chips}
        activeCount={activeCount}
        onClear={clearFilters}
        resultLabel={`Показать ${orders.total.toLocaleString('ru-RU')} ${plural(orders.total)}`}
      >

      {notice && (
        <div className="pa-notice">
          <Informer
            kind={notice.kind}
            title={notice.title}
            reasons={notice.reasons}
            illustration={noticeIllustration(notice)}
            onClose={() => setNotice(null)}
            action={
              notice.link && (
                <a className="pa-link-inline" href={notice.link.href} target="_blank" rel="noopener noreferrer" download={notice.link.download}>
                  {notice.link.label}
                </a>
              )
            }
          >
            {notice.text}
          </Informer>
        </div>
      )}

      {orders.error && (
        <div className="pa-notice">
          <Informer
            kind="error"
            title="Не удалось загрузить заказы"
            action={
              <Button variant="action-secondary" size={400} onClick={orders.reload}>
                Повторить
              </Button>
            }
          >
            {orders.error}
          </Informer>
        </div>
      )}

      {orders.loading && !orders.error && (
        <div className="po-page__count" role="status" aria-label="Загружаем заказы">
          <Skeleton width={110} height={24} />
        </div>
      )}
      {!orders.loading && !orders.error && (
        <div className="po-page__count" aria-live="polite">
          Найдено: {orders.total.toLocaleString('ru-RU')}
        </div>
      )}

      {empty ? (
        <EmptyState illustration={emptyOrdersIllustration} title={filtered ? 'Ничего не найдено' : 'Заказов пока нет'}>
          {filtered ? 'Попробуйте выбрать другие фильтры или сбросить их.' : 'Заказы появятся здесь, когда владелец откроет вам доступ к ним.'}
        </EmptyState>
      ) : (
        !orders.error && (
          <div className="pa-scroll pa-scroll--orders" ref={scrollRef} tabIndex={0} role="region" aria-label="Таблица заказов">
            <OrdersTable
              items={items}
              loading={orders.loading}
              loadingMore={orders.loadingMore}
              partner={partner}
              busy={actions.busy}
              onOpen={(order: OrderListItem) => setOpenedId(order.id)}
              onImage={setImage}
              onStatus={actions.requestStatus}
              onPrint={actions.requestPrint}
          onReturn={actions.requestReturn}
            />
            <div ref={sentinelRef} className="pa-scroll__end" aria-hidden="true" />
            {orders.moreError && (
              <div className="pa-scroll__footer">
                <Informer
                  kind="error"
                  action={
                    <Button variant="action-secondary" size={400} onClick={orders.loadMore}>
                      Повторить
                    </Button>
                  }
                >
                  {orders.moreError}
                </Informer>
              </div>
            )}
            {/* Запасной путь без автоподгрузки: клавиатура, старые браузеры. Обычно до этой кнопки не доходят. */}
            {hasMore && !orders.loadingMore && !orders.moreError && !orders.loading && (
              <div className="pa-scroll__footer">
                <Button variant="secondary" size={400} onClick={orders.loadMore}>
                  Показать ещё
                </Button>
              </div>
            )}
            {!hasMore && !orders.loading && items.length > 0 && (
              <div className="pa-scroll__footer pa-muted" role="status">
                Показаны все заказы: {items.length.toLocaleString('ru-RU')}
              </div>
            )}
          </div>
        )
      )}

      </FilterLayout>

      {opened && (
        <OrderDrawer
          order={opened}
          partner={partner}
          refreshKey={refreshKey}
          busy={actions.busy}
          onClose={() => setOpenedId(null)}
          onImage={setImage}
          onStatus={actions.requestStatus}
          onPrint={actions.requestPrint}
          onReturn={actions.requestReturn}
        />
      )}

      {actions.dialogs}

      {image && <Lightbox src={ozonImage(image.url, 800) ?? image.url} fallbackSrc={image.url} alt={image.alt} onClose={() => setImage(null)} />}
    </div>
  );
}
