import { useState, useMemo, useRef } from 'react';
import { Search, Download, Upload, Save, X, ChevronRight, CheckCircle, AlertCircle, Cloud, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Atlas, Concept } from '../anatomy';
import { SYSTEMS } from '../anatomy';
import { saveDb } from '../lib/dbService';
import { getAdminPassword } from './AdminAuth';

export interface MedicalEntry {
  conceptId: string;
  englishName: string;
  indonesianName: string;
  latinName: string;
  snomedCode: string;
  description: string;
}

export type MedicalDb = Record<string, MedicalEntry>;

interface DataManagerProps {
  atlas: Atlas;
  db: MedicalDb;
  onDbChange: (db: MedicalDb) => void;
  onClose: () => void;
}

function getSystemForConcept(concept: Concept, atlas: Atlas): string {
  const part = atlas.parts.find(p => p.conceptId === concept.id);
  return part ? (SYSTEMS.find(s => s.id === part.system)?.name ?? 'Unknown') : 'Unknown';
}

function completionBadge(entry: MedicalEntry | undefined) {
  if (!entry) return null;
  const filled = [entry.indonesianName, entry.snomedCode, entry.description].filter(Boolean).length;
  if (filled === 3) return <span className="completion-badge complete"><CheckCircle size={11}/> Lengkap</span>;
  if (filled > 0) return <span className="completion-badge partial"><AlertCircle size={11}/> {filled}/3</span>;
  return null;
}

