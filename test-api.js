import crypto from 'crypto';

const md5 = (data) => crypto.createHash('md5').update(data).digest('hex');

const playletId = "6505";
const chapterId = "461122";

const payload = {
  chapter_id: chapterId,
  guid: "e823594c-2321-4e10-bdd9-02f4655ab7ae",
  language_id: "1",
  os: "android",
  playlet_id: playletId
};

const sortedString = Object.keys(payload)
  .sort()
  .map(key => `${key}=${payload[key]}`)
  .join('&');

const stringToHash = sortedString + "&signSalt=nW8GqjbdSYRI";
console.log("String to hash:", stringToHash);

const sign = md5(stringToHash).toLowerCase();
console.log("Sign:", sign);

fetch('https://apiweb.flickreels.net/web/playlet/play', {
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
}).then(res => res.json()).then(console.log).catch(console.error);
