#!/usr/bin/env python3
"""
Сборка брендбука PartnerOffice: design/brandbook/index.html.
Читает tokens/ozon-tokens.json, icons/icons.svg, components/ozon/typography.css и подставляет живые примеры компонентов.
Запуск из корня проекта:  python3 design/build/build_brandbook.py
"""
import json, re, html, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
tokens = json.load(open(f'{ROOT}/tokens/ozon-tokens.json'))
L, D, R = tokens['light'], tokens['dark'], tokens['root']
icons_svg = open(f'{ROOT}/icons/icons.svg').read()
typo_css = open(f'{ROOT}/components/ozon/typography.css').read()

# ---------- утилиты ----------
def esc(s): return html.escape(s, quote=True)

def hex8(v):
    """#rrggbbaa -> короткая строка для подписи"""
    v = v.strip()
    m = re.fullmatch(r'#([0-9a-fA-F]{8})', v)
    if m:
        rgb, a = m.group(1)[:6], int(m.group(1)[6:], 16)
        return f'#{rgb}' if a == 255 else f'#{rgb} · {round(a / 2.55)}%'
    return v

SYMBOLS = [i for i in re.findall(r'<symbol id="([^"]+)"', icons_svg) if not i.startswith('logo-')]  # логотип Ozon в брендбук не выводим

def ic(name, size=24, cls=''):
    return f'<svg class="po-icon {cls}" width="{size}" height="{size}" aria-hidden="true"><use href="#{name}"/></svg>'

def sw(var, label=None, light=None, dark=None, big=False):
    """образец цвета; var — имя CSS-переменной"""
    return (f'<div class="bb-sw{" bb-sw--big" if big else ""}"><div class="bb-sw__chip"><i style="background:var({var})"></i></div>'
            f'<div class="bb-sw__meta"><code>{esc(var)}</code><span>{esc(hex8(light or ""))}</span></div></div>')

# ---------- компоненты (разметка как в оригинале) ----------
def btn(text, variant='primary', size=500, left=None, right=None, disabled=False, fill=False, only_icon=None):
    body_cls = {300: 'ozi-body-300-true', 400: 'ozi-body-400-true', 500: 'ozi-body-500-true', 600: 'ozi-body-600-true'}[size]
    c = ['po-button__button', f'po-button__size-{size}', body_cls, f'po-button__{variant}', 'po-button__fill' if fill else 'po-button__hug']
    if left or only_icon: c.append('po-button__hasLeftIcon')
    if right: c.append('po-button__hasRightIcon')
    if only_icon: c.append('po-button__noContent')
    if disabled: c.append('po-button__disabled')
    inner = ''
    if only_icon: inner = ic(only_icon)
    else:
        if left: inner += ic(left)
        inner += f'<div class="po-truncate__truncate po-button__text">{esc(text)}</div>'
        if right: inner += ic(right)
    return (f'<button class="{" ".join(c)}"{" disabled" if disabled else ""}><div class="po-button__overlay"></div>'
            f'<div class="po-button__content">{inner}</div></button>')

def field(label=None, value='', size=500, kind='input', state='', caption=None, left_icon=None, right_icon=None, placeholder='', active=False, error_cap=False):
    """поле ввода: kind = input | select | date | search"""
    st = {'error': 'po-input__containerIsError', 'success': 'po-input__containerIsSuccess', 'warning': 'po-input__containerIsWarning',
          'disabled': 'po-input__containerIsDisabled', 'readonly': 'po-input__containerIsReadonly'}.get(state, '')
    inside = bool(label) and size >= 500
    floated = inside and (value or active)
    root = ['po-input__root']
    if kind == 'select': root += ['po-input-select__inputSelect', 'po-input-select__root']
    cont = ['po-input__container', f'po-input__size-{size}', 'po-input__leftRadius', 'po-input__rightRadius', st]
    if active: cont.append('po-input__containerIsActive')
    ic_cls = ['po-input__inputContainer'] + (['po-input__withLabelInside'] if inside else [])
    tok = ['po-input__inputTokensContainer', f'po-input__size-{size}', 'po-input__singleline'] + (['po-input__withLabelInside'] if inside else [])
    inp = ['po-input__input', f'po-input__input-{size}', 'ozi-table-500'] + ([] if (value or not inside) else ['po-input__hidePlaceholder'])
    ro = ' readonly' if kind == 'select' else ''
    left = f'<div class="po-input-search__leftContent">{ic("ui-search", 24, "po-input-search__leftIcon po-input-search__icon")}</div>' if kind == 'search' else ''
    lab = ''
    if inside:
        lab = (f'<label class="po-truncate__truncate po-input__pointerEventsNone po-input__labelInside po-input__label po-input__size-{size} '
               f'po-input__labelText-{size} ozi-table-500{" po-input__labelTextFloated-%d" % size if floated else ""}">{esc(label)}</label>')
    right = ''
    if kind == 'select': right = f'<div class="po-input-select__rightContent">{ic("ui-chevron-updown", 24, "po-input-select__icon")}</div>'
    if kind == 'date': right = f'<div class="po-input-date__rightContent">{ic("nav-delivery" if False else "ui-calendar", 24, "po-input-date__icon")}</div>'
    if right_icon and kind not in ('select', 'date'): right = f'<div class="po-input__rightContent">{ic(right_icon)}</div>'
    cap = f'<div class="po-input__caption{" po-input__validityError" if error_cap else ""} ozi-body-400">{esc(caption)}</div>' if caption else ''
    ph = esc(placeholder if (placeholder or not inside) else '')
    return (f'<div class="{" ".join(root)}"><div class="{" ".join(x for x in cont if x)}">{left}<div class="{" ".join(ic_cls)}">'
            f'<div class="po-input__inputTokensWrapper"><div class="{" ".join(tok)}"><div class="po-input__beforeInputWrapper"></div>'
            f'<input class="{" ".join(inp)}"{ro} placeholder="{ph}" value="{esc(value)}"></div></div>{lab}</div>{right}</div>{cap}</div>')

def badge(text, kind='secondary info', size=500):
    k = kind.split()
    cls = ['po-badge__badge', f'po-badge__size-{size}', 'ozi-body-400-true'] + [f'po-badge__{x}' for x in k]
    return f'<div class="{" ".join(cls)}"><div class="po-badge__overlay"></div><div class="po-truncate__truncate po-badge__label">{esc(text)}</div></div>'

def counter(n, size=500, kind='primary'):
    return f'<div class="po-counter__counter po-counter__size-{size} ozi-label-300-true po-counter__{kind}"><div class="po-truncate__truncate">{n}</div></div>'

def checkbox(checked=False, disabled=False, label=''):
    cls = 'po-checkbox' + (' po-checkbox--checked' if checked else '')
    t = f'<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="{cls}"{" checked" if checked else ""}{" disabled" if disabled else ""}>'
    return t + (f'<span>{esc(label)}</span>' if label else '') + '</label>'

def toggle(label, checked=True):
    return (f'<label class="po-data-cell__dataCell po-toggle__container ozi-table-500 po-toggle__size-500 po-toggle__block{" po-toggle__checked" if checked else ""}" style="--columns: max-content 1fr;">'
            f'<div class="po-toggle__leftContent po-toggle__minHeight"><div class="po-toggle__wrapper"><input class="po-toggle__toggle" type="checkbox"{" checked" if checked else ""}><div class="po-toggle__togglePoint"></div></div></div>'
            f'<div class="po-data-cell__content"><div class="po-data-content__dataContent po-data-content__size-500"><div class="po-truncate__truncate po-data-content__label po-data-content__label-size-500 ozi-table-500">{esc(label)}</div></div></div></label>')

def tabs(items, active=0, size=500):
    out = f'<div class="po-tabs__tabs po-tabs__size-{size} po-tabs__hug po-tabs__underline">'
    for i, t in enumerate(items):
        out += (f'<button type="button" class="po-tab__tab"><div class="po-data-cell__dataCell po-tab-content__tabContent po-tab-content__size-{size}{" po-tab-content__active" if i == active else ""}" style="--columns: 1fr;">'
                f'<div class="po-data-cell__content"><div class="po-data-content__dataContent po-data-content__size-{size}"><div class="po-data-content__label po-data-content__label-size-{size} ozi-table-500">{esc(t)}</div></div></div></div></button>')
    return out + '</div>'

def chips(items, active=0, size=500):
    out = f'<div class="po-filter-chip-group__filterChipGroup po-filter-chip-group__size-{size}">'
    for i, t in enumerate(items):
        out += (f'<button type="button" class="po-filter-chip-base__filterChipBase po-filter-chip-base__size-{size} ozi-body-{size} po-filter-chip-base__toggle po-filter-chip-base__grouped{" po-filter-chip-base__filled" if i == active else ""}">'
                f'<div class="po-filter-chip-base__content" style="--grid-template-columns: 1fr;"><div class="po-truncate__truncate po-filter-chip-base__label">{esc(t)}</div></div></button>')
    return out + '</div>'

