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
SCRIPT_VERSION = 4
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
check('setup creates the tabs (Connection first)', names[0] == 'Connection' and {'Tasks', 'Workouts', 'Exercises', 'Workout templates', 'Profile', 'Settings', 'Conflicts'} <= set(names), names)
check('connection tab shows the token', sheet(state, 'Connection')['rows'][2][1] == token)

base = {'protocol': 1, 'token': token}
check('wrong token is refused', gas('post', {**base, 'action': 'ping', 'token': 'AAAA-BBBB-CCCC-DDDD'}).get('error') == 'bad-token')
check('token works lowercase and without dashes', gas('post', {**base, 'action': 'ping', 'token': token.replace('-', '').lower()}).get('ok') is True)
check('ping reports the script version', gas('post', {**base, 'action': 'ping'}).get('version') == SCRIPT_VERSION)
check('old app versions are told to update', gas('post', {**base, 'action': 'ping', 'protocol': 99}).get('error') == 'protocol')
check('GET confirms the deployment', json.loads(subprocess.run(['osascript', '-l', 'JavaScript', RUNNER, MOCK, CODE, STATE, 'get'], capture_output=True, text=True).stdout).get('app') == 'life-dashboard-sync')

# Device A sends its data (more rows than the tiny mock sheet holds, to test growth)
tasks = [rec(f't{i}', '2026-09-26T10:00:00.000Z', title=f'Task {i}', priority='high', tags=['a', 'b']) for i in range(1, 9)]
tasks[0]['title'] = '=1+1'
res = gas('post', {**base, 'action': 'push', 'deviceId': 'Mac-aaaa', 'sinceSeq': 0,
                   'records': [{'store': 'profile', 'record': rec('me', '2026-09-26T09:00:00.000Z', nickname='Joey')}]
                   + [{'store': 'tasks', 'record': t} for t in tasks]})
check('push is accepted', res.get('ok') and res['seq'] == 1 and set(res['results'].values()) == {'applied'} and res.get('version') == SCRIPT_VERSION, res)
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

# Phase 2 data: workouts carry their exercises; templates and exercises get their own tabs
workout = rec('w1', '2026-09-27T09:00:00.000Z', title='Push day', muscleGroups=['Push'],
              exercises=[{'id': 'e1', 'exerciseId': 'bench-press-barbell', 'name': 'Bench Press (Barbell)',
                          'sets': [{'id': 's1', 'type': 'normal', 'weightKg': 70, 'reps': 8, 'done': True}]},
                         {'id': 'e2', 'exerciseId': 'lateral-raise-dumbbell', 'name': 'Lateral Raise (Dumbbell)', 'sets': []}])
res = gas('post', {**base, 'action': 'push', 'deviceId': 'Mac-aaaa', 'sinceSeq': 5, 'records': [
    {'store': 'workouts', 'record': workout},
    {'store': 'templates', 'record': rec('t-push', '2026-09-27T09:00:00.000Z', name='Push Day', exercises=[])},
    {'store': 'exercises', 'record': rec('bench-press-barbell', '2026-09-27T09:00:00.000Z', favorite=True)},
]})
check('workouts, templates and exercises are accepted', set(res['results'].values()) == {'applied'} and len(res['results']) == 3, res)
state = gas('dump')
w_header = sheet(state, 'Workouts')['rows'][0]
w_row = rows_of(state, 'Workouts')[0]
check('a workout\'s exercises are listed by name', w_row[w_header.index('exercises')] == 'Bench Press (Barbell), Lateral Raise (Dumbbell)', w_row)
check('the full workout is kept exactly', json.loads(w_row[5]) == workout)
check('templates get their own tab', len(rows_of(state, 'Workout templates')) == 1 and len(rows_of(state, 'Exercises')) == 1)
res = gas('post', {**base, 'action': 'pull', 'sinceSeq': 4})
check('pull returns the new kinds of data', sorted(c['store'] for c in res['changes']) == ['exercises', 'templates', 'workouts'] and res.get('version') == SCRIPT_VERSION, res)

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

# ---------------------------------------------------------------------------
print('\nWard Patients checks (made-up patients only)')


def save_state(state):
    with open(STATE, 'w') as f:
        json.dump(state, f)


def add_logsheet(file_id, rows, access='edit', max_cols=26, name='Ward logsheet', **sheet_extra):
    state = gas('dump')
    state.setdefault('files', {})[file_id] = {
        'name': name, 'tz': 'Asia/Manila', 'access': access,
        'sheets': [{'name': 'Sheet1', 'rows': rows, 'maxRows': 200, 'maxCols': max_cols, **sheet_extra},
                   {'name': 'Archive', 'rows': [], 'maxRows': 50, 'maxCols': 10}]}
    save_state(state)


