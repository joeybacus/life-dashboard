#!/usr/bin/env python3
"""Regenerate the PNG app icons from the SVG artwork using headless Google Chrome.
Run from anywhere:  python3 tools/make-icons.py"""
import os, shutil, subprocess, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
# Chrome can't make windows smaller than ~500px, so render at 512 and shrink with macOS `sips`.
JOBS = [  # (source svg, output png)
    ('icons/icon.svg', 'icons/icon-512.png'),
    ('icons/icon-maskable.svg', 'icons/icon-maskable-512.png'),
]
RESIZES = [  # (from, size, to)
    ('icons/icon-512.png', 192, 'icons/icon-192.png'),
    ('icons/icon-maskable-512.png', 180, 'icons/apple-touch-icon.png'),
]

def render(src, out, size=512):
    out_path = os.path.join(ROOT, out)
    if os.path.exists(out_path):
        os.remove(out_path)
    profile = tempfile.mkdtemp(prefix='icon-chrome-')
    proc = subprocess.Popen([
        CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
        '--force-device-scale-factor=1', f'--user-data-dir={profile}',
        '--default-background-color=00000000', f'--window-size={size},{size}',
        f'--screenshot={out_path}', 'file://' + os.path.join(ROOT, src),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 30
    while time.time() < deadline and proc.poll() is None:
        if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            time.sleep(0.5)  # let Chrome finish writing
            break
        time.sleep(0.2)
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    shutil.rmtree(profile, ignore_errors=True)
    if not os.path.exists(out_path):
        raise SystemExit(f'Failed to render {out}')
    print(f'{out}  ({size}x{size})')

for job in JOBS:
    render(*job)
for src, size, out in RESIZES:
    subprocess.run(['sips', '-z', str(size), str(size), os.path.join(ROOT, src), '--out', os.path.join(ROOT, out)],
                   check=True, stdout=subprocess.DEVNULL)
    print(f'{out}  ({size}x{size})')
