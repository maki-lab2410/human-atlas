import os
import time
import json
import pandas as pd
import google.generativeai as genai

# 1. Konfigurasi API Gemini
API_KEY = "Masukkan API Key Gemini Anda di sini"
genai.configure(api_key=API_KEY)

# Menggunakan model Flash Lite yang sama
model_name = 'models/gemini-3.5-flash-lite'
model = genai.GenerativeModel(
    model_name,
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json"
    )
)

# 2. Path File
script_dir = os.path.dirname(os.path.abspath(__file__))
output_file = os.path.join(script_dir, '../public/anatomy_template_FINAL.csv')

try:
    df = pd.read_csv(output_file)
except FileNotFoundError:
    print("ERROR: File FINAL.csv tidak ditemukan.")
    exit()

# Memastikan tipe kolom berupa object/string
df['Indonesian_Name'] = df['Indonesian_Name'].astype('object')

# 3. Filter baris yang masih error, kosong, atau gagal diterjemahkan (masih bahasa Inggris)
to_fix = []
for idx, row in df.iterrows():
    ind_name = str(row.get('Indonesian_Name', '')).strip()
    eng_name = str(row.get('Original_English_Name', '')).strip()
    
    if pd.isna(eng_name) or eng_name == 'nan' or eng_name == '':
        continue
        
    # LOGIKA BARU: Jika nama indo kosong, "Error", atau sama persis dengan nama Inggrisnya
    if (ind_name == "Error Translasi" or 
        ind_name == "Error/Kosong" or 
        pd.isna(ind_name) or 
        ind_name == "" or
        ind_name.lower() == eng_name.lower()):
        
        to_fix.append((idx, eng_name))

print(f"Total nama anatomi yang perlu diterjemahkan ulang oleh AI: {len(to_fix)}")
print("-" * 50)

# 4. Proses Batching Penerjemahan (20 data sekali kirim)
batch_size = 20

for i in range(0, len(to_fix), batch_size):
    batch = to_fix[i:i+batch_size]
    request_data = [{"id": item[0], "term": item[1]} for item in batch]
    
    prompt = f"""
    Anda adalah seorang ahli penerjemah anatomi kedokteran dari Inggris ke Indonesia.
    Tugas Anda: Terjemahkan istilah anatomi bahasa Inggris berikut ke dalam nomenklatur medis Bahasa Indonesia yang lazim digunakan.
    
    Input data:
    {json.dumps(request_data)}
    
    ATURAN WAJIB (SANGAT KETAT):
    1. JANGAN PERNAH menyalin ulang kata bahasa Inggris aslinya. Anda wajib menerjemahkannya.
    2. Gunakan padanan yang umum di fakultas kedokteran Indonesia. Contoh: 'Left Humerus' HARUS menjadi 'Tulang Lengan Atas Kiri' atau 'Humerus Kiri'. 'superior ulnar collateral artery' menjadi 'Arteri kolateral ulnaris superior'.
    3. Kembalikan array JSON murni. Setiap objek harus memiliki "id" (integer dari input) dan "indonesian_name" (string terjemahan).
    """
    
    try:
        response = model.generate_content(prompt)
        results = json.loads(response.text)
        
        for res in results:
            row_id = res.get('id')
            translated_name = res.get('indonesian_name')
            
            # Memastikan AI tidak curang dengan memberikan data kosong
            if row_id is not None and translated_name and translated_name.lower() != "error translasi":
                df.at[row_id, 'Indonesian_Name'] = translated_name.capitalize()
                
        print(f"[{min(i + batch_size, len(to_fix))}/{len(to_fix)}] ✓ Berhasil menerjemahkan {len(batch)} istilah.")
        
    except Exception as e:
        print(f"⚠ Error pada batch {i}: {e}. (Akan dicoba lagi nanti)")
    
    # Simpan progres otomatis
    df.to_csv(output_file, index=False)
    time.sleep(5) # Jeda aman 5 detik

print("-" * 50)
print(f"SELESAI! Seluruh terjemahan error telah diperbaiki di: {output_file}")