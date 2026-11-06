import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type CopyFn = (value: string) => Promise<void>;
const CopyContext = createContext<CopyFn | null>(null);

/** Копирует в буфер; если браузер не даёт Clipboard API (http, старые версии), пробует через скрытое поле. */
async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(field);
      field.select();
      const done = document.execCommand('copy');
      field.remove();
      return done;
    } catch {
      return false;
    }
  }
}

/** Одно уведомление «Скопировано …» на всё приложение: кнопки копирования есть на каждой странице. */
export function CopyProvider({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback<CopyFn>(async (value) => {
    if (!(await writeClipboard(value))) return;
    setCopied(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 2600);
  }, []);
  return (
    <CopyContext.Provider value={copy}>
      {children}
      {copied && <div className="pa-copy-toast" role="status"><span aria-hidden="true">✓</span> Скопировано {copied}</div>}
    </CopyContext.Provider>
  );
}

/**
 * Значение с кнопкой копирования, которая появляется при наведении или фокусе (на сенсорных экранах видна всегда).
 * Для артикулов, номеров отправлений, кодов этикеток, трек-номеров и т.п. Без значения рисует только содержимое.
 */
export function CopyValue({ value, label, children }: { value: string | null | undefined; /** Что копируется, для скринридера: «номер отправления». */ label?: string; children?: ReactNode }) {
  const copy = useContext(CopyContext);
  const text = value?.trim();
  return (
    <span className="pa-copy-value">
      {children ?? value}
      {text && (
        <button
          type="button"
          className="pa-copy-value__button"
          onClick={(event) => { event.stopPropagation(); void (copy ? copy(text) : writeClipboard(text)); }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={`Скопировать${label ? ` ${label}` : ''} ${text}`}
          title="Скопировать"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 10c0-4.941 1.059-6 6-6s6 1.059 6 6-1.059 6-6 6-6-1.059-6-6"/><path fill="currentColor" d="M10 17c-.5 0-1 .5-1 1 0 2 3.898 2 5 2 4.941 0 6-1.059 6-6 0-1.102 0-5-2-5-.53.042-1 .5-1 1 0 5.5-1.5 7-7 7"/></svg>
        </button>
      )}
    </span>
  );
}
