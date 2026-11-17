"""Поведенческие проверки: запускаются в контейнере python внутри docker-сети (web, vps, backend)."""
import http.client
import json
import socket
import sys
import time

WEB, VPS = ("web", 80), ("vps", 80)
SEC = ["x-content-type-options", "referrer-policy", "x-frame-options", "content-security-policy"]
failures = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def get(target, path, method="GET", headers=None, body=None):
    conn = http.client.HTTPConnection(*target, timeout=20)
    conn.request(method, path, body=body, headers=headers or {})
    r = conn.getresponse()
    data = r.read()
    hdrs = {}
    for k, v in r.getheaders():
        hdrs.setdefault(k.lower(), []).append(v)
    conn.close()
    return r.status, hdrs, data


def hits():
    return json.loads(get(("backend", 5002), "/__hits")[2])


def reset():
    get(("backend", 5002), "/__reset")


# ---- 1. Заголовки безопасности (по одному разу) и единственный Cache-Control в каждом location ----
cases = [  # path, ожидаемый статус, подстрока Cache-Control
    ("/", 200, None), ("/index.html", 200, "no-cache"), ("/assets/a.js", 200, "immutable"),
    ("/assets/missing.js", 404, None), ("/site.webmanifest", 200, "max-age=86400"),
    ("/brand/x.svg", 200, "max-age=604800"), ("/healthz", 200, None), ("/orders", 200, None),
    ("/partner-api/ping", 200, "no-store"), ("/partner-api/returns/events", 200, "no-store"),
]
for path, status, cc in cases:
    s, h, _ = get(WEB, path)
    check(s == status, f"web {path} -> {s}")
    for name in SEC:
        check(len(h.get(name, [])) == 1, f"web {path}: {name} x{len(h.get(name, []))}")
    ccs = h.get("cache-control", [])
    check(len(ccs) <= 1, f"web {path}: Cache-Control not duplicated {ccs}")
    if cc:
        check(any(cc in v for v in ccs), f"web {path}: Cache-Control has {cc!r}: {ccs}")
check("max-age=31536000" in " ".join(get(WEB, "/assets/a.js")[1].get("cache-control", [])), "assets one-year max-age")
s, h, _ = get(WEB, "/site.webmanifest")
check(h.get("content-type", [""])[0].startswith("application/manifest+json"), "manifest content-type")

# ---- 2. Загрузка фото: 10 МБ файла + multipart помещаются, 11M+1 нет — на обоих слоях ----
LIMIT = 11 * 1024 * 1024


def upload(target, size, send_all):
    sock = socket.create_connection(target, timeout=60)
    head = (f"POST /partner-api/returns/photos?key=k HTTP/1.1\r\nHost: x\r\nContent-Type: application/octet-stream\r\n"
            f"Content-Length: {size}\r\nConnection: close\r\n\r\n").encode()
    sock.sendall(head)
    try:
        if send_all:
            block = b"a" * 65536
            left = size
            while left > 0:
                n = min(left, len(block))
                sock.sendall(block[:n])
                left -= n
        else:
            sock.sendall(b"a" * 1024)
    except OSError:
        pass
    buf = b""
    try:
        while b"\r\n" not in buf:
            part = sock.recv(4096)
            if not part:
                break
            buf += part
    except OSError:
        pass
    sock.close()
    line = buf.split(b"\r\n")[0].decode(errors="replace")
    return int(line.split()[1]) if line.startswith("HTTP/") else 0


for name, target in (("web", WEB), ("vps", VPS)):
    check(upload(target, 10 * 1024 * 1024 + 4096, True) == 200, f"{name}: 10 MiB photo + multipart overhead accepted")
    check(upload(target, LIMIT, True) == 200, f"{name}: exactly 11M accepted")
    check(upload(target, LIMIT + 1, False) == 413, f"{name}: 11M+1 rejected with 413")

