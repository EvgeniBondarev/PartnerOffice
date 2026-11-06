import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Раздел панели фильтров: fieldset с legend, чтобы скринридер объявлял группу. Заголовок сворачивает раздел;
 * свёрнутый раздел с выбранным значением подсказывает об этом точкой, чтобы фильтр не терялся из виду.
 */
export function FilterSection({ title, active = false, defaultOpen = true, children }: { title: string; active?: boolean; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <fieldset className="pa-filter-section">
      <legend className="pa-filter-section__legend">
        <button type="button" className="pa-filter-section__toggle ozi-body-500-true" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
          <span>{title}</span>
          {!open && active && <span className="pa-filter-section__dot" role="img" aria-label="выбрано" />}
          <Icon name="ui-chevron-down" size={20} className={`pa-filter-section__chevron${open ? ' pa-filter-section__chevron--open' : ''}`} />
        </button>
      </legend>
      <div id={bodyId} className="pa-filter-section__body" hidden={!open}>{children}</div>
    </fieldset>
  );
}
