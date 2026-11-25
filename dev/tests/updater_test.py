#!/usr/bin/env python3
"""
Uji otomatis public/3d-anatomy/updater.php & _admin_auth.php.
Menguji:
  1. check versi terhadap mock GitHub release API
  2. penolakan apply tanpa password admin yang sah (401)
  3. penolakan bila SHA-256 tidak cocok (422)
  4. penolakan ZIP dengan path traversal (../evil.txt) (422)
  5. apply sukses + proteksi penuh file instansi (config.php, lab.sqlite, .htadmin_pass, custom-favicon.png, anatomy_db.json)
  6. rollback sukses mengembalikan versi dan file sebelumnya
"""

import hashlib
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UPDATER_SRC = ROOT / 'public' / '3d-anatomy' / 'updater.php'
AUTH_SRC = ROOT / 'public' / '3d-anatomy' / '_admin_auth.php'
DB_SRC = ROOT / 'public' / '3d-anatomy' / 'db.php'
SET_PASS_SRC = ROOT / 'public' / '3d-anatomy' / 'set-admin-pass.php'


def make_zip(path: Path, entries: dict[str, bytes]) -> str:
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def req_json(url: str, data: dict | None = None):
    raw = json.dumps(data).encode('utf-8') if data is not None else None
    headers = {'Content-Type': 'application/json'} if data is not None else {}
    req = urllib.request.Request(url, data=raw, headers=headers, method='POST' if data is not None else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix='atlas_upd_test_'))
    passed = 0

    def check(cond: bool, msg: str):
        nonlocal passed
        if not cond:
            raise AssertionError(f'GAGAL: {msg}')
        passed += 1

    try:
        site = tmp / 'site'
        app_dir = site / '3d-anatomy'
        lab_data = app_dir / 'lab' / 'data'
        models_dir = site / 'models'
        mock_srv_dir = tmp / 'mock_gh'

        for d in (lab_data, models_dir, mock_srv_dir):
            d.mkdir(parents=True, exist_ok=True)

        # Salin file backend yang diuji ke sandbox
        for src in (UPDATER_SRC, AUTH_SRC, DB_SRC):
            shutil.copy2(src, app_dir / src.name)

        (site / 'index.html').write_text('<html>old-v1</html>', encoding='utf-8')
        (models_dir / 'heart.glb').write_bytes(b'MODEL-ORIGINAL')
        (app_dir / 'version.json').write_text(json.dumps({'version': '1.0.0', 'repo': 'maki-lab2410/human-atlas'}), encoding='utf-8')
        (app_dir / 'anatomy_db.json').write_text('{"custom":"edited-by-local-admin"}', encoding='utf-8')
        (app_dir / 'custom-favicon.png').write_bytes(b'CUSTOM-FAVICON')
        (app_dir / 'lab' / 'config.php').write_text("<?php return ['client_secret' => 'local-secret'];", encoding='utf-8')
        (lab_data / 'lab.sqlite').write_bytes(b'SQLITE-LOCAL-DATA')

        # Buat hash admin memakai PHP (password: 'TestAdminPass123!')
        pw = 'TestAdminPass123!'
        hash_out = subprocess.check_output(['php', '-r', f"echo password_hash({pw!r}, PASSWORD_BCRYPT, ['cost'=>4]);"], text=True)
        (app_dir / '.htadmin_pass').write_text(hash_out, encoding='utf-8')

        # Buat ZIP rilis valid v1.1.0 (termasuk entri berbahaya yang harus dilewati oleh preserved_paths)
        good_zip = mock_srv_dir / 'human-atlas-app.zip'
        good_sha = make_zip(good_zip, {
            'index.html': b'<html>new-v1.1.0</html>',
            'assets/app-new.js': b'console.log("1.1.0");',
            '3d-anatomy/version.json': b'{"version":"1.1.0","repo":"maki-lab2410/human-atlas"}',
            '3d-anatomy/anatomy_db.json': b'{"custom":"OVERWRITE_ATTEMPT"}',
            '3d-anatomy/lab/config.php': b'OVERWRITE_ATTEMPT',
            '3d-anatomy/lab/data/lab.sqlite': b'OVERWRITE_ATTEMPT',
            '3d-anatomy/.htadmin_pass': b'OVERWRITE_ATTEMPT',
            '3d-anatomy/custom-favicon.png': b'OVERWRITE_ATTEMPT',
            'models/heart.glb': b'OVERWRITE_ATTEMPT',
        })

        bad_zip = mock_srv_dir / 'bad-traversal.zip'
        bad_sha = make_zip(bad_zip, {'../evil.txt': b'pwn'})

        # Jalankan mock server GitHub Releases
        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(mock_srv_dir), **kwargs)
            def log_message(self, *args):
                pass

        gh_srv = socketserver.TCPServer(('127.0.0.1', 0), Handler)
        gh_port = gh_srv.server_address[1]
        threading.Thread(target=gh_srv.serve_forever, daemon=True).start()

        def set_release(zip_name: str, sha: str):
            (mock_srv_dir / 'release-manifest.json').write_text(json.dumps({
                'version': '1.1.0',
                'app_size': (mock_srv_dir / zip_name).stat().st_size,
                'app_sha256': sha,
            }), encoding='utf-8')
            (mock_srv_dir / 'latest.json').write_text(json.dumps({
                'tag_name': 'v1.1.0',
                'published_at': '2026-11-25T00:00:00Z',
                'html_url': f'http://127.0.0.1:{gh_port}/rel',
                'body': 'Catatan rilis v1.1.0',
                'assets': [
                    {'name': 'human-atlas-app.zip', 'size': (mock_srv_dir / zip_name).stat().st_size, 'browser_download_url': f'http://127.0.0.1:{gh_port}/{zip_name}'},
                    {'name': 'release-manifest.json', 'browser_download_url': f'http://127.0.0.1:{gh_port}/release-manifest.json'},
                ],
            }), encoding='utf-8')

        set_release('human-atlas-app.zip', good_sha)

        # Jalankan PHP built-in server untuk site/
        env = os.environ.copy()
        env['ATLAS_DATA_DIR'] = str(app_dir)
        env['ATLAS_ROOT_DIR'] = str(site)
        env['ATLAS_RELEASE_API_URL'] = f'http://127.0.0.1:{gh_port}/latest.json'
        php_proc = subprocess.Popen(
            ['php', '-S', '127.0.0.1:0', '-t', str(site)],
            env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        # Baca port yang dipilih? Gunakan port acak bebas dulu agar deterministik
        php_proc.terminate()
        php_proc.wait()

        import socket
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            php_port = s.getsockname()[1]

        php_proc = subprocess.Popen(
            ['php', '-S', f'127.0.0.1:{php_port}', '-t', str(site)],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        import time
        time.sleep(0.4)

        try:
            base = f'http://127.0.0.1:{php_port}/3d-anatomy'

            # 1. db.php ping tetap bekerja dengan _admin_auth.php
            st, d = req_json(f'{base}/db.php?action=ping')
            check(st == 200 and d.get('php') is True, 'db.php ping gagal')

            # 2. check update mendeteksi v1.1.0
            st, d = req_json(f'{base}/updater.php?action=check')
            check(st == 200 and d.get('has_update') is True and d.get('latest_version') == '1.1.0' and d.get('can_auto_update') is True, f'check gagal: {d}')

            # 3. apply tanpa password sah ditolak 401
            st, _ = req_json(f'{base}/updater.php?action=apply', {'password': 'salah'})
            check(st == 401, f'harus 401, dapat {st}')

            # 4. apply dengan SHA-256 salah ditolak 422
            set_release('human-atlas-app.zip', '0' * 64)
            st, d = req_json(f'{base}/updater.php?action=apply', {'password': pw})
            check(st == 422, f'SHA mismatch harus 422, dapat {st} {d}')

            # 5. apply dengan ZIP path traversal ditolak 422
            set_release('bad-traversal.zip', bad_sha)
            st, d = req_json(f'{base}/updater.php?action=apply', {'password': pw})
            check(st == 422, f'path traversal harus 422, dapat {st} {d}')
            check(not (tmp / 'evil.txt').exists(), 'file traversal tidak boleh tercipta')

            # 6. apply sukses + seluruh file instansi terlindungi
            set_release('human-atlas-app.zip', good_sha)
            st, d = req_json(f'{base}/updater.php?action=apply', {'password': pw})
            check(st == 200 and d.get('version') == '1.1.0', f'apply gagal: {st} {d}')
            check((site / 'index.html').read_text() == '<html>new-v1.1.0</html>', 'index.html tidak terupdate')
            check((site / 'assets' / 'app-new.js').exists(), 'file baru tidak terbuat')
            check((app_dir / 'anatomy_db.json').read_text() == '{"custom":"edited-by-local-admin"}', 'anatomy_db.json tertimpa!')
            check((app_dir / 'lab' / 'config.php').read_text() == "<?php return ['client_secret' => 'local-secret'];", 'config.php tertimpa!')
            check((lab_data / 'lab.sqlite').read_bytes() == b'SQLITE-LOCAL-DATA', 'lab.sqlite tertimpa!')
            check((app_dir / '.htadmin_pass').read_text() == hash_out, '.htadmin_pass tertimpa!')
            check((app_dir / 'custom-favicon.png').read_bytes() == b'CUSTOM-FAVICON', 'custom-favicon.png tertimpa!')
            check((models_dir / 'heart.glb').read_bytes() == b'MODEL-ORIGINAL', 'models/ tertimpa!')

            # 7. check sekarang tidak ada update lagi & has_rollback=True
            st, d = req_json(f'{base}/updater.php?action=check')
            check(st == 200 and d.get('has_update') is False and d.get('has_rollback') is True, f'post-update check salah: {d}')

            # 8. rollback mengembalikan v1.0.0 dan index.html lama, menghapus file baru
            st, d = req_json(f'{base}/updater.php?action=rollback', {'password': pw})
            check(st == 200 and d.get('version') == '1.0.0', f'rollback gagal: {st} {d}')
            check((site / 'index.html').read_text() == '<html>old-v1</html>', 'index.html tidak kembali')
            check(not (site / 'assets' / 'app-new.js').exists(), 'file tambahan tidak terhapus saat rollback')

            print(f'updater_test: {passed} lulus, 0 gagal')
        finally:
            php_proc.terminate()
            php_proc.wait()
            gh_srv.shutdown()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
