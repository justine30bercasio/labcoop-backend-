function publicBaseUrl() {
  const v = process.env.PUBLIC_BASE_URL || '';
  return v.replace(/\/+$/, '') || 'https://labcoop-backend.onrender.com';
}

function absoluteUrl(path) {
  const p = (path || '').startsWith('/') ? path : '/' + (path || '');
  return publicBaseUrl() + p;
}

module.exports = { publicBaseUrl, absoluteUrl };
