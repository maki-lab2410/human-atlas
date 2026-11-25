#!/usr/bin/env python3
"""Membangun data Lab Terminologi dari CSV (sumber kebenaran) menjadi JSON untuk aplikasi.

Sumber : data/terminologi/morfem.csv, istilah.csv, singkatan.csv
Keluaran: app/terminology/data/terminologi.json (+ salinan untuk server: public/3d-anatomy/lab/terminologi.json)

Pemeriksaan otomatis:
  - ID unik, jenis/kategori/status valid
  - Potongan kata (kolom `bagian`) bila digabung harus sama dengan istilah
  - Setiap morfem yang dipakai harus ada di morfem.csv
  - conceptId (bila diisi) harus ada di public/models/atlas.json
Jalankan:  python3 scripts/build-terminologi.py
Kode keluar 1 bila ada kesalahan (JSON tidak ditulis).
"""
import csv, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'terminologi')
OUT = os.path.join(ROOT, 'app', 'terminology', 'data', 'terminologi.json')
OUT_SERVER = os.path.join(ROOT, 'public', '3d-anatomy', 'lab', 'terminologi.json')   # salinan untuk penilaian oleh server

JENIS = {'prefix', 'root', 'cv', 'suffix'}
KATEGORI = {'anatomi', 'diagnosis', 'tindakan', 'gejala', 'ilmu', 'fisiologi', 'alat', 'obat', 'umum'}
KAT_SINGKATAN = {'tanda vital', 'diagnosis', 'laboratorium', 'pemeriksaan penunjang', 'resep', 'unit layanan', 'administrasi', 'statistik rumah sakit', 'umum'}
STATUS = {'belum', 'valid', 'revisi'}


def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def main():
    errors, warnings = [], []
    morf = read('morfem.csv')
    istilah = read('istilah.csv')
    singk = read('singkatan.csv')

    mids = {}
    for r in morf:
        i = r['id'].strip()
        if not i: errors.append('morfem: id kosong'); continue
        if i in mids: errors.append(f'morfem: id ganda "{i}"')
        if r['jenis'] not in JENIS: errors.append(f'morfem {i}: jenis "{r["jenis"]}" tidak valid')
        if not r['arti'].strip(): errors.append(f'morfem {i}: arti kosong')
        if r['status'] not in STATUS: errors.append(f'morfem {i}: status "{r["status"]}" tidak valid')
        mids[i] = r

    concept_ids = None
    atlas = os.path.join(ROOT, 'public', 'models', 'atlas.json')
    if os.path.exists(atlas):
        concept_ids = {c['id'] for c in json.load(open(atlas, encoding='utf-8'))['concepts']}

    tids = set()
    used = set()
    terms = []
    for r in istilah:
        i = r['id'].strip()
        if i in tids: errors.append(f'istilah: id ganda "{i}"')
        tids.add(i)
        if r['kategori'] not in KATEGORI: errors.append(f'istilah {i}: kategori "{r["kategori"]}" tidak valid')
        if r['status'] not in STATUS: errors.append(f'istilah {i}: status "{r["status"]}" tidak valid')
        if not r['definisi'].strip(): errors.append(f'istilah {i}: definisi kosong')
        parts = []
        for p in r['bagian'].split('|'):
            surface, _, mid = p.partition('=')
            mid = mid or surface
            if mid not in mids: errors.append(f'istilah {i}: morfem "{mid}" tidak ada di morfem.csv')
            used.add(mid)
            parts.append({'t': surface, 'm': mid})
        base = r['istilah'].split(' (')[0]
        if ''.join(x['t'] for x in parts) != base:
            errors.append(f'istilah {i}: potongan "{"".join(x["t"] for x in parts)}" ≠ "{base}"')
        cid = r['conceptId'].strip()
        if cid and concept_ids is not None and cid not in concept_ids:
            errors.append(f'istilah {i}: conceptId "{cid}" tidak ada di atlas')
        if r['kategori'] == 'anatomi' and not cid: warnings.append(f'istilah {i}: anatomi tanpa conceptId')
        terms.append({'id': i, 'term': r['istilah'], 'parts': parts, 'indonesian': r['indonesia'], 'definition': r['definisi'],
                      'category': r['kategori'], 'system': r['sistem'], 'conceptId': cid or None, 'quiz3d': r['quiz3d'].strip().lower() in ('ya', 'y', '1', 'true'),
                      'status': r['status']})

    sids = set()
    abbr = []
    for r in singk:
        i = r['id'].strip()
        if i in sids: errors.append(f'singkatan: id ganda "{i}"')
        sids.add(i)
        if r['kategori'] not in KAT_SINGKATAN: errors.append(f'singkatan {i}: kategori "{r["kategori"]}" tidak valid')
        if r['status'] not in STATUS: errors.append(f'singkatan {i}: status "{r["status"]}" tidak valid')
        if not r['arti'].strip(): errors.append(f'singkatan {i}: arti kosong')
        abbr.append({'id': i, 'abbr': r['singkatan'], 'full': r['kepanjangan'], 'meaning': r['arti'], 'category': r['kategori'], 'status': r['status']})

    for m in mids:
        if m not in used and mids[m]['jenis'] != 'cv':
            warnings.append(f'morfem {m} ({mids[m]["bentuk"]}) belum dipakai pada istilah mana pun')

    if errors:
        print(f'{len(errors)} KESALAHAN:')
        for e in errors: print('  -', e)
        sys.exit(1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    data = {
        'morphemes': [{'id': i, 'form': r['bentuk'], 'type': r['jenis'], 'meaning': r['arti'], 'origin': r['asal'] or None, 'status': r['status']} for i, r in mids.items()],
        'terms': terms,
        'abbreviations': abbr,
    }
    for path in (OUT, OUT_SERVER):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    belum = sum(1 for x in data['morphemes'] + terms + abbr if x['status'] == 'belum')
    print(f'OK: {len(data["morphemes"])} morfem, {len(terms)} istilah, {len(abbr)} singkatan -> {os.path.relpath(OUT, ROOT)} (+ salinan server)')
    print(f'Status "belum" divalidasi: {belum}')
    if warnings:
        print(f'{len(warnings)} peringatan (tidak menghalangi):')
        for w in warnings[:30]: print('  -', w)
        if len(warnings) > 30: print(f'  ... dan {len(warnings) - 30} lagi')


if __name__ == '__main__':
    main()
