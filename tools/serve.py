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
import json
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

    def do_POST(self):
        """Settings → Lock and invites saves a new master-password lock into js/core/access-config.js.
        Only from this Mac itself (not other Wi-Fi devices), and only that one file."""
        if self.path.split('?')[0] != '/__access-config':
            self.send_error(404)
            return
        if self.client_address[0] not in ('127.0.0.1', '::1', '::ffff:127.0.0.1'):
            self._reply(403, 'Set the master password in the preview on this Mac (localhost), not from another device.')
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
            config = json.loads(self.rfile.read(min(length, 20000)))
            ok = (isinstance(config, dict) and config.get('v') == 1
                  and all(isinstance(config.get(k), str) and config[k] for k in ('salt', 'check', 'publicKey'))
                  and isinstance(config.get('iterations'), int)
                  and isinstance(config.get('privateKey'), dict)
                  and all(isinstance(config['privateKey'].get(k), str) for k in ('iv', 'data')))
            if not ok:
                raise ValueError
        except ValueError:
            self._reply(400, 'That lock looked wrong, so nothing was saved.')
            return
        keep = {k: config[k] for k in ('v', 'salt', 'iterations', 'check', 'publicKey')}
        keep['privateKey'] = {'iv': config['privateKey']['iv'], 'data': config['privateKey']['data']}
        path = os.path.join(ROOT, 'js', 'core', 'access-config.js')
        with open(path, encoding='utf-8') as f:
            header = f.read().split('export const ACCESS', 1)[0]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(header + 'export const ACCESS = ' + json.dumps(keep, indent=2) + ';\n')
        self._reply(200, 'Saved.')

    def _reply(self, status, text):
        body = text.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


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
