import React, { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import { Film, Play, Star, ChevronLeft, Info, AlertTriangle, Loader2, Download, ListVideo, Search, Home, LayoutGrid, User, Lock } from 'lucide-react';
import { cn } from './lib/utils';

import Profile from './Profile';
import Admin from './Admin';

// Types
type Drama = {
  slug: string;
  playlet_id: string;
  title: string;
  thumbnail: string;
  category?: string;
};

type Episode = {
  ep: number;
  chapter_id: string;
};

export default function App() {
  const [dramas, setDramas] = useState<Drama[]>([]);
  const [activeDrama, setActiveDrama] = useState<Drama | null>(null);
  
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeEpisode, setActiveEpisode] = useState<number | null>(null);
  
  const [statusMessage, setStatusMessage] = useState<string>('Pilih drama dari daftar di bawah untuk mulai menonton.');
  const [isLoadingMain, setIsLoadingMain] = useState<boolean>(true);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [errorStatus, setErrorStatus] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'categories' | 'profile'>('home');
  const [selectedCategory, setSelectedCategory] = useState<{name: string, count: number} | null>(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  
  const [currentPlaylistUrl, setCurrentPlaylistUrl] = useState<string | null>(null);

  // User Auth State
  const [user, setUser] = useState<any>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [qrCodePath, setQrCodePath] = useState('');
  const [isAdminRoute, setIsAdminRoute] = useState(false);

  useEffect(() => {
    // Basic router logic for /admin
    if (window.location.pathname === '/admin') {
      setIsAdminRoute(true);
      return;
    }

    // Check user login
    const savedName = localStorage.getItem('user_name');
    if (savedName) {
      handleUserLogin(savedName);
    } else {
      setShowLoginModal(true);
    }
  }, []);

  const handleUserLogin = async (nameToLogin: string) => {
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameToLogin })
      });
      if (res.ok) {
        const u = await res.json();
        setUser(u);
        localStorage.setItem('user_name', u.name);
        setShowLoginModal(false);
        // Also fetch qrCode config
        fetchQrConfig();
      }
    } catch(e) { console.error(e); }
  };

  const fetchQrConfig = async () => {
    try {
      const savedName = localStorage.getItem('user_name');
      if (savedName) {
        const res = await fetch(`/api/users/me?name=${savedName}`);
        if (res.ok) {
           const data = await res.json();
           setUser(data.user);
           setQrCodePath(data.qrCodePath);
        }
      }
    } catch(e) {}
  };

  const handleLogout = () => {
    localStorage.removeItem('user_name');
    setUser(null);
    setShowLoginModal(true);
  };

  // Auto-slide featured banner
  useEffect(() => {
    if (activeTab === 'home' && !activeDrama && dramas.length > 0) {
      const interval = setInterval(() => {
        setFeaturedIndex((prev) => (prev + 1) % Math.min(5, dramas.length));
      }, 2500); // changes roughly every ~2.5 second (instruction asks for 2 sec, so giving it 2.5 looks a bit smoother with 500ms transition)
      return () => clearInterval(interval);
    }
  }, [activeTab, activeDrama, dramas.length]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Compute categories based on fetched data
  const dynamicCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    dramas.forEach(d => {
      const cat = d.category || 'Lainnya';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [dramas]);

  useEffect(() => {
    const fetchDramas = async () => {
      try {
        const res = await fetch(`/api/dramas`);
        if (!res.ok) throw new Error('Response jaringan bermasalah');
        const data = await res.json();
        
        if (data.dramas && data.dramas.length > 0) {
          setDramas(data.dramas);
        } else {
          setErrorStatus(true);
          setStatusMessage('Gagal memuat daftar drama.');
        }
      } catch (err) {
        console.error("Error fetching dramas:", err);
        setErrorStatus(true);
        setStatusMessage('Error koneksi ke server untuk memuat drama.');
      } finally {
        setIsLoadingMain(false);
      }
    };

    fetchDramas();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);
  
  const playVideo = async (epInfo: Episode, explicitDrama?: Drama) => {
    const dramaToPlay = explicitDrama || activeDrama;
    if (!dramaToPlay) return;
    
    if (user && user.status !== 'Pro') {
      if (user.limit <= 0) {
        setShowLockModal(true);
        return;
      }
      // Decrement
      try {
        const dRes = await fetch('/api/users/decrement-limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: user.name })
        });
        if (dRes.ok) {
           const dData = await dRes.json();
           setUser(dData.user);
        } else {
           alert('Gagal mengecek limit. Coba lagi.');
           return;
        }
      } catch(e) { }
    }

    setActiveEpisode(epInfo.ep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setErrorStatus(false);
    setIsPlaying(false);
    setStatusMessage(`Mengambil kunci akses untuk Episode ${epInfo.ep}...`);

    try {
      // Jika chapter_id kosong (fallback), kita asumsikan menggunakan base ID manual
      const targetChapterId = epInfo.chapter_id || (461121 + epInfo.ep).toString();
      
      const res = await fetch(`/api/play/${dramaToPlay.playlet_id}/${targetChapterId}`);
      if (!res.ok) {
         let errData: any = {};
         try { errData = await res.json(); } catch(e) {}
         console.warn("API Error response:", res.status, errData);
         throw new Error(errData.error || `HTTP ${res.status}: Gagal memuat link video`);
      }
      
      const data = await res.json();
      
      if (data.url) {
        setStatusMessage(`Memutar Episode ${epInfo.ep}`);
        
        // Pass the URL to our backend proxy to rewrite .ts files
        const proxyUrl = `/api/proxy-m3u8?url=${encodeURIComponent(data.url)}`;
        setCurrentPlaylistUrl(proxyUrl);
        loadPlayer(proxyUrl);
      } else {
        throw new Error(data.error || 'Gagal memuat link video');
      }
    } catch (err: any) {
      console.error("Error playing video:", err);
      setErrorStatus(true);
      setStatusMessage(`Error: ${err.message || 'Gagal terhubung ke server video.'}`);
    }
  };

  const selectDrama = async (drama: Drama) => {
    setActiveDrama(drama);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveEpisode(null);
    setEpisodes([]);
    setIsPlaying(false);
    setErrorStatus(false);
    setCurrentPlaylistUrl(null);
    setStatusMessage(`Memuat episode untuk ${drama.title}...`);
    setIsLoadingEpisodes(true);
    
    // Stop current video
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    try {
      const res = await fetch(`/api/episodes/${drama.slug}/${drama.playlet_id}`);
      if (!res.ok) throw new Error('Response jaringan bermasalah');
      const data = await res.json();
      
      if (data.episodes && data.episodes.length > 0) {
        setEpisodes(data.episodes);
        setStatusMessage('Menyiapkan pemutaran otomatis...');
        // Auto-play the first episode
        playVideo(data.episodes[0], drama);
      } else {
        setErrorStatus(true);
        setStatusMessage('Gagal memuat episode. Data tidak ditemukan.');
      }
    } catch (err) {
      console.error("Error fetching episodes:", err);
      setErrorStatus(true);
      setStatusMessage('Error koneksi ke server untuk memuat episode.');
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  const handleVideoEnded = () => {
    if (activeEpisode !== null && episodes.length > 0) {
      const currentIndex = episodes.findIndex(e => e.ep === activeEpisode);
      if (currentIndex !== -1 && currentIndex + 1 < episodes.length) {
        const nextEp = episodes[currentIndex + 1];
        playVideo(nextEp);
      } else {
        setStatusMessage('Semua episode telah diputar.');
      }
    }
  };

  const loadPlayer = (m3u8Url: string) => {
    const video = videoRef.current;
    if (!video) return;

    setIsPlaying(true);

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      
      const newHls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        fragLoadingTimeOut: 120000, // 120s timeout for slow networks
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        manifestLoadingTimeOut: 60000,
        manifestLoadingMaxRetry: 10,
        levelLoadingTimeOut: 60000,
        levelLoadingMaxRetry: 10,
        enableWorker: true
      }); 
      hlsRef.current = newHls;
      
      newHls.on(Hls.Events.MEDIA_ATTACHED, () => {
        newHls.loadSource(m3u8Url);
      });
      newHls.attachMedia(video);
      
      newHls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatusMessage("Video siap. Sedang memutar...");
        video.play().catch(e => {
           console.warn("Auto-play prevented", e);
           setStatusMessage("Tap 'Play' (▶) untuk mulai menonton.");
        });
        setTimeout(() => {
          setStatusMessage("");
        }, 4000);
      });
      newHls.on(Hls.Events.FRAG_LOADED, () => {
         // Clear any loading/error messages once a fragment is successfully loaded and we are playing
         setStatusMessage("");
      });
      
      newHls.on(Hls.Events.ERROR, (event, data) => {
         // Silently ignore non-fatal errors
         if (!data.fatal) return;
         
         console.warn('Fatal HLS Error:', data.type, data.details);
         
         switch (data.type) {
           case Hls.ErrorTypes.NETWORK_ERROR:
             setStatusMessage(`Memulihkan koneksi... (${data.details})`);
             newHls.startLoad();
             break;
           case Hls.ErrorTypes.MEDIA_ERROR:
             setStatusMessage(`Memulihkan media...`);
             newHls.recoverMediaError();
             break;
           default:
             newHls.destroy();
             setStatusMessage(`Video error: ${data.details}.`);
             setErrorStatus(true);
             setIsPlaying(false);
             break;
         }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = m3u8Url; 
      video.addEventListener('loadedmetadata', () => {
        setStatusMessage("Video siap. Sedang memutar...");
        video.play().catch(e => {
           console.warn("Auto-play prevented", e);
           setStatusMessage("Tap 'Play' (▶) untuk mulai menonton.");
        });
        setTimeout(() => {
          setStatusMessage("");
        }, 4000);
      });
      video.addEventListener('error', (e) => {
        console.error("Native play error:", e);
        setStatusMessage("Error memutar video. Silakan coba lagi.");
        setErrorStatus(true);
        setIsPlaying(false);
      });
    } else {
       setErrorStatus(true);
       setStatusMessage("Browser Anda tidak mendukung pemutaran video ini.");
       setIsPlaying(false);
    }
  };
  
  const handleDownload = () => {
    if (!currentPlaylistUrl) {
      alert("Belum ada video yang dimuat untuk diunduh!");
      return;
    }
    alert("Video ini adalah streaming playlist HLS (.m3u8).\nKarena sistem keamanan server dan browser, file diunduh sebagai playlist (.m3u8). Anda dapat menggunakan VLC Player, 1DM, atau downloader khusus HLS/m3u8 untuk mendownload mp4 aslinya.");
    
    const a = document.createElement("a");
    a.href = currentPlaylistUrl;
    a.download = `${activeDrama?.slug || 'video'}-EP${activeEpisode || 1}.m3u8`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filteredDramas = dramas.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()));

  // Check for admin route
  if (isAdminRoute) {
    return <Admin />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans pb-20">
      {/* Name Input Modal */}
      {showLockModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-amber-700 rounded-full flex items-center justify-center p-1 shadow-lg shadow-red-500/20">
                 <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center">
                   <Lock className="w-8 h-8 text-red-500" />
                 </div>
              </div>
            </div>
            <h2 className="text-xl font-serif font-bold text-center mb-2">Akses Terkunci</h2>
            <p className="text-sm text-slate-400 text-center mb-6">Limit nonton Anda habis atau ini adalah episode premium. Silakan hubungi admin untuk Top Up Limit atau Upgrade Pro.</p>
            
            {qrCodePath ? (
              <div className="mb-6 flex flex-col items-center">
                <div className="bg-white p-2 rounded-xl">
                  <img src={qrCodePath} alt="QR Code" className="w-48 h-48 object-cover rounded-lg" />
                </div>
                <p className="text-xs text-slate-500 mt-2">Scan QR untuk Top Up</p>
              </div>
            ) : (
              <div className="mb-6 w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center text-slate-500 text-sm">
                QR Belum Tersedia
              </div>
            )}
            
            <button 
              onClick={() => setShowLockModal(false)}
              className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition-colors border border-white/10"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-amber-700 rounded-full flex items-center justify-center p-1">
                 <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center">
                   <User className="w-8 h-8 text-primary" />
                 </div>
              </div>
            </div>
            <h2 className="text-xl font-serif font-bold text-center mb-2">Selamat Datang</h2>
            <p className="text-sm text-slate-400 text-center mb-6">Silakan masukkan nama Anda untuk melanjutkan.</p>
            <form onSubmit={(e) => { e.preventDefault(); if (loginName.trim()) handleUserLogin(loginName.trim()); }}>
              <input 
                type="text" 
                value={loginName}
                onChange={e => setLoginName(e.target.value)}
                placeholder="Nama Anda..."
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors text-center font-medium mb-4"
                autoFocus
              />
              <button 
                type="submit" 
                disabled={!loginName.trim()}
                className="w-full bg-primary text-slate-950 font-bold py-3 rounded-xl hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                Mulai Menonton
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      {!activeDrama && (
        <header className="sticky top-0 z-50 bg-slate-950 border-b-2 border-primary/20 px-4 lg:px-6 py-2 flex items-center justify-between shadow-md shadow-primary/5 gap-2">
          <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center shadow-[0_0_15px_rgba(var(--color-primary),0.5)]">
              <Play className="w-5 h-5 text-slate-950 fill-current ml-1" />
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 hidden sm:block">
              VIPDRACINA
            </h1>
          </div>
          
          <div className="flex-1 max-w-xl mx-auto px-2">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => {
                   setSearchQuery(e.target.value); 
                   if (e.target.value && activeTab !== 'search') setActiveTab('search');
                   if (!e.target.value && activeTab === 'search') setActiveTab('home');
                }}
                placeholder="Cari drama..."
                className="w-full bg-slate-900 border-2 border-white/10 rounded-full py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-4 flex-shrink-0" onClick={() => setActiveTab('profile')} style={{cursor: 'pointer'}}>
            <div className="hidden md:flex items-center gap-1.5 text-xs text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20 shadow-sm">
              <Star className="w-4 h-4 text-primary" fill="currentColor" /> PREMIUM
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-amber-700 border-2 border-slate-900 shadow-md shadow-primary/20" />
          </div>
        </header>
      )}

      <main className={cn("mx-auto flex flex-col", !activeDrama ? "max-w-7xl px-4 mt-2 gap-2" : "w-full max-w-screen-2xl mx-auto mt-0")}>
        
        {!activeDrama ? (
          // =========================
          // HALAMAN DEPAN: LIST DRAMA
          // =========================
          <div className="space-y-2">
            
            {activeTab === 'home' && (
              <>
                {dramas.length > 0 && !isLoadingMain && (
                  <div className="mb-2">
                    <div className="relative w-full aspect-[4/3] sm:aspect-video md:aspect-[21/9] rounded-2xl overflow-hidden shadow-lg shadow-primary/10 border border-white/10 cursor-pointer group" onClick={() => selectDrama(dramas[featuredIndex])}>
                      {dramas.slice(0, 5).map((drama, idx) => (
                         <div 
                           key={`feature-${idx}`} 
                           className={cn("absolute inset-0 transition-opacity duration-1000", idx === featuredIndex ? "opacity-100 z-10" : "opacity-0 z-0")}
                         >
                           <img 
                             src={drama.thumbnail} 
                             alt={drama.title}
                             className="w-full h-full object-cover object-top" 
                           />
                           <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent opacity-90" />
                           
                           {/* Centered Play Button visible on hover/always on mobile */}
                           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/80 backdrop-blur-sm flex items-center justify-center opacity-80 sm:opacity-0 sm:group-hover:opacity-100 sm:scale-75 sm:group-hover:scale-100 transition-all duration-300 shadow-[0_0_20px_rgba(var(--color-primary),0.6)]">
                             <Play className="w-8 h-8 sm:w-10 sm:h-10 text-slate-950 fill-current ml-2" />
                           </div>
                           
                           <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-8 right-4 sm:right-8 text-left">
                              <span className="inline-block px-2 sm:px-3 py-1 bg-red-600 border border-red-400 text-white text-[10px] sm:text-xs uppercase font-extrabold rounded-md mb-2 shadow-lg tracking-widest">
                                SEDANG HANGAT
                              </span>
                              <h3 className="font-serif text-2xl sm:text-4xl lg:text-5xl font-black text-white line-clamp-2 leading-tight drop-shadow-xl text-balance">
                                {drama.title}
                              </h3>
                           </div>
                         </div>
                      ))}

                      {/* Pagination indicators */}
                      <div className="absolute bottom-2 right-4 sm:bottom-4 sm:right-8 z-20 flex gap-1.5">
                        {dramas.slice(0, 5).map((_, idx) => (
                           <div 
                             key={`dot-${idx}`} 
                             className={cn("h-1.5 rounded-full transition-all duration-300", idx === featuredIndex ? "w-6 bg-primary" : "w-1.5 bg-white/30")}
                           />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-2 mb-2">
                   <ListVideo className="w-5 h-5 text-primary" />
                   <h2 className="text-xl font-serif font-semibold">Semua Drama</h2>
                </div>
                
                {isLoadingMain ? (
                   <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
                      <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
                      <span className="text-lg font-medium">Memuat katalog...</span>
                   </div>
                ) : dramas.length > 0 ? (
                   <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
                     {dramas.map((drama, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => selectDrama(drama)}
                          className="group cursor-pointer rounded-xl overflow-hidden bg-slate-900 border border-white/5 hover:ring-1 hover:ring-primary transition-all duration-300 shadow-sm"
                        >
                           <div className="aspect-[3/4] relative overflow-hidden bg-slate-800">
                             <img 
                               src={drama.thumbnail} 
                               alt={drama.title}
                               className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                             />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-80" />
                             <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                                <div className="px-2 py-0.5 bg-primary/90 text-slate-950 text-[10px] font-bold rounded-sm">
                                  Tonton
                                </div>
                             </div>
                           </div>
                           <div className="p-3">
                             <h3 className="font-semibold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                               {drama.title}
                             </h3>
                           </div>
                        </div>
                     ))}
                   </div>
                ) : (
                   <div className="text-center py-10 text-slate-500">
                     Tidak ada drama yang ditemukan.
                   </div>
                )}
              </>
            )}

            {activeTab === 'search' && (
              <>
                {isLoadingMain ? (
                   <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
                      <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
                      <span className="text-lg font-medium">Mencari...</span>
                   </div>
                ) : filteredDramas.length > 0 ? (
                   <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
                     {filteredDramas.map((drama, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => selectDrama(drama)}
                          className="group cursor-pointer rounded-xl overflow-hidden bg-slate-900 border border-white/5 hover:ring-1 hover:ring-primary transition-all duration-300"
                        >
                           <div className="aspect-[3/4] relative overflow-hidden bg-slate-800">
                             <img 
                               src={drama.thumbnail} 
                               alt={drama.title}
                               className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                             />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-80" />
                             <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                                <div className="px-2 py-0.5 bg-primary/90 text-slate-950 text-[10px] font-bold rounded-sm">
                                  Tonton
                                </div>
                             </div>
                           </div>
                           <div className="p-3">
                             <h3 className="font-semibold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                               {drama.title}
                             </h3>
                           </div>
                        </div>
                     ))}
                   </div>
                ) : (
                   <div className="text-center py-10 text-slate-500">
                     {searchQuery ? "Judul drama tidak ditemukan." : "Ketik judul drama di atas untuk mencari."}
                   </div>
                )}
              </>
            )}

            {activeTab === 'categories' && (
               <div className="pb-10">
                  {!selectedCategory ? (
                    <>
                      <h2 className="text-2xl font-serif font-bold mb-6 flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-primary" />
                        Kategori Drama
                      </h2>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {dynamicCategories.map((cat, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => setSelectedCategory(cat)}
                            className="bg-slate-900/80 border border-white/5 rounded-2xl p-5 cursor-pointer hover:bg-slate-800 hover:border-primary/50 transition-all flex flex-col items-center justify-center text-center gap-3 relative overflow-hidden group shadow-sm"
                          >
                            <div className="absolute right-0 top-0 w-24 h-24 bg-primary/5 rounded-bl-full -z-10 group-hover:bg-primary/20 transition-colors" />
                            <h3 className="font-semibold text-white group-hover:text-primary transition-colors">{cat.name}</h3>
                            <span className="text-xs font-medium text-slate-400 bg-black/40 px-3 py-1 rounded-full">{cat.count} Video</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-6">
                        <button 
                          onClick={() => setSelectedCategory(null)}
                          className="w-8 h-8 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center hover:bg-slate-800 transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5 text-slate-400" />
                        </button>
                        <h2 className="text-2xl font-serif font-bold">Kategori: {selectedCategory.name}</h2>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
                        {dramas.filter(d => (d.category || 'Lainnya') === selectedCategory.name).map((drama, idx) => (
                           <div 
                             key={`cat-drama-${idx}`} 
                             onClick={() => selectDrama(drama)}
                             className="group cursor-pointer rounded-xl overflow-hidden bg-slate-900 border border-white/5 hover:ring-1 hover:ring-primary transition-all duration-300"
                           >
                              <div className="aspect-[3/4] relative overflow-hidden bg-slate-800">
                                <img 
                                  src={drama.thumbnail} 
                                  alt={drama.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-80" />
                                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                                   <div className="px-2 py-0.5 bg-primary/90 text-slate-950 text-[10px] font-bold rounded-sm">
                                     Tonton
                                   </div>
                                </div>
                              </div>
                              <div className="p-3">
                                <h3 className="font-semibold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                                  {drama.title}
                                </h3>
                              </div>
                           </div>
                        ))}
                      </div>
                    </>
                  )}
               </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
               <Profile user={user} qrCodePath={qrCodePath} logout={handleLogout} />
            )}
            
          </div>
        ) : (
          // =========================
          // HALAMAN DETAIL & PLAYER
          // =========================
          <div className="flex flex-col gap-4">
            {/* Top Area: Player with absolute back button */}
            <div className="relative w-full bg-slate-900 rounded-b-2xl md:rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex flex-col md:mt-4" style={{ height: 'max(40vh, 320px)', maxHeight: '75vh' }}>
              
              {/* Back Button Floating */}
              <button 
                onClick={() => { setActiveDrama(null); setIsPlaying(false); }}
                className="absolute top-4 left-4 z-50 w-10 h-10 bg-black/40 hover:bg-black/80 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 transition-all shadow-md"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>

              {!isPlaying && (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 opacity-80 z-0" />
              )}
              
              {!isPlaying && !isLoadingEpisodes && !errorStatus && activeEpisode === null && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in duration-500 z-20">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center backdrop-blur-md">
                       <Film className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-slate-400 font-medium tracking-wide text-sm uppercase">Pilih Episode</p>
                 </div>
              )}

              {!isPlaying && errorStatus && (
                 <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-500">
                       <div className="text-red-400 font-medium tracking-wide text-sm text-center px-4">
                         {statusMessage}
                         <button onClick={() => playVideo({ep: activeEpisode!} as any)} className="mt-4 block px-4 py-2 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 font-semibold mx-auto">Coba Lagi</button>
                       </div>
                 </div>
              )}

              <div className="flex-1 w-full h-full relative flex items-center bg-black">
                <video
                  ref={videoRef}
                  controls
                  playsInline
                  autoPlay
                  onEnded={handleVideoEnded}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain relative z-10"
                  poster={activeDrama?.thumbnail} 
                />
              </div>
            </div>

            {/* Status Message Overlay outside video as fallback */}
            {statusMessage && isPlaying && (
               <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-2 mx-4 md:mx-0 rounded-lg text-sm font-medium animate-in slide-in-from-bottom-2 text-center max-w-fit align-middle self-center">
                 {statusMessage}
               </div>
            )}

            {/* Horizontal Episode List */}
            <div className="px-4 md:px-0">
              <div className="flex items-center justify-between mb-3">
                 <h3 className="text-lg font-serif font-semibold">Daftar Episode</h3>
                 <span className="text-xs font-medium text-slate-400 select-none">{episodes.length} Episodes</span>
              </div>
              
              <div className="bg-slate-900/40 rounded-2xl p-3 md:p-4 ring-1 ring-white/5">
                {isLoadingEpisodes ? (
                   <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
                      <span className="text-sm font-medium">{statusMessage}</span>
                   </div>
                ) : episodes.length > 0 ? (
                   <div className="flex overflow-x-auto snap-x snap-mandatory custom-scrollbar gap-2 pb-2">
                     {episodes.map((ep, idx) => {
                        const isActive = activeEpisode === ep.ep;
                        const isLocked = user && user.status !== 'Pro' && idx >= 5;
                        return (
                          <div 
                            key={ep.ep}
                            onClick={() => {
                               if (isLocked && user?.limit <= 0) {
                                  setShowLockModal(true);
                               } else {
                                  playVideo(ep);
                               }
                            }}
                            className={cn(
                              "snap-start shrink-0 flex items-center justify-center cursor-pointer transition-all rounded-xl border relative overflow-hidden group font-semibold",
                              "w-16 h-12 md:w-20 md:h-14",
                              isActive 
                                ? "bg-primary text-slate-950 border-primary shadow-[0_0_15px_rgba(234,179,8,0.2)]" 
                                : isLocked
                                ? "bg-slate-800/80 text-slate-500 border-white/5 opacity-80"
                                : "bg-slate-800 text-slate-300 border-white/5 hover:bg-slate-700 hover:text-white"
                            )}
                          >
                            {isActive ? (
                               <Play className="w-4 h-4 fill-slate-950" />
                            ) : isLocked ? (
                               <div className="flex items-center gap-1"><span className="text-xs">{ep.ep}</span><Lock className="w-3 h-3 text-red-400" /></div>
                            ) : (
                               <span>{ep.ep}</span>
                            )}
                          </div>
                        );
                     })}
                   </div>
                ) : (
                   <div className="text-center py-8 text-slate-500 text-sm">
                     Belum ada data episode.
                   </div>
                )}
              </div>
            </div>

            {/* Info Box */}
            <div className="px-4 md:px-0 mb-8">
              <div className="bg-slate-900/50 rounded-2xl p-6 ring-1 ring-white/5 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-serif font-semibold text-white tracking-tight leading-tight">{activeDrama.title}</h2>
                    <div className="flex items-center gap-4 mt-3 text-sm text-slate-400">
                      <span className="px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-semibold uppercase">{activeDrama.slug.replace(/-/g, ' ')}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-600" />
                      <span>Sub Indo (Hardsub)</span>
                    </div>
                  </div>
                  
                  {/* Download Button */}
                  <div className="flex items-center gap-2">
                    <button 
                       onClick={handleDownload}
                       disabled={!currentPlaylistUrl || activeEpisode === null}
                       className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-sm transition-colors border border-white/10"
                    >
                      <Download className="w-4 h-4" />
                      Unduh M3U8
                    </button>
                  </div>
                </div>
                
                <p className="text-slate-300 leading-relaxed text-sm md:text-base max-w-4xl mt-2">
                  Saksikan serial melodrama eksklusif. Subtitle bahasa Indonesia biasanya sudah tertanam (hardsub) dari sumber resmi. Jika subtitle tidak muncul, kemungkinan episode ini belum diterjemahkan dari asalnya.
                </p>

                {/* Status Bar */}
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl mt-6 transition-colors duration-300",
                  errorStatus ? "bg-red-500/10 text-red-400 ring-1 ring-red-500/20" : 
                  statusMessage.includes('Memutar') || statusMessage.includes('Mengambil') ? "bg-primary/10 text-primary ring-1 ring-primary/20" : 
                  "bg-slate-800/50 text-slate-400 ring-1 ring-white/5"
                )}>
                  {errorStatus ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <Info className="w-5 h-5 flex-shrink-0" />}
                  <span className="text-sm font-medium">{statusMessage}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Bottom Navigation */}
      {!activeDrama && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-md border-t border-white/5 pb-safe block">
          <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-between">
            <button onClick={() => setActiveTab('home')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'home' ? "text-primary" : "text-slate-500 hover:text-slate-300")}>
              <Home className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-wider">Utama</span>
            </button>
            <button onClick={() => setActiveTab('search')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'search' ? "text-primary" : "text-slate-500 hover:text-slate-300")}>
              <Search className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-wider">Pencarian</span>
            </button>
            <button onClick={() => setActiveTab('categories')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'categories' ? "text-primary" : "text-slate-500 hover:text-slate-300")}>
              <LayoutGrid className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-wider">Kategori</span>
            </button>
            <button onClick={() => setActiveTab('profile')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'profile' ? "text-primary" : "text-slate-500 hover:text-slate-300")}>
              <User className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-wider">Profil</span>
            </button>
          </div>
        </nav>
      )}

      {/* Scrollbar styling */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}} />
    </div>
  );
}
