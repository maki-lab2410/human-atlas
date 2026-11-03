import os
import pandas as pd
import json

# 1. Path File
script_dir = os.path.dirname(os.path.abspath(__file__))
csv_file = os.path.join(script_dir, '../public/anatomy_template_FINAL.csv')
json_file = os.path.join(script_dir, '../public/anatomy_data.json')

print("Membaca file CSV final...")
try:
    df = pd.read_csv(csv_file)
except FileNotFoundError:
    print("ERROR: File anatomy_template_FINAL.csv belum ditemukan. Tunggu hingga proses terminal sebelumnya selesai.")
    exit()

# 2. Menyusun struktur data JSON
output_data = {
    "_meta": {
        "version": "1.0.0",
        "language": "id-ID",
        "snomed_edition": "SNOMED CT International Edition",
        "release": "20260927",
        "total_entries": len(df),
        "systems": ["skeletal", "muscular", "cardiovascular", "nervous", "respiratory", "digestive", "urinary", "endocrine"]
    },
    "skeletal": {} # Atau dikelompokkan dinamis sesuai kebutuhan
}

# Memasukkan baris data CSV ke dalam format JSON
for idx, row in df.iterrows():
    fma_id = str(row.get('Concept_ID', f'item_{idx}')).strip().lower()
    
    # Menyiapkan struktur per item organ
    output_data["skeletal"][fma_id] = {
        "name_id": str(row.get('Indonesian_Name', '')),
        "name_latin": str(row.get('Medical_Latin_Name', '')),
        "name_eng": str(row.get('Original_English_Name', '')),
        "snomed_code": str(row.get('SNOMED_CT_Code', '')),
        "description": str(row.get('Description', ''))
    }

# 3. Simpan ke file anatomy_data.json di folder public
with open(json_file, 'w', encoding='utf-8') as f:
    json.dump(output_data, f, ensure_ascii=False, indent=4)

print(f"BERHASIL! Data CSV telah dikonversi penuh ke: {json_file}")