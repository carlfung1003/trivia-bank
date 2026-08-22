#!/usr/bin/env python3
"""Local dev server that refuses to cache anything.

Python's default http.server sends Last-Modified, and browsers will happily
reuse a cached ES module without revalidating. Since an ES module's own
imports carry no ?v= query, a stale ./audio.js survives a reload of a freshly
versioned main.js — which cost a debugging round mid-build, with the page
reporting a method missing that was plainly there on disk.

Usage:  python3 scripts/serve.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "GET" in (args[0] if args else ""):
            return                      # quiet the per-asset noise
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    handler = partial(NoCacheHandler, directory=".")
    print(f"The Trivia Bank -> http://127.0.0.1:{port}/   (no-store)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
