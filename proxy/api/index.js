export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check endpoint
  if (req.url === '/' || req.url === '/health') {
    return res.status(200).json({ status: 'ok', region: 'bom1-mumbai', service: 'data.gov.in proxy' });
  }

  try {
    // Forward path and query params to api.data.gov.in
    const targetUrl = new URL(req.url, 'https://api.data.gov.in');

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      signal: AbortSignal.timeout(25_000),
    });

    const body = await response.text();
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    return res.status(response.status).send(body);
  } catch (err) {
    return res.status(502).json({ error: 'Proxy fetch failed', message: err.message });
  }
}
