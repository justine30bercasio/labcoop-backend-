import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/app_constants.dart';

class SocketService {
  static IO.Socket? _socket;
  static bool _initialized = false;

  static IO.Socket? get socket => _socket;
  static bool get isConnected => _socket?.connected ?? false;

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    final storage = FlutterSecureStorage();
    final token = await storage.read(key: 'auth_token') ?? '';

    _socket = IO.io(AppConstants.baseUrl, <String, dynamic>{
      'transports': ['websocket', 'polling'],
      'auth': {'token': token},
    });

    _socket!.onConnect((_) {});
    _socket!.onDisconnect((_) {});
    _socket!.onError((err) {});
  }

  static void joinAccount(String accountId) {
    _socket?.emit('join_account', accountId);
  }

  static void sendMessage(String accountId, String content) {
    _socket?.emit('child_message', {
      'accountId': accountId,
      'content': content,
    });
  }

  static void sendTyping(String accountId, bool isTyping) {
    _socket?.emit('typing', {
      'accountId': accountId,
      'isTyping': isTyping,
    });
  }

  static void markRead(String accountId) {
    _socket?.emit('mark_read', {'accountId': accountId});
  }

  static void onNewMessage(void Function(dynamic data) callback) {
    _socket?.on('new_message', callback);
  }

  static void offNewMessage() {
    _socket?.off('new_message');
  }

  static void onTypingStatus(void Function(dynamic data) callback) {
    _socket?.on('typing_status', callback);
  }

  static void offTypingStatus() {
    _socket?.off('typing_status');
  }

  static void dispose() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _initialized = false;
  }
}
