import { useLayoutEffect, useState, type RefObject } from 'react';

/** Ширина элемента в px, следит за изменением. null, пока не измерена или нет ResizeObserver (тесты). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
