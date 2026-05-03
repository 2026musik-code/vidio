import { Hono } from 'hono';
import md5 from 'crypto-js/md5.js';

type Bindings = {
  QR_BUCKET?: any; 
  DATA_KV?: any; 
  ASSETS: any;
  R2_PUBLIC_URL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const getDefaultData = () => ({ users: [] as any[], adminPassword: 'admin123', qrCodePath: '' });

async function getAppData(env: Bindings): Promise<any> {
  if (env.DATA_KV) {
    const data = await env.DATA_KV.get('appData', 'json');
    if (data) return data;
  }
  return getDefaultData();
}

async function saveAppData(env: Bindings, data: any) {
  if (env.DATA_KV) {
    await env.DATA_KV.put('appData', JSON.stringify(data));
  }
}

// Extract IP helper
const getIp = (c: any) => c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'Unknown';

// User APIs
app.post('/api/users/login', async (c) => {
  const { name } = await c.req.json();
  if (!name) return c.json({ error: 'Name is required' }, 400);

  const ip = getIp(c);
  const userAgent = c.req.header('user-agent') || 'Unknown';

  const appData = await getAppData(c.env);
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
    await saveAppData(c.env, appData);
  } else {
    user.ip = ip;
    user.userAgent = userAgent;
    await saveAppData(c.env, appData);
  }

  return c.json(user);
});

app.get('/api/users/me', async (c) => {
  const name = c.req.query('name');
  if (!name) return c.json({ error: 'Name required' }, 400);

  const appData = await getAppData(c.env);
  const user = appData.users.find((u: any) => u.name.toLowerCase() === name.toLowerCase());
  
  if (user) return c.json({ user, qrCodePath: appData.qrCodePath });
  return c.json({ error: 'User not found' }, 404);
});

app.post('/api/users/decrement-limit', async (c) => {
  const { name } = await c.req.json();
  const appData = await getAppData(c.env);
  const user = appData.users.find((u: any) => u.name.toLowerCase() === name.toLowerCase());

  if (user && user.limit > 0) {
    user.limit -= 1;
    await saveAppData(c.env, appData);
    return c.json({ success: true, user });
  }
  return c.json({ error: 'Limit habis atau user tidak ditemukan' }, 403);
});

// Admin APIs
app.post('/api/admin/login', async (c) => {
  const { password } = await c.req.json();
  const appData = await getAppData(c.env);
  if (password === appData.adminPassword) {
    return c.json({ token: 'admin-token-123' });
  }
  return c.json({ error: 'Invalid password' }, 401);
});

async function checkAdmin(c: any, next: any) {
  if (c.req.header('authorization') !== 'Bearer admin-token-123') {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  await next();
}

app.get('/api/admin/users', checkAdmin, async (c) => {
  const appData = await getAppData(c.env);
  return c.json(appData.users);
});

app.get('/api/admin/config', checkAdmin, async (c) => {
  const appData = await getAppData(c.env);
  return c.json({ qrCodePath: appData.qrCodePath });
});

app.put('/api/admin/users/:id', checkAdmin, async (c) => {
  const id = c.req.param('id');
  const { status, limit } = await c.req.json();
  
  const appData = await getAppData(c.env);
  const user = appData.users.find((u: any) => u.id === id);
  if (!user) return c.json({ error: 'User not found' }, 404);

  if (status) user.status = status;
  if (limit !== undefined) user.limit = limit;

  await saveAppData(c.env, appData);
  return c.json(user);
});

app.post('/api/admin/change-password', checkAdmin, async (c) => {
  const { newPassword } = await c.req.json();
  if (newPassword) {
    const appData = await getAppData(c.env);
    appData.adminPassword = newPassword;
    await saveAppData(c.env, appData);
    return c.json({ success: true });
  }
  return c.json({ error: 'No newPassword' }, 400);
});

app.post('/api/admin/upload-qr', checkAdmin, async (c) => {
  const body = await c.req.parseBody();
  const file = body['qrimage'] as File;
  
  if (!file) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  try {
    const ext = file.name ? `.${file.name.split('.').pop()}` : '.png';
    const filename = `qrcode-${Date.now()}${ext}`;

    const appData = await getAppData(c.env);

    if (c.env.QR_BUCKET) {
      await c.env.QR_BUCKET.put(filename, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type }
      });

      const publicUrl = c.env.R2_PUBLIC_URL 
        ? `${c.env.R2_PUBLIC_URL}/${filename}`
        : `/r2-image/${filename}`; // fallback to local worker route if no public URL

      appData.qrCodePath = publicUrl;
    } else {
      // In CF worker, we can't save to generic file system
      return c.json({ error: 'QR_BUCKET not binded in Cloudflare' }, 500);
    }

    await saveAppData(c.env, appData);
    return c.json({ path: appData.qrCodePath });
  } catch (e: any) {
    console.error('Upload error:', e);
    return c.json({ error: 'Failed to upload QR code' }, 500);
  }
});

// Fallback image serving if no public URL is provided for R2
app.get('/r2-image/:filename', async (c) => {
  const filename = c.req.param('filename');
  if (c.env.QR_BUCKET) {
    const obj = await c.env.QR_BUCKET.get(filename);
    if (!obj) return c.notFound();
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    return new Response(obj.body, { headers });
  }
  return c.notFound();
});

// Scraper APIs
app.get('/api/dramas', async (c) => {
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

    return c.json({ dramas });
  } catch (error) {
    return c.json({ error: 'Gagal melakukan scraping list drama' }, 500);
  }
});

