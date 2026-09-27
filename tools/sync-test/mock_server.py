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
    --code OLD.gs  runs another copy of the script (e.g. an older version, to test updating)

Ward Patients: other spreadsheets (like the practice logsheet the app can create)
live in the state's "files". To act like someone else editing a logsheet:
    GET  /__ward                                   → all of them (JSON)
    GET  /__ward/cell?id=…&row=2&col=4&value=text  → change a cell (&type=bool for TRUE/FALSE)
    GET  /__ward/swap?id=…&a=2&b=3                 → swap two rows (like sorting the sheet)
    GET  /__ward/delete?id=…&row=3                 → delete a row (a discharged patient)
    GET  /__ward/access?id=…&to=view|edit|none     → change your access to it
Use made-up patients only.
"""
import argparse
import http.server
import json
import os
import subprocess
import tempfile
import threading
import urllib.parse
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CODE = os.path.join(ROOT, 'apps-script', 'Code.gs')
MOCK = os.path.join(HERE, 'gas-mock.js')
RUNNER = os.path.join(HERE, 'run-gas.js')

LOCK = threading.Lock()          # one script run at a time, like LockService
RESPONSES = {}
STATE = {'path': None, 'offline': False, 'code': CODE}


def run_gas(mode, request_text=''):
    with LOCK:
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as req:
            req.write(request_text)
        try:
            done = subprocess.run(
                ['osascript', '-l', 'JavaScript', RUNNER, MOCK, STATE['code'], STATE['path'], mode, req.name],
                capture_output=True, text=True, timeout=60)
        finally:
            os.unlink(req.name)
        if done.returncode != 0:
            raise RuntimeError(done.stderr.strip())
        return done.stdout.strip()


def edit_state(change):
    """Change the pretend spreadsheets directly (like a person editing them)."""
    with LOCK:
        with open(STATE['path']) as f:
            text = f.read()
        state = json.loads(text) if text.strip() else {'sheets': [], 'props': {}, 'logs': [], 'files': {}}
        result = change(state)
        with open(STATE['path'], 'w') as f:
            json.dump(state, f)
        return result


def ward_edit(path, params):
    def first_tab(state):
        file = state.get('files', {}).get(params.get('id', ''))
        if not file:
            raise KeyError('no such spreadsheet')
        return file, file['sheets'][0]['rows']

    def change(state):
        file, rows = first_tab(state)
        if path == '/__ward/cell':
            row, col = int(params['row']), int(params['col'])
            value = params.get('value', '')
            if params.get('type') == 'bool':
                value = value.lower() == 'true'
            while len(rows) < row:
                rows.append([])
            while len(rows[row - 1]) < col:
                rows[row - 1].append('')
            rows[row - 1][col - 1] = value
        elif path == '/__ward/swap':
            a, b = int(params['a']) - 1, int(params['b']) - 1
            rows[a], rows[b] = rows[b], rows[a]
        elif path == '/__ward/delete':
            del rows[int(params['row']) - 1]
        elif path == '/__ward/access':
            file['access'] = params['to']
        return {'ok': True}
    return edit_state(change)


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
        params = {k: v[0] for k, v in urllib.parse.parse_qs(query, keep_blank_values=True).items()}
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
        if path == '/__ward':
            return self.send(200, json.dumps(edit_state(lambda state: state.get('files', {}))))
        if path.startswith('/__ward/'):
            try:
                return self.send(200, json.dumps(ward_edit(path, params)))
            except (KeyError, ValueError, IndexError) as err:
                return self.send(400, json.dumps({'ok': False, 'error': str(err)}))
        self.send(404, '{"error":"not found"}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=8124)
    parser.add_argument('--state', default=os.path.join(tempfile.gettempdir(), 'life-dashboard-mock-sheet.json'))
    parser.add_argument('--code', default=CODE, help='the Code.gs to run (default: apps-script/Code.gs)')
    args = parser.parse_args()
    STATE['path'] = args.state
    STATE['code'] = os.path.abspath(args.code)
    if not os.path.exists(args.state):
        open(args.state, 'w').close()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Pretend Apps Script at http://127.0.0.1:{args.port}/macros/s/TEST/exec (state: {args.state}, code: {STATE["code"]})', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
