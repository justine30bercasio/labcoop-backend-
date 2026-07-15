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
    // Admin: check session (all admin routes use adminId)
    if (req.session?.adminId) {
      socket.data.role = 'admin';
      socket.data.userId = req.session.adminId;
      socket.data.name = req.session.adminName || 'Admin';
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

    // Admin joins global room for messenger badge
    if (role === 'admin') {
      socket.join('admin');
    }

    // ── Join a chat room ──
    socket.on('joinRoom', (room) => {
      if (!room || typeof room !== 'string') return;
      socket.join(room);
    });

    // ── Leave a chat room ──
    socket.on('leaveRoom', (room) => {
      if (!room) return;
      socket.leave(room);
    });

    // ── Send message (both admin and child) ──
    socket.on('sendMessage', async (data) => {
      const { room, content, senderName } = data || {};
      if (!room || !content) return;
      // Extract accountId from room name "chat_<accountId>"
      const accountId = room.startsWith('chat_') ? room.slice(5) : null;
      if (!accountId) return;
      if (!store?.query) return;
      try {
        const { v4: uuidv4 } = require('uuid');
        const messageId = uuidv4();
        const createdAt = new Date().toISOString();
        const isAdmin = role === 'admin';

        // Flutter sends accountId in the payload for child messages
        const actualAccountId = isAdmin ? accountId : (data.accountId || socket.data.accountId || accountId);
        const childName = data.childName || '';

        await store.query(
          `INSERT INTO support_messages (message_id, account_id, child_name, sender_type, sender_name, content, admin_read, child_read, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [messageId, actualAccountId, childName, isAdmin ? 'admin' : 'child', senderName || (isAdmin ? 'Admin' : 'Child'), content, isAdmin ? 1 : 0, isAdmin ? 0 : 1, createdAt]
        );

        const payload = {
          message_id: messageId,
          account_id: actualAccountId,
          sender_type: isAdmin ? 'admin' : 'child',
          sender_name: senderName || (isAdmin ? 'Admin' : 'Child'),
          content,
          admin_read: isAdmin ? 1 : 0,
          child_read: isAdmin ? 0 : 1,
          created_at: createdAt,
        };

        // Broadcast to the entire room (including sender for echo)
        io.to(room).emit('newMessage', payload);
        // Also emit to admin room for badge updates
        if (role === 'child') {
          io.to('admin').emit('newMessage', payload);
        }
      } catch (_) {}
    });

    // ── Typing indicator ──
    socket.on('typing', (data) => {
      const { room, isTyping } = data || {};
      if (!room) return;
      const accountId = room.startsWith('chat_') ? room.slice(5) : null;
      // Relay to everyone in the room except sender
      socket.to(room).emit('typingStatus', { room, accountId, isTyping, sender: role });
    });

    // ── Read receipt (child marks admin messages as read) ──
    socket.on('messageRead', async (data) => {
      const { room } = data || {};
      if (!room) return;
      if (role !== 'child') return;
      if (!store?.query) return;
      const accountId = room.startsWith('chat_') ? room.slice(5) : null;
      if (!accountId) return;
      try {
        await store.query(
          "UPDATE support_messages SET child_read = 1 WHERE account_id = $1 AND sender_type = 'admin' AND child_read = 0",
          [accountId]
        );
        io.to(room).emit('readReceipt', { room, readBy: 'child' });
      } catch (_) {}
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() { return io; }

module.exports = { initSocket, getIO };
