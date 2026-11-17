"""Фейковый Studio2 для проверки nginx: эхо запроса, приём тела, SSE с паузами."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HITS = []
LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "private, max-age=60")  # nginx не должен дублировать Cache-Control
        self.end_headers()
        self.wfile.write(body)

    def _handle(self):
        length = int(self.headers.get("Content-Length") or 0)
        received = 0
        while received < length:
            chunk = self.rfile.read(min(65536, length - received))
            if not chunk:
                break
            received += len(chunk)
        path = self.path
        if path == "/__hits":
            with LOCK:
                return self._json(HITS)
        if path == "/__reset":
            with LOCK:
                HITS.clear()
            return self._json([])
        with LOCK:
            HITS.append(path)
        if path.split("?")[0] == "/partner-api/returns/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            for i in range(3):
                self.wfile.write(f"event: revision\ndata: {i}\n\n".encode())
                self.wfile.flush()
                if i < 2:
                    time.sleep(1.5)
            return
        self._json({"uri": path, "received": received, "host": self.headers.get("Host"),
                    "xff": self.headers.get("X-Forwarded-For"), "xrip": self.headers.get("X-Real-IP")})

    do_GET = do_POST = do_DELETE = do_PUT = _handle


ThreadingHTTPServer(("0.0.0.0", 5002), Handler).serve_forever()
