// Vercel Serverless Function — Airtable Product Catalog Gallery Proxy
// Deploy to Vercel. Set AIRTABLE_API_KEY in Vercel Environment Variables.
// v2 — returns name + all images per record for modal + inquiry form

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const BASE_ID = 'appXLmBmFuXvIs9kz';
  const TABLE   = 'CUSTOM DESIGNS';
  const API_KEY = process.env.AIRTABLE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'AIRTABLE_API_KEY not set in environment variables' });
  }

  try {
    let allRecords = [];
    let offset     = null;

    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`);
      if (offset) url.searchParams.set('offset', offset);

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();
      allRecords  = allRecords.concat(data.records);
      offset      = data.offset || null;
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
              });
            }
          }
        }
      }

      if (allImages.length === 0) continue;

      const name =
        fields['Name'] ||
        fields['Title'] ||
        fields['Product Name'] ||
        fields['Item'] ||
        fields['SKU'] ||
        `Piece #${record.id.slice(-6)}`;

      items.push({
        id:        record.id,
        name:      typeof name === 'string' ? name : String(name),
        image:     allImages[0],
        allImages,
      });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ items, total: items.length });

  } catch (err) {
    console.error('Gallery proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