export default function DataManager({ atlas, db, onDbChange, onClose }: DataManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [systemFilter, setSystemFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MedicalEntry>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [showOnlyEmpty, setShowOnlyEmpty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Server save state ──────────────────────────────────────────────────
  const [serverSaveStatus, setServerSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [serverSaveMsg, setServerSaveMsg] = useState('');

  const handleSaveToServer = async () => {
    setServerSaveStatus('saving');
    setServerSaveMsg('Menyimpan ke server...');
    const password = getAdminPassword();
    const result = await saveDb(db, password);
    if (result.ok) {
      setServerSaveStatus('ok');
      setServerSaveMsg(result.message);
    } else {
      setServerSaveStatus('err');
      setServerSaveMsg(result.message);
    }
    setTimeout(() => setServerSaveStatus('idle'), 6000);
  };

  const systems = useMemo(() => {
    const sysIds = [...new Set(atlas.parts.map(p => p.system))];
    return sysIds.map(id => SYSTEMS.find(s => s.id === id)!).filter(Boolean);
  }, [atlas]);

  const concepts = useMemo(() => {
    let list = atlas.concepts;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        db[c.id]?.indonesianName?.toLowerCase().includes(q) ||
        db[c.id]?.snomedCode?.includes(q)
      );
    }
    if (systemFilter !== 'all') {
      const partIds = new Set(atlas.parts.filter(p => p.system === systemFilter).map(p => p.conceptId));
      list = list.filter(c => partIds.has(c.id));
    }
    if (showOnlyEmpty) {
      list = list.filter(c => !db[c.id]?.indonesianName && !db[c.id]?.snomedCode);
    }
    return list;
  }, [atlas, searchQuery, systemFilter, showOnlyEmpty, db]);

  const stats = useMemo(() => {
    const total = atlas.concepts.length;
    const withName = atlas.concepts.filter(c => db[c.id]?.indonesianName).length;
    const withSnomed = atlas.concepts.filter(c => db[c.id]?.snomedCode).length;
    return { total, withName, withSnomed };
  }, [atlas, db]);

  const startEdit = (concept: Concept) => {
    const existing = db[concept.id] ?? {};
    setEditingId(concept.id);
    setEditForm({
      conceptId: concept.id,
      englishName: concept.name,
      indonesianName: existing.indonesianName ?? '',
      latinName: existing.latinName ?? '',
      snomedCode: existing.snomedCode ?? '',
      description: existing.description ?? '',
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const updated: MedicalDb = {
      ...db,
      [editingId]: {
        conceptId: editingId,
        englishName: editForm.englishName ?? '',
        indonesianName: editForm.indonesianName ?? '',
        latinName: editForm.latinName ?? '',
        snomedCode: editForm.snomedCode ?? '',
        description: editForm.description ?? '',
      }
    };
    onDbChange(updated);
    setEditingId(null);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'anatomy_database.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const header = 'Concept_ID,English_Name,Latin_Name,Indonesian_Name,SNOMED_CT_Code,Description';
    const rows = atlas.concepts.map(c => {
      const e = db[c.id];
      const csv = (s: string = '') => `"${s.replace(/"/g, '""')}"`;
      return `${csv(c.id)},${csv(c.name)},${csv(e?.latinName)},${csv(e?.indonesianName)},${csv(e?.snomedCode)},${csv(e?.description)}`;
    });
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'anatomy_database.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        onDbChange(parsed);
        alert('Database berhasil diimpor!');
      } catch { alert('File JSON tidak valid.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const importCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const lines = (evt.target?.result as string).split('\n');
      const newDb: MedicalDb = { ...db };
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].match(/("(?:[^"]|"")*"|[^,]*),?/g)?.map(s => s.replace(/^"|"$|"$/g, '').replace(/""/g, '"').replace(/,$/, '')) ?? [];
        if (parts.length >= 6 && parts[0]) {
          newDb[parts[0]] = {
            conceptId: parts[0], englishName: parts[1], latinName: parts[2],
            indonesianName: parts[3], snomedCode: parts[4], description: parts[5],
          };
        }
      }
      onDbChange(newDb);
      alert('CSV berhasil diimpor!');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <section className="fixed top-4 right-4 bottom-4 w-[800px] bg-white/95 backdrop-blur-2xl border border-gray-200/50 rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden p-5">
      
      {/* 1. Header (Ukuran font dikecilkan ke text-base / 16px) */}
      <div className="flex justify-between items-center mb-5 shrink-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">Databases</h2>
          <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
            {stats.total.toLocaleString()}
          </span>
        </div>
        <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      {/* 2. Stats Bar & Import/Export */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl mb-4 shrink-0">
        
        {/* Grup Statistik */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[20px] font-semibold text-gray-900 leading-none mb-1">{stats.total.toLocaleString()}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total</span>
          </div>
          
          <div className="w-px h-6 bg-gray-200 rounded-full"></div>
          
          <div className="flex flex-col">
            <span className="text-[20px] font-semibold text-green-600 leading-none mb-1">{stats.withName.toLocaleString()}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Nama ID</span>
          </div>
          
          <div className="w-px h-6 bg-gray-200 rounded-full"></div>
          
          <div className="flex flex-col">
            <span className="text-[20px] font-semibold text-blue-600 leading-none mb-1">{stats.withSnomed.toLocaleString()}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">SNOMED</span>
          </div>
          
          <div className="w-px h-6 bg-gray-200 rounded-full"></div>
          
          <div className="flex flex-col">
            <span className="text-[20px] font-semibold text-orange-500 leading-none mb-1">{(stats.total - stats.withName).toLocaleString()}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Kosong</span>
          </div>
        </div>
        
        {/* Grup Tombol Aksi */}
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="text-green-500 text-[11px] flex items-center gap-1 font-medium mr-2">
              <CheckCircle size={14} /> Tersimpan
            </span>
          )}
          
          {/* Tombol Import CSV (Hanya Ikon) */}
          <Button 
            variant="outline" 
            className="h-8 w-8 p-0 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600 shadow-sm transition-all" 
            onClick={() => fileRef.current?.click()} 
            title="Import CSV"
          >
            <Upload size={14} />
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCsv} />
          
          {/* Tombol Export CSV (Hanya Ikon) */}
          <Button 
            variant="outline" 
            className="h-8 w-8 p-0 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600 shadow-sm transition-all" 
            onClick={exportCsv} 
            title="Export CSV"
          >
            <Download size={14} />
          </Button>

          {/* Tombol Simpan ke Server */}
          <Button
            variant="outline"
            className={`h-8 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all border ${
              serverSaveStatus === 'ok'  ? 'bg-green-50 border-green-300 text-green-700' :
              serverSaveStatus === 'err' ? 'bg-red-50 border-red-300 text-red-600' :
              serverSaveStatus === 'saving' ? 'bg-blue-50 border-blue-200 text-blue-600 animate-pulse' :
              'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
            }`}
            onClick={handleSaveToServer}
            disabled={serverSaveStatus === 'saving'}
            title="Simpan semua perubahan ke server"
          >
            {serverSaveStatus === 'ok'  ? <><Cloud size={13}/> Tersimpan</> :
             serverSaveStatus === 'err' ? <><CloudOff size={13}/> Gagal</> :
             serverSaveStatus === 'saving' ? <><Cloud size={13}/> Menyimpan…</> :
             <><Cloud size={13}/> Simpan ke Server</>}
          </Button>
        </div>

        {/* Pesan status server save */}
        {serverSaveMsg && serverSaveStatus !== 'idle' && (
          <div className={`mt-2 px-3 py-1.5 text-[10px] rounded-lg ${
            serverSaveStatus === 'ok'  ? 'bg-green-50 text-green-700' :
            serverSaveStatus === 'err' ? 'bg-orange-50 text-orange-700' :
            'bg-blue-50 text-blue-700'
          }`}>
            {serverSaveMsg}
          </div>
        )}
        
      </div>

      {/* 3. Filters & Search */}
      <div className="flex items-center gap-3 mb-4 shrink-0 h-[42px]">
        {/* Kolom Pencarian */}
        <div className="relative flex-1 h-full">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama atau kode SNOMED..."
            className="w-full h-full pl-9 pr-9 bg-gray-50 border border-gray-200 rounded-xl text-[9pt] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-[9pt] placeholder:text-gray-400"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-gray-200/50 p-1 rounded-full transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
        
        {/* Dropdown Sistem dengan Chevron Kustom */}
        <select 
          value={systemFilter} 
          onChange={e => setSystemFilter(e.target.value)} 
          className="h-full pl-4 pr-9 bg-gray-50 border border-gray-200 rounded-xl text-[9pt] font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer appearance-none bg-no-repeat bg-[position:right_10px_center] bg-[length:14px_14px]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")` }}
        >
          <option value="all">Semua Sistem</option>
          {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Checkbox Filter */}
        <label className="h-full flex items-center gap-2.5 text-[9pt] font-medium text-gray-600 cursor-pointer hover:text-gray-900 transition-colors bg-gray-50 px-4 rounded-xl border border-gray-200">
          <input 
            type="checkbox" 
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
            checked={showOnlyEmpty} 
            onChange={e => setShowOnlyEmpty(e.target.checked)}
          />
          Belum Lengkap
        </label>
      </div>

      {/* 4. Table Area (Semua baris di-press agar padat, font 12-13px) */}
      <div className="flex-1 overflow-y-auto border border-gray-100 rounded-2xl relative">
        <table className="w-full text-left">
          <thead className="bg-gray-50/95 backdrop-blur sticky top-0 z-10 border-b border-gray-100">
            <tr>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase" style={{width:'26%'}}>Nama Inggris</th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase" style={{width:'22%'}}>Indonesia / Latin</th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase" style={{width:'14%'}}>SNOMED CT</th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase" style={{width:'30%'}}>Deskripsi</th>
              <th className="py-2.5 px-3 text-[11px] font-semibold text-gray-500 uppercase" style={{width:'8%'}}>Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {concepts.slice(0, 200).map(concept => {
              const entry = db[concept.id];
              const isEditing = editingId === concept.id;

              if (isEditing) {
                return (
                  <tr key={concept.id} className="bg-blue-50/40 border-y border-blue-100">
                    <td className="py-2.5 px-3 align-top">
                      <span className="text-[13px] font-semibold text-gray-700">{concept.name}</span>
                    </td>
                    <td className="py-2.5 px-3 flex flex-col gap-1.5 align-top">
                      <input 
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200/80 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-gray-400 placeholder:text-[9pt]" 
                        placeholder="Nama Indonesia..." 
                        value={editForm.indonesianName} 
                        onChange={e => setEditForm(f => ({...f, indonesianName: e.target.value}))} 
                        autoFocus
                      />
                      <input 
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200/80 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-gray-400 placeholder:text-[9pt]" 
                        placeholder="Nama Latin..." 
                        value={editForm.latinName} 
                        onChange={e => setEditForm(f => ({...f, latinName: e.target.value}))}
                      />
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <input 
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200/80 rounded-lg text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-gray-400 placeholder:text-[9pt]" 
                        placeholder="00000000" 
                        value={editForm.snomedCode} 
                        onChange={e => setEditForm(f => ({...f, snomedCode: e.target.value}))}
                      />
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <textarea 
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200/80 rounded-lg text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all leading-normal placeholder:text-gray-400 placeholder:text-[9pt]" 
                        rows={2} 
                        placeholder="Deskripsi medis..." 
                        value={editForm.description} 
                        onChange={e => setEditForm(f => ({...f, description: e.target.value}))}
                      />
                    </td>
                    <td className="py-2.5 px-3 align-top w-24">
                      <div className="flex flex-col gap-1.5">
                        <Button 
                          className="w-full bg-blue-500 hover:bg-blue-600 text-white h-7 px-2 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-center shadow-sm" 
                          onClick={saveEdit}
                        >
                          <Save size={12} className="mr-1"/> Simpan
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="w-full h-7 px-2 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 text-[11px] font-medium transition-colors flex items-center justify-center shadow-sm" 
                          onClick={() => setEditingId(null)}
                        >
                          <X size={12} className="mr-1"/> Batal
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={concept.id} className="hover:bg-gray-50 cursor-pointer group transition-colors" onClick={() => startEdit(concept)}>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-gray-700">{concept.name}</span>
                      {completionBadge(entry)}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 flex flex-col justify-center">
                    {entry?.indonesianName
                      ? <span className="text-[13px] text-gray-800">{entry.indonesianName}</span>
                      : <span className="text-[12px] text-gray-400 italic">Belum diisi</span>
                    }
                    {entry?.latinName && <span className="text-[11px] text-gray-400 italic mt-0.5">{entry.latinName}</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    {entry?.snomedCode
                      ? <span className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded font-mono">{entry.snomedCode}</span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="py-2.5 px-3 text-[12px] text-gray-500 leading-relaxed">
                    {entry?.description
                      ? <span>{entry.description.slice(0, 80)}{entry.description.length > 80 ? '...' : ''}</span>
                      : <span className="text-gray-400 italic">Belum diisi</span>
                    }
                  </td>
                  <td className="py-2.5 px-3">
                    <Button variant="ghost" className="h-7 px-2 text-[11px] rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-gray-500" onClick={e => { e.stopPropagation(); startEdit(concept); }}>
                      Edit <ChevronRight size={14}/>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {concepts.length > 200 && (
          <div className="text-center p-3 text-[11px] text-gray-400 bg-gray-50 border-t border-gray-100">
            Menampilkan 200 dari {concepts.length.toLocaleString()} hasil. Gunakan pencarian untuk menyempurnakan.
          </div>
        )}
      </div>
    </section>
  );
}