def informer(text, kind='info', size=500, line=True, bold=None):
    glyph = {'info': 'i', 'warning': '!', 'error': '!', 'success': '✓', 'alert': '!'}[kind]
    colr = {'info': 'var(--action-500)', 'warning': 'var(--warning-400)', 'error': 'var(--negative-500)', 'success': 'var(--success-400)', 'alert': 'var(--alert-400)'}[kind]
    ico = f'<span style="display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:{colr};color:#fff;font:700 18px/1 var(--global-font)">{glyph}</span>'
    return (f'<div class="po-informer__informer ozi-body-500 po-informer__size-{size} po-informer__{kind}{" po-informer__showAccentLine" if line else ""}">'
            f'<div class="po-data-cell__dataCell" style="--columns: max-content 1fr;">{ico}<div class="po-data-cell__content"><div class="po-data-content__dataContent po-data-content__size-{size}">'
            f'<div class="po-data-content__label po-data-content__label-size-{size} ozi-table-500">{text}</div></div></div></div></div>')

def avatar(size=400):
    return (f'<div class="po-avatar__container po-avatar__size-{size} ozi-body-300"><div class="po-avatar__statusMaskContainer"><div class="po-avatar__avatar po-avatar__counterMaskContainer">'
            f'{ic("ui-user", 16)}</div></div></div>')

def th(t, w=None, align='left'):
    return (f'<th class="po-table-cell-base__cell po-table-cell-base__th ozi-table-400-true po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__horizontal-align-{align} po-table-cell-base__bottomBorder"'
            + (f' style="width:{w}px"' if w else '') + f'>{t}</th>')

def td(inner, align='left'):
    return (f'<td class="po-table-cell-base__cell po-table-cell-base__td ozi-table-500 po-table-cell-base__size-500 po-table-cell-base__vertical-align-top po-table-cell-base__horizontal-align-{align} po-table-cell-base__bottomBorder">{inner}</td>')

def tr(cells, hover=True): return f'<tr class="po-table-row__row{" po-table-row__hoverable po-table-row__pointer" if hover else ""}">{"".join(cells)}</tr>'

def skeleton(w, h, r=8): return f'<div class="po-skeleton-common__skeleton po-skeleton-common__rectangle" style="width:{w}px;height:{h}px;border-radius:{r}px"></div>'

def menu_item(icon, label, active=False, count=None, arrow=False):
    cols = 'max-content 1fr max-content' if (count or arrow) else 'max-content 1fr'
    extra = ''
    if count: extra = f'<div class="po-menu-item__block">{counter(count, 600, "primary")}</div>'
    if arrow: extra = f'<div class="po-menu-item__block">{ic("ui-menu-expand", 24)}</div>'
    return (f'<li class="po-menu-item__menuItem po-menu__item{" po-menu__item--active" if active else ""}"><button type="button" class="po-menu-item__button po-menu-item__roundHover" style="--level-scale: 0;">'
            f'<div class="po-data-cell__dataCell" style="--columns: {cols};"><div class="po-menu-item__block"><div class="po-menu__icon">{ic(icon)}</div></div>'
            f'<div class="po-data-cell__content"><div class="po-data-content__dataContent po-data-content__size-500"><div class="po-data-content__label po-data-content__label-size-500 ozi-table-500">{esc(label)}</div></div></div>{extra}</div></button></li>')

# ---------- данные ----------
RAMPS = ['neutral', 'action', 'success', 'alert', 'warning', 'negative', 'info', 'pro', 'econom']
STEPS = ['600', '500', '400', '300', '100', '50', '25', '100-opaque', '50-opaque', '25-opaque']
RAMP_NOTE = {
    'neutral': 'Тёмно-синий нейтральный: меню, подписи, рамки.', 'action': 'Основной синий: кнопки, ссылки, активные состояния.',
    'success': 'Успех, «Утверждено», выполненные шаги.', 'alert': 'Малиновый: счётчики, ошибки с высоким приоритетом, красные даты.',
    'warning': 'Предупреждения, важные новости.', 'negative': 'Ошибки, отмена, просрочка.', 'info': 'Нейтральная информация, бирюзовый бейдж.',
    'pro': 'Акцентные сущности (Pro).', 'econom': 'Акцентные сущности (Эконом).'}

def ramp_html(name):
    cells = ''
    for s in STEPS:
        v = f'--{name}-{s}'
        if v in R:
            cells += (f'<div class="bb-step"><i style="background:var({v})"></i><b>{s.replace("-opaque", " ·opq")}</b><span>{esc(hex8(R[v]))}</span></div>')
    return f'<div class="bb-ramp"><div class="bb-ramp__name"><b>{name}</b><span>{RAMP_NOTE.get(name, "")}</span></div><div class="bb-ramp__steps">{cells}</div></div>'

def sem_group(prefix, title, note=''):
    items = [k for k in L if k.startswith(prefix) and not k.startswith('--ozi-active') ]
    rows = ''
    for k in items:
        rows += (f'<tr><td><span class="bb-dot"><i style="background:var({k})"></i></span></td><td><code>{k}</code></td><td>{esc(hex8(L[k]))}</td>'
                 f'<td><span class="bb-dot bb-dot--dark"><i style="background:{D.get(k, L[k])}"></i></span></td><td>{esc(hex8(D.get(k, "")))}</td></tr>')
    return (f'<h4 class="bb-h4">{title}</h4><p class="bb-note">{note}</p><table class="bb-table"><thead><tr><th></th><th>Токен</th><th>Светлая</th><th></th><th>Тёмная</th></tr></thead><tbody>{rows}</tbody></table>')

def type_rows():
    """метрики типографики (px) из components/ozon/typography.css: класс, размер, строка, вес"""
    return [('heading-800', '40', '48', '700'), ('heading-700', '36', '44', '700'), ('heading-600', '32', '40', '700'), ('heading-500', '28', '36', '700'),
            ('heading-400', '26', '30', '700'), ('heading-350', '22', '26', '600'), ('heading-300', '19', '24', '600'), ('heading-200', '17', '22', '600'), ('heading-100', '15', '20', '600'),
            ('body-700', '19', '28', '400 / 600'), ('body-600', '17', '28', '400 / 600'), ('body-500', '15', '24', '400 / 600'), ('body-400', '13', '20', '400 / 600'), ('body-300', '11', '16', '400 / 600'),
            ('table-600', '17', '24', '400 / 600'), ('table-500', '15', '20', '400 / 600'), ('table-400', '13', '16', '400 / 600'), ('table-300', '11', '12', '400 / 600'),
            ('label-500', '15', '16', '400 / 600'), ('label-400', '13', '16', '400 / 600'), ('label-300', '11', '12', '400 / 600')]

SAMPLE = 'Заказы партнёров 0123456789'

# ---------- секции ----------
def section_cover():
    return f'''
<section id="intro" class="bb-sec">
  <div class="bb-eyebrow">PartnerOffice · версия 1.0 · 2026-10-12</div>
  <h1 class="bb-h1">Брендбук интерфейса</h1>
  <p class="bb-lead">Единый визуальный язык кабинета партнёров. Интерфейс повторяет привычный партнёрам рабочий инструмент «Турбо ПВЗ» (дизайн-система ozi): те же цвета, шрифт, сетка, формы, навигация и иконки, поэтому с PartnerOffice работают без обучения.</p>
  <div class="bb-cards">
    <div class="bb-card"><b>Принцип 1. Привычность</b><p>Партнёр видит те же отступы, цвета и порядок элементов, что в рабочем ПО Ozon. Не изобретаем свои контролы.</p></div>
    <div class="bb-card"><b>Принцип 2. Плотность и ясность</b><p>Таблицы и фильтры в первую очередь. Один синий акцент, остальное нейтральное. Цвет несёт смысл статуса.</p></div>
    <div class="bb-card"><b>Принцип 3. Токены, а не значения</b><p>Любой цвет, тень и непрозрачность берутся из <code>tokens/ozon-tokens.css</code>. Тёмная тема подключается классом <code>.theme-dark</code>.</p></div>
  </div>
  {informer('<b>Что заменить своим.</b> Логотип, название «Турбо ПВЗ», 3D-иллюстрации и рекламные баннеры принадлежат Ozon и в PartnerOffice не переносятся: в плитках и пустых состояниях стоят нейтральные заглушки.', 'warning')}
  <h3 class="bb-h3">Как подключить</h3>
  <pre class="bb-code">&lt;link rel="stylesheet" href="tokens/ozon-tokens.css"&gt;
&lt;link rel="stylesheet" href="components/base.css"&gt;      &lt;!-- шрифт Onest, сброс --&gt;
&lt;link rel="stylesheet" href="components/ozon/button.css"&gt;  &lt;!-- нужные компоненты --&gt;
&lt;link rel="stylesheet" href="components/layout.css"&gt;       &lt;!-- шапка, меню, страница --&gt;</pre>
  <ul class="bb-list">
    <li><b>Классы:</b> <code>po-имя__элемент</code> (BEM как в оригинале), типографика <code>ozi-body-500</code>, <code>ozi-heading-400</code>.</li>
    <li><b>Тема:</b> светлая по умолчанию (<code>:root</code>), тёмная — <code>.theme-dark</code> на контейнере.</li>
    <li><b>Иконки:</b> спрайт <code>icons/icons.svg</code>, <code>&lt;svg&gt;&lt;use href="#nav-claims"/&gt;&lt;/svg&gt;</code>, цвет — <code>currentColor</code>.</li>
    <li><b>Пересборка:</b> <code>python3 design/build/build_brandbook.py</code>.</li>
  </ul>
</section>'''