app.get('/api/episodes/:slug/:playlet_id', async (c) => {
  const slug = c.req.param('slug');
  const playlet_id = c.req.param('playlet_id');
  const targetUrl = `https://www.flickreels.net/playlist/${slug}/${playlet_id}/episode-1`;

  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K)' }
    });
    const html = await response.text();
    
    const nuxtMatch = html.match(/<script type="application\/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">(.*?)<\/script>/s);
    let episodes: {ep: number, chapter_id: string}[] = [];
    
    if (nuxtMatch) {
      const data = JSON.parse(nuxtMatch[1]);
      const strs = data.filter((x: any) => typeof x === 'string');
      const nums = strs.filter((s: string) => /^\d{5,8}$/.test(s));
      
      const sortedIds = [...new Set(nums)].map(Number).sort((a,b) => a - b);
      episodes = sortedIds.map((id, index) => ({
        ep: index + 1,
        chapter_id: id.toString()
      }));
    }
    
    if (episodes.length === 0) {
        const regex = new RegExp(`/playlist/${slug}/${playlet_id}/episode-(\\d+)`, 'g');
        const matches = [...html.matchAll(regex)];
        const eps = [...new Set(matches.map(m => parseInt(m[1])))].sort((a, b) => a - b);
        episodes = eps.map(e => ({ ep: e, chapter_id: "" }));
    }
    
    return c.json({ episodes });
  } catch (error) {
    return c.json({ error: 'Gagal melakukan scraping' }, 500);
  }
});

app.get('/api/play/:playlet_id/:chapter_id', async (c) => {
  const playlet_id = c.req.param('playlet_id');
  const chapter_id = c.req.param('chapter_id');

  const payload: Record<string, string> = {
    chapter_id,
    guid: "e823594c-2321-4e10-bdd9-02f4655ab7ae",
    language_id: "1",
    os: "android",
    playlet_id
  };

  const sortedString = Object.keys(payload)
    .sort()
    .map(key => `${key}=${payload[key]}`)
    .join('&');

  const stringToHash = sortedString + "&signSalt=nW8GqjbdSYRI";
  const sign = md5(stringToHash).toString().toLowerCase();

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

    const data: any = await apiRes.json();

    if (data.status_code === 1 && data?.data?.hls_url) {
      return c.json({ url: data.data.hls_url });
    } else {
      return c.json({ error: "Ditolak server / Sign Invalid", details: data }, 403);
    }
  } catch (error) {
    return c.json({ error: "Gagal menembak API" }, 500);
  }
});

app.get('/api/proxy-m3u8', async (c) => {
  try {
    const targetUrl = c.req.query('url');
    if (!targetUrl) return c.text('Missing url parameter', 400);

    const response = await fetch(targetUrl, {
      headers: {
        'Origin': 'https://www.flickreels.net',
        'Referer': 'https://www.flickreels.net/',
      }
    });
    
    if (!response.ok) return c.text('Failed to fetch M3U8', response.status as any);

    const m3u8Text = await response.text();
    const urlObj = new URL(targetUrl);
    const baseUrl = urlObj.origin + urlObj.pathname.split('/').slice(0, -1).join('/') + '/';
    const queryParams = urlObj.search; 
    
    const rewrittenM3u8 = m3u8Text.split('\n').map(line => {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        let absoluteUrl = t;
        if (!t.startsWith('http')) {
          absoluteUrl = baseUrl + t;
        }
        if (!absoluteUrl.includes('?')) {
          absoluteUrl += queryParams;
        }
        const isM3u8 = absoluteUrl.includes('.m3u8');
        const endpoint = isM3u8 ? '/api/proxy-m3u8' : '/api/proxy-stream';
        return `${endpoint}?url=${encodeURIComponent(absoluteUrl)}`;
      }
      return line;
    }).join('\n');

    return c.text(rewrittenM3u8, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
  } catch (error) {
    return c.text('Internal Server Error', 500);
  }
});

app.get('/api/proxy-stream', async (c) => {
  try {
    const targetUrl = c.req.query('url');
    if (!targetUrl) return c.text('Missing url parameter', 400);

    const res = await fetch(targetUrl, {
      headers: {
        'Origin': 'https://www.flickreels.net',
        'Referer': 'https://www.flickreels.net/',
        'User-Agent': c.req.header('user-agent') || 'Mozilla/5.0'
      }
    });

    if (!res.ok) return c.text('Failed to fetch stream chunk', res.status as any);

    const newHeaders = new Headers(res.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(res.body, {
      status: res.status,
      headers: newHeaders
    });
  } catch (error) {
    return c.text('Internal Server Error', 500);
  }
});

// If no route matches API, return 404
app.all('/api/*', (c) => c.notFound());

// Serve static assets for exactly everything else
app.get('*', async (c) => {
  try {
    // ASSETS binding is available when using `wrangler pages deploy` or `[assets]` 
    // It intercepts static requests efficiently.
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res && res.status < 400) {
      return res;
    }
    // Handle SPA fallback: Fetch index.html
    const indexReq = new Request(new URL('/', c.req.url).toString(), c.req.raw);
    const fallbackRes = await c.env.ASSETS.fetch(indexReq);
    return fallbackRes;
  } catch (e) {
    // If not using ASSETS binding natively (e.g., using functions directory), this might fail
    return c.text('Not Found', 404);
  }
});

export default app;
