import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useModal } from './Overlay';

interface LightboxProps {
  /** Крупная картинка. */
  src: string;
  /** Запасной адрес (оригинал), если уменьшенная версия не загрузилась. */
  fallbackSrc?: string;
  alt: string;
  onClose: () => void;
}

/**
 * Просмотр картинки поверх страницы: затемнение, картинка по центру, большой крестик справа сверху.
 * Закрывается Esc, кликом по затемнению или по картинке.
 */
export function Lightbox({ src, fallbackSrc, alt, onClose }: LightboxProps) {
  const windowRef = useModal(onClose);
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return createPortal(
    <>
      <div className="po-backdrop__backdrop pa-lightbox__backdrop" onMouseDown={onClose} aria-hidden="true" />
      <div className="po-window__root pa-overlay__root pa-lightbox__root" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div ref={windowRef} className="po-window__window po-dialog__dialog po-dialog__size-500 po-dialog__hasNoPaddingTop pa-lightbox" role="dialog" aria-modal="true" aria-label={`Фото: ${alt}`} tabIndex={-1}>
          {failed ? (
            <div className="pa-lightbox__failed">Изображение не подгрузилось</div>
          ) : (
            <img
              className="pa-lightbox__image"
              style={loaded ? undefined : { position: 'absolute', opacity: 0 }}
              src={current}
              alt={alt}
              onClick={onClose}
              onLoad={() => setLoaded(true)}
              onError={() => {
                if (fallbackSrc && current !== fallbackSrc) setCurrent(fallbackSrc);
                else setFailed(true);
              }}
            />
          )}
          {!failed && !loaded && <span className="pa-spinner pa-lightbox__spinner" role="status" aria-label="Загружаем фото" />}
          <button type="button" className="pa-lightbox__close" onClick={onClose} aria-label="Закрыть просмотр" title="Закрыть">
            <Icon name="ui-close" />
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
