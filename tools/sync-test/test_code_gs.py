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
SCRIPT_VERSION = 12
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
check('readable columns are added after the fixed ones', header[:6] == ['id', 'updatedAt', 'deletedAt', 'seq', 'device', 'json'] and 'Title' in header, header)
check('formulas are shown as text', task_rows[0][header.index('Title')] == "'=1+1", task_rows[0][header.index('Title')])
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
check('other headings in E1:G1 are detected', res['headers'] == {'state': 'taken', 'values': ['Plan', '', 'Notes'], 'dataBelow': False, 'cols': ['E', 'F', 'G']}, res['headers'])
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

# Version 7: the list's own columns (read and edited as text), adding a column, moving rows
COLS = '1' + 'K' * 43
add_logsheet(COLS, [
    HEAD + ['Rounded', 'Rounds Start', 'Rounds End', 'Diagnosis'],
    ['Patient M', '7001', 'labs M', 'recs M', False, '', '', 'Stroke'],
    ['Patient N', '7002', '', 'P2 recs N', False, '', '', ''],
    ['', '', 'a note under the list (no name)', '', '', '', '', ''],
    ['Patient O', '', 'no number', '', False, '', '', 'Seizure'],
    ['Patient P', '7004', '', '', False, '', '', {'__f': '=UPPER("x")', 'v': 'X'}],
], max_cols=8)
kw = {**base, 'spreadsheetId': COLS, 'tab': 'Sheet1'}


def ksync(**extra):
    return gas('post', {**kw, 'action': 'wardSync', 'cols': ['C', 'D', 'H'], **extra})


res = ksync()
m = res['rows'][0]
check('the list\'s columns are read as cells', m.get('cells') == {'C': 'labs M', 'D': 'recs M', 'H': 'Stroke'} and m['labs'] == 'labs M', m)
check('row 1 comes back as headings', res.get('headings') == HEAD + ['Rounded', 'Rounds Start', 'Rounds End', 'Diagnosis'] and res.get('lastColumn') == 8, res.get('headings'))
res = gas('post', {**kw, 'action': 'wardSync', 'cols': ['A', 'B', 'E', 'F', 'Z9', 'H']})
check('A, B and our rounds columns are never read as cells', res['rows'][0].get('cells') == {'H': 'Stroke'}, res['rows'][0].get('cells'))
check('older apps (no cols) get no cells', 'cells' not in gas('post', {**kw, 'action': 'wardSync'})['rows'][0])

res = ksync(writes=[{'id': 'h1', 'hn': '7001', 'text': True, 'expect': {'H': 'Stroke'}, 'set': {'H': 'Ischaemic stroke'}}])
check('a column of the list is saved as text', res['results']['h1']['status'] == 'ok' and cell(log_rows(COLS), 2, 8) == 'Ischaemic stroke' and res['rows'][0]['cells']['H'] == 'Ischaemic stroke', res['results'])
edit_cell(COLS, 2, 8, 'Changed by a co-resident')
res = ksync(writes=[{'id': 'h2', 'hn': '7001', 'text': True, 'expect': {'H': 'Ischaemic stroke'}, 'set': {'H': 'Mine'}}])
check('an added column is protected from overwriting too', res['results']['h2']['status'] == 'conflict' and res['results']['h2']['current'] == {'H': 'Changed by a co-resident'}, res['results'])
res = ksync(writes=[
    {'id': 'h3', 'hn': '7004', 'text': True, 'expect': {'H': 'X'}, 'set': {'H': 'typed'}},
    {'id': 'h4', 'hn': '7001', 'text': True, 'expect': {}, 'set': {'A': 'x'}},
    {'id': 'h5', 'hn': '7001', 'text': True, 'expect': {}, 'set': {'E': 'x'}},
    {'id': 'h6', 'hn': '7001', 'text': True, 'expect': {'Z': ''}, 'set': {'Z': 'beyond the sheet'}},
    {'id': 'h7', 'hn': '7002', 'text': True, 'expect': {'C': '', 'D': 'P2 recs N'}, 'set': {'C': 'labs N'}},
])
st = {k: v['status'] for k, v in res['results'].items()}
check('a formula in an added column is never overwritten', st['h3'] == 'formula' and log_rows(COLS)[5][7]['__f'].startswith('=UPPER'), st)
check('text writes never touch A, B or our rounds columns', st['h4'] == st['h5'] == 'invalid' and cell(log_rows(COLS), 2, 1) == 'Patient M', st)
check('a column beyond the sheet is refused', st['h6'] == 'invalid', st)
check('C can be written as a text column too', st['h7'] == 'ok' and cell(log_rows(COLS), 3, 3) == 'labs N', st)
res = gas('post', {**tw, 'action': 'wardSync', 'cols': ['C', 'D', 'E', 'G'], 'writes': [{'id': 'e1', 'hn': '2001', 'text': True, 'expect': {'E': 'keep this'}, 'set': {'E': 'edited plan'}}]})
check('E–G used for something else can be shown and edited', res['rows'][0]['cells'] == {'C': '', 'D': 'recs still save', 'E': 'edited plan', 'G': ''} and res['results']['e1']['status'] == 'ok' and log_rows(TAKEN)[1][4] == 'edited plan', res)

res = ksync(addColumn={'heading': '  Bed   number '})
check('a new column goes after all the others', res['added'] == {'status': 'ok', 'column': 'I'} and log_rows(COLS)[0][8] == 'Bed number' and res['rows'][0]['cells'].get('I') == '', res.get('added'))
check('the new column is read in the same answer', res['headings'][-1] == 'Bed number' and res['lastColumn'] == 9, res.get('headings'))
res = ksync(addColumn={'heading': '=SUM(A:A)'})
check('a heading that looks like a formula stays text', res['added']['column'] == 'J' and log_rows(COLS)[0][9] == '=SUM(A:A)', res.get('added'))
res = gas('post', {**ward, 'action': 'wardSync', 'cols': ['C', 'D'], 'addColumn': {'heading': 'Plan'}})
check('on a sheet using only A–G the first added column is H', res['added'] == {'status': 'ok', 'column': 'H'} and cell(log_rows(LOG), 1, 8) == 'Plan', res.get('added'))
check('an empty heading is refused', ksync(addColumn={'heading': '  '})['added'] == {'status': 'invalid'})
res = gas('post', {**vw, 'action': 'wardSync', 'addColumn': {'heading': 'Plan'}})
check('a view-only logsheet gets no new column', res['added']['status'] == 'read-only' and len(log_rows(VIEW)[0]) == 4, res.get('added'))
WIDE = '1' + 'W' * 43
add_logsheet(WIDE, [HEAD + [''] * 47 + ['Last'], ['Patient W', '8001']], max_cols=52)
check('the app stops at column AZ', gas('post', {**base, 'spreadsheetId': WIDE, 'tab': 'Sheet1', 'action': 'wardSync', 'addColumn': {'heading': 'x'}})['added'] == {'status': 'too-wide'})


def snapshot(rows):
    return [{'row': r['row'], 'name': r['name'], 'hn': r['hn']} for r in rows]


