import React, { useState, useEffect } from 'react';
import { User, ShieldCheck, Mail, Smartphone, Globe, LogOut } from 'lucide-react';
import { cn } from './lib/utils';

export default function Profile({ user, qrCodePath, logout }: { user: any, qrCodePath: string, logout: () => void }) {
  return (
    <div className="pb-10 max-w-lg mx-auto">
      {/* Profile Header Logo */}
      <div className="flex flex-col items-center gap-4 mb-8 mt-4">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-primary to-amber-700 p-1 shadow-lg shadow-primary/20">
          <div className="w-full h-full bg-slate-900 rounded-xl flex items-center justify-center border border-white/5">
            <User className="w-10 h-10 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-serif font-bold text-white tracking-widest uppercase">Profil Anda</h2>
      </div>

      {/* Profile Details Container */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-xl mb-6 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <ShieldCheck className="w-20 h-20 text-primary" />
        </div>
        
        <div className="space-y-5 relative z-10">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <span className="text-slate-400 text-sm">Status Akun</span>
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm",
              user?.status === 'Pro' ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-slate-800 text-slate-300 border border-white/10"
            )}>
              {user?.status || 'Free'}
            </span>
          </div>
          
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <span className="text-slate-400 text-sm">Nama</span>
            <span className="text-white font-semibold">{user?.name || 'Guest'}</span>
          </div>

          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <span className="text-slate-400 text-sm">Limit Nonton</span>
            <span className="text-primary font-bold text-lg">{user?.limit || 0}</span>
          </div>

          <div className="space-y-2 pt-2">
            <span className="text-slate-400 text-sm block mb-2">Info Pengguna</span>
            <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400 font-mono break-all border border-white/5">
              <div className="mb-1"><strong className="text-slate-300">IP:</strong> {user?.ip || 'Unknown'}</div>
              <div><strong className="text-slate-300">Agent:</strong> {user?.userAgent || 'Unknown'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Section */}
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-xl mb-6 flex flex-col items-center">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Silakan Scan / Transfer</h3>
        {qrCodePath ? (
           <div className="bg-white p-2 rounded-xl">
             <img src={qrCodePath} alt="QR Code" className="w-48 h-48 object-cover rounded-lg" />
           </div>
        ) : (
           <div className="w-48 h-48 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
             QR Belum Tersedia
           </div>
        )}
      </div>

      {/* Contact Section */}
      <div className="grid grid-cols-2 gap-4">
        <a 
          href="https://wa.me/6287733745059" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-2 bg-green-600/10 hover:bg-green-600/20 border border-green-500/30 rounded-xl p-4 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center mb-1">
             <Smartphone className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-semibold text-green-400">WhatsApp</span>
        </a>
        
        <a 
          href="https://t.me/otomotif_digital" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center mb-1">
             <Globe className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-semibold text-blue-300">Telegram</span>
        </a>
      </div>
      
      <button 
        onClick={logout}
        className="mt-8 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <LogOut className="w-4 h-4" /> Keluar
      </button>
    </div>
  );
}