def section_colors():
    brand = [('--brand-primary-ozon-blue', 'Основной синий'), ('--brand-primary-ozon-magenta', 'Малиновый'), ('--brand-additional-morning-blue', 'Голубой'),
             ('--brand-additional-dark-space', 'Тёмный космос'), ('--brand-accent-green-grass', 'Зелёный'), ('--brand-accent-orange-star', 'Оранжевый'),
             ('--brand-fresh-ozon-fiji', 'Бирюзовый'), ('--brand-ozon-tech-tech-green', 'Тех-зелёный')]
    b = ''.join(f'<div class="bb-brand"><i style="background:var({k})"></i><b>{n}</b><code>{k}</code><span>{esc(R[k])}</span></div>' for k, n in brand)
    hues = ''
    for h in ['aqua', 'blue', 'green', 'magenta', 'orange', 'red', 'violet', 'yellow']:
        cells = ''.join(f'<div class="bb-step"><i style="background:var(--ozi-{h}-{s})"></i><b>{s}</b><span>{esc(hex8(L.get(f"--ozi-{h}-{s}", "")))}</span></div>' for s in ['25', '100', '200', '300', '400'] if f'--ozi-{h}-{s}' in L)
        hues += f'<div class="bb-ramp"><div class="bb-ramp__name"><b>{h}</b></div><div class="bb-ramp__steps">{cells}</div></div>'
    return f'''
<section id="colors" class="bb-sec">
  <h2 class="bb-h2">1. Цвет</h2>
  <p class="bb-lead">Палитра построена на одном основном синем и нейтральных серо-синих. Статусы: зелёный — успех, жёлтый — предупреждение, красный/малиновый — ошибка и срочное. Фон приложения белый, а блоки отделяются полупрозрачной подложкой (<code>--ozi-layer-surface-transparent</code>).</p>
  <h3 class="bb-h3">Бренд</h3><div class="bb-brands">{b}</div>
  <h3 class="bb-h3">Применение</h3>
  <div class="bb-usage">
    <div><i style="background:var(--action-500)"></i><b>Действие</b><span>#005bff — кнопки, ссылки, активные табы, фокус, выбранные значения</span></div>
    <div><i style="background:var(--neutral-600)"></i><b>Меню</b><span>#203148 — левое меню; активный пункт <code>--action-100</code></span></div>
    <div><i style="background:var(--alert-500)"></i><b>Счётчики</b><span>малиновый — счётчики уведомлений, выходные в календаре</span></div>
    <div><i style="background:var(--success-400)"></i><b>Успех</b><span>#1dae40 — «Утверждено», шаги выполнены</span></div>
    <div><i style="background:var(--negative-500)"></i><b>Ошибка</b><span>#e83827 — просрочено, ошибки полей, отмена</span></div>
    <div><i style="background:var(--warning-400)"></i><b>Внимание</b><span>#f7b200 — предупреждения; жёлтый флаг «Важная» #ffd62c</span></div>
  </div>
  <h3 class="bb-h3">Базовые ряды</h3>
  {''.join(ramp_html(r) for r in RAMPS)}
  <h3 class="bb-h3">Акцентные оттенки</h3>{hues}
  <h3 class="bb-h3">Семантические токены</h3>
  <p class="bb-note">Используйте их в компонентах: они сами переключаются в тёмной теме. Слева светлая, справа тёмная.</p>
  {sem_group('--ozi-text-', 'Текст', 'primary — основной, secondary — подписи и заголовки таблиц, tertiary — подсказки, action — ссылки.')}
  {sem_group('--ozi-bg-', 'Фоны', 'primary-transparent — поля ввода; secondary/tertiary-transparent — подложки и disabled; *-primary — залитые бейджи и кнопки.')}
  {sem_group('--ozi-graphic-', 'Графика и рамки', 'quaternary-transparent — рамки полей и разделители; tertiary — иконки.')}
  {sem_group('--ozi-layer-', 'Слои', 'floor0/floor1 — подложки таблиц, surface-transparent — карточки, hover.')}
</section>'''

def section_type():
    rows = ''
    for c, fs, lh, fw in type_rows():
        rows += (f'<tr><td><code>ozi-{c}{"-true" if not c.startswith("heading") else ""}</code></td><td>{fs}</td><td>{lh}</td><td>{fw}</td>'
                 f'<td><span class="ozi-{c}{"-true" if not c.startswith("heading") else ""}" style="white-space:nowrap">{SAMPLE}</span></td></tr>')
    return f'''
<section id="type" class="bb-sec">
  <h2 class="bb-h2">2. Типографика</h2>
  <p class="bb-lead">Единственный шрифт — <b>Onest</b> (вариативный, веса 100–900, лицензия OFL). Интервал между буквами всегда 0. Заголовки жирные (600–700), текст 400, акценты 600. Для чисел в таблицах включены табличные цифры (<code>ozi-table-*</code>).</p>
  <div class="bb-fontcard"><div class="bb-fontcard__aa">Aa</div><div><b>Onest</b><p style="font-weight:300">Light 300 · Заказы партнёров</p><p style="font-weight:400">Regular 400 · Заказы партнёров</p><p style="font-weight:600">SemiBold 600 · Заказы партнёров</p><p style="font-weight:700">Bold 700 · Заказы партнёров</p></div></div>
  <table class="bb-table bb-table--type"><thead><tr><th>Класс</th><th>Размер, px</th><th>Строка, px</th><th>Вес</th><th>Пример</th></tr></thead><tbody>{rows}</tbody></table>
  <h3 class="bb-h3">Правила</h3>
  <ul class="bb-list"><li>Заголовок страницы — <code>heading-400</code> (26/30, 700). Заголовок блока — <code>heading-300</code> (19/24, 600) или <code>heading-200</code> (17/22, 600).</li>
  <li>Основной текст и ячейки таблицы — 15px. Заголовки колонок и подписи полей — 13px, цвет <code>--ozi-text-secondary-transparent</code>.</li>
  <li>Цифры, суммы, номера — всегда <code>ozi-table-*</code>, выравнивание сумм по правому краю.</li>
  <li>Крупные показатели в карточках — 28/36, 700; единицы измерения рядом — 17/22, 600.</li></ul>
</section>'''