res = ksync()
before = snapshot(res['rows'])
check('rows to arrange: patients only', [r['row'] for r in before] == [2, 3, 5, 6], before)
res = ksync(move={'expect': before, 'order': [6, 2, 5, 3]})
lr = log_rows(COLS)
check('rows move into the new order', res['moved'] == {'status': 'ok'} and [r[0] for r in lr[1:6]] == ['Patient P', 'Patient M', '', 'Patient O', 'Patient N'], [r[0] for r in lr[1:6]])
check('a row without a name stays where it was', cell(lr, 4, 3) == 'a note under the list (no name)')
check('whole rows move (every column, formulas too)', lr[1][7]['__f'].startswith('=UPPER') and lr[2][7] == 'Changed by a co-resident' and lr[4][7] == 'Seizure', lr[1:6])
check('the answer has the new order', [r['name'] for r in res['rows']] == ['Patient P', 'Patient M', 'Patient O', 'Patient N'] and res['rows'][0]['row'] == 2, [r['name'] for r in res['rows']])
res = ksync(writes=[{'id': 'm1', 'hn': '7002', 'expect': {'D': 'P2 recs N'}, 'set': {'D': 'found after the move'}}])
check('edits still find patients after a move', res['results']['m1'] == {'status': 'ok', 'row': 6} and cell(log_rows(COLS), 6, 4) == 'found after the move', res['results'])
after = snapshot(res['rows'])
check('the same order again changes nothing', ksync(move={'expect': after, 'order': [r['row'] for r in after]})['moved'] == {'status': 'same'})
check('an order that isn\'t these rows is refused', ksync(move={'expect': after, 'order': [2, 3, 5, 5]})['moved'] == {'status': 'invalid'} and ksync(move={'expect': after, 'order': [2, 3]})['moved'] == {'status': 'invalid'})
edit_cell(COLS, 3, 1, 'Patient M (renamed)')
res = ksync(move={'expect': after, 'order': [6, 5, 3, 2]})
check('nothing moves if a patient row changed since', res['moved'] == {'status': 'changed'} and [r[0] for r in log_rows(COLS)[1:6]] == ['Patient P', 'Patient M (renamed)', '', 'Patient O', 'Patient N'], res.get('moved'))
state = gas('dump')
next(s for s in state['files'][COLS]['sheets'] if s['name'] == 'Sheet1')['rows'].append(['Patient Q', '7005'])
save_state(state)
fresh = snapshot(ksync()['rows'])
check('a patient added meanwhile counts as a change', ksync(move={'expect': after, 'order': [r['row'] for r in after]})['moved']['status'] in ('changed', 'same') and len(fresh) == 5)
res = ksync(move={'expect': fresh, 'order': [7, 6, 5, 3, 2]})
check('the last row can move to the top', res['moved'] == {'status': 'ok'} and [r[0] for r in log_rows(COLS)[1:7]] == ['Patient Q', 'Patient N', '', 'Patient O', 'Patient M (renamed)', 'Patient P'], [r[0] for r in log_rows(COLS)[1:7]])
res = gas('post', {**vw, 'action': 'wardSync', 'move': {'expect': [{'row': 2, 'name': 'Patient J', 'hn': '5001'}], 'order': [2]}})
check('one patient: nothing to move', res['moved'] == {'status': 'same'})
TWO = '1' + 'U' * 43
add_logsheet(TWO, [HEAD, ['Patient R', '9001'], ['Patient S', '9002']], access='view')
res = gas('post', {**base, 'spreadsheetId': TWO, 'tab': 'Sheet1', 'action': 'wardSync', 'move': {'expect': [{'row': 2, 'name': 'Patient R', 'hn': '9001'}, {'row': 3, 'name': 'Patient S', 'hn': '9002'}], 'order': [3, 2]}})
check('rows of a view-only logsheet don\'t move', res['moved'] == {'status': 'read-only'} and log_rows(TWO)[1][0] == 'Patient R', res.get('moved'))
PROT2 = '1' + 'R' * 43
add_logsheet(PROT2, [HEAD, ['Patient T', '9101'], ['Patient U', '9102']], protectedCols=[3])
res = gas('post', {**base, 'spreadsheetId': PROT2, 'tab': 'Sheet1', 'action': 'wardSync', 'move': {'expect': [{'row': 2, 'name': 'Patient T', 'hn': '9101'}, {'row': 3, 'name': 'Patient U', 'hn': '9102'}], 'order': [3, 2]}})
check('rows with protected cells don\'t move', res['moved'] == {'status': 'protected'} and log_rows(PROT2)[1][0] == 'Patient T', res.get('moved'))

res = gas('post', {**base, 'action': 'push', 'deviceId': 'Mac-aaaa', 'sinceSeq': 0, 'records': [
    {'store': 'wardLists', 'record': rec('ward', '2026-09-28T09:00:00.000Z', name='Ward 3', order=0, headings={}, columns=[{'id': 'labs', 'col': 'C', 'label': 'Labs'}])}]})
check('patient lists (names and columns) sync in their own tab', res['results'] == {'wardLists:ward': 'applied'} and rows_of(gas('dump'), 'Ward lists')[0][0] == 'ward', res)

