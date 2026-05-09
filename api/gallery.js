// Vercel Serverless Function — TRR Website Gallery Proxy v3
// Auto-categorizes by description keywords

let cache = null;
let cacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000;

function categorize(description, name) {
  const text = ((description || '') + ' ' + (name || '')).toLowerCase();
  
  const engagementKeywords = [
    'engagement', 'center stone', 'center diamond', 'centre stone',
    'solitaire', 'halo', 'proposal', 'bridal', 'promise ring',
    'cushion', 'oval engagement', 'round brilliant', 'pear shaped',
    'three stone', '3 stone', 'split shank', 'cathedral'
  ];
  
  const weddingKeywords = [
    'wedding band', 'wedding ring', 'band', 'eternity', 'anniversary',
    'stackable', 'milgrain', 'chevron', 'curved band', 'straight band',
    'mens band', "men's band", 'his band', 'her band', 'matching band',
    'wrap band', 'wrap ring', 'coil', 'spiral', 'bypass',
    'channel set', 'pave band', 'diamond band', 'baguette band',
    'half eternity', 'full eternity', 'contoured', 'shadow band'
  ];

  for (const kw of engagementKeywords) {
    if (text.includes(kw)) return 'Engagement Ring';
  }
  for (const kw of weddingKeywords) {
    if (text.includes(kw)) return 'Wedding Band';
  }
  return 'Other';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const BASE_ID = 'appRZAg4zWZCgwihV';
  const TABLE   = 'CUSTOM DESIGNS';
  const API_KEY = process.env.AIRTABLE_API_KEY;

  if (!API_KEY) return res.status(500).json({ error: 'AIRTABLE_API_KEY not set' });

  const now = Date.now();
  if (cache && (now - cacheTime) < CACHE_DURATION) {
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json(cache);
  }

  try {
    let allRecords = [], offset = null;

    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`);
      if (offset) url.searchParams.set('offset', offset);
      url.searchParams.set('sort[0][field]', 'Auto Created');
      url.searchParams.set('sort[0][direction]', 'desc');

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      if (!response.ok) {
        if (cache) return res.status(200).json(cache);
        return res.status(response.status).json({ error: await response.text() });
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records);
      offset = data.offset || null;
    } while (offset);

    const items = [];

    for (const record of allRecords) {
      const fields    = record.fields;
      const allImages = [];

      for (const value of Object.values(fields)) {
        if (Array.isArray(value)) {
          for (const att of value) {
            if (att.type && att.type.startsWith('image/')) {
              allImages.push({
                url:       att.url,
                thumbnail: att.thumbnails?.large?.url || att.thumbnails?.small?.url || att.url,
                width:     att.width  || null,
                height:    att.height || null,
                filename:  att.filename || '',
              });
            }
          }
        }
      }

      if (allImages.length === 0) continue;

      const name = fields['Name'] || fields['Title'] || fields['Product Name'] || `Piece #${record.id.slice(-6)}`;
      const description = fields['Description'] || fields['description'] || '';
      const customerName = fields['Name of Customer'] || '';

      const reference = allImages[0].filename
        ? allImages[0].filename.replace(/\.[^/.]+$/, '')
        : record.id.slice(-6);

      const category = fields['Category'] || categorize(description, typeof name === 'string' ? name : String(name));

      items.push({
        id:          record.id,
        name:        typeof name === 'string' ? name : String(name),
        reference,
        category,
        customerName: typeof customerName === 'string' ? customerName : String(customerName),
        image:       allImages[0],
        allImages,
      });
    }

    cache = { items, total: items.length };
    cacheTime = now;
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json(cache);

  } catch (err) {
    console.error('Gallery proxy error:', err);
    if (cache) return res.status(200).json(cache);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