def section_foundation():
    spacing = [4, 8, 12, 16, 20, 24, 32, 48]
    sp = ''.join(f'<div class="bb-space"><i style="width:{s}px;height:{s}px"></i><b>{s}</b></div>' for s in spacing)
    radii = [(6, 'чекбокс, hover стрелок'), (8, 'кнопки, поля, бейджи, пункты меню, дропдауны'), (12, 'крупное поле поиска'), (16, 'карточки, плитки, информеры, строки'), (20, 'графики, виджеты'), (24, 'диалоги и боковые панели')]
    rd = ''.join(f'<div class="bb-radius"><i style="border-radius:{r}px"></i><b>{r}px</b><span>{n}</span></div>' for r, n in radii)
    el = [('--elevation-200', 'карточка-строка'), ('--elevation-300', 'tooltip'), ('--elevation-500', 'дропдаун, календарь'), ('--elevation-500-left', 'боковая панель'), ('--elevation-900', 'диалог')]
    ev = ''.join(f'<div class="bb-elev"><i style="box-shadow:var({k})"></i><b>{k[2:]}</b><span>{n}</span></div>' for k, n in el)
    op = ''.join(f'<div class="bb-op"><i style="opacity:var(--opacity-{k})"></i><b>{k}</b><span>{v}</span></div>' for k, v in [('50', '5%'), ('100', '10%'), ('200', '25%'), ('300', '50% · disabled'), ('400', '75%'), ('500', '100%')])
    return f'''
<section id="foundation" class="bb-sec">
  <h2 class="bb-h2">3. Сетка, отступы, радиусы, тени</h2>
  <h3 class="bb-h3">Каркас страницы (1470 × 802)</h3>
  <div class="bb-wire">
    <div class="bb-wire__header">Шапка · высота 56px · padding 0 24px · линия снизу 2px #d9dde1</div>
    <div class="bb-wire__body"><div class="bb-wire__menu">Меню<br>260px<br>(88px свёрнуто)</div><div class="bb-wire__page">Контент · padding 24px 32px<br>Заголовок 26/30 → табы (отступ 20) → фильтры → таблица<br><small>Сетка с боковой колонкой: 1fr + 348px, зазор 32px (≤1279px — 300px, ≤900px — одна колонка)</small></div></div>
  </div>
  <h3 class="bb-h3">Шаг отступов</h3><div class="bb-spaces">{sp}</div>
  <p class="bb-note">Базовый шаг 4px. Типичные значения: зазор в строке фильтров 8px, зазор плиток 24px, отступ блоков внутри страницы 24–32px, внутренний отступ карточек 24px.</p>
  <h3 class="bb-h3">Скругления</h3><div class="bb-radii">{rd}</div>
  <h3 class="bb-h3">Тени</h3><div class="bb-elevs">{ev}</div>
  <h3 class="bb-h3">Прозрачность</h3><div class="bb-ops">{op}</div>
  <h3 class="bb-h3">Слои (z-index)</h3>
  <p class="bb-note">Шапка и меню: 1500–1501, окна и боковые панели: <code>--z-index-window</code>, уведомления: <code>--z-index-notification</code>. Затемнение за окном: <code>rgba(11,14,18,.56)</code>.</p>
</section>'''

def section_icons():
    cells = ''.join(f'<div class="bb-icon">{ic(n, 24)}<code>{n}</code></div>' for n in SYMBOLS)
    return f'''
<section id="icons" class="bb-sec">
  <h2 class="bb-h2">4. Иконки</h2>
  <p class="bb-lead">Линейно-заливные иконки на сетке 24×24 (иконки в шапке — 16/24), заливка <code>currentColor</code>, толщина штриха около 2px, скруглённые концы. Цвет задаёт контекст: в меню — белый, в полях — серо-синий (<code>--ozi-graphic-tertiary-transparent</code>), в кнопках — цвет текста. Размер в меню и кнопках 24px, внутри бейджей и тегов 16px.</p>
  <div class="bb-icons">{cells}</div>
  <p class="bb-note">Всего {len(SYMBOLS)} иконок. Новые иконки рисовать в том же стиле: сетка 24, скруглённые углы 2px, без обводки (контур заливкой). Файл: <code>icons/icons.svg</code>.</p>
  <h3 class="bb-h3">Размеры и цвета</h3>
  <div class="bb-row">
    <div class="bb-chip">{ic("nav-claims", 16)}<span>16</span></div><div class="bb-chip">{ic("nav-claims", 24)}<span>24</span></div>
    <div class="bb-chip" style="color:var(--action-500)">{ic("nav-claims")}<span>action</span></div>
    <div class="bb-chip" style="color:var(--ozi-graphic-tertiary-transparent)">{ic("nav-claims")}<span>tertiary</span></div>
    <div class="bb-chip" style="background:var(--neutral-600);color:#fff">{ic("nav-claims")}<span>на тёмном</span></div>
  </div>
</section>'''

def section_shell():
    menu = ('<ul>' + '<div class="po-menu__group">' + menu_item('nav-issue', 'Заказы') + '</div>' +
            '<div class="po-menu__group">' + menu_item('nav-receiving', 'Приёмка', True) + menu_item('nav-fbo', 'Поставки') + menu_item('nav-shipping', 'Отгрузки', False, 37) + menu_item('nav-delivery', 'Доставка') + '</div>' +
            '<div class="po-menu__group">' + menu_item('nav-returns', 'Возвраты', arrow=True) + '</div>' +
            '<div class="po-menu__group">' + menu_item('nav-claims', 'Претензии', False, 6) + menu_item('nav-quality', 'Контроль качества') + menu_item('nav-reviews', 'Отзывы') + menu_item('nav-analytics', 'Аналитика') + menu_item('nav-more', 'Ещё', arrow=True) + '</div></ul>')
    header = (f'<div class="po-header" style="position:relative"><div class="po-header__logo"><span class="bb-logo">PO</span><span class="po-header__title">PartnerOffice</span></div>'
              f'<div class="po-header__select">{field(None, "Партнёр: Казань_01", 400, "select")}</div><span class="po-header__version">Версия: 1.0.0</span><span class="po-header__spacer"></span>'
              f'<div class="po-header__icon">{ic("ui-hat")}{counter(13, 500)}</div><div class="po-header__icon">{ic("ui-bell")}{counter(1, 500)}</div><div class="po-header__sep"></div>'
              f'<div class="po-header__user">PARTNER_kazan{avatar(400)}{ic("ui-chevron-down")}</div></div>')
    page = (f'<div class="po-page"><h1 class="po-page__title">Заказы партнёру</h1><div class="po-page__tabs">{tabs(["Новые", "В работе", "Отгруженные"], 0)}</div>'
            f'<div class="po-page__toolbar"><div class="po-field-sm">{field(None, "", 500, "search", placeholder="Отправление")}</div><div class="po-field-sm">{field("Статус", "", 500, "select")}</div><div class="po-field-sm">{field("Регион", "", 500, "select")}</div>{btn("Найти", "primary", 500)}</div>'
            f'<div class="po-page__count">Найдено: 3</div></div>')
    return f'''
<section id="shell" class="bb-sec">
  <h2 class="bb-h2">5. Каркас: шапка, меню, страница</h2>
  <p class="bb-lead">Шапка закреплена сверху, меню слева закреплено под ней, контент прокручивается. Меню сворачивается до иконок (88px). В пункте меню слева иконка 24px, текст 15px, справа счётчик или стрелка подменю.</p>
  <div class="bb-demo bb-demo--shell"><div class="po-shell" style="min-height:0">{header}<div class="po-menu" style="position:relative;top:0;height:auto;min-height:440px">{menu}<div class="po-menu__copyright">© PartnerOffice</div></div>{page}</div></div>
  <h3 class="bb-h3">Параметры</h3>
  <table class="bb-table"><thead><tr><th>Элемент</th><th>Значение</th></tr></thead><tbody>
  <tr><td>Шапка</td><td>56px, белая, <code>box-shadow: inset 0 -2px 0 #d9dde1</code>, padding 0 24px, элементы выровнены по центру с зазором 16px; слева логотип + название, затем селект 320×32, версия 13px серым, справа два иконки-колокольчика со счётчиками, разделитель 1px, имя пользователя 15/600 синим и аватар</td></tr>
  <tr><td>Меню</td><td>260px, <code>--neutral-600</code> (#203148), padding 16px 16px 0; группы разделены линией <code>1px --neutral-100</code>, отступ 8px; пункт 44px, радиус 8px, активный <code>--action-100</code>, hover <code>--action-50</code>, фокус outline 2px <code>--action-400</code></td></tr>
  <tr><td>Подменю</td><td>Открывается флайаутом справа: белый дропдаун радиус 8px, пункты по 44px</td></tr>
  <tr><td>Страница</td><td>padding 24px 32px, заголовок heading-400, табы, ряд фильтров с зазором 8px, счётчик «Найдено: N»</td></tr>
  <tr><td>Подвал меню</td><td>Копирайт 11px серым, кнопка сворачивания в нижнем левом углу</td></tr></tbody></table>
</section>'''