# Version 8: the name, hospital number and rounds in the columns a list chooses
# (like a logsheet with a checkbox for another script in A, the name in B, the number in C,
# labs in D, recommendations in E and the rounds in F–H)
LAY = '1' + 'Y' * 43
add_logsheet(LAY, [
    ['Run', 'Name', 'HRN', 'Labs', 'Notes', 'Rounded', 'Rounds Start', 'Rounds End'],
    [True, 'Patient Y1', '8101', 'Na 130', 'P1 recheck Na', False, '', ''],
    [False, 'Patient Y2', '8102', '', 'for EEG', True, '2026-09-26 08:00', '2026-09-26 08:20'],
    [True, '', '8199', 'no name: ignored', '', '', '', ''],
], max_cols=8)
lw = {**base, 'spreadsheetId': LAY, 'tab': 'Sheet1', 'layout': {'name': 'B', 'hn': 'C', 'rounds': 'F'}}
res = gas('post', {**lw, 'action': 'wardCheck'})
check('v8 check: rounds headings found in F–H', res.get('headers', {}).get('state') == 'ours' and res['headers']['cols'] == ['F', 'G', 'H'] and res.get('patients') == 2, res)
res = gas('post', {**lw, 'action': 'wardSync', 'cols': ['A', 'B', 'C', 'D', 'E', 'F']})
y1, y2 = res['rows']
check('v8: names and numbers come from the chosen columns', [(r['name'], r['hn']) for r in res['rows']] == [('Patient Y1', '8101'), ('Patient Y2', '8102')], res['rows'])
check('v8: rounds are read from F–H', y1['rounded'] is False and y2['rounded'] is True and y2['start'] == '2026-09-26 08:00' and y2['end'] == '2026-09-26 08:20', y2)
check('v8: the name, number and rounds columns are never cells; A can be', y1['cells'] == {'A': 'TRUE', 'D': 'Na 130', 'E': 'P1 recheck Na'}, y1['cells'])
res = gas('post', {**lw, 'action': 'wardSync', 'cols': ['D', 'E'], 'writes': [
    {'id': 'y1', 'hn': '8101', 'expect': {'E': False, 'F': '', 'G': ''}, 'set': {'E': True, 'F': '2026-09-27 08:00', 'G': '2026-09-27 08:15'}},
    {'id': 'y2', 'hn': '8102', 'text': True, 'expect': {'E': 'for EEG'}, 'set': {'E': 'for EEG tomorrow'}},
    {'id': 'y3', 'hn': '8101', 'text': True, 'expect': {}, 'set': {'C': 'x'}},
    {'id': 'y4', 'hn': '8101', 'text': True, 'expect': {}, 'set': {'F': 'x'}},
    {'id': 'y5', 'hn': '8102', 'expect': {'D': ''}, 'set': {'D': 'K 3.1'}},
]})
st = {k: v['status'] for k, v in res['results'].items()}
lr = log_rows(LAY)
check('v8: a tick goes to F–H, never A', st['y1'] == 'ok' and lr[1][5] is True and lr[1][6] == '2026-09-27 08:00' and lr[1][7] == '2026-09-27 08:15' and lr[1][0] is True, (st, lr[1]))
check('v8: E is a text column here (recommendations)', st['y2'] == 'ok' and lr[2][4] == 'for EEG tomorrow', st)
check('v8: the number and rounds columns are never written as text', st['y3'] == st['y4'] == 'invalid' and lr[1][2] == '8101', st)
check('v8: an older-style edit of D still works', st['y5'] == 'ok' and lr[2][3] == 'K 3.1', st)
res = gas('post', {**lw, 'action': 'wardSync', 'resetBefore': '2026-09-28'})
lr = log_rows(LAY)
check('v8: the midnight reset unticks F, keeps the times and A', lr[1][5] is False and lr[2][5] is False and lr[1][7] == '2026-09-27 08:15' and lr[1][0] is True and {r['hn'] for r in res['reset']} == {'8101', '8102'}, (lr[1], res['reset']))
moved = gas('post', {**lw, 'action': 'wardSync', 'move': {'expect': [{'row': 2, 'name': 'Patient Y1', 'hn': '8101'}, {'row': 3, 'name': 'Patient Y2', 'hn': '8102'}], 'order': [3, 2]}})
lr = log_rows(LAY)
check('v8: rows move by the chosen name and number columns', moved['moved'] == {'status': 'ok'} and lr[1][1] == 'Patient Y2' and lr[1][0] is False and lr[2][0] is True, (moved.get('moved'), lr[1:3]))
res = gas('post', {**lw, 'action': 'wardSync', 'addColumn': {'heading': 'Location'}})
check('v8: a new column goes after the rounds columns', res['added'] == {'status': 'ok', 'column': 'I'}, res.get('added'))
EMPTY = '1' + 'Q' * 43
add_logsheet(EMPTY, [['Run', 'Name', 'HRN', 'Labs', 'Notes'], [True, 'Patient Q1', '8201', '', '']], max_cols=5)
qw = {**base, 'spreadsheetId': EMPTY, 'tab': 'Sheet1', 'layout': {'name': 'B', 'hn': 'C', 'rounds': 'F'}}
res = gas('post', {**qw, 'action': 'wardSync', 'claim': True})
check('v8: rounds headings are added in F–H (sheet widened)', res['claimed'] and log_rows(EMPTY)[0][5:8] == ['Rounded', 'Rounds Start', 'Rounds End'] and log_rows(EMPTY)[0][4] == 'Notes', log_rows(EMPTY)[0])
bad = [{'name': 'B', 'hn': 'B'}, {'name': 'B', 'hn': 'C', 'rounds': 'C'}, {'name': 'F', 'hn': 'C', 'rounds': 'E'}, {'name': 'B', 'hn': 'C', 'rounds': 'AY'}]
check('v8: a layout that doesn\'t make sense is refused', all(gas('post', {**lw, 'layout': b, 'action': 'wardSync'}).get('error') == 'ward-bad-layout' for b in bad))
res = gas('post', {**ward, 'action': 'wardSync'})
check('v8: without a layout, A and B are the name and number as before', ('Patient A', '1001') in [(r['name'], r['hn']) for r in res['rows']], res['rows'])

res = gas('post', {**base, 'action': 'push', 'deviceId': 'Mac-aaaa', 'sinceSeq': 0, 'records': [
    {'store': 'referrals', 'record': rec('r1', '2026-10-05T09:00:00.000Z', name='Referral Z', hn='9901', location='ER', next='2026-10-06', notes='Seen for stroke',
     status='active', waiting=[{'id': 'w1', 'text': 'MRI', 'done': False}, {'id': 'w2', 'text': 'Na', 'done': True}])}]})
ref = rows_of(gas('dump'), 'Referrals')
check('referrals sync in their own tab, with readable columns', res['results'] == {'referrals:r1': 'applied'} and ref[0][0] == 'r1' and 'Referral Z' in ref[0] and 'MRI' in ref[0] and 'Na' not in ref[0], ref)

# Version 9: a referral census — no rounds columns, days in K and L
CEN = '1' + 'C' * 43
add_logsheet(CEN, [
    ['#', 'Status', 'Service', 'Ward', 'Location', 'F', 'G', 'H', 'Name', 'HRN', 'Last rounds', 'Next rounds', 'Diagnosis'],
    [1, 'Active', 'IM', '3B', 'Ward 3B – Bed 2', '', '', '', 'Census Patient 1', 'CEN-001', {'__date': '2026-10-04T16:00:00.000Z'}, {'__date': '2026-10-06T16:00:00.000Z'}, 'Seizure'],
    [2, 'Inactive', 'Surg', 'ICU', 'ICU – Bed 1', '', '', '', 'Census Patient 2', 'CEN-002', '', 'next week?', 'Stroke'],
], max_cols=13)
cw = {**base, 'spreadsheetId': CEN, 'tab': 'Sheet1', 'layout': {'name': 'I', 'hn': 'J', 'rounds': ''}, 'dates': ['K', 'L']}
res = gas('post', {**cw, 'action': 'wardCheck'})
check('v9 census check: no rounds columns', res.get('headers', {}).get('state') == 'none' and res.get('patients') == 2, res)
res = gas('post', {**cw, 'action': 'wardSync', 'claim': True, 'cols': ['B', 'E', 'K', 'L', 'M', 'F', 'G']})
c1, c2 = res['rows']
check('v9: dates are read as days, other text as shown', c1['cells']['K'] == '2026-10-05' and c1['cells']['L'] == '2026-10-07' and c2['cells']['L'] == 'next week?' and c1['cells']['B'] == 'Active', c1['cells'])
check('v9: F–H are ordinary columns when there are no rounds columns', 'F' in c1['cells'] and not res.get('claimed') and 'rounded' not in c1 and log_rows(CEN)[0][5] == 'F', (res.get('claimed'), c1))
res = gas('post', {**cw, 'action': 'wardSync', 'cols': ['B', 'L'], 'writes': [
    {'id': 'n1', 'hn': 'CEN-001', 'text': True, 'expect': {'L': '2026-10-07'}, 'set': {'L': '2026-10-09'}},
    {'id': 'n2', 'hn': 'CEN-002', 'text': True, 'expect': {'B': 'Inactive'}, 'set': {'B': 'For rounds'}},
    {'id': 'n3', 'hn': 'CEN-002', 'text': True, 'expect': {'L': 'next week?'}, 'set': {'L': '2026-10-12'}},
    {'id': 'n4', 'hn': 'CEN-001', 'expect': {'E': False, 'F': '', 'G': ''}, 'set': {'E': True, 'F': '', 'G': ''}},
    {'id': 'n5', 'hn': 'CEN-001', 'text': True, 'expect': {'K': '2026-10-01'}, 'set': {'K': '2026-10-06'}},
]})
st = {k: v['status'] for k, v in res['results'].items()}
lr = log_rows(CEN)
check('v9: a new day is saved as a date', st['n1'] == 'ok' and isinstance(lr[1][11], dict) and lr[1][11].get('__date', '').startswith('2026-10-08T16'), (st, lr[1][11]))
check('v9: a status is saved as text, and a text day becomes a date', st['n2'] == st['n3'] == 'ok' and lr[2][1] == 'For rounds' and isinstance(lr[2][11], dict), (st, lr[2]))
check('v9: rounds writes are refused without rounds columns', st['n4'] == 'invalid' and lr[1][4] == 'Ward 3B – Bed 2', st)
check('v9: a day changed by someone else is a conflict', st['n5'] == 'conflict' and res['results']['n5']['current'] == {'K': '2026-10-05'} and res['rows'][0]['cells']['L'] == '2026-10-09', res['results']['n5'])
res = gas('post', {**cw, 'action': 'wardSync', 'cols': ['M'], 'writes': [{'id': 'n6', 'hn': 'CEN-001', 'text': True, 'expect': {}, 'set': {'M': 'App wins'}}]})
check('v9: a referral change with nothing expected replaces the cell', res['results']['n6']['status'] == 'ok' and log_rows(CEN)[1][12] == 'App wins', res['results'])
check('v9: names and numbers come from I and J', [(r['name'], r['hn']) for r in res['rows']] == [('Census Patient 1', 'CEN-001'), ('Census Patient 2', 'CEN-002')])

