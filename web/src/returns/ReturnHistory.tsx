import { Fragment, useState, type ReactNode } from 'react';
import { Overlay } from '../ui/Overlay';

/** Событие истории позиции от сервиса возвратов: дата и что произошло. */
export interface ReturnEvent { when: string; kind: string; text: string }

/** FBS-сторона пары у коробки вывоза со стока (Ozon уложил наш возврат «На складе Ozon» в эту коробку). */
export interface ReturnPair {
  schema?: string | null; posting_number?: string | null; order_number?: string | null; barcode?: string | null;
  return_date?: string | null; reason?: string | null; status_name?: string | null; ozon_warehouse?: string | null;
  planned_place?: string | null; removal_id?: string | null; link?: 'unique' | 'queue' | string | null;
}

const SCHEMA_TITLE: Record<string, string> = {
  FBS: 'FBS — продажа с нашего склада',
  FBO: 'FBO — сток на складе Ozon',
  realFBS: 'realFBS — продажа с доставкой продавца',
};

/** Значок схемы: FBS, FBO, realFBS или пара «FBS → FBO» — возврат, который Ozon принял на сток и вывез коробкой. */
export function SchemaBadge({ schema }: { schema?: string[] | null }) {
  if (!schema?.length) return null;
  const pair = schema.length > 1;
  const title = pair
    ? `${schema[0]} → FBO: возврат ${schema[0]} Ozon принял на свой сток и вывез к вам коробкой. Одна штука, показана одной строкой`
    : SCHEMA_TITLE[schema[0]] ?? schema[0];
  return <span className={`pa-schema${pair ? ' pa-schema--pair' : ''}`} title={title} aria-label={`Схема: ${schema.join(' → ')}`}>
    {schema.map((name, i) => <Fragment key={name + i}>
      {i > 0 && <span className="pa-schema__arrow" aria-hidden="true">→</span>}
      <span className={`pa-schema__pill pa-schema__pill--${name.toLowerCase()}`}>{name}</span>
    </Fragment>)}
  </span>;
}

/** Разметка текста события: **жирный**, «статус», [[код]], {{место}} — без HTML из ответа. */
export function eventText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|«(.+?)»|\[\[(.+?)\]\]|\{\{(.+?)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = out.length;
    if (m[1] !== undefined) out.push(<b key={key}>{m[1]}</b>);
    else if (m[2] !== undefined) out.push(<span key={key} className="pa-hist__status">«{m[2]}»</span>);
    else if (m[3] !== undefined) out.push(<span key={key} className="pa-hist__code">{m[3]}</span>);
    else out.push(<span key={key} className="pa-hist__place">{m[4]}</span>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const KIND: Record<string, [string, string]> = {
  ozon: ['Ozon', 'Возврат в Ozon'],
  stock: ['Склад Ozon', 'Возврат лежит на складе Ozon'],
  fbo: ['FBO', 'Сток Ozon и вывоз коробкой'],
  us: ['У вас', 'Выдача, приёмка'],
  warn: ['Внимание', 'Не принят'],
};

const CLOCK = <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
  <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
  <path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
</svg>;

/** Кнопка «История позиции» (часы) и окно с хронологией: дата и что произошло, цвет — по источнику события. */
export function HistoryButton({ title, history, schema, posting, box }: {
  title: string; history?: ReturnEvent[] | null; schema?: string[] | null; posting?: string | null; box?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!history?.length) return null;
  const used = [...new Set(history.map(e => e.kind))].filter(k => KIND[k]);
  return <>
    <button type="button" className="pa-hist-btn" title="История позиции: что и когда с ней происходило" aria-label="История позиции" onClick={() => setOpen(true)}>{CLOCK}</button>
    {open && <Overlay kind="dialog" title="История позиции" width={760} onClose={() => setOpen(false)}>
      <div className="pa-hist">
        <div className="pa-hist__head">
          <div className="pa-hist__name">{title}</div>
          <div className="pa-hist__meta">
            <SchemaBadge schema={schema} />
            {posting && <span>отправление <span className="pa-hist__code">{posting}</span></span>}
            {box && <span>коробка <span className="pa-hist__code">{box}</span></span>}
          </div>
          <div className="pa-hist__legend">{used.map(k => <span key={k} className={`pa-hist__kind pa-hist--${k}`} title={KIND[k][1]}>{KIND[k][0]}</span>)}</div>
        </div>
        <div className="pa-hist__wrap">
          <table className="pa-hist__table">
            <thead><tr><th>№</th><th>Дата</th><th>Что произошло</th></tr></thead>
            <tbody>{history.map((e, i) => <tr key={i} className={`pa-hist--${KIND[e.kind] ? e.kind : 'ozon'}`}>
              <td className="pa-hist__n">{i + 1}</td>
              <td className="pa-hist__when"><span className="pa-hist__dot" aria-hidden="true" />{e.when}</td>
              <td className="pa-hist__what">{eventText(e.text)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="pa-sub">Время московское. Без времени — известен только день.</p>
      </div>
    </Overlay>}
  </>;
}
