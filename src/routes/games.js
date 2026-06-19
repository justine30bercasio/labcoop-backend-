const express = require('express');
const router = express.Router();

const gameCatalog = [
  // ── Game Portals (these URLs actually work) ──────────────────────────
  { id: 'gamemonetize', title: 'Game Portal', emoji: '🎮', category: 'Portal', description: 'Browse thousands of free HTML5 games', embedUrl: 'https://www.gamemonetize.com/games', plays: 999999 },
  { id: 'arcade', title: 'Arcade Games', emoji: '🏆', category: 'Portal', description: 'Action-packed arcade collection', embedUrl: 'https://www.gamemonetize.com/games/arcade', plays: 50000 },
  { id: 'educational', title: 'Educational Games', emoji: '📚', category: 'Portal', description: 'Fun learning games for kids', embedUrl: 'https://www.gamemonetize.com/games/educational', plays: 45000 },
  { id: 'puzzle', title: 'Puzzle Games', emoji: '🧩', category: 'Portal', description: 'Brain-teasing puzzles and brain games', embedUrl: 'https://www.gamemonetize.com/games/puzzle', plays: 40000 },
  { id: 'action', title: 'Action Games', emoji: '💥', category: 'Portal', description: 'Exciting action-packed games', embedUrl: 'https://www.gamemonetize.com/games/action', plays: 35000 },
  { id: 'sports', title: 'Sports Games', emoji: '⚽', category: 'Portal', description: 'Sports and athletic challenges', embedUrl: 'https://www.gamemonetize.com/games/sports', plays: 30000 },
  { id: 'racing', title: 'Racing Games', emoji: '🏎️', category: 'Portal', description: 'Fast-paced racing games', embedUrl: 'https://www.gamemonetize.com/games/racing', plays: 28000 },
  { id: 'girls', title: 'Girls Games', emoji: '👗', category: 'Portal', description: 'Fun games for everyone', embedUrl: 'https://www.gamemonetize.com/games/girls', plays: 25000 },
  { id: 'multiplayer', title: 'Multiplayer Games', emoji: '👥', category: 'Portal', description: 'Play with friends online', embedUrl: 'https://www.gamemonetize.com/games/multiplayer', plays: 22000 },
  { id: 'shooting', title: 'Shooting Games', emoji: '🔫', category: 'Portal', description: 'Target and shooting challenges', embedUrl: 'https://www.gamemonetize.com/games/shooting', plays: 20000 },
  { id: 'adventure', title: 'Adventure Games', emoji: '🗺️', category: 'Portal', description: 'Explore and go on adventures', embedUrl: 'https://www.gamemonetize.com/games/adventure', plays: 18000 },
  { id: 'strategy', title: 'Strategy Games', emoji: '🧠', category: 'Portal', description: 'Think and plan your way to victory', embedUrl: 'https://www.gamemonetize.com/games/strategy', plays: 16000 },
  { id: 'simulation', title: 'Simulation Games', emoji: '🏙️', category: 'Portal', description: 'Build and manage your world', embedUrl: 'https://www.gamemonetize.com/games/simulation', plays: 14000 },
  { id: 'music', title: 'Music Games', emoji: '🎵', category: 'Portal', description: 'Rhythm and music challenges', embedUrl: 'https://www.gamemonetize.com/games/music', plays: 12000 },
  { id: 'card', title: 'Card Games', emoji: '🃏', category: 'Portal', description: 'Classic card and board games', embedUrl: 'https://www.gamemonetize.com/games/card', plays: 10000 },
  { id: 'cooking', title: 'Cooking Games', emoji: '🍳', category: 'Portal', description: 'Cook and serve delicious meals', embedUrl: 'https://www.gamemonetize.com/games/cooking', plays: 8000 },
];

// ── Individual Featured Games (curated for kids) ────────────────────────
// Add real embed URLs here when you have them from GameMonetize publisher account

// GET /api/games
router.get('/', (req, res) => {
  const { category, search, limit } = req.query;
  let result = [...gameCatalog];

  if (category && category !== 'All' && category !== 'Portal') {
    result = result.filter(g => g.category === category);
  }
  if (category === 'Portal') {
    result = result.filter(g => g.category === 'Portal');
  }
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(g =>
      g.title.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q)
    );
  }
  if (limit) {
    result = result.slice(0, parseInt(limit));
  }

  res.json({
    total: result.length,
    categories: [...new Set(gameCatalog.map(g => g.category))].sort(),
    games: result,
  });
});

// GET /api/games/categories
router.get('/categories', (req, res) => {
  const cats = [...new Set(gameCatalog.map(g => g.category))].sort();
  res.json({ categories: cats });
});

// GET /api/games/:id
router.get('/:id', (req, res) => {
  const game = gameCatalog.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ message: 'Game not found' });
  res.json(game);
});

// GET /api/games/proxy/embed?url=...
// Proxies game pages from GameZipper, stripping ads/analytics server-side
router.get('/proxy/embed', async (req, res) => {
  const gameUrl = req.query.url;
  if (!gameUrl || !gameUrl.startsWith('https://gamezipper.com/')) {
    return res.status(400).json({ error: 'Only gamezipper.com URLs are supported' });
  }
  try {
    const resp = await fetch(gameUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LabCoop/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return res.status(502).json({ error: 'Failed to fetch game' });
    let html = await resp.text();
    const adPatterns = [
      /<script[^>]*src="[^"]*gz-analytics[^"]*"[^>]*><\/script>/gi,
      /<script[^>]*src="[^"]*monetag[^"]*"[^>]*><\/script>/gi,
      /<script[^>]*src="[^"]*adsbygoogle[^"]*"[^>]*><\/script>/gi,
      /<script[^>]*src="[^"]*googlesyndication[^"]*"[^>]*><\/script>/gi,
      /<script[^>]*src="[^"]*doubleclick[^"]*"[^>]*><\/script>/gi,
      /<script[^>]*src="[^"]*trycloudflare[^"]*"[^>]*><\/script>/gi,
      /<script[^>]*src="[^"]*adservice[^"]*"[^>]*><\/script>/gi,
      /<script[^>]*src="[^"]*googleadservices[^"]*"[^>]*><\/script>/gi,
      /<script[^>]*id="[^"]*monetag[^"]*"[^>]*>[\s\S]*?<\/script>/gi,
      /<script[^>]*data-name="[^"]*monetag[^"]*"[^>]*>[\s\S]*?<\/script>/gi,
      /<ins[^>]*class="[^"]*adsbygoogle[^"]*"[^>]*>[\s\S]*?<\/ins>/gi,
    ];
    for (const pattern of adPatterns) {
      html = html.replace(pattern, '');
    }
    // Remove inline monetag/adsbygoogle script blocks
    html = html.replace(/<script[^>]*>[\s\S]*?(?:monetag|adsbygoogle|googletag|doubleclick)[\s\S]*?<\/script>/gi, '');
    // Inject base tag so relative URLs resolve against the original game host
    const baseUrl = gameUrl.replace(/\/?$/, '/');
    html = html.replace('<head>', `<head><base href="${baseUrl}">`);
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Origin-Agent-Cluster');
    res.set('Content-Type', 'text/html');
    res.set('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
    res.send(html);
  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'Game load timed out' });
    res.status(502).json({ error: 'Failed to load game' });
  }
});

module.exports = router;