def section_components():
    # кнопки
    variants = ['primary', 'action-secondary', 'secondary', 'outline', 'ghost', 'uncontained']
    names = {'primary': 'Основная', 'action-secondary': 'Вторичная акцентная', 'secondary': 'Вторичная', 'outline': 'Контурная', 'ghost': 'Прозрачная', 'uncontained': 'Текстовая'}
    brows = ''.join(f'<div class="bb-brow"><span class="bb-cap">{names[v]}</span>{btn("Кнопка", v)}{btn("Кнопка", v, left="ui-search")}{btn("Кнопка", v, disabled=True)}</div>' for v in variants)
    neg = ''.join(f'<span style="margin-right:12px">{btn("Отменить", v)}</span>' for v in ['primary-negative', 'secondary-negative', 'ghost-negative', 'uncontained-negative'])
    sizes = ''.join(f'<span style="margin-right:12px">{btn("Размер " + str(s), "primary", s)}</span>' for s in [300, 400, 500, 600])
    # поля
    fields = f'''<div class="bb-fields">
      <div><div class="bb-cap">Пустое</div>{field("Статус", "", 500, "select")}</div>
      <div><div class="bb-cap">Заполнено</div>{field("Номер заказа", "0242240665-0001-1", 500)}</div>
      <div><div class="bb-cap">В фокусе</div>{field("Регион", "Казань", 500, "select", active=True)}</div>
      <div><div class="bb-cap">Ошибка</div>{field("Телефон", "+7 900", 500, state="error", caption="Введите номер полностью", error_cap=True)}</div>
      <div><div class="bb-cap">Успех</div>{field("ИНН", "7707083893", 500, state="success", caption="ИНН найден")}</div>
      <div><div class="bb-cap">Предупреждение</div>{field("Адрес", "г. Казань", 500, state="warning", caption="Уточните улицу")}</div>
      <div><div class="bb-cap">Недоступно</div>{field("Договор", "ОД-А 380/20", 500, state="disabled")}</div>
      <div><div class="bb-cap">Период</div>{field("Период", "12.04.2026 – 12.10.2026", 500, "date")}</div>
      <div><div class="bb-cap">Поиск, размер 600</div>{field(None, "", 600, "search", placeholder="Штрихкод")}</div>
      <div><div class="bb-cap">Компактное, 32px</div>{field(None, "Казань_01", 400, "select")}</div>
    </div>'''
    dd = '''<div class="po-dropdown po-dropdown--500" style="width:238px"><div class="po-dropdown__scroll"><div class="po-dropdown__list">
      <div class="po-dropdown-item"><div class="po-dropdown-item__block">''' + checkbox(True) + '''<span class="po-dropdown-item__text">Новый</span></div></div>
      <div class="po-dropdown-item" style="background:var(--ozi-layer-surface-transparent)"><div class="po-dropdown-item__block">''' + checkbox() + '''<span class="po-dropdown-item__text">В сборке</span></div></div>
      <div class="po-dropdown-item"><div class="po-dropdown-item__block">''' + checkbox() + '''<span class="po-dropdown-item__text">Отгружен</span></div></div></div></div></div>'''
    # таблица
    head = ''.join([th('<input type="checkbox" class="po-checkbox">', 44), th('Отправление<div class="bb-sub">Партнёр</div>', 200), th('Статус', 150), th('Регион', 150), th('Отгрузить до'), th('Сумма', 120, 'right')])
    def row(n, p, st, kind, reg, dt, s):
        return tr([td('<input type="checkbox" class="po-checkbox">'), td(f'{n}<div class="bb-sub">{p}</div>'), td(badge(st, kind)), td(reg), td(dt), td(s, 'right')])
    rows = (row('0242240665-0001-1', 'ИП Иванов', 'Новый', 'secondary info', 'Казань', '13 октября, 18:00', '3 450,00 ₽') +
            row('0242240665-0002-1', 'ООО «Вектор»', 'В сборке', 'secondary warning', 'Самара', '13 октября, 12:00', '12 900,50 ₽') +
            row('0242240665-0003-1', 'ИП Иванов', 'Отгружен', 'primary success', 'Казань', '12 октября, 15:30', '840,00 ₽') +
            row('0242240665-0004-1', 'ООО «Вектор»', 'Просрочен', 'primary negative', 'Самара', '11 октября, 10:00', '5 120,00 ₽') +
            row('0242240665-0005-1', 'ИП Петров', 'Архив', 'primary neutral', 'Уфа', '10 октября, 09:00', '1 000,00 ₽'))
    table = f'<table class="po-table__table" style="width:100%"><thead><tr class="po-table-row__row">{head}</tr></thead><tbody>{rows}</tbody></table>'
    # календарь (копия демо)
    cal = '<div id="bb-cal" class="po-calendar"></div>'
    tip = '<div class="theme-dark" style="display:inline-block"><div class="po-tooltip__tooltip po-tooltip__size-400"><div class="tippy-box" data-theme="primary" style="display:grid;border-radius:8px;box-shadow:0 0 24px #0000001f"><div class="tippy-content" style="padding:12px;max-width:320px;color:var(--ozi-text-primary-transparent)">Считаем соотношение средней приёмки к лимиту только по отправлениям прямого потока</div></div></div></div>'
    drawer = f'''<div class="bb-frame"><div class="bb-frame__backdrop"></div><div class="po-window__window po-drawer__drawer po-drawer__size-500 po-drawer__right" style="position:absolute;left:auto;right:0;top:0;bottom:0;width:420px;display:block;margin:0">
      <h2 class="ozi-heading-400">Уведомления</h2><div style="margin:16px 0">{chips(["Новые", "В процессе", "Прочитано"], 0)}</div>
      <div class="bb-list-row"><span>Новый заказ 0242240665-0001-1</span><span class="bb-muted">Сегодня</span>{ic("ui-chevron-right")}</div>
      <div class="bb-list-row"><span>Партнёр принял заказ</span><span class="bb-muted">Вчера</span>{ic("ui-chevron-right")}</div>
      <div style="position:absolute;left:32px;bottom:32px">{btn("Закрыть", "primary")}</div>
      <button type="button" class="po-window__closeIcon po-drawer__closeIcon">{ic("ui-close")}</button></div></div>'''
    dialog = f'''<div class="bb-frame bb-frame--dialog"><div class="bb-frame__backdrop"></div><div class="po-window__window po-dialog__dialog po-dialog__size-500" style="position:relative;display:block;background:#fff;width:460px;margin:auto">
      <h3 class="ozi-heading-300" style="padding-right:32px">Подтвердите отгрузку</h3><p style="margin:12px 0 24px;color:var(--ozi-text-secondary-transparent)">Заказ 0242240665-0001-1 будет передан партнёру ИП Иванов. Отменить действие после подтверждения нельзя.</p>
      <div style="display:flex;gap:8px">{btn("Подтвердить", "primary")}{btn("Отмена", "action-secondary")}</div>
      <button type="button" class="po-window__closeIcon po-dialog__closeIcon" style="position:absolute">{ic("ui-close")}</button></div></div>'''
    sk = f'<div style="display:grid;gap:8px;max-width:560px">{skeleton(420, 48)}{skeleton(560, 20)}{skeleton(480, 20)}<div style="display:flex;gap:12px">{skeleton(270, 140)}{skeleton(270, 140)}</div></div>'
    return f'''
<section id="components" class="bb-sec">
  <h2 class="bb-h2">6. Компоненты</h2>
  <p class="bb-lead">Ниже живые примеры. Каждый компонент — отдельный файл в <code>components/ozon/</code> (стили выгружены из оригинала, классы переименованы <code>ozi__X__y → po-X__y</code>).</p>

  <h3 class="bb-h3" id="c-buttons">Кнопки <small>button.css</small></h3>
  <p class="bb-note">Одна основная кнопка на экран (синяя). Вторичные действия — <code>action-secondary</code>. Высоты: 300 → 24px, 400 → 32px, 500 → 44px, 600 → 56px. Радиус 8px, текст 600. Иконочная кнопка — квадрат (44×44) с подложкой <code>action-secondary</code>.</p>
  <div class="bb-demo">{brows}<div class="bb-brow"><span class="bb-cap">Иконочные</span>{btn("", "action-secondary", only_icon="ui-settings")}{btn("", "action-secondary", only_icon="ui-sound")}{btn("", "action-secondary", only_icon="ui-clear-filters")}</div>
  <div class="bb-brow"><span class="bb-cap">Негативные</span>{neg}</div><div class="bb-brow"><span class="bb-cap">Размеры</span>{sizes}</div></div>

  <h3 class="bb-h3" id="c-fields">Поля ввода и селекты <small>input.css</small></h3>
  <p class="bb-note">Подпись «плавает»: в пустом поле лежит на месте значения, в заполненном уходит вверх (13px серым). Фон <code>rgba(255,255,255,.64)</code>, рамка 1px <code>--ozi-graphic-quaternary-transparent</code>, hover — тёмнее, фокус — 2px <code>#005bff</code>. Ошибка, успех, предупреждение — рамка 2px соответствующего цвета и подпись ниже (13px).</p>
  <div class="bb-demo">{fields}</div>

  <h3 class="bb-h3" id="c-dropdown">Выпадающий список <small>dropdown.css</small></h3>
  <div class="bb-demo"><div class="bb-row" style="align-items:flex-start;gap:32px">{dd}<div style="width:260px">{field("Статус", "Выбрано: 1", 500, "select", active=True)}</div></div></div>

  <h3 class="bb-h3" id="c-checks">Чекбокс и переключатель <small>checkbox.css, toggle.css</small></h3>
  <div class="bb-demo"><div class="bb-row">{checkbox(False, label="Пусто")}{checkbox(True, label="Выбрано")}{checkbox(False, True, "Недоступно")}<div style="width:240px">{toggle("С рекомендацией")}</div><div style="width:240px">{toggle("Выключено", False)}</div></div></div>

  <h3 class="bb-h3" id="c-tabs">Табы и переключатель-чипы <small>tabs.css, filter-chip.css</small></h3>
  <p class="bb-note">Табы — для разделов страницы (подчёркивание 2px серым, активный — синим). Чипы-группа — для смены представления внутри раздела (активный с синей рамкой 2px).</p>
  <div class="bb-demo"><div class="bb-row" style="gap:48px;align-items:flex-end">{tabs(["Главная", "Отправления", "Архив"], 0)}{chips(["В работе", "Закрыто", "Аналитика"], 0)}</div></div>

  <h3 class="bb-h3" id="c-badges">Бейджи, счётчики, флаги <small>badge.css, counter.css</small></h3>
  <div class="bb-demo"><div class="bb-row">{badge("Новое", "primary brand")}{badge("Утверждено", "primary success")}{badge("Просрочен", "primary negative")}{badge("В архиве", "primary neutral")}{badge("На рассмотрении", "secondary info")}{badge("В сборке", "secondary warning")}{badge("Ошибка", "secondary negative")}{badge("Успех", "secondary success")}<span class="po-flag">Важная</span>{counter(37, 600)}{counter(6, 500)}{counter(1, 500)}</div></div>

  <h3 class="bb-h3" id="c-informer">Информер <small>informer.css</small></h3>
  <div class="bb-demo bb-stack">{informer("Отсканируйте или введите штрихкод отправления", "info")}{informer("Срок отгрузки истекает через 2 часа", "warning")}{informer("Не удалось передать заказ партнёру", "error")}{informer("Заказ передан партнёру", "success")}</div>

  <h3 class="bb-h3" id="c-table">Таблица <small>table.css</small></h3>
  <p class="bb-note">Заголовок: 13/600 серым на подложке <code>--ozi-bg-tertiary-transparent</code>, высота 50px. Строка 54px+, ячейка padding 16/8/15, разделитель 1px, hover <code>#f5f7fa</code>. Подпись под значением 13px серым. Суммы и числа — вправо, статусы бейджами.</p>
  <div class="bb-demo">{table}</div>

  <h3 class="bb-h3" id="c-calendar">Календарь периода <small>calendar.css</small></h3>
  <div class="bb-demo">{cal}</div>

  <h3 class="bb-h3" id="c-tooltip">Подсказка <small>tooltip.css</small></h3>
  <div class="bb-demo">{tip}</div>

  <h3 class="bb-h3" id="c-drawer">Боковая панель <small>drawer.css, window.css</small></h3>
  <p class="bb-note">Ширина 600px (на макете уменьшена), радиус слева 24px, padding 32px, затемнение <code>rgba(11,14,18,.56)</code>, закрытие крестиком и кнопкой внизу. Появляется справа за 0.3s.</p>
  <div class="bb-demo">{drawer}</div>

  <h3 class="bb-h3" id="c-dialog">Диалог <small>dialog.css</small></h3>
  <div class="bb-demo">{dialog}</div>

  <h3 class="bb-h3" id="c-skeleton">Скелетон <small>skeleton.css</small></h3>
  <div class="bb-demo">{sk}</div>
</section>'''