# ---- 3. Небезопасные закодированные пути блокируются ДО выбора location (server-level), query не трогаем ----
# http.client отправляет путь байт-в-байт, повторного кодирования нет.
bad = [
    "/partner-api/returns/%2e%2e/admin", "/partner-api/returns/%2E%2E%2Fadmin", "/partner-api/returns/.%2e/x",
    "/partner-api/returns/%2e./x", "/partner-api/a%2fb", "/partner-api/a%2Fb", "/partner-api/a%5cb", "/partner-api/a%5Cb",
    "/partner-api/a%00b", "/partner-api/%252e%252e/x", "/partner-api/a%252fb", "/partner-api/a/../b",
    "/partner-api/a%5c..%5cb", "/partner-api/a/..%2fb", "/partner-api/a/./b", "/partner-api/a/%2e/b", "/partner-api/a\\b",
    # nginx нормализует путь за пределы /partner-api/ (раньше: SPA 200 мимо проверки внутри location).
    "/partner-api/a/%2e%2e/%2e%2e/admin", "/partner-api/a/%2E%2E/%2E%2E/admin", "/partner-api/a/%2e%2e%2f..%2fb",
    "/partner-api/a/../../admin", "/partner-api/a/..", "/partner-api/a/%2e%2e", "/partner-api/a/%2e%2e?x=1",
    "/partner-api/returns/events/%2e%2e/%2e%2e/%2e%2e/x",
    # Нормализация приводит путь к /partner-api/..., а Studio2 получил бы исходный адрес.
    "/x/%2e%2e/partner-api/orders", "/%70artner-api/a%2fb", "/partner-api%2forders", "/x/../partner-api/orders",
    # Многослойное кодирование: 2, 3, 5 слоёв и закодированные цифры/буквы следующего слоя.
    "/partner-api/a/%252e%252e/%252e%252e/admin", "/partner-api/a/%25252e%25252e/%25252e%25252e/admin",
    "/partner-api/a/%2525252e%2525252e/x", "/partner-api/a%25252fb", "/partner-api/a%2525252fb", "/partner-api/a%25255cb",
    "/partner-api/a%252500b", "/partner-api/a/%25%32%65%25%32%65/x", "/partner-api/a/%252%65%252%65/x",
    "/partner-api/a/%2525%32%65/x", "/partner-api/a%25%32%66b", "/partner-api/a%25%35%63b", "/partner-api/a%25%30%30b",
    # Прочие обходы нормализации в бэкенде: overlong UTF-8, %u-кодирование.
    "/partner-api/a/%c0%ae%c0%ae/x", "/partner-api/a%c0%afb", "/partner-api/a/%e0%80%ae/x", "/partner-api/a/%u002e%u002e/x",
]
for path in bad:
    reset()
    s, _, _ = get(WEB, path)
    seen = hits()
    check(s == 400 and not seen, f"blocked {path} -> {s}, backend hits {seen}")
# Пути вне /partner-api с кодировками — SPA: охранник адресован только /partner-api.
for path in ["/orders/a%2fb", "/orders/%2e%2e/returns", "/assets/%2e%2e/index.html"]:
    reset()
    s, _, _ = get(WEB, path)
    check(s != 400 and not hits(), f"non-API path {path} not blocked by guard -> {s}")
good = [
    "/partner-api/orders?q=a%2fb%2e%2e&x=%5c", "/partner-api/orders/suggestions?q=%D0%B0%D0%B1%D0%B2&limit=10",
    "/partner-api/returns/photos/abc-123?key=a%2Fb%3Ac", "/partner-api/returns/photos?key=..%2f..%2fx",
    "/partner-api/returns/changes?since=1&loaded_key=%2e%2e",
    "/partner-api/orders/12/ozon/countries?search=%D0%A0%D0%BE%D1%81",
    # Кодировки только в query (в том числе многослойные и обходные): путь чист, query не проверяется.
    "/partner-api/orders?q=%252e%252e%252fx&p=%2e%2e%2f%2e%2e%2fadmin", "/partner-api/orders?path=/../x&b=%00%5c",
    "/partner-api/orders?q=a/%2e%2e/b", "/partner-api/orders?x=..", "/partner-api/orders?x=%u002e",
    # Не обход: буквальный "%" (%25 + не обходная последовательность), кириллица, точки внутри имён.
    "/partner-api/orders/100%25", "/partner-api/orders/50%25off", "/partner-api/orders/%D0%B0%D0%B1%D0%B2",
    "/partner-api/orders/a.b/c..d/.hidden", "/partner-api/orders/12/..x",
]
for path in good:
    reset()
    s, _, _ = get(WEB, path)
    seen = hits()
    check(s == 200 and seen == [path], f"allowed {path} -> {s}, backend saw {seen}")
reset()
s, _, _ = get(VPS, "/partner-api/orders?q=a%2fb")
check(s == 200 and hits() == ["/partner-api/orders?q=a%2fb"], "vps passes query encodings to backend")

# ---- 4. SSE: события приходят по мере появления (без буферизации и gzip) ----
for name, target in (("web", WEB), ("vps", VPS)):
    conn = http.client.HTTPConnection(*target, timeout=30)
    conn.request("GET", "/partner-api/returns/events", headers={"Accept": "text/event-stream", "Accept-Encoding": "gzip"})
    started = time.time()
    r = conn.getresponse()
    check(r.getheader("Content-Type", "").startswith("text/event-stream"), f"{name} SSE content-type")
    check(r.getheader("Content-Encoding") is None, f"{name} SSE not compressed")
    arrivals = []
    buf = b""
    while len(arrivals) < 3:
        chunk = r.read1(4096)
        if not chunk:
            break
        buf += chunk
        while buf.count(b"\n\n") > len(arrivals):
            arrivals.append(round(time.time() - started, 2))
    conn.close()
    check(len(arrivals) == 3, f"{name} SSE got 3 events: {arrivals}")
    check(bool(arrivals) and arrivals[0] < 1.0, f"{name} SSE first event immediately ({arrivals[:1]})")
    check(len(arrivals) == 3 and arrivals[1] < 2.5 and arrivals[2] > 2.5, f"{name} SSE events are not batched: {arrivals}")

# ---- 5. Прокси-заголовки сохранены ----
s, _, data = get(WEB, "/partner-api/ping", headers={"X-Real-IP": "203.0.113.7"})
echo = json.loads(data)
check(echo["host"] == "studio2.test" and echo["xff"] == "203.0.113.7" and echo["xrip"] == "203.0.113.7",
      f"proxy headers kept {echo}")

print(f"\n{len(failures)} failure(s)")
sys.exit(1 if failures else 0)
