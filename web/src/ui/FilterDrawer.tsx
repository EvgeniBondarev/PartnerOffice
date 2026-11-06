import type { ReactNode } from 'react';
import { Button } from './Button';
import { Overlay } from './Overlay';

/**
 * Панель фильтров на узком экране: справа на планшете, шторкой снизу на телефоне. Esc закрывает, фокус возвращается на кнопку «Фильтры».
 * Фильтры меняют список сразу, поэтому кнопка внизу только закрывает шторку и показывает, сколько всего найдено.
 */
export function FilterDrawer({ sheet, resultLabel, onClose, children }: { sheet: boolean; resultLabel: string; onClose: () => void; children: ReactNode }) {
  return (
    <Overlay kind="drawer" placement={sheet ? 'bottom' : 'right'} title="Фильтры" width={sheet ? undefined : 360} onClose={onClose}
      footer={<Button fill onClick={onClose}>{resultLabel}</Button>}>
      {children}
    </Overlay>
  );
}
