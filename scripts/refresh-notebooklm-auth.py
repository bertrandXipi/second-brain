#!/usr/bin/env python3
"""
Auto-refresh NotebookLM MCP auth tokens from Chrome profile cookies.
Reads cookies directly from the saved Chrome profile (no Chrome needed).
"""

import sqlite3
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime

CHROME_COOKIES_DB = os.path.expanduser('~/.notebooklm-mcp/chrome-profile/Default/Cookies')
AUTH_JSON = os.path.expanduser('~/.notebooklm-mcp/auth.json')
LOG_FILE = os.path.expanduser('~/notebooklm-auth-refresh.log')

GOOGLE_DOMAINS = [
    '.google.com',
    'accounts.google.com',
    'notebooklm.google.com',
    '.notebooklm.google.com',
]

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def extract_cookies():
    if not os.path.exists(CHROME_COOKIES_DB):
        raise FileNotFoundError(f'Chrome cookies DB not found: {CHROME_COOKIES_DB}')

    # Copy DB to avoid lock issues
    tmp_db = '/tmp/notebooklm-cookies-tmp.db'
    shutil.copy2(CHROME_COOKIES_DB, tmp_db)

    conn = sqlite3.connect(tmp_db)
    cur = conn.cursor()

    placeholders = ','.join(['?' for _ in GOOGLE_DOMAINS])
    cur.execute(
        f'SELECT name, value, host_key FROM cookies WHERE host_key IN ({placeholders})',
        GOOGLE_DOMAINS
    )

    cookies = {}
    for name, value, host_key in cur.fetchall():
        if value:  # skip empty/encrypted values
            cookies[name] = value

    conn.close()
    os.unlink(tmp_db)
    return cookies

def update_auth_json(cookies):
    existing = {}
    if os.path.exists(AUTH_JSON):
        with open(AUTH_JSON) as f:
            existing = json.load(f)

    existing['cookies'] = cookies

    # Update csrf_token from SAPISID
    sapisid = cookies.get('SAPISID') or cookies.get('__Secure-3PAPISID', '')
    if sapisid:
        existing['csrf_token'] = sapisid

    with open(AUTH_JSON, 'w') as f:
        json.dump(existing, f, indent=2)

    log(f'Updated auth.json with {len(cookies)} cookies')

def restart_mcp():
    result = subprocess.run(
        ['sudo', 'systemctl', 'restart', 'notebooklm-mcp'],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        log('notebooklm-mcp restarted successfully')
    else:
        log(f'Failed to restart notebooklm-mcp: {result.stderr}')
        return False
    return True

def main():
    log('Starting NotebookLM auth refresh...')

    try:
        cookies = extract_cookies()
        log(f'Extracted {len(cookies)} cookies from Chrome profile')

        if len(cookies) < 3:
            log('ERROR: Too few cookies - Chrome profile may need re-login')
            sys.exit(1)

        update_auth_json(cookies)
        restart_mcp()
        log('Auth refresh complete!')

    except Exception as e:
        log(f'ERROR: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()
