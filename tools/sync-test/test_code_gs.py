#!/usr/bin/env python3
"""Checks apps-script/Code.gs against a pretend spreadsheet (no Google account needed).

    python3 tools/sync-test/test_code_gs.py
"""
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CODE = os.path.join(ROOT, 'apps-script', 'Code.gs')
MOCK = os.path.join(HERE, 'gas-mock.js')
RUNNER = os.path.join(HERE, 'run-gas.js')
STATE = tempfile.NamedTemporaryFile(suffix='.json', delete=False).name
FAILURES = []


def gas(mode, request=None):
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        f.write(json.dumps(request) if request is not None else '')
    done = subprocess.run(['osascript', '-l', 'JavaScript', RUNNER, MOCK, CODE, STATE, mode, f.name],
                          capture_output=True, text=True)
    os.unlink(f.name)
    if done.returncode:
        raise SystemExit(f'Script crashed: {done.stderr}')
    return json.loads(done.stdout)


def check(name, condition, detail=''):
    print(('  ok   ' if condition else '  FAIL ') + name + ('' if condition else f'  → {detail}'))
    if not condition:
        FAILURES.append(name)


def sheet(state, name):
    return next((s for s in state['sheets'] if s['name'] == name), None)


def rows_of(state, name):
    s = sheet(state, name)
    return [r for r in (s['rows'][1:] if s else []) if r and r[0]]


def rec(id_, updated, **fields):
    return {'id': id_, 'createdAt': '2026-09-01T00:00:00.000Z', 'updatedAt': updated, 'deletedAt': None, **fields}


print('Code.gs protocol checks')
open(STATE, 'w').close()

res = gas('post', {'action': 'ping', 'token': 'x', 'protocol': 1})
check('refuses requests before setup', res.get('error') == 'not-set-up', res)

token = gas('setup')['token']
check('setup creates a readable token', re.fullmatch(r'[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}', token or ''), token)
state = gas('dump')
names = [s['name'] for s in state['sheets']]
check('setup creates the tabs (Connection first)', names[0] == 'Connection' and {'Tasks', 'Workouts', 'Profile', 'Settings', 'Conflicts'} <= set(names), names)
check('connection tab shows the token', sheet(state, 'Connection')['rows'][2][1] == token)

base = {'protocol': 1, 'token': token}
check('wrong token is refused', gas('post', {**base, 'action': 'ping', 'token': 'AAAA-BBBB-CCCC-DDDD'}).get('error') == 'bad-token')
check('token works lowercase and without dashes', gas('post', {**base, 'action': 'ping', 'token': token.replace('-', '').lower()}).get('ok') is True)
check('old app versions are told to update', gas('post', {**base, 'action': 'ping', 'protocol': 99}).get('error') == 'protocol')
check('GET confirms the deployment', json.loads(subprocess.run(['osascript', '-l', 'JavaScript', RUNNER, MOCK, CODE, STATE, 'get'], capture_output=True, text=True).stdout).get('app') == 'life-dashboard-sync')

# Device A sends its data (more rows than the tiny mock sheet holds, to test growth)
tasks = [rec(f't{i}', '2026-09-26T10:00:00.000Z', title=f'Task {i}', priority='high', tags=['a', 'b']) for i in range(1, 9)]
tasks[0]['title'] = '=1+1'
res = gas('post', {**base, 'action': 'push', 'deviceId': 'Mac-aaaa', 'sinceSeq': 0,
                   'records': [{'store': 'profile', 'record': rec('me', '2026-09-26T09:00:00.000Z', nickname='Joey')}]
                   + [{'store': 'tasks', 'record': t} for t in tasks]})
check('push is accepted', res.get('ok') and res['seq'] == 1 and set(res['results'].values()) == {'applied'}, res)
state = gas('dump')
task_rows = rows_of(state, 'Tasks')
check('rows beyond the sheet size are added', len(task_rows) == 8, len(task_rows))
header = sheet(state, 'Tasks')['rows'][0]
check('readable columns are added after the fixed ones', header[:6] == ['id', 'updatedAt', 'deletedAt', 'seq', 'device', 'json'] and 'title' in header, header)
check('formulas are shown as text', task_rows[0][header.index('title')] == "'=1+1", task_rows[0][header.index('title')])
check('the full item is kept exactly', json.loads(task_rows[0][5]) == tasks[0])

