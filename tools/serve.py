#!/usr/bin/env python3
"""Local preview server for Life Dashboard (for development only).

Serves the project folder to this Mac and to other devices on the same Wi-Fi,
and prints the addresses to open. Stop it with Control-C (or close the window).

    python3 tools/serve.py            # port 8000
    python3 tools/serve.py --port 8080
"""
import argparse
import functools
import http.server
import os
import socket
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
    }

    def end_headers(self):
        # Always check for a fresh copy, so edits show up on reload
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the window quiet


def lan_address():
    """This Mac's address on the local network (no data is actually sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
    except OSError:
        return None


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()

    try:
        httpd = Server(('0.0.0.0', args.port), functools.partial(Handler, directory=ROOT))
    except OSError:
        print(f'Port {args.port} is already in use. Is the preview already running?')
        print(f'Try:  python3 tools/serve.py --port {args.port + 1}')
        sys.exit(1)

    ip = lan_address()
    print('\n  Life Dashboard preview is running.\n')
    print(f'  On this Mac:      http://localhost:{args.port}')
    if ip:
        print(f'  On your iPhone:   http://{ip}:{args.port}   (same Wi-Fi network)')
    print('\n  Keep this window open while you preview. Press Control-C to stop.\n', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n  Stopped.')
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
