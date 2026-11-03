import pandas as pd
import requests
import time
import os
from deep_translator import GoogleTranslator

# 1. Konfigurasi Path File
script_dir = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(script_dir, '../public/anatomy_template.csv')
output_file = os.path.join(script_dir, '../public/anatomy_template_TERISI.csv')

file_to_read = output_file if os.path.exists(output_file) else input_file
print(f"Membaca data dari: {file_to_read}...")

try:
    df = pd.read_csv(file_to_read)
except FileNotFoundError:
    print("ERROR: File CSV tidak ditemukan.")
    exit()

# Menghindari error Pandas tipe float64
kolom_kosong = ['Medical_Latin_Name', 'Indonesian_Name', 'SNOMED_CT_Code', 'Description']
for col in kolom_kosong:
    if col in df.columns:
        df[col] = df[col].astype('object')

translator = GoogleTranslator(source='en', target='id')

# MENGGUNAKAN SERVER BARU: CSIRO Ontoserver (Lebih stabil untuk FHIR)
fhir_url = "https://r4.ontoserver.csiro.au/fhir/ValueSet/$expand"

# Menyamar sebagai Web Browser asli agar tidak diblokir Firewall
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Connection": "keep-alive"
}

# Gunakan session agar koneksi tetap stabil (tidak putus-nyambung)
session = requests.Session()
session.headers.update(headers)

print(f"Memulai pemrosesan {len(df)} baris data...")
print("-" * 50)

for index, row in df.iterrows():
    eng_name = str(row['Original_English_Name']).strip()
    
    if pd.isna(eng_name) or eng_name == 'nan':
        continue
        
    # Lewati baris yang sudah terisi (Resume)
    if pd.notna(row['SNOMED_CT_Code']) and pd.notna(row['Indonesian_Name']) and str(row['Indonesian_Name']) not in ["Error Translasi", "Error/Kosong", "nan"]:
        continue
        
    print(f"[{index+1}/{len(df)}] Proses: {eng_name}...", end=" ", flush=True)
    
    # --- A. Translasi ---
    try:
        df.at[index, 'Indonesian_Name'] = translator.translate(eng_name).capitalize()
    except Exception:
        df.at[index, 'Indonesian_Name'] = "Error Translasi"
        
    # --- B. Pencarian SNOMED CT via Ontoserver ---
    try:
        params = {
            "url": "http://snomed.info/sct?fhir_vs",
            "filter": eng_name,
            "count": 1 # Hanya minta 1 hasil paling relevan agar enteng
        }
        
        response = session.get(fhir_url, params=params, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            if 'expansion' in data and 'contains' in data['expansion']:
                concepts = data['expansion']['contains']
                if len(concepts) > 0:
                    concept_id = concepts[0].get('code', '')
                    display = concepts[0].get('display', '')
                    
                    df.at[index, 'SNOMED_CT_Code'] = str(concept_id)
                    df.at[index, 'Description'] = f"Struktur anatomis klinis dari {display}"
                    print(f"✓ (SNOMED: {concept_id})")
                else:
                    print("⚠ (Tidak ditemukan)")
            else:
                print("⚠ (Tidak ditemukan)")
        elif response.status_code == 429:
             print("⚠ (Terblokir: Too Many Requests. Jeda sebentar...)")
             time.sleep(5) # Jeda ekstra jika mulai kena limit
        else:
             print(f"⚠ (Server Error {response.status_code})")
             
    except Exception:
        print("⚠ (Gagal koneksi API/Timeout)")
        
    # Auto-Save setiap 15 baris
    if (index + 1) % 15 == 0:
        df.to_csv(output_file, index=False)
        
    # Waktu jeda 2 detik 
    time.sleep(2)

# Simpan final
df.to_csv(output_file, index=False)
print("-" * 50)
print(f"PROSES SELESAI! Data utuh berhasil disimpan ke: {output_file}")