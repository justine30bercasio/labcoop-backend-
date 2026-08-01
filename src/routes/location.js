const express = require('express');
const rateLimit = require('express-rate-limit');
const { store } = require('../db');
const { asyncHandler } = require('../async-handler');

const router = express.Router();

// Kids app reports its location periodically — 30 req / 10 min is generous for a foreground heartbeat
const locationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { message: 'Too many location updates. Slow down and try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function isValidLatLng(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// POST /api/location — child app upserts its current position
router.post('/', locationLimiter, asyncHandler(async (req, res) => {
  const accountId = req.accountId;
  const { lat, lng, accuracy, devicePlatform } = req.body || {};
  if (!isValidLatLng(lat, lng)) {
    return res.status(400).json({ message: 'Invalid lat/lng coordinates' });
  }
  await store.upsertUserLocation({
    accountId,
    lat,
    lng,
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    devicePlatform: typeof devicePlatform === 'string' ? devicePlatform.slice(0, 40) : '',
  });

  // Broadcast to admins in real time
  try {
    const { getIO } = require('../services/socket');
    const io = getIO();
    if (io) {
      io.to('admin').emit('liveLocation', {
        account_id: accountId,
        lat,
        lng,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
        is_online: 1,
        last_seen: new Date().toISOString(),
      });
    }
  } catch (_) {}

  res.json({ ok: true });
}));

// DELETE /api/location — mark offline on logout. The pin STAYS on the map
// (turned red) so admins can see where the user last was.
router.delete('/', asyncHandler(async (req, res) => {
  await store.markUserLocationOffline(req.accountId);
  try {
    const { getIO } = require('../services/socket');
    const io = getIO();
    if (io) {
      const now = new Date().toISOString();
      io.to('admin').emit('liveLocationOffline', {
        account_id: req.accountId,
        is_online: 0,
        last_seen: now,
      });
    }
  } catch (_) {}
  res.json({ ok: true });
}));

// POST /api/location/purge — hard-delete the pin (privacy: remove my location).
router.post('/purge', asyncHandler(async (req, res) => {
  await store.clearUserLocation(req.accountId);
  try {
    const { getIO } = require('../services/socket');
    const io = getIO();
    if (io) io.to('admin').emit('liveLocationPurge', { account_id: req.accountId });
  } catch (_) {}
  res.json({ ok: true });
}));

module.exports = router;