def section_patterns():
    tiles = ''.join(f'<div class="po-tile"><div class="po-tile__title">{t}</div><div class="po-tile__art">{ic(i, 48)}</div>{("<div class=po-tile__badge>" + counter(c, 500) + "</div>") if c else ""}</div>' for t, i, c in
                    [('Заказы партнёрам', 'nav-issue', None), ('Отгрузки', 'nav-shipping', 37), ('Возвраты', 'nav-returns', None), ('Претензии', 'nav-claims', 6), ('Остатки', 'nav-fbo', None)])
    hub = f'<div class="po-tiles">{tiles}</div>'
    search = f'{informer("Отсканируйте или введите номер отправления", "info")}<div class="po-search" style="margin-top:16px"><div class="po-search__field">{field(None, "", 600, "search", placeholder="Номер отправления")}</div>{btn("Найти", "primary", 600)}</div>'
    kpi = f'''<div style="display:grid;grid-template-columns:1fr 248px;gap:24px;max-width:960px"><div class="po-island">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px"><div><div class="po-widget__label">Загруженность</div><div style="display:flex;align-items:center;gap:8px"><span class="po-widget__value" style="font-size:28px">8<span class="po-widget__unit">%</span></span><div style="flex:1;height:4px;border-radius:4px;background:rgba(124,155,181,.227);position:relative"><i style="position:absolute;left:0;top:0;bottom:0;width:8%;background:var(--action-500);border-radius:4px"></i></div></div></div>
      <div><div class="po-widget__label">Заказов за неделю</div><div class="po-widget__value">843<span class="po-widget__unit">шт.</span></div></div>
      <div><div class="po-widget__label">Лимит</div><div class="po-widget__value">10000<span class="po-widget__unit">шт.</span></div></div>
      <div><div class="po-widget__label">Баланс</div><div class="po-widget__value">2134<span class="po-widget__unit">экз.</span></div></div></div></div>
      <div class="po-widget po-widget--link"><div class="po-widget__label">Рейтинг</div><div class="po-widget__value">4,31</div></div></div>'''
    article = '<div class="po-article"><div class="po-article__date">09 октября 2026</div><div class="po-article__title">Как работать с заказами партнёра <span class="po-flag">Важная</span></div><p>Партнёр получает заказ в кабинете и подтверждает его в течение часа. После сборки заказ отгружается в Ozon.</p><p><b>Что приедет и как принять.</b> Отсканируйте маркировку на наклейке и проверьте состав заказа.</p></div>'
    rows = ''.join(f'<div class="po-card-row">Ячейка {i}</div>' for i in range(1, 4))
    empty = f'<div class="po-empty"><div class="po-empty__icon">?</div><div class="po-empty__title">Ничего не найдено</div><div class="po-empty__text">Попробуйте выбрать другие фильтры</div></div>'
    hero = f'<div class="po-empty po-empty--hero"><div class="po-empty__icon">i</div><div class="po-empty__title">Отсканируйте штрихкод отправления</div></div>'
    return f'''
<section id="patterns" class="bb-sec">
  <h2 class="bb-h2">7. Шаблоны страниц</h2>
  <p class="bb-lead">Любой раздел PartnerOffice собирается из этих шаблонов: так экраны остаются одинаковыми.</p>
  <h3 class="bb-h3">Плитки-хаб</h3><p class="bb-note">300×100, радиус 16px, фон #f5f7fa, заголовок 17/22 с отступом 24px сверху, справа иллюстрация, в углу счётчик; зазор плиток 24px.</p><div class="bb-demo">{hub}</div>
  <h3 class="bb-h3">Поиск по штрихкоду</h3><div class="bb-demo">{search}</div>
  <h3 class="bb-h3">Страница с таблицей</h3><p class="bb-note">Заголовок → табы → строка фильтров (поля 44px, «Найти», сброс) → «Найдено: N» → таблица. Показан в разделе 5 и 6.</p>
  <h3 class="bb-h3">Дашборд</h3><p class="bb-note">Карточка-остров <code>--ozi-layer-surface-transparent</code>, радиус 16px, padding 24px, число 28/36 жирное, единицы 17/22; рядом виджет-ссылка (padding 24px, #f5f7fa).</p><div class="bb-demo">{kpi}</div>
  <h3 class="bb-h3">Новость / статья</h3><div class="bb-demo">{article}</div>
  <h3 class="bb-h3">Список-карточки</h3><div class="bb-demo bb-stack" style="gap:12px">{rows}</div>
  <h3 class="bb-h3">Пустые состояния</h3><div class="bb-demo bb-two">{empty}{hero}</div>
</section>'''

