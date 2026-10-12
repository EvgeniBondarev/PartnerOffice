# PartnerOffice

Кабинет региональных партнёров по заказам Ozon. Партнёры работают с заказами через проект [Studio2](https://github.com/EvgeniBondarev/Studio2Prod), а PartnerOffice даёт им отдельный интерфейс. Интерфейс повторяет привычный партнёрам рабочий инструмент «Турбо ПВЗ» (дизайн-система ozi): те же цвета, шрифт, сетка, формы, навигация и иконки, поэтому обучение не требуется.

Архитектура и план разработки: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Фронтенд партнёра: [web/README.md](web/README.md).

## Брендбук

**[Исходник страницы брендбука](design/brandbook/index.html)** (на GitHub открывается как код; чтобы увидеть страницу, скачайте репозиторий и откройте файл в браузере)

Локально: откройте `design/brandbook/index.html` или выполните `python3 -m http.server` из папки `design` и перейдите на `/brandbook/index.html`. Пересборка: `python3 design/build/build_brandbook.py`.

### Скриншоты

| | |
|---|---|
| ![Введение](docs/screenshots/01-intro.jpg)<br>Введение и принципы | ![Цвет](docs/screenshots/02-colors.jpg)<br>Цвет: бренд и применение |
| ![Типографика](docs/screenshots/03-typography.jpg)<br>Типографика (Onest) | ![Каркас](docs/screenshots/04-app-shell.jpg)<br>Каркас: шапка, меню, страница |
| ![Кнопки](docs/screenshots/05-buttons.jpg)<br>Кнопки | ![Поля и список](docs/screenshots/06-fields-dropdown.jpg)<br>Поля ввода и выпадающий список |
| ![Таблица](docs/screenshots/07-table.jpg)<br>Таблица | ![Календарь и подсказка](docs/screenshots/08-calendar-tooltip.jpg)<br>Календарь периода и подсказка |
| ![Панель и диалог](docs/screenshots/09-drawer-dialog.jpg)<br>Боковая панель и диалог | ![Шаблоны страниц](docs/screenshots/10-page-templates.jpg)<br>Шаблоны страниц |
| ![Иконки](docs/screenshots/11-icons.jpg)<br>Иконки | |

## Что в репозитории

| Папка | Содержимое |
|---|---|
| `design/brandbook/` | Брендбук интерфейса (цвет, типографика, сетка, иконки, каркас, компоненты, шаблоны, правила) |
| `design/tokens/` | Дизайн-токены: 316 переменных `:root`, светлая и тёмная тема |
| `design/components/` | `base.css`, `layout.css`, `dropdown.css`, `checkbox.css`, `calendar.css`, демо; `ozon/` — 25 файлов компонентов |
| `design/fonts/` | Onest 2.0 (вариативный, лицензия OFL) |
| `design/icons/` | Спрайт иконок `icons.svg` |
| `design/build/` | Генератор брендбука |
| `design/RESEARCH.md` | Сводка исследования оригинала: цвета, размеры, состояния, маршруты |
| `docs/screenshots/` | Скриншоты брендбука |

Подробности и порядок подключения: [design/README.md](design/README.md).

## Что нельзя переносить

Логотип, название «Турбо ПВЗ», 3D-иллюстрации и рекламные баннеры принадлежат Ozon и в PartnerOffice не используются. В брендбуке вместо них заглушки. Скриншоты и исходные CSS оригинала в репозиторий не входят: на скриншотах реальные данные пункта выдачи.

## Статус

- Готово: токены, компоненты, брендбук.
- Не снято с оригинала: тёмная тема в виде страниц, формы действий и toast-уведомления, выбор месяца и года в календаре, мобильные ширины (<900px сверены только по CSS).
- Дальше: экраны PartnerOffice (заказы партнёру, карточка заказа, отгрузки) и интеграция с данными Studio2.
