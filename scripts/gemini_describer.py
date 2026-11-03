import os
import time
import json
import pandas as pd
import google.generativeai as genai

# 1. Konfigurasi API Gemini
# GANTI TEKS DI BAWAH INI DENGAN API KEY ANDA
API_KEY = "Masukkan API Key Gemini Anda di sini"
genai.configure(api_key=API_KEY)

# Menggunakan model Gemini 3.5 Flash Lite (Kuota 500 RPD & 15 RPM)
model_name = 'models/gemini-3.5-flash-lite'
print(f"Menggunakan model: {model_name}")

model = genai.GenerativeModel(
    model_name,
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json"
    )
)

# 2. Pengaturan Path File
script_dir = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(script_dir, '../public/anatomy_template_TERISI.csv')
output_file = os.path.join(script_dir, '../public/anatomy_template_FINAL.csv')

file_to_read = output_file if os.path.exists(output_file) else input_file
print(f"Membaca data dari: {file_to_read}...")

try:
    df = pd.read_csv(file_to_read)
except FileNotFoundError:
    print("ERROR: File CSV tidak ditemukan. Pastikan proses mapping SNOMED sudah berjalan.")
    exit()

# 3. Filter data yang perlu di-generate
to_process = []
for idx, row in df.iterrows():
    eng_name = str(row.get('Original_English_Name', '')).strip()
    desc = str(row.get('Description', ''))
    
    if pd.isna(eng_name) or eng_name == 'nan':
        continue
        
    # Lewati jika deskripsi sudah ada dan bukan dari SNOMED
    if pd.isna(desc) or desc == 'nan' or desc.startswith("Struktur anatomis") or desc.strip() == "":
        to_process.append((idx, eng_name))

print(f"Total anatomi yang akan dibuatkan kamus deskripsinya: {len(to_process)}")
print("-" * 50)

# 4. Proses Batching
batch_size = 20

for i in range(0, len(to_process), batch_size):
    batch = to_process[i:i+batch_size]
    
    request_data = [{"id": item[0], "term": item[1]} for item in batch]
    
    prompt = f"""
    Anda adalah seorang ahli anatomi medis dan penulis ensiklopedia kedokteran.
    Tugas Anda: Berikan 1 atau 2 kalimat deskripsi medis profesional dalam Bahasa Indonesia yang menjelaskan letak atau fungsi dari istilah anatomi di bawah ini.
    
    Input data:
    {json.dumps(request_data)}
    
    ATURAN WAJIB:
    Kembalikan array JSON murni. Setiap objek di dalam array harus persis memiliki key "id" (integer) dan "deskripsi" (string). 
    Jangan mengubah nomor ID.
    """
    
    try:
        response = model.generate_content(prompt)
        results = json.loads(response.text)
        
        for res in results:
            row_id = res.get('id')
            deskripsi = res.get('deskripsi')
            
            if row_id is not None and deskripsi:
                df.at[row_id, 'Description'] = deskripsi
                
        print(f"[{min(i + batch_size, len(to_process))}/{len(to_process)}] ✓ Berhasil generate {len(batch)} deskripsi medis.")
        
    except Exception as e:
        print(f"⚠ Error pada batch {i}: {e}. (Akan dilewati, bisa dilanjutkan nanti)")
    
    # Auto-save ke file FINAL
    df.to_csv(output_file, index=False)
    
    # JEDA AMAN: 5 Detik per request. (Jangan dikurangi agar tidak melebihi 15 RPM).
    time.sleep(5)

print("-" * 50)
print(f"PROSES SELESAI! Data utuh beserta deskripsi ala kamus telah disimpan ke: {output_file}")