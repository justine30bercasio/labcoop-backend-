const jwt = require('jsonwebtoken');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.accountId = decoded.accountId;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function adminAuthMiddleware(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(403).json({ message: 'Admin access not configured (set ADMIN_TOKEN)' });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }
  const token = authHeader.split(' ')[1];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ message: 'Invalid admin token' });
  }
  next();
}

module.exports = { authMiddleware, adminAuthMiddleware };
