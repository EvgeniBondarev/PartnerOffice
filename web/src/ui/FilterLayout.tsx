import { useEffect, useRef, useState, type MouseEventHandler, type ReactNode } from 'react';
import { FilterChips, type FilterChip } from './FilterChips';
import { FilterDrawer } from './FilterDrawer';
import { useElementWidth } from './useElementWidth';
import { useMediaQuery } from './useMediaQuery';

/** Панель слева (280px + зазор 24px) стоит, только если рядом с ней таблице хватает места: считаем по ширине самой страницы, а не окна,
 *  потому что развёрнутое меню забирает ещё 160px. Меньше — панель открывается по кнопке поверх; на телефоне шторкой снизу. */
export const PANEL_MIN_WIDTH = 1280;
const PANEL_MEDIA = '(min-width: 1200px)', PHONE_MEDIA = '(max-width: 767px)';

interface FilterLayoutProps {
  /** Заголовок страницы: в левой колонке над панелью. */
  heading: ReactNode;
  /** Во всю ширину над панелью и поиском (например, вкладки разделов). */
  top?: ReactNode;
  /** Поиск: в правой колонке над списком. Можно не задавать, если поиск стоит в `top`. */
  search?: ReactNode;
  /** Содержимое панели; в шторке и боковой панели заголовок «Фильтры» убирают. */
  panel: (hideTitle: boolean) => ReactNode;
  chips: FilterChip[];
  activeCount: number;
  onClear: () => void;
  /** Подпись кнопки шторки: «Показать 962 возврата». */
  resultLabel: string;
  /** Например, чтобы щелчок по фильтру не забирал фокус у поиска со сканера. */
  onMouseDown?: MouseEventHandler<HTMLElement>;
  children: ReactNode;
}

/**
 * Шаблон «список с панелью фильтров»: слева заголовок и панель, справа поиск, теги выбранного и список (children).
 * Общий для всех страниц со списками: ширина экрана, кнопка «Фильтры (N)», боковая панель и шторка решаются здесь.
 */
export function FilterLayout({ heading, top, search, panel, chips, activeCount, onClear, resultLabel, onMouseDown, children }: FilterLayoutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const wideWindow = useMediaQuery(PANEL_MEDIA), phone = useMediaQuery(PHONE_MEDIA, false);
  const docked = width === null ? wideWindow : width >= PANEL_MIN_WIDTH;
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { if (docked) setDrawerOpen(false); }, [docked]);
  return (
    <>
      {top && <div className="pa-list__top">{top}</div>}
      <div ref={ref} className={`pa-list__layout${docked ? ' pa-list__layout--panel' : ''}`}>
        <div className="pa-list__left">
          <div className="pa-list__heading">{heading}</div>
          {docked && <section className="pa-list__aside" aria-label="Фильтры" onMouseDown={onMouseDown}>{panel(false)}</section>}
        </div>
        <div className="pa-list__right">
          {search}
          <div className="pa-list__main">
            <div className="pa-list__bar" onMouseDown={onMouseDown}>
              {!docked && <button type="button" className="pa-list__filters-button ozi-body-500-true" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
                {activeCount > 0 ? `Фильтры (${activeCount})` : 'Фильтры'}
              </button>}
              <FilterChips chips={chips} onClear={onClear} />
            </div>
            {children}
          </div>
        </div>
      </div>
      {drawerOpen && !docked && <FilterDrawer sheet={phone} resultLabel={resultLabel} onClose={() => setDrawerOpen(false)}>{panel(true)}</FilterDrawer>}
    </>
  );
}