# Version 10: dropdown columns (data validation), like the census's Status column
DD = '1' + 'D' * 43
STATUSES = ['NEW', 'ACTIVE', 'INACTIVE', 'SIGNED OUT', 'FOR ROUNDS']
add_logsheet(DD, [
    ['#', 'Status', 'C', 'D', 'Location', 'F', 'G', 'H', 'Name', 'HRN', 'Last', 'Next', 'Dx'],
    [1, 'ACTIVE', '', '', 'ER', '', '', '', 'Dropdown Patient 1', 'DD-001', '', '', 'Seizure'],
    [2, 'NEW', '', '', 'ICU', '', '', '', 'Dropdown Patient 2', 'DD-002', '', '', 'Stroke'],
], max_cols=13, validation={'2': STATUSES})
dw = {**base, 'spreadsheetId': DD, 'tab': 'Sheet1', 'layout': {'name': 'I', 'hn': 'J', 'rounds': ''}, 'dates': ['K', 'L']}
res = gas('post', {**dw, 'action': 'wardSync', 'cols': ['B', 'E', 'M']})
check('v10: dropdown values come back for the app to offer', res.get('choices') == {'B': STATUSES}, res.get('choices'))
res = gas('post', {**dw, 'action': 'wardSync', 'cols': ['B', 'M'], 'writes': [
    {'id': 'd1', 'hn': 'DD-001', 'text': True, 'expect': {}, 'set': {'B': 'Inactive'}},
    {'id': 'd2', 'hn': 'DD-002', 'text': True, 'expect': {}, 'set': {'B': 'Maybe later'}},
    {'id': 'd3', 'hn': 'DD-002', 'text': True, 'expect': {}, 'set': {'M': 'Stroke, left MCA'}},
    {'id': 'd4', 'hn': 'DD-002', 'text': True, 'expect': {}, 'set': {'B': 'for rounds'}},
]})
st = {k: v['status'] for k, v in res['results'].items()}
lr = log_rows(DD)
check('v10: a status is written in the dropdown\'s own spelling', st['d1'] == 'ok' and lr[1][1] == 'INACTIVE', (st, lr[1][1]))
check('v10: a value the dropdown doesn\'t have fails only that change', st['d2'] == 'not-a-choice' and res['results']['d2'].get('choices') == STATUSES and st['d3'] == 'ok' and lr[2][12] == 'Stroke, left MCA', st)
check('v10: and the rest of the request still answers', res.get('ok') and len(res['rows']) == 2 and st['d4'] == 'ok' and lr[2][1] == 'FOR ROUNDS', (res.get('ok'), st))

# Version 11: a tick-box column (column A, for another script that checks the labs of ticked patients)
TB = '1' + 'T' * 43
add_logsheet(TB, [
    ['Run', 'Name', 'HRN', 'Labs', 'Notes', 'Rounded', 'Rounds Start', 'Rounds End'],
    [True, 'Tick Patient 1', 'TB-001', 'Na 130', 'P1', False, '', ''],
    [False, 'Tick Patient 2', 'TB-002', '', 'P3', False, '', ''],
], max_cols=8)
tw = {**base, 'spreadsheetId': TB, 'tab': 'Sheet1', 'layout': {'name': 'B', 'hn': 'C', 'rounds': 'F'}, 'checks': ['A']}
res = gas('post', {**tw, 'action': 'wardSync', 'cols': ['A', 'D', 'E']})
check('v11: a tick-box column is read as TRUE / FALSE', [r['cells']['A'] for r in res['rows']] == ['TRUE', 'FALSE'], [r['cells'] for r in res['rows']])
res = gas('post', {**tw, 'action': 'wardSync', 'cols': ['A', 'D'], 'writes': [
    {'id': 't1', 'hn': 'TB-001', 'text': True, 'expect': {}, 'set': {'A': 'FALSE'}},
    {'id': 't2', 'hn': 'TB-002', 'text': True, 'expect': {}, 'set': {'A': 'TRUE'}},
    {'id': 't3', 'hn': 'TB-002', 'text': True, 'expect': {}, 'set': {'A': 'yes please'}},
]})
st = {k: v['status'] for k, v in res['results'].items()}
lr = log_rows(TB)
check('v11: ticking and unticking write real checkbox values (not text)', st['t1'] == st['t2'] == 'ok' and lr[1][0] is False and lr[2][0] is True, (st, lr[1][0], lr[2][0]))
check('v11: only TRUE or FALSE can go in a tick-box column', st['t3'] == 'invalid', st)
check('v11: the answer shows the new ticks', [r['cells']['A'] for r in res['rows']] == ['FALSE', 'TRUE'], [r['cells'] for r in res['rows']])

# ---------------------------------------------------------------------------
print('\nTo-do tabs (version 5)')
open(STATE, 'w').close()
token = gas('setup')['token']
base = {'protocol': 1, 'token': token}
state = gas('dump')
names = [s['name'] for s in state['sheets']]
check('setup adds the to-do tabs', {'Subtasks', 'Habits', 'Habit log', 'Focus sessions', 'Calendar links'} <= set(names), names)
check('setup starts the 30-minute calendar check', state['triggers'] == [{'fn': 'calendarTick', 'everyMinutes': 30}], state['triggers'])

# A Tasks tab written by an older version (its own readable columns, wider than the new layout)
old_task = rec('old-1', '2026-09-20T02:00:00.000Z', title='Old style task', priority='low', status='open')
tasks_tab = sheet(state, 'Tasks')
tasks_tab['maxCols'] = 40
tasks_tab['rows'] = [['id', 'updatedAt', 'deletedAt', 'seq', 'device', 'json'] + [f'old{i}' for i in range(30)],
                     ['old-1', old_task['updatedAt'], '', '1', 'Mac-aaaa', json.dumps(old_task)] + ['stale'] * 30]
