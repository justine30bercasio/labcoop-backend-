const { Server } = require('socket.io');
const { store } = require('../db');

let io = null;

function initSocket(httpServer, sessionMiddleware) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  // Wrap session middleware for socket handshake
  const wrap = (mw) => (socket, next) => mw(socket.request, {}, next);
  io.use(wrap(sessionMiddleware));

  io.use((socket, next) => {
    const req = socket.request;
    // Admin: check session
    if (req.session?.userId) {
      socket.data.role = 'admin';
      socket.data.userId = req.session.userId;
      return next();
    }
    // Child: check JWT in auth handshake
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        socket.data.role = 'child';
        socket.data.accountId = decoded.accountId || decoded.id;
        return next();
      } catch (_) {}
    }
    next(new Error('Authentication required'));
  });

  io.on('connection', (socket) => {
    const role = socket.data.role;
    const accountId = socket.data.accountId;

    // Join account room (child) or admin global room
    if (role === 'child' && accountId) {
      socket.join('account:' + accountId);
    } else if (role === 'admin') {
      socket.join('admin');
    }

    // ── Join specific account room (admin opens a conversation) ──
    socket.on('join_account', (accId) => {
      if (role === 'admin' && accId) {
        socket.join('account:' + accId);
      }
    });

    // ── Admin sends reply (just relay — HTTP POST does the DB save + socket emit) ──
    socket.on('admin_message', (data) => {
      if (role !== 'admin') return;
      const { accountId, content } = data;
      if (!accountId || !content) return;
      io.to('account:' + accountId).emit('new_message', {
        account_id: accountId,
        sender_type: 'admin',
        sender_name: 'Admin',
        content,
        admin_read: 1,
        child_read: 0,
        created_at: new Date().toISOString(),
      });
    });

    // ── Child sends message ──
    socket.on('child_message', async (data) => {
      if (role !== 'child') return;
      const { content, senderName } = data;
      if (!content) return;
      if (!store?.query) return;
      try {
        const { v4: uuidv4 } = require('uuid');
        const messageId = uuidv4();
        const createdAt = new Date().toISOString();
        await store.query(
          `INSERT INTO support_messages (message_id, account_id, sender_type, sender_name, content, admin_read, child_read, created_at)
           VALUES ($1, $2, 'child', $3, $4, 0, 1, $5)`,
          [messageId, accountId, senderName || 'Child', content, createdAt]
        );
        const payload = {
          message_id: messageId,
          account_id: accountId,
          sender_type: 'child',
          sender_name: senderName || 'Child',
          content,
          admin_read: 0,
          child_read: 1,
          created_at: createdAt,
        };
        io.to('admin').emit('new_message', payload);
        io.to('account:' + accountId).emit('new_message', payload);
      } catch (_) {}
    });

    // ── Typing indicator ──
    socket.on('typing', (data) => {
      const { accountId, isTyping } = data;
      if (role === 'child' && accountId) {
        io.to('admin').emit('typing_status', { accountId, isTyping, sender: 'child' });
      } else if (role === 'admin' && accountId) {
        io.to('account:' + accountId).emit('typing_status', { accountId, isTyping, sender: 'admin' });
      }
    });

    // ── Read receipt (child reads admin message) ──
    socket.on('mark_read', async (data) => {
      const { accountId } = data;
      if (role !== 'child') return;
      if (!store?.query) return;
      try {
        await store.query(
          `UPDATE support_messages SET child_read = 1 WHERE account_id = $1 AND sender_type = 'admin' AND child_read = 0`,
          [accountId]
        );
        io.to('admin').emit('read_receipt', { accountId, readBy: 'child' });
      } catch (_) {}
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() { return io; }

module.exports = { initSocket, getIO };
