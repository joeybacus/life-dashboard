#!/usr/bin/env python3
"""Checks apps-script/Vouchers.gs against a pretend spreadsheet (no Google account needed).

    python3 tools/sync-test/test_vouchers_gs.py
"""
import json
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CODE = os.path.join(ROOT, 'apps-script', 'Vouchers.gs')
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


def state():
    with open(STATE) as f:
        return json.load(f)


def save(data):
    with open(STATE, 'w') as f:
        json.dump(data, f)


def tab(data, name):
    return next(s for s in data['sheets'] if s['name'] == name)


def set_now(iso):
    data = state()
    data['now'] = iso
    save(data)


SHEET_A = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'
SHEET_B = '1ZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZz'


def ask(code, device='dev-a', sheet=''):
    return gas('post', {'action': 'voucher', 'code': code, 'deviceId': device, 'sheetId': sheet})


print('Vouchers.gs checks')
open(STATE, 'w').close()
gas('setup')
data = state()
codes = tab(data, 'Codes')
check('setup makes the Codes headers', codes['rows'][0][:5] == ['Name or note', '1 week', '1 month', '1 year', 'Their Google Sheet (link)'], codes['rows'][:1])
check('setup makes the Used tab', tab(data, 'Used')['rows'][0][0] == 'Code')
codes['rows'] += [['Sarah', 'WEEK-1234', 'month5678', 'YEAR9999', ''], ['Tom', '', 'GONE0000', '', ''],
                  ['Ana', '', 'ANA-LINKED', '', f'https://docs.google.com/spreadsheets/d/{SHEET_A}/edit#gid=0']]
codes['maxRows'] = max(codes['maxRows'], 10)
save(data)
set_now('2026-10-17T03:00:00.000Z')  # Oct 17 in Manila

check('GET answers who it is', gas('get').get('app') == 'life-dashboard-vouchers')
check('unknown code is refused', ask('NOPE1234') == {'ok': True, 'valid': False, 'reason': 'unknown'})
check('short code is refused', ask('AB').get('valid') is False)

r = ask('week-1234')
check('1 week code: first use starts it (lower case, dashes ok)', r.get('valid') and r.get('ends') == '2026-10-23', r)
r = ask('MONTH 5678')
check('1 month code ends a month later', r.get('ends') == '2026-11-16', r)
r = ask('YEAR9999')
check('1 year code ends a year later', r.get('ends') == '2027-10-16', r)

used = tab(state(), 'Used')['rows']
row = next(x for x in used if x and x[0] == 'WEEK1234')
check('Used tab records first use and last day', row[1:5] == ['1 week', '2026-10-17', '2026-10-23', '2026-10-17'], row)

set_now('2026-10-20T03:00:00.000Z')
r = ask('WEEK1234')
check('still valid mid-week, same last day', r.get('valid') and r.get('ends') == '2026-10-23', r)
r = ask('WEEK1234', 'dev-c')
check('no Sheet link: a second device is refused', r.get('reason') == 'in-use', r)
row = next(x for x in tab(state(), 'Used')['rows'] if x and x[0] == 'WEEK1234')
check('one device recorded with its first day', row[5] == 1 and row[6] == 'dev-a@2026-10-17', row)
data = state()
next(x for x in tab(data, 'Used')['rows'] if x and x[0] == 'WEEK1234')[6] = ''
save(data)
r = ask('WEEK1234', 'dev-c')
check('clearing Device IDs moves it to a new device', r.get('valid'), r)
r = ask('WEEK1234', 'dev-a')
check('…and the old device is refused', r.get('reason') == 'in-use', r)
data = state()
next(x for x in tab(data, 'Used')['rows'] if x and x[0] == 'WEEK1234')[6] = 'dev-a@2026-10-17'
save(data)

set_now('2026-10-24T03:00:00.000Z')
r = ask('WEEK1234')
check('ends after its last day', r == {'ok': True, 'valid': False, 'reason': 'expired', 'ends': '2026-10-23'}, r)

data = state()
row = next(x for x in tab(data, 'Used')['rows'] if x and x[0] == 'WEEK1234')
row[3] = '2026-12-31'
save(data)
r = ask('WEEK1234')
check('editing Last day in Used extends it', r.get('valid') and r.get('ends') == '2026-12-31', r)

r = ask('GONE0000')
check('Tom\'s code works', r.get('valid'), r)
data = state()
tab(data, 'Codes')['rows'][2][2] = ''
save(data)
r = ask('GONE0000')
check('deleting a code from Codes stops it', r.get('reason') == 'unknown', r)

for i in range(8):
    data = state()
    tab(data, 'Codes')['rows'].append(['x', f'MANY{i:04d}', '', ''])
    tab(data, 'Codes')['maxRows'] = max(tab(data, 'Codes')['maxRows'], len(tab(data, 'Codes')['rows']) + 1)
    save(data)
    ask(f'MANY{i:04d}')
check('Used tab grows past its size', sum(1 for x in tab(state(), 'Used')['rows'] if x and x[0]) == 13)

print('Sheet-linked codes')
set_now('2026-10-17T03:00:00.000Z')
r = ask('ANA-LINKED', 'ana-phone', SHEET_A)
check('works in the app synced to that Sheet', r.get('valid') and not r.get('needsSheet'), r)
r = ask('ANA-LINKED', 'ana-ipad', SHEET_A)
check('…on any of their devices', r.get('valid'), r)
r = ask('ANA-LINKED', 'friend', SHEET_B)
check('refused in an app synced to another Sheet', r.get('reason') == 'other-sheet', r)
r = ask('ANA-LINKED', 'ana-mac', '')
check('a device not synced yet gets 3 days', r.get('valid') and r.get('needsSheet') and r.get('graceEnds') == '2026-10-19', r)
set_now('2026-10-19T03:00:00.000Z')
check('…still fine on day 3', ask('ANA-LINKED', 'ana-mac', '').get('valid'))
set_now('2026-10-20T03:00:00.000Z')
r = ask('ANA-LINKED', 'ana-mac', '')
check('…then it must connect the Sheet', r.get('reason') == 'needs-sheet', r)
r = ask('ANA-LINKED', 'ana-mac', SHEET_A)
check('…and works again once synced', r.get('valid'), r)
row = next(x for x in tab(state(), 'Used')['rows'] if x and x[0] == 'ANALINKED')
check('friend\'s device not recorded', 'friend' not in row[6] and row[5] == 3, row)

check('unknown action refused', gas('post', {'action': 'sync'}).get('error') == 'unknown-action')

os.unlink(STATE)
print(f'\n{"All checks passed." if not FAILURES else f"{len(FAILURES)} check(s) failed."}')
raise SystemExit(1 if FAILURES else 0)