save_state(state)
gas('setup')
state = gas('dump')
check('running setup again doesn\'t add a second timer', len(state['triggers']) == 1)
tasks_tab = sheet(state, 'Tasks')
check('setup gives an older Tasks tab the new readable columns', tasks_tab['rows'][0][6:8] == ['Title', 'Status'] and len([h for h in tasks_tab['rows'][0] if h]) == 24, tasks_tab['rows'][0])
check('…recalculated from each task, with old columns cleared', tasks_tab['rows'][1][6] == 'Old style task' and 'stale' not in tasks_tab['rows'][1] and tasks_tab['rows'][1][5] == json.dumps(old_task), tasks_tab['rows'][1])


def push(records, device='iPhone-bbbb'):
    return gas('post', {**base, 'action': 'push', 'deviceId': device, 'sinceSeq': 999,
                        'records': [{'store': s, 'record': r} for s, r in records]})


def readable(state, tab, id_):
    s = sheet(state, tab)
    header = s['rows'][0]
    row = next(r for r in s['rows'][1:] if r and r[0] == id_)
    return dict(zip(header, list(row) + [''] * (len(header) - len(row))))


T = '2026-09-27T00:15:00.000Z'  # 08:15 in Manila
cat = rec('cat-mba', T, name='MBA', order=2, color='#2fc4ff', icon='briefcase')
task = rec('task-1', T, title='Finish STRAMA paper', status='open', priority='high', categoryId='cat-mba', tags=['school', 'paper'],
           date='2026-09-28', startTime='20:00', endTime='21:00', pinned=True, notes='Chapter 3', addToCalendar=False,
           reminders=[{'id': 'r1', 'kind': 'before', 'minutes': 30}, {'id': 'r2', 'kind': 'at', 'at': '2026-09-28T04:00:00.000Z'}],
           recurrence={'kind': 'monthly', 'interval': 1, 'week': 2, 'weekday': 2}, links=[{'id': 'l1', 'title': 'Brief', 'url': 'https://example.com'}])
res = push([('tasks', task), ('taskCategories', cat)])  # the category is listed after the task: still named
check('tasks and categories are accepted', set(res['results'].values()) == {'applied'}, res)
r = readable(gas('dump'), 'Tasks', 'task-1')
check('tasks have readable columns', r['Title'] == 'Finish STRAMA paper' and r['Priority'] == 'High' and r['Status'] == 'Open'
      and r['Date'] == '2026-09-28' and r['Time'] == '20:00–21:00', r)
check('the category is shown by name as well as id', r['Category'] == 'MBA' and r['Category id'] == 'cat-mba', r)
check('times are shown in Manila time', r['Created'] == '2026-09-01 08:00' and r['Updated'] == '2026-09-27 08:15', r)
check('reminders, repeats, links and pins are readable', r['Reminders'] == '30 min before, At 2026-09-28 12:00'
      and r['Repeats'] == 'Every month on the second Tuesday' and r['Links'] == 'Brief' and r['Pinned'] == 'Yes', r)
check('the full task is kept exactly', json.loads(r['json']) == task)

push([('taskCategories', {**cat, 'name': 'MBA school', 'updatedAt': '2026-09-27T01:00:00.000Z'})])
check('renaming a category updates the Tasks tab', readable(gas('dump'), 'Tasks', 'task-1')['Category'] == 'MBA school')

push([('subtasks', rec('sub-1', T, taskId='task-1', title='Outline', done=True, order=0))])
r = readable(gas('dump'), 'Subtasks', 'sub-1')
check('subtasks show their task\'s title', r['Task'] == 'Finish STRAMA paper' and r['Subtask'] == 'Outline' and r['Done'] == 'Yes', r)
push([('subtasks', rec('sub-2', T, taskId='task-1', title='Call Dr Reyes', done=False, order=1, date='2026-09-28', startTime='14:00', endTime='14:30',
                       reminders=[{'id': 's', 'kind': 'before', 'minutes': 15}, {'id': 't', 'kind': 'before', 'minutes': 0}]))])
r = readable(gas('dump'), 'Subtasks', 'sub-2')
check('subtasks show their own date, time and reminders (version 6)', r['Date'] == '2026-09-28' and r['Time'] == '14:00–14:30' and r['Reminders'] == '15 min before, At the time' and r['Google Calendar'] == '', r)
done_task = {**task, 'title': 'Finish STRAMA paper (final)', 'status': 'done', 'completedAt': '2026-09-28T13:05:00.000Z', 'updatedAt': '2026-09-28T13:05:00.000Z'}
push([('tasks', done_task)])
state = gas('dump')
check('renaming a task updates its subtasks', readable(state, 'Subtasks', 'sub-1')['Task'] == 'Finish STRAMA paper (final)')
check('a done task shows when it was done', readable(state, 'Tasks', 'task-1')['Status'] == 'Done' and readable(state, 'Tasks', 'task-1')['Completed'] == '2026-09-28 21:05')

push([('habitLogs', rec('hl1', T, habitId='h1', date='2026-09-27', done=True)),
      ('focusSessions', rec('f1', T, taskId='task-1', type='focus', start='2026-09-27T01:00:00.000Z', end='2026-09-27T01:25:00.000Z', plannedMinutes=25, completed=True)),
      ('habits', rec('h1', T, name='Read 20 pages', group='Evening', schedule={'kind': 'days', 'days': [1, 3, 5]}, active=True, order=0))])
state = gas('dump')
check('habits, the habit log and focus sessions are readable', readable(state, 'Habits', 'h1')['Schedule'] == 'Mon, Wed, Fri'
      and readable(state, 'Habit log', 'hl1')['Habit'] == 'Read 20 pages' and readable(state, 'Focus sessions', 'f1')['Minutes'] == '25'
      and readable(state, 'Focus sessions', 'f1')['Task'] == 'Finish STRAMA paper (final)', [readable(state, t, i) for t, i in (('Habits', 'h1'), ('Habit log', 'hl1'), ('Focus sessions', 'f1'))])
check('devices can\'t write the Calendar links tab', push([('calendarLinks', rec('task-1', T, status='linked'))])['results'] == {})
res = gas('post', {**base, 'action': 'pull', 'sinceSeq': 0})
check('pull returns the new kinds of data', {'subtasks', 'habits', 'habitLogs', 'focusSessions', 'taskCategories', 'tasks'} <= {c['store'] for c in res['changes']}, {c['store'] for c in res['changes']})

# ---------------------------------------------------------------------------
print('\nGoogle Calendar link (pretend calendar)')


def set_now(iso):
    st = gas('dump')
    st['now'] = iso
    save_state(st)


def live_events(st=None):
    st = st or gas('dump')
    return {e['id']: e for c in st['calendars'].values() if not c['deleted'] for e in c['events'].values() if not e['deleted']}


def link(id_):
    s = sheet(gas('dump'), 'Calendar links')
    row = next((r for r in s['rows'][1:] if r and r[0] == id_), None)
    return json.loads(row[5]) if row else None


def cal_sync(**extra):
    return gas('post', {**base, 'action': 'calendarSync', **extra})


def ctask(id_, **fields):
    fields.setdefault('status', 'open')
    fields.setdefault('priority', 'medium')
    fields.setdefault('reminders', [])
    fields.setdefault('addToCalendar', True)
    return rec(id_, fields.pop('updated', '2026-09-28T01:00:00.000Z'), **fields)


