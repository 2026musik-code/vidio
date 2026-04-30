import React, { useState, useEffect } from 'react';
import { Lock, Users, Upload, Shield, Save, LogOut } from 'lucide-react';
import { cn } from './lib/utils';

export default function Admin() {
  const [password, setPassword] = useState('');
  const [isLogged, setIsLogged] = useState(false);
  const [token, setToken] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('admin_token');
    if (t) {
      setToken(t);
      setIsLogged(true);
    }
  }, []);

  useEffect(() => {
    if (isLogged && token) {
      fetchUsers();
    }
  }, [isLogged, token]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` }});
      if (res.ok) {
        setUsers(await res.json());
      } else {
        logout();
      }
    } catch(e) { console.error(e); }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('admin_token', data.token);
      setToken(data.token);
      setIsLogged(true);
      setStatusMsg('');
    } else {
      setStatusMsg('Password salah!');
    }
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    setToken('');
    setIsLogged(false);
  };

  const updateUser = async (id: string, status: string, limit: number) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, limit })
      });
      if (res.ok) {
        fetchUsers();
        alert('User diperbarui!');
      }
    } catch(e) { console.error(e); }
  };

  const uploadQr = async () => {
    if (!qrFile) return;
    const formData = new FormData();
    formData.append('qrimage', qrFile);

    try {
      const res = await fetch('/api/admin/upload-qr', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        alert('QR code berhasil diupload!');
        setQrFile(null);
      }
    } catch(e) { console.error(e); }
  };

  const changeAdminPassword = async () => {
    if (!newPassword) return;
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        alert('Password berhasil diubah!');
        setNewPassword('');
      }
    } catch(e) { console.error(e); }
  };

  if (!isLogged) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-white/5 rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-center text-xl font-serif font-bold text-white mb-6 tracking-wider">ADMIN PANEL</h1>
          <form onSubmit={login} className="space-y-4">
            <div>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan Password Admin"
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors text-center"
              />
            </div>
            {statusMsg && <p className="text-red-400 text-sm text-center font-medium">{statusMsg}</p>}
            <button type="submit" className="w-full bg-primary text-slate-950 font-bold py-3 rounded-lg hover:bg-amber-500 transition-colors">
              Masuk
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
             <Shield className="w-8 h-8 text-primary" />
             <h1 className="text-2xl font-serif font-bold tracking-widest">DASHBOARD ADMIN</h1>
          </div>
          <button onClick={logout} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-colors">
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main content: User List */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-serif font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Daftar Pengguna
            </h2>
            
            <div className="space-y-4">
              {users.map((u, idx) => (
                <div key={idx} className="bg-slate-900 border border-white/10 rounded-xl p-5 shadow-sm space-y-4">
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
                     <div>
                       <h3 className="font-bold text-lg text-white">{u.name}</h3>
                       <p className="text-xs text-slate-400">Terdaftar: {new Date(u.createdAt).toLocaleDateString('id-ID')}</p>
                     </div>
                     <div className="flex items-center gap-2">
                       <select 
                         value={u.status}
                         onChange={(e) => updateUser(u.id, e.target.value, u.limit)}
                         className="bg-slate-950 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none"
                       >
                         <option value="Free">Free</option>
                         <option value="Pro">Pro</option>
                       </select>
                       <div className="flex items-center gap-1 border border-white/10 rounded overflow-hidden">
                         <span className="bg-slate-950 text-xs px-2 py-2 text-slate-400">Limit</span>
                         <input 
                           type="number" 
                           value={u.limit}
                           onChange={(e) => updateUser(u.id, u.status, parseInt(e.target.value) || 0)}
                           className="w-16 bg-slate-800 text-white px-2 py-1.5 outline-none text-sm font-mono text-center"
                         />
                       </div>
                     </div>
                   </div>
                   
                   <div className="bg-slate-950/50 rounded-lg p-3 text-xs text-slate-400 font-mono break-all space-y-1">
                     <div><strong className="text-slate-300">IP:</strong> {u.ip}</div>
                     <div><strong className="text-slate-300">User-Agent:</strong> {u.userAgent}</div>
                   </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="p-8 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-white/5">
                  Belum ada pengguna terdaftar.
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Settings */}
          <div className="space-y-6">
            <h2 className="text-xl font-serif font-semibold flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" /> Pengaturan
            </h2>
            
            {/* Upload QR Card */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-5 space-y-4">
               <h3 className="font-medium text-white mb-2 pb-2 border-b border-white/5">Upload Kode QR</h3>
               <div className="flex items-center gap-3">
                 <input 
                   type="file" 
                   accept="image/*"
                   onChange={(e) => setQrFile(e.target.files?.[0] || null)}
                   className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 w-full"
                 />
               </div>
               <button 
                 onClick={uploadQr}
                 disabled={!qrFile}
                 className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg font-medium text-sm transition-colors border border-white/10 disabled:opacity-50"
               >
                 Upload QR Image
               </button>
            </div>

            {/* Change Password Card */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-5 space-y-4">
               <h3 className="font-medium text-white mb-2 pb-2 border-b border-white/5">Ganti Sandi Admin</h3>
               <input 
                 type="password" 
                 value={newPassword}
                 onChange={e => setNewPassword(e.target.value)}
                 placeholder="Masukkan sandi baru..."
                 className="w-full bg-slate-950 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors text-white"
               />
               <button 
                 onClick={changeAdminPassword}
                 disabled={!newPassword}
                 className="w-full flex items-center justify-center gap-2 bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 border border-amber-500/20 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
               >
                 <Save className="w-4 h-4" /> Simpan Sandi
               </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
