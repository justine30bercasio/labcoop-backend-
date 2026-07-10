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

function requireOwnership(req, res, next) {
  const requestedId = req.params.accountId || req.query.account_id;
  if (requestedId && req.accountId !== requestedId) {
    return res.status(403).json({ message: 'Forbidden: you can only access your own account' });
  }
  next();
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

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.adminRole) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!roles.includes(req.session.adminRole)) {
      return res.status(403).json({ message: `Requires one of roles: ${roles.join(', ')}` });
    }
    next();
  };
}

function requireConsent(req, res, next) {
  const { store } = require('../db');
  store.getAccount(req.accountId).then(account => {
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }
    const status = account.consent_status || 'none';
    if (status === 'none') {
      return res.status(403).json({
        message: 'Parental consent required. Please submit a consent request with a parent email.',
        consent_status: status,
        consentRequired: true,
      });
    }
    if (status === 'pending') {
      return res.status(403).json({
        message: 'Parental consent still pending approval. Please ask your parent to check their email.',
        consent_status: status,
        consentRequired: true,
      });
    }
    if (status === 'rejected') {
      return res.status(403).json({
        message: 'Parental consent was rejected. Please contact support.',
        consent_status: status,
        consentRequired: true,
      });
    }
    next();
  }).catch(err => {
    console.error('requireConsent error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  });
}

module.exports = { authMiddleware, adminAuthMiddleware, requireOwnership, requireRole, requireConsent };
