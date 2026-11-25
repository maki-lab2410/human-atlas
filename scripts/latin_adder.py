import os
import time
import json
import pandas as pd
import google.generativeai as genai

# 1. Konfigurasi API Gemini
API_KEY = "Masukkan API Key Gemini Anda di sini"
genai.configure(api_key=API_KEY)

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

df['Medical_Latin_Name'] = df['Medical_Latin_Name'].astype('object')

# 3. Filter baris yang kolom Latinnya masih kosong atau NaN
to_fill = []
for idx, row in df.iterrows():
    latin_val = str(row.get('Medical_Latin_Name', ''))
    eng_name = str(row.get('Original_English_Name', '')).strip()
    
    if pd.isna(eng_name) or eng_name == 'nan':
        continue
        
    if latin_val == "" or latin_val == "nan" or pd.isna(row.get('Medical_Latin_Name')):
        to_fill.append((idx, eng_name))

print(f"Total anatomi yang akan dicarikan nama Latinnya: {len(to_fill)}")
print("-" * 50)

# 4. Proses Batching (20 data sekali kirim)
batch_size = 20

for i in range(0, len(to_fill), batch_size):
    batch = to_fill[i:i+batch_size]
    request_data = [{"id": item[0], "term": item[1]} for item in batch]
    
    prompt = f"""
    Anda adalah seorang profesor anatomi yang menguasai Terminologia Anatomica (Bahasa Latin medis resmi).
    Tugas Anda: Berikan nama resmi dalam Bahasa Latin medis yang valid untuk setiap istilah anatomi Bahasa Inggris di bawah ini (sesuai standar FMA / Terminologia Anatomica).
    
    Input data:
    {json.dumps(request_data)}
    
    ATURAN WAJIB:
    Kembalikan array JSON murni. Setiap objek di dalam array harus persis memiliki key "id" (integer dari input) dan "latin_name" (string nama Latin, contoh: 'Aorta ascendens'). 
    Jika tidak ada padanan Latin resminya, kosongkan string-nya "". Jangan mengubah nomor ID.
    """
    
    try:
        response = model.generate_content(prompt)
        results = json.loads(response.text)
        
        for res in results:
            row_id = res.get('id')
            latin_name = res.get('latin_name')
            
            if row_id is not None and latin_name:
                df.at[row_id, 'Medical_Latin_Name'] = latin_name
                
        print(f"[{min(i + batch_size, len(to_fill))}/{len(to_fill)}] ✓ Berhasil melengkapi {len(batch)} nama Latin.")
        
    except Exception as e:
        print(f"⚠ Error pada batch {i}: {e}. (Akan dicoba lagi nanti)")
    
    df.to_csv(output_file, index=False)
    time.sleep(5)

print("-" * 50)
print(f"SELESAI! Kolom nama Latin telah terisi di: {output_file}")