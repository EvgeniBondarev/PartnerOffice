import { useSyncExternalStore } from 'react';

/** Совпадает ли окно с медиазапросом, и обновляется при его изменении. Без matchMedia (тесты, старые окружения) — fallback. */
export function useMediaQuery(query: string, fallback = true): boolean {
  const subscribe = (notify: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
    const list = window.matchMedia(query);
    list.addEventListener('change', notify);
    return () => list.removeEventListener('change', notify);
  };
  const snapshot = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, snapshot, () => fallback);
}