def log_rows(file_id, tab='Sheet1'):
    f = gas('dump')['files'][file_id]
    return next(s for s in f['sheets'] if s['name'] == tab)['rows']


def edit_cell(file_id, row, col, value):
    state = gas('dump')
    rows = next(s for s in state['files'][file_id]['sheets'] if s['name'] == 'Sheet1')['rows']
    while len(rows) < row:
        rows.append([])
    while len(rows[row - 1]) < col:
        rows[row - 1].append('')
    rows[row - 1][col - 1] = value
    save_state(state)


def cell(rows, row, col):
    line = rows[row - 1] if len(rows) >= row else []
    return line[col - 1] if len(line) >= col else ''


HEAD = ['Name', 'Hospital Number', 'Laboratory Results', 'Recommendations']
LOG = '1' + 'L' * 43
add_logsheet(LOG, [
    HEAD,
    ['Patient A', '1001', 'Na 135\nK 4.0\n', 'Continue meds'],
    ['Patient B', ' 1002 ', 'WBC 12', 'PRIORITY: CT today'],
    ['', '1099', 'ignored row (no name)', 'x'],
    ['Patient C', 'ab-1003', '', ''],
    ['Patient D', '1004', '', {'__f': '=CONCAT("from ","formula")', 'v': 'from formula'}],
    ['Patient E', '1005', '', ''],
    ['Patient E twin', '1005', '', ''],
])
ward = {**base, 'spreadsheetId': LOG, 'tab': 'Sheet1'}
A_TO_B = [r[:2] for r in log_rows(LOG)]

check('ward actions need the secret token', gas('post', {**ward, 'action': 'wardSync', 'token': 'AAAA-BBBB-CCCC-DDDD'}).get('error') == 'bad-token')
check('a malformed spreadsheet ID is refused', gas('post', {**ward, 'action': 'wardCheck', 'spreadsheetId': 'abc'}).get('error') == 'ward-bad-id')
check('a spreadsheet that can\'t be opened is reported', gas('post', {**ward, 'action': 'wardCheck', 'spreadsheetId': '1' + 'Z' * 43}).get('error') == 'ward-no-access')
res = gas('post', {**ward, 'action': 'wardCheck', 'tab': 'Ward 3'})
check('a missing tab is reported with the tab names', res.get('error') == 'ward-no-tab' and res.get('tabs') == ['Sheet1', 'Archive'], res)
res = gas('post', {**ward, 'action': 'wardCheck', 'tab': '  sheet1 '})
check('the tab name ignores capitals and spaces', res.get('ok') and res.get('tab') == 'Sheet1', res)
check('check: empty E–G, editable, 6 named patients', res.get('headers', {}).get('state') == 'empty' and res.get('canEdit') is True and res.get('patients') == 6, res)

res = gas('post', {**ward, 'action': 'wardSync'})
rows = res.get('rows', [])
check('rows without a name are ignored', [r['name'] for r in rows] == ['Patient A', 'Patient B', 'Patient C', 'Patient D', 'Patient E', 'Patient E twin'], rows)
check('row numbers are the sheet\'s', [r['row'] for r in rows] == [2, 3, 5, 6, 7, 8], [r['row'] for r in rows])
check('lab results keep their line breaks', rows[0]['labs'] == 'Na 135\nK 4.0', repr(rows[0]['labs']))
check('hospital numbers are trimmed', rows[1]['hn'] == '1002')
check('E–G aren\'t read while they aren\'t ours', 'rounded' not in rows[0])
check('reading never writes headings', cell(log_rows(LOG), 1, 5) == '' and not res.get('claimed'))

res = gas('post', {**ward, 'action': 'wardSync', 'claim': True})
check('claim adds the E–G headings', res.get('claimed') and [cell(log_rows(LOG), 1, c) for c in (5, 6, 7)] == ['Rounded', 'Rounds Start', 'Rounds End'], res.get('headers'))
check('after claiming, rounds are read', res['headers']['state'] == 'ours' and res['rows'][0].get('rounded') is False and res['rows'][0].get('start') == '')


def write(writes, **extra):
    return gas('post', {**ward, 'action': 'wardSync', 'writes': writes, **extra})


