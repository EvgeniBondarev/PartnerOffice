import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: ReactNode;
}

/**
 * Подсказка рендерится в body, а не в ячейке таблицы: прокручиваемый контейнер
 * не обрезает её. Позиция ограничивается границами окна.
 */
export function Tooltip({ text, children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, placement: 'top' as 'top' | 'bottom' });

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(272, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
    // У верхнего края выводим вниз, в остальных случаях — вверх, как в брендбуке.
    const placement = rect.top < 96 ? 'bottom' : 'top';
    setPosition({ left, top: placement === 'top' ? rect.top - 8 : rect.bottom + 8, placement });
  }, []);

  const show = () => {
    updatePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const refresh = () => updatePosition();
    window.addEventListener('resize', refresh);
    // capture ловит прокрутку также во вложенной таблице.
    window.addEventListener('scroll', refresh, true);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <span ref={triggerRef} className="pa-action-hint" role="img" aria-label={text} tabIndex={0} onMouseEnter={show} onMouseLeave={() => setOpen(false)} onFocus={show} onBlur={() => setOpen(false)}>
        {children}
      </span>
      {open &&
        createPortal(
          <span
            className={`pa-floating-tooltip po-tooltip__tooltip po-tooltip__size-400 pa-floating-tooltip--${position.placement}`}
            role="tooltip"
            style={{ left: position.left, top: position.top, width: Math.min(272, window.innerWidth - 24) }}
          >
            <span className="tippy-box" data-theme="primary"><span className="tippy-content">{text}</span></span>
          </span>,
          document.body
        )}
    </>
  );
}
