#!/usr/bin/env python3
"""
scripts/deploy.py — Script Otomatis Deploy ke Server cPanel via FTP / FTPS
Didesain khusus untuk 3D Anatomy Lab (emr.dinus.id)
"""

import os
import sys
import ftplib
import getpass
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"
ENV_FILE = ROOT_DIR / ".env.deploy"

# ─── Warna Terminal ─────────────────────────────────────────────────────────
class Colors:
    GREEN = '\033[92m'
    BLUE = '\033[94m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

def log(msg, color=Colors.RESET):
    print(f"{color}{msg}{Colors.RESET}")

# ─── Baca Konfigurasi dari .env.deploy ──────────────────────────────────────
def load_env():
    config = {
        'FTP_HOST': 'ftp.emr.dinus.id',
        'FTP_USER': '3d-anatomy@emr.dinus.id',
        'FTP_PASS': '',
        'FTP_PORT': 21,
        'FTP_REMOTE_DIR': '/',
        'FTP_USE_TLS': 'true'
    }
    if ENV_FILE.exists():
        with open(ENV_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                config[k.strip()] = v.strip().strip('"').strip("'")
    return config

def save_env_password(password: str):
    config = load_env()
    config['FTP_PASS'] = password
    with open(ENV_FILE, 'w', encoding='utf-8') as f:
        f.write("# Konfigurasi Deployment FTP ke cPanel (JANGAN DIKOMIT KE GIT)\n")
        f.write(f"FTP_HOST={config['FTP_HOST']}\n")
        f.write(f"FTP_USER={config['FTP_USER']}\n")
        f.write(f"FTP_PASS={config['FTP_PASS']}\n")
        f.write(f"FTP_PORT={config['FTP_PORT']}\n")
        f.write(f"FTP_REMOTE_DIR={config['FTP_REMOTE_DIR']}\n")
        f.write(f"FTP_USE_TLS={config['FTP_USE_TLS']}\n")
    log(f"💾 Password disimpan di .env.deploy untuk deploy berikutnya.", Colors.GREEN)

# ─── Build Project ──────────────────────────────────────────────────────────
def run_build():
    log("\n📦 Menjalankan build produksi (npm run build)...", Colors.BLUE + Colors.BOLD)
    res = subprocess.run(["npm", "run", "build"], cwd=ROOT_DIR)
    if res.returncode != 0:
        log("❌ Build gagal! Periksa error di atas sebelum deploy.", Colors.RED)
        sys.exit(1)
    log("✅ Build berhasil!\n", Colors.GREEN)

# ─── Koneksi FTP / FTPS ────────────────────────────────────────────────────
def connect_ftp(config):
    host = config['FTP_HOST']
    port = int(config['FTP_PORT'])
    user = config['FTP_USER']
    password = config['FTP_PASS']
    use_tls = config.get('FTP_USE_TLS', 'true').lower() in ('true', '1', 'yes')

    ftp = None
    if use_tls:
        try:
            log(f"🔐 Menghubungkan ke {host}:{port} via FTPS (Explicit TLS)...", Colors.CYAN)
            ftp = ftplib.FTP_TLS()
            ftp.connect(host, port, timeout=30)
            ftp.auth()
            ftp.login(user, password)
            ftp.prot_p()  # Proteksi data connection dengan TLS
            log("✅ Terhubung via FTPS terenkripsi!", Colors.GREEN)
            return ftp
        except Exception as e:
            log(f"⚠️ Gagal FTPS TLS ({e}). Mencoba fallback ke FTP standar...", Colors.YELLOW)

    log(f"🌐 Menghubungkan ke {host}:{port} via FTP standar...", Colors.CYAN)
    ftp = ftplib.FTP()
    ftp.connect(host, port, timeout=30)
    ftp.login(user, password)
    log("✅ Terhubung via FTP standar!", Colors.GREEN)
    return ftp

# ─── Helper Remote Directory ───────────────────────────────────────────────
def get_remote_file_sizes(ftp, remote_path):
    """Mendapatkan daftar ukuran file yang sudah ada di remote untuk smart skip."""
    sizes = {}
    try:
        # Gunakan MLSD jika didukung oleh server FTP cPanel (paling akurat)
        for name, facts in ftp.mlsd(remote_path):
            if facts.get('type') == 'file':
                try:
                    sizes[name] = int(facts.get('size', -1))
                except ValueError:
                    pass
        return sizes
    except Exception:
        pass

    # Fallback: LIST parsing untuk mendapatkan ukuran file
    try:
        lines = []
        ftp.retrlines(f'LIST {remote_path}', lines.append)
        for line in lines:
            parts = line.split()
            # Format: permissions links owner group size month day time/year name
            if len(parts) >= 9 and not line.startswith('d'):
                try:
                    filename = parts[-1]
                    file_size = int(parts[4])
                    sizes[filename] = file_size
                except (ValueError, IndexError):
                    pass
    except Exception:
        pass

    return sizes

def ensure_remote_dir(ftp, remote_dir):
    """Membuat direktori remote secara rekursif jika belum ada."""
    parts = [p for p in remote_dir.replace('\\', '/').split('/') if p]
    current = ""
    for part in parts:
        current += "/" + part
        try:
            ftp.cwd(current)
        except ftplib.error_perm:
            try:
                ftp.mkd(current)
                ftp.cwd(current)
            except ftplib.error_perm:
                pass

# ─── Upload File & Sinkronisasi ────────────────────────────────────────────
def sync_directory(ftp, local_dir: Path, remote_base: str, force=False):
    log("\n🚀 Memulai sinkronisasi file ke server cPanel...", Colors.BLUE + Colors.BOLD)
    
    total_uploaded = 0
    total_skipped = 0
    total_bytes = 0

    all_files = [p for p in local_dir.rglob('*') if p.is_file() and not p.name.startswith('.DS_Store')]
    all_files.sort(key=lambda p: str(p))

    # Kelompokkan berdasarkan folder remote untuk mengecek cache file yang ada
    remote_cache = {}

    for i, local_file in enumerate(all_files, 1):
        rel_path = local_file.relative_to(local_dir)
        rel_dir = rel_path.parent.as_posix()
        filename = local_file.name

        remote_dir = (Path(remote_base) / rel_dir).as_posix()
        if not remote_dir.startswith('/'):
            remote_dir = '/' + remote_dir
        remote_dir = remote_dir.rstrip('/') or '/'

        if remote_dir not in remote_cache:
            ensure_remote_dir(ftp, remote_dir)
            remote_cache[remote_dir] = get_remote_file_sizes(ftp, remote_dir)

        remote_sizes = remote_cache[remote_dir]
        local_size = local_file.stat().st_size
        remote_size = remote_sizes.get(filename)

        # Smart Skip jika ukuran file identik dan bukan force deploy
        if not force and remote_size is not None and remote_size == local_size:
            total_skipped += 1
            continue

        remote_filepath = f"{remote_dir}/{filename}".replace('//', '/')
        ensure_remote_dir(ftp, remote_dir)

        size_kb = local_size / 1024
        size_str = f"{size_kb:.1f} KB" if size_kb < 1024 else f"{(size_kb/1024):.2f} MB"

        prefix = f"[{i}/{len(all_files)}]"
        print(f"  {Colors.CYAN}{prefix}{Colors.RESET} Mengunggah: {Colors.BOLD}{rel_path.as_posix()}{Colors.RESET} ({size_str})...", end='', flush=True)

        with open(local_file, 'rb') as f:
            ftp.storbinary(f'STOR {filename}', f, blocksize=65536)

        print(f"\r  {Colors.GREEN}{prefix} ✓ Terunggah: {rel_path.as_posix()} ({size_str})          {Colors.RESET}")
        total_uploaded += 1
        total_bytes += local_size

    return total_uploaded, total_skipped, total_bytes

# ─── Main Program ──────────────────────────────────────────────────────────
def main():
    log("=" * 65, Colors.BLUE)
    log("  🚀 3D Anatomy Lab — Tool Deploy Otomatis ke cPanel (FTP)", Colors.BOLD + Colors.BLUE)
    log("=" * 65, Colors.BLUE)

    config = load_env()

    # Periksa flag CLI
    force = '--force' in sys.argv
    skip_build = '--no-build' in sys.argv

    # Jalankan build jika folder dist belum ada atau tidak diskip
    if not skip_build or not DIST_DIR.exists():
        run_build()
    else:
        log("⏩ Melewati tahap build (--no-build).", Colors.YELLOW)

    if not DIST_DIR.exists():
        log(f"❌ Folder build '{DIST_DIR}' tidak ditemukan!", Colors.RED)
        sys.exit(1)

    # Dapatkan Password
    password = config.get('FTP_PASS', '').strip()
    if not password:
        log(f"Akun FTP: {Colors.BOLD}{config['FTP_USER']}{Colors.RESET} di {Colors.BOLD}{config['FTP_HOST']}{Colors.RESET}")
        password = getpass.getpass("🔑 Masukkan Password Akun FTP: ").strip()
        if not password:
            log("❌ Password tidak boleh kosong.", Colors.RED)
            sys.exit(1)
        
        # Tawarkan simpan password
        save = input("Simpan password ini di .env.deploy agar tidak perlu input lagi? (y/n) [y]: ").strip().lower()
        if save in ('', 'y', 'yes'):
            save_env_password(password)
        config['FTP_PASS'] = password

    # Koneksi FTP
    try:
        ftp = connect_ftp(config)
    except Exception as e:
        log(f"\n❌ Gagal terhubung ke FTP: {e}", Colors.RED)
        log("💡 Tips: Periksa kembali hostname, username, dan password Anda.", Colors.YELLOW)
        sys.exit(1)

    try:
        # Masuk ke direktori target (biasanya root FTP account sudah terkunci ke folder 3d-anatomy)
        target_dir = config.get('FTP_REMOTE_DIR', '/')
        try:
            ftp.cwd(target_dir)
        except Exception:
            pass

        uploaded, skipped, total_bytes = sync_directory(ftp, DIST_DIR, target_dir, force=force)

        log("\n" + "=" * 65, Colors.GREEN)
        log("🎉 DEPLOYMENT BERHASIL!", Colors.BOLD + Colors.GREEN)
        log(f"  • File terunggah baru/diperbarui : {uploaded} file", Colors.GREEN)
        if skipped > 0:
            log(f"  • File identik dilewati (cepat) : {skipped} file (gunakan --force untuk upload ulang semua)", Colors.YELLOW)
        mb_transferred = total_bytes / (1024 * 1024)
        log(f"  • Total data terkirim           : {mb_transferred:.2f} MB", Colors.GREEN)
        log(f"  • URL Live Aplikasi             : {Colors.BOLD}https://emr.dinus.id/3d-anatomy/{Colors.RESET}", Colors.CYAN)
        log("=" * 65 + "\n", Colors.GREEN)

    finally:
        try:
            ftp.quit()
        except Exception:
            pass

if __name__ == '__main__':
    main()