res = write([{'id': 'w1', 'hn': '1001', 'expect': {'D': 'Continue meds'}, 'set': {'D': 'Continue meds\nStart physio'}}])
check('a recommendation is saved', res['results']['w1']['status'] == 'ok' and cell(log_rows(LOG), 2, 4) == 'Continue meds\nStart physio', res['results'])
check('the saved list comes back with it', res['rows'][0]['recs'] == 'Continue meds\nStart physio')

edit_cell(LOG, 2, 4, 'Edited by a co-resident')
res = write([{'id': 'w2', 'hn': '1001', 'expect': {'D': 'Continue meds\nStart physio'}, 'set': {'D': 'My newer version'}}])
r = res['results']['w2']
check('a cell changed by someone else is not overwritten', r['status'] == 'conflict' and r['current']['D'] == 'Edited by a co-resident' and cell(log_rows(LOG), 2, 4) == 'Edited by a co-resident', r)
res = write([{'id': 'w3', 'hn': '1001', 'expect': {'D': 'Continue meds'}, 'set': {'D': 'Edited by a co-resident'}}])
check('a change already in the sheet counts as saved', res['results']['w3']['status'] == 'same')
res = write([{'id': 'w4', 'hn': '1001', 'expect': {'D': 'x'}, 'set': {'D': 'y'}, 'quiet': True}])
check('a quiet write that no longer applies is skipped', res['results']['w4']['status'] == 'skipped' and cell(log_rows(LOG), 2, 4) == 'Edited by a co-resident')

# Someone sorts the sheet: Patient A moves from row 2 to row 3
state = gas('dump')
lrows = next(s for s in state['files'][LOG]['sheets'] if s['name'] == 'Sheet1')['rows']
lrows[1], lrows[2] = lrows[2], lrows[1]
save_state(state)
A_TO_B = [r[:2] for r in log_rows(LOG)]
res = write([{'id': 'w5', 'hn': '1001', 'expect': {'D': 'Edited by a co-resident'}, 'set': {'D': 'Saved after the move'}}])
check('a write finds the patient\'s new row', res['results']['w5'] == {'status': 'ok', 'row': 3} and cell(log_rows(LOG), 3, 4) == 'Saved after the move' and cell(log_rows(LOG), 2, 4) == 'PRIORITY: CT today', res['results'])

res = write([
    {'id': 'n1', 'hn': '9999', 'expect': {'D': ''}, 'set': {'D': 'x'}},
    {'id': 'n2', 'hn': '1005', 'expect': {'D': ''}, 'set': {'D': 'x'}},
    {'id': 'n3', 'hn': '1004', 'expect': {'D': 'from formula'}, 'set': {'D': 'x'}},
    {'id': 'n4', 'hn': '1099', 'expect': {'D': 'x'}, 'set': {'D': 'y'}},
    {'id': 'n5', 'hn': '1001', 'expect': {}, 'set': {'A': 'Renamed'}},
    {'id': 'n6', 'hn': '1001', 'expect': {}, 'set': {'B': '2002', 'D': 'x'}},
    {'id': 'n7', 'hn': '1001', 'expect': {}, 'set': {'A': 'x', 'C': 'labs'}},
    {'id': 'n8', 'hn': '1001', 'expect': {'E': False}, 'set': {'E': True, 'F': 'soon'}},
    {'id': 'n9', 'hn': 'AB-1003', 'expect': {'D': ''}, 'set': {'D': '=HYPERLINK("x")'}},
])
st = {k: v['status'] for k, v in res['results'].items()}
check('unknown hospital number → not-found', st['n1'] == 'not-found', st)
check('duplicate hospital number → duplicate (nothing written)', st['n2'] == 'duplicate' and cell(log_rows(LOG), 7, 4) == '' and cell(log_rows(LOG), 8, 4) == '', st)
check('a formula cell is never overwritten', st['n3'] == 'formula' and log_rows(LOG)[5][3]['__f'].startswith('=CONCAT'), st)
check('rows without a name can\'t be written', st['n4'] == 'not-found', st)
check('columns A and B are never written', st['n5'] == st['n6'] == st['n7'] == 'invalid' and [r[:2] for r in log_rows(LOG)] == A_TO_B, st)
check('times must look like 2026-09-27 08:15', st['n8'] == 'invalid', st)
check('hospital numbers match ignoring capitals', st['n9'] == 'ok', st)
check('text that looks like a formula is saved as text', cell(log_rows(LOG), 5, 4) == '=HYPERLINK("x")')

