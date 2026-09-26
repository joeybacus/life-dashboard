#!/usr/bin/env python3
"""Pretend Google Apps Script web app, for testing sync on this Mac.

It runs the real apps-script/Code.gs (with mocked Google services, via macOS's
built-in JavaScript engine) and answers like a deployed Apps Script web app:
a POST gets a 302 redirect to an "echo" URL that returns the JSON result.

    python3 tools/sync-test/mock_server.py            # http://127.0.0.1:8124
    Web app URL for the app:  http://127.0.0.1:8124/macros/s/TEST/exec
    GET  /__setup   → runs setup() and returns the secret token
    GET  /__state   → the pretend spreadsheet (JSON)
    GET  /__reset   → starts over with an empty spreadsheet
    GET  /__offline?on=1|0 → simulate Google being unreachable
"""
import argparse
import http.server
import json
import os
import subprocess
import tempfile
import threading
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CODE = os.path.join(ROOT, 'apps-script', 'Code.gs')
MOCK = os.path.join(HERE, 'gas-mock.js')
RUNNER = os.path.join(HERE, 'run-gas.js')

LOCK = threading.Lock()          # one script run at a time, like LockService
RESPONSES = {}
STATE = {'path': None, 'offline': False}


def run_gas(mode, request_text=''):
    with LOCK:
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as req:
            req.write(request_text)
        try:
            done = subprocess.run(
                ['osascript', '-l', 'JavaScript', RUNNER, MOCK, CODE, STATE['path'], mode, req.name],
                capture_output=True, text=True, timeout=60)
        finally:
            os.unlink(req.name)
        if done.returncode != 0:
            raise RuntimeError(done.stderr.strip())
        return done.stdout.strip()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, status, body='', content_type='application/json', headers=None):
        data = body.encode()
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        # Real Apps Script web apps don't answer CORS preflight requests
        self.send_response(405)
        self.end_headers()

    def do_POST(self):
        if STATE['offline']:
            self.close_connection = True
            return
        if not (self.path.startswith('/macros/') and self.path.rstrip('/').endswith('/exec')):
            return self.send(404, '{"error":"not found"}')
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode('utf-8')
        try:
            result = run_gas('post', body)
        except Exception as err:  # the real service shows an HTML error page
            return self.send(500, f'<html><body>Script error: {err}</body></html>', 'text/html')
        key = uuid.uuid4().hex
        RESPONSES[key] = result
        self.send(302, '', 'text/html', {'Location': f'/macros/echo?user_content_key={key}'})

    def do_GET(self):
        path, _, query = self.path.partition('?')
        params = dict(p.split('=', 1) for p in query.split('&') if '=' in p)
        if path == '/macros/echo':
            return self.send(200, RESPONSES.pop(params.get('user_content_key', ''), '{"ok":false,"error":"expired"}'))
        if path.startswith('/macros/') and path.rstrip('/').endswith('/exec'):
            return self.send(200, run_gas('get'))
        if path == '/__setup':
            return self.send(200, run_gas('setup'))
        if path == '/__state':
            return self.send(200, run_gas('dump'))
        if path == '/__reset':
            with LOCK:
                open(STATE['path'], 'w').close()
            return self.send(200, '{"ok":true}')
        if path == '/__offline':
            STATE['offline'] = params.get('on') == '1'
            return self.send(200, json.dumps({'offline': STATE['offline']}))
        self.send(404, '{"error":"not found"}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=8124)
    parser.add_argument('--state', default=os.path.join(tempfile.gettempdir(), 'life-dashboard-mock-sheet.json'))
    args = parser.parse_args()
    STATE['path'] = args.state
    if not os.path.exists(args.state):
        open(args.state, 'w').close()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Pretend Apps Script at http://127.0.0.1:{args.port}/macros/s/TEST/exec (state: {args.state})', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
