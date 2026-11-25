"use client";

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Stage } from '@react-three/drei';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// Komponen internal untuk memuat dan merender file .glb
function LungModel() {
  // Path disesuaikan dengan struktur subfolder Anda
  const { scene } = useGLTF('/3d-anatomy/models/lung.glb'); 
  return <primitive object={scene} />;
}

export default function LungPage() {
  return (
    <main className="relative w-full h-screen bg-gray-50 overflow-hidden">
      
      {/* Tombol Navigasi Kembali */}
      <div className="absolute top-6 left-6 z-10">
        <Link 
          href="/3d-anatomy" 
          className="flex items-center gap-2 bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow-sm border border-gray-200 text-gray-700 hover:bg-gray-100 transition-all font-medium text-sm"
        >
          <ArrowLeft size={16} />
          Kembali ke Atlas Utama
        </Link>
      </div>

      {/* Label Informasi Organ */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur-md px-8 py-4 rounded-3xl shadow-lg border border-white/50 text-center">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Paru-paru (Lungs)</h1>
        <p className="text-sm text-gray-500 mt-1">Tampilan 3D Organ Terisolasi</p>
      </div>

      {/* Area Kanvas 3D */}
      <Canvas shadows camera={{ position: [0, 0, 150], fov: 45 }}>
        <Suspense fallback={null}>
          {/* Komponen Stage otomatis menempatkan model persis di tengah dan memberikan pencahayaan studio */}
          <Stage environment="city" intensity={0.6} adjustCamera={1.2}>
            <LungModel />
          </Stage>
        </Suspense>
        {/* Kontrol kamera untuk memutar otomatis dan interaksi mouse */}
        <OrbitControls makeDefault autoRotate autoRotateSpeed={1.5} enablePan={false} />
      </Canvas>
      
    </main>
  );
}

// Preload file 3D agar loading lebih cepat saat halaman dibuka
useGLTF.preload('/3d-anatomy/models/lung.glb');