import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/app_constants.dart';

class SocketService {
  static IO.Socket? _socket;
  static bool _initialized = false;
  static String? _currentRoom;

  static IO.Socket? get socket => _socket;
  static bool get isConnected => _socket?.connected ?? false;

  /// Resolves when socket handshake completes
  static Future<void> get onConnected async {
    if (isConnected) return;
    final completer = Completer<void>();
    final timer = Timer(const Duration(seconds: 8), () {
      if (!completer.isCompleted) completer.complete();
    });
    _socket?.onConnect((_) {
      if (!completer.isCompleted) completer.complete();
    });
    if (isConnected && !completer.isCompleted) {
      timer.cancel();
      completer.complete();
    }
    await completer.future;
    timer.cancel();
  }

  static Future<void> init({bool force = false, bool isParent = false}) async {
    if (_initialized && !force) return;
    final storage = FlutterSecureStorage();
    final token = isParent
        ? (await storage.read(key: 'parent_token') ?? await storage.read(key: 'auth_token') ?? '')
        : (await storage.read(key: 'auth_token') ?? await storage.read(key: 'parent_token') ?? '');
    if (_initialized && _socket?.id != null) {
      if (!force) return;
      _socket?.disconnect();
      _socket?.dispose();
    }
    _initialized = true;

    _socket = IO.io(AppConstants.baseUrl, <String, dynamic>{
      'transports': ['websocket', 'polling'],
      'auth': {'token': token},
    });

    _socket!.onConnect((_) {});
    _socket!.onDisconnect((_) {});
    _socket!.onError((err) {});

    // Reconnect: re-join room
    _socket!.io.on('reconnect', (_) {
      if (_currentRoom != null) {
        _socket?.emit('joinRoom', _currentRoom);
      }
    });
  }

  static Future<void> joinRoom(String room) async {
    _currentRoom = room;
    await onConnected;
    _socket?.emit('joinRoom', room);
  }

  static void sendMessage(String accountId, String content, {String? senderName, String? childName}) {
    _socket?.emit('sendMessage', {
      'room': 'chat_$accountId',
      'content': content,
      'senderName': senderName,
      'accountId': accountId,
      'childName': childName ?? '',
    });
  }

  static void sendParentMessage(String parentId, String content, {String? senderName}) {
    _socket?.emit('sendMessage', {
      'room': 'parent_chat_$parentId',
      'content': content,
      'senderName': senderName ?? 'Parent',
      'parentId': parentId,
    });
  }

  static void sendTyping(String room, bool isTyping) {
    _socket?.emit('typing', {
      'room': room,
      'isTyping': isTyping,
    });
  }

  static Future<void> markRead(String room) async {
    await onConnected;
    _socket?.emit('messageRead', {'room': room});
  }

  static void onNewMessage(void Function(dynamic data) callback) {
    _socket?.on('newMessage', callback);
    // Also listen on old event name for safety
    _socket?.on('new_message', callback);
  }

  static void offNewMessage() {
    _socket?.off('newMessage');
    _socket?.off('new_message');
  }

  static void onTypingStatus(void Function(dynamic data) callback) {
    _socket?.on('typingStatus', callback);
    _socket?.on('typing_status', callback);
  }

  static void offTypingStatus() {
    _socket?.off('typingStatus');
    _socket?.off('typing_status');
  }

  static void onReadReceipt(void Function(dynamic data) callback) {
    _socket?.on('readReceipt', callback);
  }

  static void offReadReceipt() {
    _socket?.off('readReceipt');
  }

  static void dispose() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _initialized = false;
    _currentRoom = null;
  }
}