res = gas('post', {**base, 'action': 'pull', 'sinceSeq': 0})
check('pull returns everything for a new device', res['seq'] == 1 and len(res['changes']) == 9, len(res.get('changes', [])))
check('pull returns nothing new when up to date', gas('post', {**base, 'action': 'pull', 'sinceSeq': 1})['changes'] == [])

# Device B (hasn't seen A's changes: sinceSeq 0) edits the same items
res = gas('post', {**base, 'action': 'push', 'deviceId': 'iPhone-bbbb', 'sinceSeq': 0, 'records': [
    {'store': 'tasks', 'record': rec('t1', '2026-09-26T11:00:00.000Z', title='Newer from iPhone')},
    {'store': 'tasks', 'record': rec('t2', '2026-09-26T08:00:00.000Z', title='Older from iPhone')},
    {'store': 'tasks', 'record': tasks[2]},
]})
r = res['results']
check('newest change wins', r['tasks:t1'] == 'applied', r)
check('older change is not applied', r['tasks:t2'] == 'stale', r)
check('identical item is recognised', r['tasks:t3'] == 'same', r)
state = gas('dump')
conflicts = rows_of(state, 'Conflicts')
check('both losing versions are kept in Conflicts', len(conflicts) == 2 and {c[2] for c in conflicts} == {'t1', 't2'}, conflicts)
check('Conflicts keeps the full losing item', json.loads([c for c in conflicts if c[2] == 't1'][0][7])['title'] == '=1+1')

res = gas('post', {**base, 'action': 'pull', 'sinceSeq': 1})
check('device A receives only the new change', [c['record']['title'] for c in res['changes']] == ['Newer from iPhone'], res['changes'])

# Same content saved on two devices at different times (e.g. default categories)
gas('post', {**base, 'action': 'push', 'deviceId': 'Mac-aaaa', 'sinceSeq': 2, 'records': [{'store': 'taskCategories', 'record': rec('cat-mba', '2026-09-26T07:00:00.000Z', name='MBA', order=2)}]})
res = gas('post', {**base, 'action': 'push', 'deviceId': 'iPhone-bbbb', 'sinceSeq': 0, 'records': [{'store': 'taskCategories', 'record': {**rec('cat-mba', '2026-09-26T12:00:00.000Z', order=2, name='MBA')}}]})
check('same content is not reported as a conflict', res['results']['taskCategories:cat-mba'] == 'same' and len(rows_of(gas('dump'), 'Conflicts')) == 2, res)

# Limits, logs and re-running setup
big = rec('me', '2026-09-26T13:00:00.000Z', photo='data:image/jpeg;base64,' + 'A' * 60000)
res = gas('post', {**base, 'action': 'push', 'deviceId': 'Mac-aaaa', 'sinceSeq': 5, 'records': [{'store': 'profile', 'record': big}],
                   'logs': [{'store': 'settings', 'id': 'app', 'reason': 'Replaced when this device joined sync', 'keptUpdatedAt': 'k', 'lostUpdatedAt': 'l', 'json': '{"id":"app"}'}]})
check('oversized items are refused, not truncated', res['results']['profile:me'] == 'too-large', res)
check('device logs are added to Conflicts', len(rows_of(gas('dump'), 'Conflicts')) == 3)
check('too many items at once are refused', gas('post', {**base, 'action': 'push', 'records': [{'store': 'tasks', 'record': rec(f'x{i}', 'z')} for i in range(501)]}).get('error') == 'too-many')
check('unknown data types are ignored', gas('post', {**base, 'action': 'push', 'records': [{'store': 'passwords', 'record': rec('p', 'z')}]})['results'] == {})

state = gas('dump')
sheet(state, 'Connection')['rows'][3][1] = 'https://script.google.com/macros/s/abc/exec'
with open(STATE, 'w') as f:
    json.dump(state, f)
check('running setup again keeps the same token', gas('setup')['token'] == token)
check('running setup again keeps the saved URL', sheet(gas('dump'), 'Connection')['rows'][3][1].startswith('https://script.google.com'))

os.unlink(STATE)
print(f'\n{"All checks passed." if not FAILURES else f"{len(FAILURES)} check(s) failed."}')
sys.exit(1 if FAILURES else 0)
