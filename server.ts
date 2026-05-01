import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import md5 from 'crypto-js/md5.js';
import fs from 'fs';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

// R2 Storage Setup (Optional)
const r2Client = process.env.R2_ENDPOINT ? new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
}) : null;

// Storage Setup
const dataFile = path.join(process.cwd(), 'data.json');
let appData = { users: [] as any[], adminPassword: 'admin123', qrCodePath: '' };

try {
  if (fs.existsSync(dataFile)) {
    appData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  } else {
    fs.writeFileSync(dataFile, JSON.stringify(appData, null, 2));
  }
} catch(e) { console.error(e); }

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(appData, null, 2));
}

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
// Use memory storage to be able to upload to R2
const upload = multer({ storage: multer.memoryStorage() });


async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.post('/api/users/login', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    // Get IP and User-Agent
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    let user = appData.users.find((u: any) => u.name.toLowerCase() === name.toLowerCase());
    
    if (!user) {
      user = {
        id: Date.now().toString(),
        name,
        ip,
        userAgent,
        status: 'Free',
        limit: 10,
        createdAt: new Date().toISOString()
      };
      appData.users.push(user);
      saveData();
    } else {
      // Update ip/userAgent for existing user
      user.ip = ip;
      user.userAgent = userAgent;
      saveData();
    }

    res.json(user);
  });
  
  app.get('/api/users/me', (req, res) => {
    const name = req.query.name as string;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const user = appData.users.find((u: any) => u.name.toLowerCase() === name.toLowerCase());
    if (user) return res.json({ user, qrCodePath: appData.qrCodePath });
    return res.status(404).json({ error: 'User not found' });
  });

  app.post('/api/users/decrement-limit', (req, res) => {
    const { name } = req.body;
    const user = appData.users.find((u: any) => u.name.toLowerCase() === name.toLowerCase());
    if (user && user.limit > 0) {
      user.limit -= 1;
      saveData();
      return res.json({ success: true, user });
    }
    return res.status(403).json({ error: 'Limit habis atau user tidak ditemukan' });
  });

  // Admin APIs
  app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === appData.adminPassword) {
      res.json({ token: 'admin-token-123' }); // dummy simple token
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  });

  const checkAdmin = (req: any, res: any, next: any) => {
    if (req.headers.authorization !== 'Bearer admin-token-123') return res.status(403).json({ error: 'Unauthorized' });
    next();
  };

  app.get('/api/admin/users', checkAdmin, (req, res) => {
    res.json(appData.users);
  });
  
  app.get('/api/admin/config', checkAdmin, (req, res) => {
    res.json({ qrCodePath: appData.qrCodePath });
  });

  app.put('/api/admin/users/:id', checkAdmin, (req, res) => {
    const { id } = req.params;
    const { status, limit } = req.body;
    const user = appData.users.find((u: any) => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (status) user.status = status;
    if (limit !== undefined) user.limit = limit;
    
    saveData();
    res.json(user);
  });

  app.post('/api/admin/change-password', checkAdmin, (req, res) => {
    const { newPassword } = req.body;
    if (newPassword) {
      appData.adminPassword = newPassword;
      saveData();
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'No newPassword' });
    }
  });

  app.post('/api/admin/upload-qr', checkAdmin, upload.single('qrimage'), async (req, res) => {
    if (req.file) {
      try {
        const ext = path.extname(req.file.originalname) || '.png';
        const filename = `qrcode-${Date.now()}${ext}`;

        if (r2Client && process.env.R2_BUCKET_NAME) {
          // Upload to R2
          await r2Client.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: filename,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          }));
          
          const publicUrl = process.env.R2_PUBLIC_URL 
            ? `${process.env.R2_PUBLIC_URL}/${filename}`
            : `https://${process.env.R2_BUCKET_NAME}.r2.dev/${filename}`;
  
          appData.qrCodePath = publicUrl;
        } else {
          // Fallback to local
          const newPath = path.join(process.cwd(), 'uploads', filename);
          fs.writeFileSync(newPath, req.file.buffer);
          appData.qrCodePath = `/uploads/${filename}`;
        }

        saveData();
        res.json({ path: appData.qrCodePath });
      } catch (e: any) {
        console.error('Upload error:', e);
        res.status(500).json({ error: 'Failed to upload QR code' });
      }
    } else {
      res.status(400).json({ error: 'No file uploaded' });
    }
  });

  // ==========================================
  // 0. BACKEND: SCRAPER DAFTAR DRAMA (HOME)
  // ==========================================
  app.get('/api/dramas', async (req, res) => {
    try {
      const sources = [
        { url: 'https://www.flickreels.net/', category: 'Trending' },
        { url: 'https://www.flickreels.net/classify/romance/1500/1', category: 'Romance' },
        { url: 'https://www.flickreels.net/classify/ceo-billionaire/1579/1', category: 'CEO / Billionaire' },
        { url: 'https://www.flickreels.net/classify/avenge/1556/1', category: 'Avenge' },
        { url: 'https://www.flickreels.net/classify/timetravel/1798/1', category: 'Time Travel' },
        { url: 'https://www.flickreels.net/classify/flash-marriage/1742/1', category: 'Flash Marriage' },
        { url: 'https://www.flickreels.net/classify/feel-good/2280/1', category: 'Feel-Good' },
        { url: 'https://www.flickreels.net/classify/urban/1460/1', category: 'Urban' },
        { url: 'https://www.flickreels.net/classify/drama/1886/1', category: 'Drama' },
        { url: 'https://www.flickreels.net/classify/ancient-asian/1468/1', category: 'Asian' },
      ];

      const fetchSource = async (source: {url: string, category: string}) => {
        try {
          const response = await fetch(source.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K)' }
          });
          const html = await response.text();
          const items: any[] = [];
          const regex = /<a[^>]*href="\/playlist\/([a-zA-Z0-9-]+)\/(\d+)\/episode-1"[^>]*>([\s\S]*?)<\/a>/g;
          let match;
          while ((match = regex.exec(html)) !== null) {
            const slug = match[1];
            const playlet_id = match[2];
            const innerHTML = match[3];
            
            const imgRegex = /<img[^>]*src="([^"]+)"[^>]*alt="image-([^"]*)"/i;
            const imgMatch = innerHTML.match(imgRegex);
            
            if (imgMatch) {
              let thumb = imgMatch[1].split('?')[0]; 
              let title = imgMatch[2].trim().replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
              items.push({ slug, playlet_id, title, thumbnail: thumb, category: source.category });
            } else {
              items.push({ slug, playlet_id, title: slug.replace(/-/g, ' ').toUpperCase(), thumbnail: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&q=80&h=300", category: source.category });
            }
          }
          return items;
        } catch (e) {
          return [];
        }
      };

      const results = await Promise.all(sources.map(fetchSource));
      const dramas: any[] = [];
      const seenIds = new Set();
      
      for (const list of results) {
        for (const item of list) {
          if (!seenIds.has(item.playlet_id)) {
            seenIds.add(item.playlet_id);
            dramas.push(item);
          }
        }
      }

      res.json({ dramas });
    } catch (error) {
      console.error('Scraping error:', error);
      res.status(500).json({ error: 'Gagal melakukan scraping list drama' });
    }
  });

  // ==========================================
  // 1. BACKEND: SCRAPER DAFTAR EPISODE
  // ==========================================
  app.get('/api/episodes/:slug/:playlet_id', async (req, res) => {
    const { slug, playlet_id } = req.params;
    const targetUrl = `https://www.flickreels.net/playlist/${slug}/${playlet_id}/episode-1`;

    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K)' }
      });
      
      const html = await response.text();
      
      // Ambil NUXT_DATA untuk mendapatkan chapter IDs
      const nuxtMatch = html.match(/<script type="application\/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">(.*?)<\/script>/s);
      
      let episodes: {ep: number, chapter_id: string}[] = [];
      
      if (nuxtMatch) {
        const data = JSON.parse(nuxtMatch[1]);
        const strs = data.filter((x: any) => typeof x === 'string');
        const nums = strs.filter((s: string) => /^\d{5,8}$/.test(s)); // ID chapter biasaya 5-8 digit
        
        // Kita buang duplikat, dan urutkan
        const sortedIds = [...new Set(nums)].map(Number).sort((a,b) => a - b);
        
        // ID dengan urutan yang sama persis biasanya adalah daftar chapter yang benar (consecutive)
        // Jadi asumsikan ini adalah daftar episode
        episodes = sortedIds.map((id, index) => ({
          ep: index + 1,
          chapter_id: id.toString()
        }));
      }
      
      // Fallback jika array kosong
      if (episodes.length === 0) {
          // Regex untuk menarik nomor episode dari string URL
          const regex = new RegExp(`/playlist/${slug}/${playlet_id}/episode-(\\d+)`, 'g');
          const matches = [...html.matchAll(regex)];
          
          // Memfilter data agar angkanya unik dan terurut (1, 2, 3...)
          const eps = [...new Set(matches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
          episodes = eps.map(e => ({ ep: e, chapter_id: "" }));
      }
      
      res.json({ episodes });
    } catch (error) {
      console.error('Scraping error:', error);
      res.status(500).json({ error: 'Gagal melakukan scraping' });
    }
  });

  // ==========================================
  // 2. BACKEND: API BYPASSER (MD5 SIGN GENERATOR)
  // ==========================================
  app.get('/api/play/:playlet_id/:chapter_id', async (req, res) => {
    const { playlet_id, chapter_id } = req.params;

    // Data Payload sesuai dengan hasil network sniffing
    const payload: Record<string, string> = {
      chapter_id,
      guid: "e823594c-2321-4e10-bdd9-02f4655ab7ae",
      language_id: "1",
      os: "android", // the original used "android", we'll stick to it
      playlet_id
    };

    // A. Mengurutkan key sesuai abjad (aturan wajib API Flickreels)
    const sortedString = Object.keys(payload)
      .sort()
      .map(key => `${key}=${payload[key]}`)
      .join('&');

    // B. Menambahkan Salt Rahasia
    const stringToHash = sortedString + "&signSalt=nW8GqjbdSYRI";

    // C. Generate MD5 Sign ke bentuk lowercase
    const sign = md5(stringToHash).toString().toLowerCase();

    // D. Tembak API Flickreels
    try {
      const apiRes = await fetch('https://apiweb.flickreels.net/web/playlet/play', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'origin': 'https://www.flickreels.net',
          'referer': 'https://www.flickreels.net/',
          'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
          'sign': sign,
          'web-system': 'android'
        },
        body: JSON.stringify(payload)
      });

      const data = await apiRes.json();

      if (data.status_code === 1 && data?.data?.hls_url) {
        res.json({ url: data.data.hls_url });
      } else {
        res.status(403).json({ error: "Ditolak server / Sign Invalid", details: data });
      }
    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({ error: "Gagal menembak API" });
    }
  });

  // ==========================================
  // 3. BACKEND: M3U8 PROXY REWRITER
  // ==========================================
  app.get('/api/proxy-m3u8', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
      }

      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).send('Failed to fetch M3U8');
      }

      const m3u8Text = await response.text();
      
      const urlObj = new URL(targetUrl);
      const baseUrl = urlObj.origin + urlObj.pathname.split('/').slice(0, -1).join('/') + '/';
      const queryParams = urlObj.search; 
      
      // Rewrite .ts lines
      const rewrittenM3u8 = m3u8Text.split('\n').map(line => {
        const t = line.trim();
        if (t.endsWith('.ts')) {
          if (t.startsWith('http')) {
            return t.includes('?') ? t : t + queryParams;
          }
          return baseUrl + t + queryParams;
        }
        return line;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(rewrittenM3u8);
    } catch (error) {
      console.error('M3U8 proxy error:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