def section_rules():
    return '''
<section id="rules" class="bb-sec">
  <h2 class="bb-h2">8. Правила и ограничения</h2>
  <div class="bb-do">
    <div class="bb-do__yes"><h4>Делаем</h4><ul>
      <li>Берём цвета, тени и непрозрачность только из токенов.</li>
      <li>Одна основная синяя кнопка на экране; прочие — <code>action-secondary</code>.</li>
      <li>Фильтры над таблицей всегда в одну строку, «Найти» справа, сброс иконкой.</li>
      <li>Статус — бейдж нужного цвета; просрочку — красным текстом под значением.</li>
      <li>Суммы с неразрывным пробелом в тысячах и знаком ₽, выровнены вправо.</li>
      <li>Пустое состояние: иконка, жирная строка, серая подсказка.</li>
    </ul></div>
    <div class="bb-do__no"><h4>Не делаем</h4><ul>
      <li>Не вводим новых акцентных цветов и градиентов в интерфейсе.</li>
      <li>Не используем другие шрифты и межбуквенный интервал.</li>
      <li>Не меняем радиусы (6/8/12/16/20/24) и высоты контролов (24/32/44/56).</li>
      <li>Не рисуем рамки 1px вокруг карточек: отделяем подложкой или тенью.</li>
      <li>Не копируем логотип, название, 3D-иллюстрации и баннеры Ozon.</li>
      <li>Не показываем состояние только цветом — всегда с текстом.</li>
    </ul></div>
  </div>
  <h3 class="bb-h3">Доступность</h3>
  <ul class="bb-list"><li>Контраст основного текста <code>#070707</code> на белом — выше 19:1; синий <code>#005bff</code> на белом — 5,6:1 (подходит для текста 15px и крупнее).</li>
  <li>Фокус клавиатуры: outline 2px <code>--action-400</code> (меню) или рамка 2px <code>#005bff</code> (поля).</li>
  <li>Disabled — opacity 50%, указатель по умолчанию, без hover.</li></ul>
  <h3 class="bb-h3">Что ещё не снято с оригинала</h3>
  <ul class="bb-list"><li>Тёмная тема: токены есть, внешний вид страниц не проверялся.</li>
  <li>Формы действий (выдача, приём), сообщения об ошибке в поле при отправке, toast-уведомления.</li>
  <li>Выбор месяца и года в календаре, мобильные ширины (<900px) проверены только по CSS.</li></ul>
  <h3 class="bb-h3">Источники</h3>
  <p class="bb-note">Токены, CSS и иконки выгружены с turbo-pvz.ozon.ru (3.11.59) 2026-10-12: <code>tokens/</code>, <code>components/ozon/</code>, <code>icons/</code>, <code>reference/ozon-css-raw/</code>. Подробная сводка: <code>RESEARCH.md</code>.</p>
</section>'''

BB_CSS = '''
:root { --bb-bg:#fff; --bb-line:#e6ebf0; }
body { background:#fff; }
.bb-layout { display:grid; grid-template-columns:260px minmax(0,1fr); min-height:100vh; }
.bb-nav { background:var(--neutral-600); color:#fff; padding:24px 16px; position:sticky; top:0; height:100vh; overflow:auto; }
.bb-nav a { display:block; padding:10px 16px; border-radius:8px; color:var(--text-500-inverted); font-size:15px; line-height:24px; }
.bb-nav a:hover { background:var(--neutral-100); }
.bb-nav a.is-active { background:var(--action-100); }
.bb-nav .bb-nav__sub a { padding:6px 16px 6px 32px; font-size:13px; line-height:20px; color:var(--text-300-inverted); }
.bb-nav__brand { align-items:center; display:flex; gap:12px; font:700 19px/24px var(--global-font); margin:0 0 24px 8px; }
.bb-logo { align-items:center; background:var(--action-500); border-radius:8px; color:#fff; display:inline-grid; font:700 14px/1 var(--global-font); height:32px; place-items:center; width:32px; }
.bb-main { max-width:1180px; padding:48px 56px 96px; }
.bb-sec { margin-bottom:96px; scroll-margin-top:24px; }
.bb-eyebrow { color:var(--ozi-text-secondary-transparent); font-size:13px; line-height:16px; margin-bottom:12px; }
.bb-h1 { font:800 40px/48px var(--global-font); margin-bottom:16px; }
.bb-h2 { font:700 32px/40px var(--global-font); margin-bottom:12px; }
.bb-h3 { font:600 19px/24px var(--global-font); margin:40px 0 12px; display:flex; align-items:baseline; gap:12px; }
.bb-h3 small { color:var(--ozi-text-secondary-transparent); font:400 13px/16px var(--global-font); }
.bb-h4 { font:600 17px/22px var(--global-font); margin:28px 0 4px; }
.bb-lead { font-size:17px; line-height:28px; max-width:820px; margin-bottom:24px; color:var(--ozi-text-primary-transparent); }
.bb-note { color:var(--ozi-text-secondary-transparent); font-size:15px; line-height:24px; max-width:860px; margin:0 0 12px; }
.bb-cap { color:var(--ozi-text-secondary-transparent); display:block; font-size:13px; line-height:16px; margin-bottom:6px; }
code { background:var(--ozi-layer-surface-transparent); border-radius:4px; font:500 13px/16px ui-monospace, Menlo, monospace; padding:2px 5px; }
.bb-code { background:var(--neutral-600); border-radius:12px; color:#fff; font:400 13px/20px ui-monospace, Menlo, monospace; overflow:auto; padding:20px 24px; }
.bb-list { margin:0; padding-left:20px; list-style:disc; display:grid; gap:8px; max-width:860px; }
.bb-cards { display:grid; gap:16px; grid-template-columns:repeat(3,1fr); margin:0 0 24px; }
.bb-card { background:var(--ozi-layer-surface-transparent); border-radius:16px; padding:24px; }
.bb-card p { color:var(--ozi-text-secondary-transparent); font-size:15px; line-height:24px; margin-top:8px; }
.bb-demo { border:1px solid var(--ozi-graphic-quaternary-transparent); border-radius:16px; padding:24px; overflow:auto; }
.bb-demo--shell { padding:0; overflow:hidden; }
.bb-stack { display:grid; gap:12px; }
.bb-two { display:grid; gap:24px; grid-template-columns:1fr 1fr; }
.bb-row { align-items:center; display:flex; flex-wrap:wrap; gap:16px; }
.bb-brow { align-items:center; display:flex; flex-wrap:wrap; gap:12px; margin-bottom:16px; }
.bb-brow .bb-cap { margin:0; width:160px; }
.bb-fields { display:grid; gap:20px 24px; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
.bb-sub { color:var(--ozi-text-secondary-transparent); font-size:13px; line-height:16px; }
.bb-muted { color:var(--ozi-text-secondary-transparent); }
.bb-brands { display:grid; gap:16px; grid-template-columns:repeat(4,1fr); }
.bb-brand { display:grid; gap:2px; font-size:13px; line-height:16px; }
.bb-brand i { border-radius:16px; display:block; height:88px; margin-bottom:8px; box-shadow:inset 0 0 0 1px rgba(0,0,0,.06); }
.bb-brand span { color:var(--ozi-text-secondary-transparent); }
.bb-usage { display:grid; gap:12px 24px; grid-template-columns:repeat(2,1fr); }
.bb-usage div { align-items:start; display:grid; gap:2px 12px; grid-template-columns:40px 1fr; }
.bb-usage i { border-radius:8px; grid-row:span 2; height:40px; width:40px; }
.bb-usage span { color:var(--ozi-text-secondary-transparent); font-size:13px; line-height:16px; }
.bb-ramp { align-items:center; display:grid; gap:16px; grid-template-columns:200px 1fr; margin-bottom:8px; }
.bb-ramp__name b { display:block; font:600 15px/20px var(--global-font); text-transform:capitalize; }
.bb-ramp__name span { color:var(--ozi-text-secondary-transparent); font-size:13px; line-height:16px; }
.bb-ramp__steps { display:flex; gap:4px; }
.bb-step { display:grid; flex:1; font-size:11px; gap:1px; line-height:14px; min-width:0; }
.bb-step i { border-radius:8px; box-shadow:inset 0 0 0 1px rgba(0,0,0,.06); display:block; height:48px; margin-bottom:4px; background-image:linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%),linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%); background-size:10px 10px; background-position:0 0,5px 5px; position:relative; }
.bb-step span { color:var(--ozi-text-secondary-transparent); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bb-table { border-collapse:collapse; width:100%; font-size:13px; line-height:16px; }
.bb-table th { color:var(--ozi-text-secondary-transparent); font-weight:600; padding:8px; text-align:left; border-bottom:1px solid var(--ozi-graphic-quaternary-transparent); }
.bb-table td { border-bottom:1px solid var(--bb-line); padding:8px; vertical-align:middle; }
.bb-table td:first-child { width:36px; }
.bb-table--type td:first-child { width:auto; }
.bb-dot { border-radius:6px; box-shadow:inset 0 0 0 1px rgba(0,0,0,.08); display:inline-block; height:24px; overflow:hidden; width:24px; background:#fff; }
.bb-dot--dark { background:#1a1d21; }
.bb-dot i { display:block; height:100%; width:100%; }
.bb-fontcard { align-items:center; background:var(--ozi-layer-surface-transparent); border-radius:16px; display:flex; gap:40px; margin:0 0 24px; padding:24px 40px; }
.bb-fontcard__aa { font:700 96px/96px var(--global-font); color:var(--action-500); }
.bb-fontcard p { font-size:19px; line-height:32px; }
.bb-wire { border:2px dashed var(--ozi-graphic-quaternary-transparent); border-radius:16px; overflow:hidden; font-size:13px; }
.bb-wire__header { background:#fff; border-bottom:2px solid #d9dde1; padding:16px 24px; }
.bb-wire__body { display:grid; grid-template-columns:260px 1fr; min-height:160px; }
.bb-wire__menu { background:var(--neutral-600); color:#fff; padding:16px; }
.bb-wire__page { padding:24px 32px; }
.bb-spaces { align-items:flex-end; display:flex; gap:24px; }
.bb-space { display:grid; gap:6px; justify-items:center; font-size:13px; }
.bb-space i { background:var(--action-400); border-radius:2px; display:block; }
.bb-radii, .bb-elevs, .bb-ops { display:grid; gap:24px; grid-template-columns:repeat(6,1fr); }
.bb-elevs { grid-template-columns:repeat(5,1fr); }
.bb-radius i, .bb-elev i, .bb-op i { background:var(--action-100-opaque); display:block; height:72px; margin-bottom:8px; }
.bb-elev i { background:#fff; border-radius:12px; }
.bb-op i { background:var(--action-500); border-radius:8px; }
.bb-radius b, .bb-elev b, .bb-op b { display:block; font:600 13px/16px var(--global-font); }
.bb-radius span, .bb-elev span, .bb-op span { color:var(--ozi-text-secondary-transparent); display:block; font-size:12px; line-height:16px; }
.bb-icons { display:grid; gap:12px; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
.bb-icon { align-items:center; border:1px solid var(--ozi-graphic-quaternary-transparent); border-radius:12px; display:grid; gap:8px; justify-items:center; padding:16px 8px; }
.bb-icon code { font-size:11px; }
.bb-icon .po-icon { color:var(--text-500); }
.bb-chip { align-items:center; background:var(--ozi-layer-surface-transparent); border-radius:8px; display:inline-flex; gap:8px; padding:12px 16px; }
.bb-do { display:grid; gap:24px; grid-template-columns:1fr 1fr; }
.bb-do div { border-radius:16px; padding:24px; }
.bb-do__yes { background:var(--success-25-opaque); }
.bb-do__no { background:var(--negative-25-opaque); }
.bb-do h4 { font:600 17px/22px var(--global-font); margin-bottom:12px; }
.bb-do ul { display:grid; gap:8px; list-style:disc; padding-left:20px; }
.bb-frame { background:#d9dde1; border-radius:16px; height:380px; overflow:hidden; position:relative; }
.bb-frame--dialog { display:grid; }
.bb-frame__backdrop { background:#0b0e128f; inset:0; position:absolute; }
.bb-frame .po-window__window { background:#fff; }
.bb-list-row { align-items:center; border-bottom:1px solid var(--ozi-graphic-quaternary-transparent); display:flex; gap:12px; padding:16px 0; }
.bb-list-row span:first-child { flex:1; }
@media (max-width:1000px) { .bb-layout { grid-template-columns:1fr; } .bb-nav { position:static; height:auto; } .bb-cards, .bb-brands, .bb-usage, .bb-do, .bb-two { grid-template-columns:1fr; } .bb-main { padding:24px 16px; } .bb-ramp { grid-template-columns:1fr; } }
'''