set_now('2026-09-28T01:00:00.000Z')  # Monday 28 September, 09:00 in Manila
res = gas('post', {**base, 'action': 'calendarStatus'})
check('status: no calendar yet, timer running', res.get('ok') and res['calendar']['state'] == 'not-created' and res['timer'] is True, res)

c1 = ctask('cal-1', title='Grand rounds prep', date='2026-09-28', startTime='14:00',
           reminders=[{'id': 'a', 'kind': 'before', 'minutes': 30}, {'id': 'b', 'kind': 'before', 'minutes': 10}])
push([('tasks', c1)])
res = cal_sync(ids=['cal-1'], appUrl='https://joeybacus.github.io/life-dashboard/')
st = gas('dump')
check('the first linked task makes the "Life Dashboard Tasks" calendar', [c['name'] for c in st['calendars'].values()] == ['Life Dashboard Tasks'], st['calendars'])
l1 = link('cal-1')
ev = live_events(st).get(l1['eventId'] if l1 else '')
check('a timed task becomes an event at its time (30 minutes long)', ev and ev['start'] == '2026-09-28T06:00:00.000Z' and ev['end'] == '2026-09-28T06:30:00.000Z' and ev['title'] == 'Grand rounds prep', ev)
check('its reminders become the alerts (the calendar\'s default is removed)', ev and sorted(ev['popups']) == [10, 30], ev and ev['popups'])
check('the link is saved for the app, with the next alert', l1['status'] == 'linked' and l1['nextAlertAt'] == '2026-09-28T05:30:00.000Z' and res['links'][0]['id'] == 'cal-1', l1)
check('the event says where it came from', 'https://joeybacus.github.io/life-dashboard/#/todo' in ev['description'] and ev['tags'].get('lifeDashboardTaskId') == 'cal-1')
res = gas('post', {**base, 'action': 'pull', 'sinceSeq': 0})
check('devices receive the link', any(c['store'] == 'calendarLinks' and c['record']['id'] == 'cal-1' for c in res['changes']))
res = cal_sync(ids=['cal-1'])
check('nothing changes when nothing changed', res['links'] == [] and len(live_events()) == 1, res)

c1b = {**c1, 'title': 'Grand rounds prep (moved)', 'startTime': '15:30', 'endTime': '16:15', 'updatedAt': '2026-09-28T01:05:00.000Z'}
push([('tasks', c1b)])
cal_sync()  # no ids: tasks changed since the last check
evs = live_events()
check('editing the task updates the same event', list(evs) == [l1['eventId']] and evs[l1['eventId']]['start'] == '2026-09-28T07:30:00.000Z'
      and evs[l1['eventId']]['end'] == '2026-09-28T08:15:00.000Z' and evs[l1['eventId']]['title'] == 'Grand rounds prep (moved)', evs)

push([('tasks', ctask('cal-2', title='Submit IRB form', date='2026-09-30', reminders=[{'id': 'c', 'kind': 'before', 'minutes': 60}])),
      ('tasks', ctask('cal-3', title='Pay rent', date='2026-10-01')),
      ('tasks', ctask('cal-4', title='Someday', date=None))])
cal_sync()
evs = live_events()
e2 = evs.get(link('cal-2')['eventId'])
e3 = evs.get(link('cal-3')['eventId'])
check('a date with reminders but no time: a 15-minute entry at 8:00 AM', e2 and e2['start'] == '2026-09-30T00:00:00.000Z' and e2['end'] == '2026-09-30T00:15:00.000Z' and e2['popups'] == [60], e2)
check('a date only: an all-day event without alerts', e3 and e3['allDay'] and e3['date'] == '2026-10-01' and e3['popups'] == [], e3)
check('no date: not in Calendar, and the app is told why', link('cal-4')['status'] == 'unlinked' and link('cal-4')['reason'] == 'no-date' and len(evs) == 3, link('cal-4'))

push([('tasks', {**c1b, 'status': 'done', 'completedAt': '2026-09-28T02:00:00.000Z', 'updatedAt': '2026-09-28T02:00:00.000Z'})])
cal_sync()
e1 = live_events().get(l1['eventId'])
check('a done task\'s event is renamed "✓ …" with no alerts', e1 and e1['title'] == '✓ Grand rounds prep (moved)' and e1['popups'] == [] and link('cal-1')['reason'] == 'done', e1)
push([('tasks', {**c1b, 'updatedAt': '2026-09-28T02:05:00.000Z'})])
cal_sync()
e1 = live_events().get(l1['eventId'])
check('reopening it brings the title and alerts back', e1 and e1['title'] == 'Grand rounds prep (moved)' and sorted(e1['popups']) == [10, 30], e1)

push([('tasks', {**c1b, 'deletedAt': '2026-09-28T02:10:00.000Z', 'updatedAt': '2026-09-28T02:10:00.000Z'})])
cal_sync()
check('deleting the task deletes its event', l1['eventId'] not in live_events() and link('cal-1')['status'] == 'unlinked')
push([('tasks', {**c1b, 'deletedAt': None, 'updatedAt': '2026-09-28T02:11:00.000Z'})])
cal_sync()
l1 = link('cal-1')
check('undo brings a new event back', l1['status'] == 'linked' and l1['eventId'] in live_events(), l1)

# The event for cal-3 is deleted in Google Calendar
st = gas('dump')
for c in st['calendars'].values():
    if link('cal-3')['eventId'] in c['events']:
        c['events'][link('cal-3')['eventId']]['deleted'] = True
save_state(st)
gas('tick')
check('an event deleted in Calendar is noticed by the 30-minute check', link('cal-3')['status'] == 'deleted' and link('cal-3')['reason'] == 'removed-in-calendar', link('cal-3'))
push([('tasks', ctask('cal-3', title='Pay rent (edited)', date='2026-10-01', updated='2026-09-28T01:30:00.000Z'))])
gas('tick')
check('…and never made again, even after an edit', link('cal-3')['status'] == 'deleted' and not any(e['tags'].get('lifeDashboardTaskId') == 'cal-3' for e in live_events().values()))
push([('tasks', ctask('cal-3', title='Pay rent (edited)', date='2026-10-01', addToCalendar=False, updated='2026-09-28T01:31:00.000Z'))])
gas('tick')
check('when the app unlinks it, it shows as not linked', link('cal-3')['status'] == 'unlinked')
push([('tasks', ctask('cal-3', title='Pay rent (edited)', date='2026-10-01', updated='2026-09-28T01:32:00.000Z'))])
gas('tick')
check('linking it again makes a new event', link('cal-3')['status'] == 'linked' and link('cal-3')['eventId'] in live_events())

# Follow-ups: a task at 10:00 with a reminder 30 minutes before (09:30), still open afterwards
set_now('2026-09-29T01:00:00.000Z')  # 09:00
push([('tasks', ctask('cal-5', title='Call the lab', date='2026-09-29', startTime='10:00', reminders=[{'id': 'x', 'kind': 'before', 'minutes': 30}]))])
gas('tick')
follow = lambda: sorted((e for e in live_events().values() if e['title'].startswith('Still not done')), key=lambda e: e['start'])
check('no follow-up before the reminder is due', follow() == [] and link('cal-5')['status'] == 'linked')
set_now('2026-09-29T03:00:00.000Z')  # 11:00 — the first follow-up (11:30) is coming up
gas('tick')
f = follow()
check('a follow-up is added 2 hours after the reminder', len(f) == 1 and f[0]['title'] == 'Still not done: Call the lab'
      and f[0]['start'] == '2026-09-29T03:35:00.000Z' and f[0]['popups'] == [5], f)