# Lab results (column C) can be edited too, with the same protections
res = write([{'id': 'c1', 'hn': '1002', 'expect': {'C': 'WBC 12'}, 'set': {'C': 'WBC 12\nCRP 20'}}])
check('lab results are saved to column C', res['results']['c1']['status'] == 'ok' and cell(log_rows(LOG), 2, 3) == 'WBC 12\nCRP 20' and cell(log_rows(LOG), 2, 1) == 'Patient B', res['results'])
edit_cell(LOG, 2, 3, 'Updated by the lab')
res = write([{'id': 'c2', 'hn': '1002', 'expect': {'C': 'WBC 12\nCRP 20'}, 'set': {'C': 'My newer labs'}}])
check('lab results changed by someone else are not overwritten', res['results']['c2']['status'] == 'conflict' and res['results']['c2']['current']['C'] == 'Updated by the lab' and cell(log_rows(LOG), 2, 3) == 'Updated by the lab', res['results'])
edit_cell(LOG, 6, 3, {'__f': '=IMPORTRANGE("x","y")', 'v': 'imported'})
res = write([{'id': 'c3', 'hn': '1004', 'expect': {'C': 'imported'}, 'set': {'C': 'typed'}}])
check('lab results from a formula are never overwritten', res['results']['c3']['status'] == 'formula' and log_rows(LOG)[5][2]['__f'].startswith('=IMPORTRANGE'), res['results'])

tick = {'E': True, 'F': '2026-09-27 08:00', 'G': '2026-09-27 08:15'}
res = write([{'id': 't1', 'hn': '1002', 'expect': {'E': False, 'F': '', 'G': ''}, 'set': tick}])
lr = log_rows(LOG)
check('ticking writes Rounded, Rounds Start and Rounds End', res['results']['t1']['status'] == 'ok' and [cell(lr, 2, c) for c in (5, 6, 7)] == [True, '2026-09-27 08:00', '2026-09-27 08:15'], [cell(lr, 2, c) for c in (5, 6, 7)])
b = next(r for r in res['rows'] if r['hn'] == '1002')
check('the tick reads back', b['rounded'] is True and b['start'] == '2026-09-27 08:00' and b['end'] == '2026-09-27 08:15', b)
res = write([{'id': 't2', 'hn': '1002', 'expect': tick, 'set': {'E': False, 'F': '2026-09-27 08:00', 'G': ''}}])
lr = log_rows(LOG)
check('unticking clears Rounds End only', res['results']['t2']['status'] == 'ok' and [cell(lr, 2, c) for c in (5, 6, 7)] == [False, '2026-09-27 08:00', ''], [cell(lr, 2, c) for c in (5, 6, 7)])

# A time typed by hand (a real date value) reads as Manila time
edit_cell(LOG, 3, 7, {'__date': '2026-09-26T01:30:00.000Z'})
edit_cell(LOG, 3, 5, True)
a = next(r for r in gas('post', {**ward, 'action': 'wardSync'})['rows'] if r['hn'] == '1001')
check('date values are read as Manila time', a['end'] == '2026-09-26 09:30', a)

# New day: yesterday's ticks are reset (only E); today's and undated ones stay
edit_cell(LOG, 5, 5, True)                   # ab-1003: ticked, but no date
edit_cell(LOG, 2, 5, True)                   # 1002: ticked today (F set, G empty → uses F)
res = gas('post', {**ward, 'action': 'wardSync', 'resetBefore': '2026-09-27'})
lr = log_rows(LOG)
check('ticks from an earlier day are reset', [x['hn'] for x in res['reset']] == ['1001'] and cell(lr, 3, 5) is False, res['reset'])
check('reset keeps the last rounds times', res['reset'][0]['end'] == '2026-09-26 09:30' and cell(lr, 3, 7) == {'__date': '2026-09-26T01:30:00.000Z'})
check('today\'s and undated ticks are kept', cell(lr, 2, 5) is True and cell(lr, 5, 5) is True)

# Columns E–G already used for something else: stop, don't overwrite
TAKEN = '1' + 'T' * 43
add_logsheet(TAKEN, [HEAD + ['Plan', '', 'Notes'], ['Patient F', '2001', '', '', 'keep this', '', '']])
tw = {**base, 'spreadsheetId': TAKEN, 'tab': 'Sheet1'}
res = gas('post', {**tw, 'action': 'wardCheck'})
check('other headings in E1:G1 are detected', res['headers'] == {'state': 'taken', 'values': ['Plan', '', 'Notes'], 'dataBelow': False}, res['headers'])
res = gas('post', {**tw, 'action': 'wardSync', 'claim': True, 'writes': [
    {'id': 'x1', 'hn': '2001', 'expect': {'E': False, 'F': '', 'G': ''}, 'set': tick},
    {'id': 'x2', 'hn': '2001', 'expect': {'D': ''}, 'set': {'D': 'recs still save'}}]})