CAL_JS = '''
(function(){
  var MONTHS=['Сентябрь','Октябрь'],DAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  var today=new Date(2026,9,12),end=today,start=new Date(2026,3,12);
  function arrow(dir,prev){return '<svg class="po-cal-grid__arrow po-cal-grid__arrow--'+dir+'" width="24" height="24" viewBox="0 0 24 24"'+(prev?' style="transform:scaleX(-1)"':'')+'><use href="#ui-chevron-right"/></svg>';}
  function grid(y,m){
    var first=new Date(y,m,1),lead=(first.getDay()+6)%7,n=new Date(y,m+1,0).getDate();
    var h='<div class="po-cal-grid"><div class="po-cal-grid__header">'+(m===8?arrow('prev',true):'')+
      '<div class="po-cal-grid__caption"><span class="po-cal-grid__clickable">'+MONTHS[m-8]+'</span><span class="po-cal-grid__year po-cal-grid__clickable">'+y+'</span></div>'+(m===9?arrow('next',false):'')+
      '</div><div class="po-cal-grid__days">'+DAYS.map(function(d){return '<div class="po-cal-grid__weekday">'+d+'</div>'}).join('');
    function edge(c){return (c===0?' po-day--first-in-row':'')+(c===6?' po-day--last-in-row':'');}
    for(var i=0;i<lead;i++)h+='<div class="po-day'+edge(i)+'" style="visibility:hidden"></div>';
    for(var d=1;d<=n;d++){var dt=new Date(y,m,d),col=(lead+d-1)%7,c=['po-day'];
      if(col===0)c.push('po-day--first-in-row');if(col===6)c.push('po-day--last-in-row','po-day--weekend');if(col===5)c.push('po-day--weekend');
      if(dt>today)c.push('po-day--disabled');else if(+dt===+end)c.push('po-day--in-range','po-day--end');else if(dt>=start)c.push('po-day--in-range');
      h+='<div class="'+c.join(' ')+'"><span class="po-day__text">'+d+'</span></div>';}
    for(var j=lead+n;j<42;j++)h+='<div class="po-day'+edge(j%7)+'" style="visibility:hidden"></div>';
    return h+'</div></div>';
  }
  var el=document.getElementById('bb-cal');if(!el)return;
  el.innerHTML=grid(2026,8)+grid(2026,9)+'<div class="po-calendar__right"><div class="po-calendar__shortcuts"><a class="po-calendar__shortcut">За полгода</a><a class="po-calendar__shortcut">За год</a></div></div>';
  // подсветка пункта навигации
  var links=[].slice.call(document.querySelectorAll('.bb-nav a[href^="#"]')),secs=links.map(function(a){return document.querySelector(a.getAttribute('href'))});
  function on(){var y=window.scrollY+120,cur=0;secs.forEach(function(s,i){if(s&&s.offsetTop<=y)cur=i});links.forEach(function(a,i){a.classList.toggle('is-active',i===cur)})}
  window.addEventListener('scroll',on,{passive:true});on();
})();
'''

def build():
    nav = [('intro', 'Введение'), ('colors', '1. Цвет'), ('type', '2. Типографика'), ('foundation', '3. Сетка и тени'), ('icons', '4. Иконки'), ('shell', '5. Каркас'),
           ('components', '6. Компоненты'), ('patterns', '7. Шаблоны страниц'), ('rules', '8. Правила')]
    comp_sub = [('c-buttons', 'Кнопки'), ('c-fields', 'Поля'), ('c-dropdown', 'Списки'), ('c-checks', 'Чекбокс, переключатель'), ('c-tabs', 'Табы, чипы'), ('c-badges', 'Бейджи'),
                ('c-informer', 'Информер'), ('c-table', 'Таблица'), ('c-calendar', 'Календарь'), ('c-tooltip', 'Подсказка'), ('c-drawer', 'Панель'), ('c-dialog', 'Диалог'), ('c-skeleton', 'Скелетон')]
    nav_html = ''
    for id_, t in nav:
        nav_html += f'<a href="#{id_}">{t}</a>'
        if id_ == 'components':
            nav_html += '<div class="bb-nav__sub">' + ''.join(f'<a href="#{i}">{n}</a>' for i, n in comp_sub) + '</div>'
    css_files = ['base', 'ozon/typography', 'ozon/truncate', 'ozon/data-cell', 'ozon/button', 'ozon/input', 'ozon/menu-item', 'ozon/tabs', 'ozon/filter-chip', 'ozon/badge', 'ozon/counter',
                 'ozon/toggle', 'ozon/informer', 'ozon/tooltip', 'ozon/drawer', 'ozon/window', 'ozon/dialog', 'ozon/skeleton', 'ozon/link', 'ozon/separator', 'ozon/table', 'ozon/scroller',
                 'ozon/icon-button', 'ozon/avatar', 'ozon/popover', 'checkbox', 'dropdown', 'calendar', 'layout']
    links = '\n'.join(f'<link rel="stylesheet" href="../components/{f}.css">' for f in css_files)
    doc = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Брендбук PartnerOffice</title>
<link rel="stylesheet" href="../tokens/ozon-tokens.css">
{links}
<style>{BB_CSS}</style>
</head>
<body>
{icons_svg}
<div class="bb-layout">
  <nav class="bb-nav"><div class="bb-nav__brand"><span class="bb-logo">PO</span>PartnerOffice</div>{nav_html}</nav>
  <main class="bb-main">
    {section_cover()}{section_colors()}{section_type()}{section_foundation()}{section_icons()}{section_shell()}{section_components()}{section_patterns()}{section_rules()}
  </main>
</div>
<script>{CAL_JS}</script>
</body>
</html>'''
    os.makedirs(f'{ROOT}/brandbook', exist_ok=True)
    open(f'{ROOT}/brandbook/index.html', 'w').write(doc)
    print('ok', len(doc), 'bytes;', len(SYMBOLS), 'icons')

if __name__ == '__main__':
    build()
