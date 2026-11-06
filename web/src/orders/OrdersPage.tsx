import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { OrderListItem } from '../api/orders';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Informer } from '../ui/Informer';
import { Lightbox } from '../ui/Lightbox';
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
import { useOrderFilters, useOrders } from './useOrdersData';
import { useOrderActions, type Notice } from './useOrderActions';

/** «1 заказ, 2 заказа, 5 заказов». */
const plural = (n: number) => {
  const tail = n % 100, last = n % 10;
  return tail >= 11 && tail <= 14 ? 'заказов' : last === 1 ? 'заказ' : last >= 2 && last <= 4 ? 'заказа' : 'заказов';
};

/** За сколько пикселей до конца списка начинаем подгружать следующую порцию. */
const LOAD_AHEAD_PX = 400;

/**
 * Страница «Заказы» по шаблону брендбука: заголовок, фильтры, «Найдено: N», таблица.
 * Таблица прокручивается внутри страницы с закреплённой шапкой, заказы подгружаются по мере прокрутки.
 */
export function OrdersPage() {
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

  const filterOptions = useOrderFilters();
  const orders = useOrders(toQuery(applied), PAGE_SIZE);

  const actions = useOrderActions({
    onNotice: setNotice,
    onChanged: (id) => {
      void orders.refreshOrder(id);
      setRefreshKey((value) => value + 1);
    }
  });

  // Поиск и фильтры панели применяются сразу, без «Найти»; «Очистить всё» поиск не трогает.
  const applySearch = useCallback((search: string) => setParams(writeParams({ ...applied, search })), [applied, setParams]);
  const pick = (patch: Partial<OrderFilterState>) => setParams(writeParams({ ...applied, ...patch }));
  const clearFilters = () => setParams(writeParams({ ...EMPTY_FILTERS, search: applied.search }));
  const activeCount = [applied.ozonStatus, applied.warehouseId, applied.clientId, applied.from || applied.to].filter(Boolean).length;
  const nameOf = (items: Array<{ id: number; name: string }> | undefined, id: string) => items?.find((item) => String(item.id) === id)?.name ?? id;
  const valueChips = (id: 'ozonStatus' | 'warehouseId' | 'clientId', title: string, name: (value: string) => string): FilterChip[] =>
    splitList(applied[id]).map((value) => ({ id: `${id}:${value}`, label: `${title}: ${name(value)}`, onRemove: () => pick({ [id]: toggleValue(applied[id], value) }) }));
  const chips: FilterChip[] = [
    ...valueChips('ozonStatus', 'Статус Ozon', (value) => value),
    ...valueChips('warehouseId', 'Склад', (value) => nameOf(filterOptions?.warehouses, value)),
    ...valueChips('clientId', 'Клиент', (value) => nameOf(filterOptions?.clients, value)),
    ...(applied.from || applied.to ? [{ id: 'date', label: `Дата заказа: ${formatRange(applied.from, applied.to)}`, onRemove: () => pick({ from: '', to: '' }) }] : [])
  ];
  const toRadio = (items: Array<{ id: number; name: string }> = []) => items.map((item) => ({ value: String(item.id), label: item.name }));
  const renderPanel = (hideTitle: boolean) => (
    <FilterPanel activeCount={activeCount} hideTitle={hideTitle} onClear={clearFilters}>
      <FilterSection title="Статус Ozon" active={!!applied.ozonStatus}>
        <CheckboxGroup value={applied.ozonStatus} options={(filterOptions?.ozonStatuses ?? []).map((name) => ({ value: name, label: name }))} onChange={(ozonStatus) => pick({ ozonStatus })} />
      </FilterSection>
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
        search={<OrdersSearch value={searchDraft} onValueChange={setSearchDraft} applied={applied.search} onApply={applySearch} />}
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
          <div className="pa-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label="Таблица заказов">
            <OrdersTable
              items={items}
              loading={orders.loading}
              loadingMore={orders.loadingMore}
              partner={partner}
              busy={actions.busy}
              onOpen={(order: OrderListItem) => setOpenedId(order.id)}
              onImage={setImage}
              onShip={actions.requestShip}
              onPrint={actions.requestPrint}
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
          onShip={actions.requestShip}
          onPrint={actions.requestPrint}
        />
      )}

      {actions.dialogs}

      {image && <Lightbox src={ozonImage(image.url, 800) ?? image.url} fallbackSrc={image.url} alt={image.alt} onClose={() => setImage(null)} />}
    </div>
  );
}
