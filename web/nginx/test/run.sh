#!/usr/bin/env bash
# Проверка nginx-конфигов в docker: `bash web/nginx/test/run.sh` из корня репозитория.
#   WEB_IMAGE=partner-office:test bash web/nginx/test/run.sh   # проверить собранный образ, а не шаблон из рабочей копии
# Поднимает фейковый Studio2, контейнер partner-office (внутренний nginx) и VPS-слой (deploy/vps-nginx/...).
# TLS на VPS-слое в тесте заменён на plain HTTP (listen 80): остальной конфиг берётся из эталона как есть.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
T="$ROOT/web/nginx/test"
TMP="$(mktemp -d)"
NET="po-nginx-test-$$"
NGINX_IMAGE="${NGINX_IMAGE:-nginx:1.27-alpine}"
PY_IMAGE="${PY_IMAGE:-python:3-alpine}"
cleanup() {
  docker rm -f "po-backend-$$" "po-web-$$" "po-vps-$$" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  python3 -I -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$TMP"
}
trap cleanup EXIT

# --- статика-заглушка ---
mkdir -p "$TMP/html/assets" "$TMP/html/brand" "$TMP/vps/snippets"
echo '<div id="root"></div>' > "$TMP/html/index.html"
echo 'console.log(1)' > "$TMP/html/assets/a.js"
echo '<svg xmlns="http://www.w3.org/2000/svg"/>' > "$TMP/html/brand/x.svg"
echo '{"name":"t"}' > "$TMP/html/site.webmanifest"
: > "$TMP/vps/snippets/errorpages.conf"

# --- VPS-слой из эталона: другой upstream, без TLS и без порта-80 редиректа ---
python3 -I - "$ROOT/deploy/vps-nginx/partner-office.mpsuper.ru" "$TMP/vps/site.conf" "po-web-$$" <<'PY'
import re
import sys

src, dst, web = sys.argv[1:4]
text = open(src, encoding="utf-8").read()
first = text.index("server {")
second = text.index("server {", first + 1)
text = text[:first] + text[second:]  # первый server: ACME и редирект
text = text.replace("192.168.1.130:5014", web + ":80")
text = text.replace("listen 127.0.0.1:8454 ssl http2;", "listen 80;")
text = re.sub(r"^\s*ssl_\w+ .*;\n", "", text, flags=re.M)
open(dst, "w", encoding="utf-8").write(text)
PY

docker network create "$NET" >/dev/null
docker run -d --name "po-backend-$$" --network "$NET" --network-alias backend \
  -v "$T/backend.py:/backend.py:ro" "$PY_IMAGE" python -u /backend.py >/dev/null

WEB_MOUNTS=(-v "$TMP/html:/usr/share/nginx/html:ro")
if [ -z "${WEB_IMAGE:-}" ]; then
  WEB_IMAGE="$NGINX_IMAGE"
  WEB_MOUNTS+=(-v "$ROOT/web/nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro")
  if [ -f "$ROOT/web/nginx/security-headers.inc" ]; then
    WEB_MOUNTS+=(-v "$ROOT/web/nginx/security-headers.inc:/etc/nginx/snippets/security-headers.inc:ro")
  fi
fi
docker run -d --name "po-web-$$" --network "$NET" --network-alias "po-web-$$" --network-alias web \
  -e STUDIO2_UPSTREAM=http://backend:5002 -e STUDIO2_HOST=studio2.test "${WEB_MOUNTS[@]}" "$WEB_IMAGE" >/dev/null
docker run -d --name "po-vps-$$" --network "$NET" --network-alias vps \
  -v "$TMP/vps/site.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$TMP/vps/snippets:/etc/nginx/snippets:ro" "$NGINX_IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "po-web-$$" wget -q -O /dev/null http://127.0.0.1/healthz 2>/dev/null \
     && docker exec "po-vps-$$" wget -q -O /dev/null http://127.0.0.1/healthz 2>/dev/null; then break; fi
  sleep 1
done
echo "== nginx -t =="
docker exec "po-web-$$" nginx -t
docker exec "po-vps-$$" nginx -t
docker exec "po-web-$$" nginx -T > "$TMP/web.conf" 2>/dev/null
docker exec "po-vps-$$" nginx -T > "$TMP/vps.conf" 2>/dev/null

rc=0
echo "== config =="; python3 -I "$T/config_test.py" "$TMP/web.conf" "$TMP/vps.conf" || rc=1
echo "== behavior =="
docker run --rm --network "$NET" -v "$T/behavior.py:/behavior.py:ro" "$PY_IMAGE" python -I /behavior.py || rc=1
if [ $rc -eq 0 ]; then echo "ALL PASSED"; else echo "FAILED"; docker logs "po-web-$$" 2>&1 | tail -15; fi
exit $rc