lr = log_rows(TAKEN)
check('rounds are refused when E–G are taken', res['results']['x1']['status'] == 'headers-taken' and lr[0][4:7] == ['Plan', '', 'Notes'] and lr[1][4] == 'keep this', res['results'])
check('recommendations still save', res['results']['x2']['status'] == 'ok' and lr[1][3] == 'recs still save')
check('rounds aren\'t read from someone else\'s columns', 'rounded' not in res['rows'][0])

BELOW = '1' + 'B' * 43
add_logsheet(BELOW, [HEAD, ['Patient G', '3001', '', '', '', 'something', '']])
res = gas('post', {**base, 'spreadsheetId': BELOW, 'tab': 'Sheet1', 'action': 'wardSync', 'claim': True})
check('data under empty headings counts as taken', res['headers']['state'] == 'taken' and res['headers']['dataBelow'] and not res['claimed'], res['headers'])

PART = '1' + 'P' * 43
add_logsheet(PART, [HEAD + ['rounded'], ['Patient H', '4001', '', '', True]], max_cols=5)
res = gas('post', {**base, 'spreadsheetId': PART, 'tab': 'Sheet1', 'action': 'wardSync', 'claim': True})
check('partly added headings are completed (and the sheet widened)', res['claimed'] and log_rows(PART)[0][4:7] == ['rounded', 'Rounds Start', 'Rounds End'] and res['headers']['state'] == 'ours', res.get('headers'))

VIEW = '1' + 'V' * 43
add_logsheet(VIEW, [HEAD, ['Patient J', '5001', '', 'old']], access='view')
vw = {**base, 'spreadsheetId': VIEW, 'tab': 'Sheet1'}
check('view-only access is detected', gas('post', {**vw, 'action': 'wardCheck'}).get('canEdit') is False)
res = gas('post', {**vw, 'action': 'wardSync', 'writes': [
    {'id': 'v1', 'hn': '5001', 'expect': {'D': 'old'}, 'set': {'D': 'new'}},
    {'id': 'v2', 'hn': '5001', 'expect': {'E': False, 'F': '', 'G': ''}, 'set': tick}]})
check('writes to a view-only logsheet report read-only', res['results']['v1']['status'] == 'read-only' and res['results']['v2']['status'] == 'read-only' and log_rows(VIEW)[1][3] == 'old', res['results'])
check('the list still loads', res.get('ok') and res['rows'][0]['name'] == 'Patient J')

PROT = '1' + 'Q' * 43
add_logsheet(PROT, [HEAD, ['Patient K', '6001', '', 'old']], protectedCols=[4])
res = gas('post', {**base, 'spreadsheetId': PROT, 'tab': 'Sheet1', 'action': 'wardSync', 'writes': [{'id': 'p1', 'hn': '6001', 'expect': {'D': 'old'}, 'set': {'D': 'new'}}]})
check('a protected column is reported', res['results']['p1']['status'] == 'protected', res['results'])

# Practice logsheet with made-up patients
res = gas('post', {**base, 'action': 'wardCreateTest'})
check('a practice logsheet can be created', res.get('ok') and res.get('tab') == 'Sheet1' and res['url'].endswith('/edit'), res)
test_file = gas('dump')['files'][res['spreadsheetId']]
check('it uses Manila time and made-up patients', test_file['tz'] == 'Asia/Manila' and all(r[0].startswith('Test Patient') for r in test_file['sheets'][0]['rows'][1:] if r[0]))
res = gas('post', {**base, 'spreadsheetId': res['spreadsheetId'], 'tab': 'Sheet1', 'action': 'wardSync', 'claim': True})
check('the practice logsheet loads (10 patients, one without a number)', len(res['rows']) == 10 and sum(1 for r in res['rows'] if not r['hn']) == 1 and res['claimed'], len(res.get('rows', [])))

state = gas('dump')
state['noAuth'] = True
save_state(state)
check('missing script permission is reported', gas('post', {**ward, 'action': 'wardCheck'}).get('error') == 'ward-needs-auth')
state = gas('dump')
state['noAuth'] = False
save_state(state)

os.unlink(STATE)
print(f'\n{"All checks passed." if not FAILURES else f"{len(FAILURES)} check(s) failed."}')
sys.exit(1 if FAILURES else 0)