set_now('2026-09-29T05:00:00.000Z')  # 13:00 — the second (13:30)
gas('tick')
set_now('2026-09-29T07:10:00.000Z')  # 15:10 — the limit (2) is reached
gas('tick')
check('follow-ups stop at the limit (2)', len(follow()) == 2 and link('cal-5')['followUps'][1]['at'] == '2026-09-29T05:30:00.000Z', follow())
push([('tasks', ctask('cal-5', title='Call the lab', date='2026-09-29', startTime='10:00', reminders=[{'id': 'x', 'kind': 'before', 'minutes': 30}],
                      status='done', completedAt='2026-09-29T07:12:00.000Z', updated='2026-09-29T07:12:00.000Z'))])
cal_sync()
check('ticking the task removes its follow-ups', follow() == [] and link('cal-5')['followUps'] == [], follow())

# Quiet hours: a follow-up that would land at 23:00 moves to 08:00 the next morning
push([('tasks', ctask('cal-6', title='Evening meds review', date='2026-09-29', startTime='21:30', reminders=[{'id': 'q', 'kind': 'before', 'minutes': 30}]))])
set_now('2026-09-29T14:00:00.000Z')  # 22:00
gas('tick')
check('no follow-up during quiet hours', follow() == [], follow())
set_now('2026-09-29T23:30:00.000Z')  # 07:30 the next morning
gas('tick')
f = follow()
check('it rings at 8:00 AM instead', len(f) == 1 and f[0]['start'] == '2026-09-30T00:05:00.000Z', f)


# Setting: remove the event when a task is done
push([('settings', rec('app', '2026-09-29T23:40:00.000Z', tasks={'calendar': {'completed': 'remove'}}))])
push([('tasks', ctask('cal-6', title='Evening meds review', date='2026-09-29', startTime='21:30', status='done', updated='2026-09-29T23:41:00.000Z',
                      reminders=[{'id': 'q', 'kind': 'before', 'minutes': 30}]))])
cal_sync()
check('with "remove", a done task\'s event and follow-ups are deleted', link('cal-6')['eventId'] == '' and link('cal-6')['reason'] == 'done-removed' and follow() == [], link('cal-6'))

# The calendar is deleted: links pause; "Try again" makes a new one
st = gas('dump')
for c in st['calendars'].values():
    c['deleted'] = True
save_state(st)
push([('tasks', ctask('cal-2', title='Submit IRB form (v2)', date='2026-09-30', reminders=[{'id': 'c', 'kind': 'before', 'minutes': 60}], updated='2026-09-29T23:50:00.000Z'))])
cal_sync()
check('a deleted calendar pauses the link', link('cal-2')['status'] == 'paused' and link('cal-2')['reason'] == 'calendar-missing', link('cal-2'))
check('status reports the calendar missing', gas('post', {**base, 'action': 'calendarStatus'})['calendar']['state'] == 'missing')
res = gas('post', {**base, 'action': 'calendarSetup', 'create': True})
st = gas('dump')
active = [c for c in st['calendars'].values() if not c['deleted']]
check('"Try again" makes a new calendar and relinks the tasks', res.get('ok') and len(active) == 1 and res['calendar']['state'] == 'ok'
      and link('cal-2')['status'] == 'linked' and link('cal-2')['calendarId'] == active[0]['id'] and link('cal-2')['eventId'] in active[0]['events'], res)

# Choosing another calendar in the app moves the events there
st = gas('dump')
st['calendars']['practice@group.calendar.google.com'] = {'id': 'practice@group.calendar.google.com', 'name': 'Practice tasks', 'tz': 'Asia/Manila', 'deleted': False, 'events': {}}
save_state(st)
push([('settings', rec('app', '2026-09-29T23:55:00.000Z', tasks={'calendar': {'calendarId': 'practice@group.calendar.google.com'}}))])
gas('post', {**base, 'action': 'calendarSetup'})
st = gas('dump')
check('choosing another calendar moves the events', link('cal-2')['calendarId'] == 'practice@group.calendar.google.com'
      and link('cal-2')['eventId'] in st['calendars']['practice@group.calendar.google.com']['events']
      and not any(not e['deleted'] for c in st['calendars'].values() if c['id'] != 'practice@group.calendar.google.com' and not c['deleted'] for e in c['events'].values()),
      [(c['name'], e['title']) for c in st['calendars'].values() if c['id'] != 'practice@group.calendar.google.com' and not c['deleted'] for e in c['events'].values() if not e['deleted']])

# No Calendar permission: calendar links pause, but syncing still works
st = gas('dump')
st['calNoAuth'] = True
save_state(st)
check('status reports the missing permission', gas('post', {**base, 'action': 'calendarStatus'}).get('error') == 'calendar-needs-auth')
res = push([('tasks', ctask('cal-2', title='Submit IRB form (v3)', date='2026-09-30', reminders=[{'id': 'c', 'kind': 'before', 'minutes': 60}], updated='2026-09-30T00:00:00.000Z'))])
check('syncing still works without Calendar permission', set(res['results'].values()) == {'applied'}, res)
cal_sync()
check('the link pauses with the reason', link('cal-2')['status'] == 'paused' and link('cal-2')['reason'] == 'calendar-needs-auth', link('cal-2'))
gas('tick')
check('the 30-minute check doesn\'t crash', gas('dump')['props'].get('CAL_LAST_RUN') is not None)
st = gas('dump')
st['calNoAuth'] = False
save_state(st)
cal_sync()
check('once allowed again, the link recovers', link('cal-2')['status'] == 'linked', link('cal-2'))
st = gas('dump')
link_tab = sheet(st, 'Calendar links')
r = readable(st, 'Calendar links', 'cal-2')
check('the Calendar links tab is readable', r['Task'] == 'Submit IRB form (v3)' and r['Status'] == 'Linked' and r['Calendar'] == 'Practice tasks', r)

# Subtasks with their own time (version 6): their own events, named with their task
set_now('2026-09-30T01:00:00.000Z')  # Wednesday 09:00
push([('settings', rec('app', '2026-09-30T00:30:00.000Z', tasks={'calendar': {'calendarId': 'practice@group.calendar.google.com', 'completed': 'rename'}}))])
parent = ctask('cal-7', title='Finish STRAMA paper', date='2026-10-02', addToCalendar=False)
sub = rec('sub-7', '2026-09-30T01:00:00.000Z', taskId='cal-7', title='Draft the introduction', done=False, order=0,
          date='2026-09-30', startTime='14:00', reminders=[{'id': 's1', 'kind': 'before', 'minutes': 15}], addToCalendar=True)
push([('tasks', parent), ('subtasks', sub)])
cal_sync()
ls = link('sub-7')
es = live_events().get(ls['eventId'] if ls else '')
check('a subtask with its own time becomes its own event, named with its task', es and es['title'] == 'Draft the introduction (Finish STRAMA paper)'
      and es['start'] == '2026-09-30T06:00:00.000Z' and es['popups'] == [15] and ls['item'] == 'subtask' and ls['taskId'] == 'cal-7', (ls, es))
