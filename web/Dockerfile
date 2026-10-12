# Сборка из корня репозитория: фронтенд берёт токены, шрифт и иконки из ../design.
#   docker build -f web/Dockerfile -t partner-office:latest .
FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY design design
COPY web web
# Тесты и типы гоняет CI до сборки образа; здесь build делает tsc и vite.
RUN cd web && npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
# Шаблон рендерится при старте контейнера (envsubst только по переменным окружения, $-переменные nginx не трогаются).
COPY web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV STUDIO2_UPSTREAM=http://studio2-web-1:5002 \
    STUDIO2_HOST=studio2.mpsuper.ru
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
