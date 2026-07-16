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
    // Child or Parent: check JWT in auth handshake
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        if (decoded.parentId) {
          socket.data.role = 'parent';
          socket.data.parentId = decoded.parentId;
          return next();
        }
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

    // ── Send message (admin, child, or parent) ──
    socket.on('sendMessage', async (data) => {
      const { room, content, senderName } = data || {};
      if (!room || !content) return;
      if (!store?.query) return;
      try {
        const { v4: uuidv4 } = require('uuid');
        const messageId = uuidv4();
        const createdAt = new Date().toISOString();
        const isAdmin = role === 'admin';
        const isParent = role === 'parent';
        const isChild = role === 'child';
        const childName = data.childName || '';

        // Determine thread type
        const isParentRoom = room.startsWith('parent_chat_');
        const actualParentId = isParentRoom ? room.slice(12) : null;

        if (isParentRoom && actualParentId) {
          // Parent chat thread
          const parentName = senderName || 'Parent';
          await store.query(
            `INSERT INTO support_messages (message_id, account_id, parent_id, child_name, sender_type, sender_name, content, admin_read, parent_read, created_at)
             VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [messageId, actualParentId, parentName, isAdmin ? 'admin' : 'parent', senderName || 'Parent', content, isAdmin ? 1 : 0, isAdmin ? 0 : 1, createdAt]
          );
          const payload = {
            message_id: messageId, parent_id: actualParentId, child_name: parentName,
            sender_type: isAdmin ? 'admin' : 'parent', sender_name: senderName || (isAdmin ? 'Admin' : 'Parent'),
            content, admin_read: isAdmin ? 1 : 0, parent_read: isAdmin ? 0 : 1, created_at: createdAt,
          };
          io.to(room).emit('newMessage', payload);
          if (!isAdmin) {
            io.to('admin').emit('newMessage', payload);
          }
        } else {
          // Child chat thread
          const accountId = room.startsWith('chat_') ? room.slice(5) : null;
          if (!accountId) return;
          const actualAccountId = isAdmin ? accountId : (data.accountId || socket.data.accountId || accountId);

          await store.query(
            `INSERT INTO support_messages (message_id, account_id, child_name, sender_type, sender_name, content, admin_read, child_read, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [messageId, actualAccountId, childName, isAdmin ? 'admin' : 'child', senderName || (isAdmin ? 'Admin' : 'Child'), content, isAdmin ? 1 : 0, isAdmin ? 0 : 1, createdAt]
          );
          const payload = {
            message_id: messageId, account_id: actualAccountId, child_name: childName,
            sender_type: isAdmin ? 'admin' : 'child', sender_name: senderName || (isAdmin ? 'Admin' : 'Child'),
            content, admin_read: isAdmin ? 1 : 0, child_read: isAdmin ? 0 : 1, created_at: createdAt,
          };
          io.to(room).emit('newMessage', payload);
          if (!isAdmin) {
            io.to('admin').emit('newMessage', payload);
          }
        }
      } catch (_) {}
    });

    // ── Typing indicator (child and parent chats) ──
    socket.on('typing', (data) => {
      const { room, isTyping } = data || {};
      if (!room) return;
      const id = room.startsWith('parent_chat_') ? room.slice(12) : (room.startsWith('chat_') ? room.slice(5) : null);
      socket.to(room).emit('typingStatus', { room, accountId: id, isTyping, sender: role });
    });

    // ── Read receipt: admin marks messages as read (child or parent) ──
    socket.on('adminRead', async (data) => {
      const { room } = data || {};
      if (!room) return;
      if (role !== 'admin') return;
      if (!store?.query) return;
      try {
        if (room.startsWith('parent_chat_')) {
          const parentId = room.slice(12);
          if (!parentId) return;
          await store.query(
            "UPDATE support_messages SET admin_read = 1 WHERE parent_id = $1 AND sender_type = 'parent' AND admin_read = 0",
            [parentId]
          );
          io.to(room).emit('readReceipt', { room, readBy: 'admin' });
        } else {
          const accountId = room.startsWith('chat_') ? room.slice(5) : null;
          if (!accountId) return;
          await store.query(
            "UPDATE support_messages SET admin_read = 1 WHERE account_id = $1 AND sender_type = 'child' AND admin_read = 0",
            [accountId]
          );
          io.to(room).emit('readReceipt', { room, readBy: 'admin' });
        }
      } catch (_) {}
    });

    // ── Read receipt (child or parent marks admin messages as read) ──
    socket.on('messageRead', async (data) => {
      const { room } = data || {};
      if (!room) return;
      if (role !== 'child' && role !== 'parent') return;
      if (!store?.query) return;
      try {
        if (role === 'parent' && room.startsWith('parent_chat_')) {
          const parentId = room.slice(12);
          if (!parentId) return;
          await store.query(
            "UPDATE support_messages SET parent_read = 1 WHERE parent_id = $1 AND sender_type = 'admin' AND parent_read = 0",
            [parentId]
          );
          io.to(room).emit('readReceipt', { room, readBy: role });
        } else if (role === 'child' && room.startsWith('chat_')) {
          const accountId = room.slice(5);
          if (!accountId) return;
          await store.query(
            "UPDATE support_messages SET child_read = 1 WHERE account_id = $1 AND sender_type = 'admin' AND child_read = 0",
            [accountId]
          );
          io.to(room).emit('readReceipt', { room, readBy: 'child' });
        }
      } catch (_) {}
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() { return io; }

module.exports = { initSocket, getIO };