check('its event says it\'s a subtask', es and 'A subtask of “Finish STRAMA paper”' in es['description'], es and es['description'])
check('the Calendar links tab names the subtask and its task', readable(gas('dump'), 'Calendar links', 'sub-7')['Task'] == 'Draft the introduction (subtask of Finish STRAMA paper)',
      readable(gas('dump'), 'Calendar links', 'sub-7'))
parent2 = {**parent, 'title': 'Finish STRAMA paper (final)', 'updatedAt': '2026-09-30T01:05:00.000Z'}
push([('tasks', parent2)])
cal_sync()
check('renaming its task renames the subtask\'s event', live_events()[ls['eventId']]['title'] == 'Draft the introduction (Finish STRAMA paper (final))', live_events()[ls['eventId']]['title'])
check('…and the Calendar links tab', 'Finish STRAMA paper (final)' in readable(gas('dump'), 'Calendar links', 'sub-7')['Task'])
push([('subtasks', {**sub, 'done': True, 'completedAt': '2026-09-30T01:10:00.000Z', 'updatedAt': '2026-09-30T01:10:00.000Z'})])
cal_sync()
check('a done subtask\'s event is renamed "✓ …"', live_events()[ls['eventId']]['title'] == '✓ Draft the introduction (Finish STRAMA paper (final))')
push([('subtasks', {**sub, 'updatedAt': '2026-09-30T01:11:00.000Z'})])
cal_sync()
check('…and back when it isn\'t done', live_events()[ls['eventId']]['title'] == 'Draft the introduction (Finish STRAMA paper (final))' and live_events()[ls['eventId']]['popups'] == [15])
push([('tasks', {**parent2, 'status': 'done', 'completedAt': '2026-09-30T01:12:00.000Z', 'updatedAt': '2026-09-30T01:12:00.000Z'})])
cal_sync()
check('completing its task marks the subtask\'s event done too', live_events()[ls['eventId']]['title'].startswith('✓ '))
push([('tasks', {**parent2, 'deletedAt': '2026-09-30T01:13:00.000Z', 'updatedAt': '2026-09-30T01:13:00.000Z'})])
cal_sync()
check('deleting its task deletes the subtask\'s event', ls['eventId'] not in live_events() and link('sub-7')['status'] == 'unlinked', link('sub-7'))
set_now('2026-10-01T01:00:00.000Z')  # Thursday 09:00
push([('tasks', ctask('cal-8', title='Grand rounds', date='2026-10-01', addToCalendar=False, updated='2026-10-01T01:00:00.000Z')),
      ('subtasks', rec('sub-8', '2026-10-01T01:00:00.000Z', taskId='cal-8', title='Print the handouts', done=False, order=0, date='2026-10-01',
                       startTime='10:00', reminders=[{'id': 'p', 'kind': 'before', 'minutes': 30}], addToCalendar=True))])
gas('tick')
set_now('2026-10-01T03:00:00.000Z')  # 11:00: its reminder was at 09:30
gas('tick')
mine = lambda: [e['title'] for e in follow() if 'Print the handouts' in e['title']]
check('a subtask still open after its reminder gets a follow-up too', mine() == ['Still not done: Print the handouts (Grand rounds)'], [e['title'] for e in follow()])
push([('tasks', ctask('cal-8', title='Grand rounds', date='2026-10-01', addToCalendar=False, deletedAt='2026-10-01T03:01:00.000Z', updated='2026-10-01T03:01:00.000Z'))])
cal_sync()
check('…removed with its task', mine() == [] and link('sub-8')['status'] == 'unlinked', mine())

print('\nApple Health weight (version 12)')
set_now('2026-10-07T01:30:00.000Z')  # 09:30 in Manila
hw = lambda **f: gas('post', {**base, 'action': 'healthWeight', **f})
res = hw(value='78.4', unit='kg', date='2026-10-07T07:10:00+08:00')
check('a weight from the Shortcut is saved', res.get('ok') and res.get('added') == 1 and res.get('message') == 'Saved 78.4 kg to Life Dashboard (2026-10-07 07:10).', res)
hrow = readable(gas('dump'), 'Body measurements', 'health-weight-' + str(1791328200000))
check('…as a Body measurements row marked from Apple Health', hrow['kind'] == 'weight' and hrow['valueKg'] == '78.4' and hrow['source'] == 'health' and hrow['device'] == 'Apple Health (Shortcut)', hrow)
pulled = [c['record'] for c in gas('post', {**base, 'action': 'pull', 'sinceSeq': 0})['changes'] if c['record']['id'].startswith('health-weight-')]
check('…and devices pull it on their next sync', len(pulled) == 1 and pulled[0]['measuredAt'] == '2026-10-06T23:10:00.000Z' and pulled[0]['valueKg'] == 78.4, pulled)
res = hw(value='78.4', unit='kg', date='2026-10-07T07:10:00+08:00')
check('sending the same weigh-in again adds nothing', res.get('ok') and res.get('added') == 0 and res.get('skipped') == 1 and res['message'].startswith('Already saved'), res)
edited = {**pulled[0], 'valueKg': 78.0, 'note': 'fixed', 'updatedAt': '2026-10-07T02:00:00.000Z'}
push([('bodyMeasurements', edited)])
hw(value='78.4', unit='kg', date='2026-10-07T07:10:00+08:00')
after = json.loads(readable(gas('dump'), 'Body measurements', edited['id'])['json'])
check('a weigh-in you edited in the app is never changed back', after['valueKg'] == 78.0 and after['note'] == 'fixed', after)
check('pounds are converted to kg', hw(value='172.9', unit='lb', date='2026-10-06T07:00:00+08:00').get('message', '').startswith('Saved 78.4 kg'))
check('a comma decimal works', hw(value='78,6', unit='kg', date='2026-10-05T07:00:00+08:00').get('added') == 1)
res = hw(value='abc', unit='kg')
check('something that isn\'t a weight is refused', res.get('ok') is False and res.get('error') == 'bad-weight' and 'Nothing saved' in res.get('message', ''), res)
check('an impossible weight is refused', hw(value='780', unit='kg').get('ok') is False)
res = hw(value='77.9', unit='kg', date='not a date')
check('an unreadable date means now', res.get('added') == 1 and '2026-10-07 09:30' in res['message'], res)
res = hw(value='77.9', unit='kg', date='2030-01-01T00:00:00Z')
check('a date in the future becomes now (and matches the one just sent)', res.get('added') == 0, res)
res = gas('post', {**base, 'action': 'healthWeight', 'weights': [{'value': '79.1', 'date': '2026-10-01T07:00:00+08:00'}, {'value': '79.0', 'date': '2026-10-02T07:00:00+08:00'}, {'value': 'x'}]})
check('several weigh-ins at once (bad ones listed)', res.get('ok') and res.get('added') == 2 and len(res.get('problems', [])) == 1, res)
check('the wrong token is refused', gas('post', {**base, 'token': 'AAAA-BBBB-CCCC-DDDD', 'action': 'healthWeight', 'value': '78'}).get('error') == 'bad-token')

os.unlink(STATE)
print(f'\n{"All checks passed." if not FAILURES else f"{len(FAILURES)} check(s) failed."}')
sys.exit(1 if FAILURES else 0)
