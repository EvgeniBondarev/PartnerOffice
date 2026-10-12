import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { OrderListItem } from '../api/orders';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Informer } from '../ui/Informer';
import { Lightbox } from '../ui/Lightbox';
import { ozonImage } from '../lib/images';
import { OrderDrawer } from './OrderDrawer';
import { OrdersTable } from './OrdersTable';
import { OrdersToolbar } from './OrdersToolbar';
import { EMPTY_FILTERS, hasActiveFilters, PAGE_SIZE, readFilters, toQuery, writeParams, type OrderFilterState } from './params';
import { useOrderFilters, useOrders } from './useOrdersData';
import { useOrderActions, type Notice } from './useOrderActions';

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

  const [draft, setDraft] = useState<OrderFilterState>(applied);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [image, setImage] = useState<{ url: string; alt: string } | null>(null);

  // «Назад» и «Вперёд» в браузере меняют адрес: поля фильтров подстраиваются под него.
  useEffect(() => setDraft(applied), [applied]);

  const filterOptions = useOrderFilters();
  const orders = useOrders(toQuery(applied), PAGE_SIZE);

  const actions = useOrderActions({
    onNotice: setNotice,
    onChanged: (id) => {
      void orders.refreshOrder(id);
      setRefreshKey((value) => value + 1);
    }
  });

  const apply = () => setParams(writeParams(draft));
  const reset = () => {
    setDraft(EMPTY_FILTERS);
    setParams(writeParams(EMPTY_FILTERS));
  };

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

  return (
    <div className="pa-orders">
      <h1 className="po-page__title">Заказы</h1>

      <OrdersToolbar draft={draft} filters={filterOptions} onChange={setDraft} onApply={apply} onReset={reset} busy={false} />

      {notice && (
        <div className="pa-notice">
          <Informer
            kind={notice.kind}
            title={notice.title}
            reasons={notice.reasons}
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
        <EmptyState icon="?" title={filtered ? 'Ничего не найдено' : 'Заказов пока нет'}>
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
