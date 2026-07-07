import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../network/dio_client.dart';

class NotificationService {
  static final _firebaseMessaging = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();
  static final _dio = DioClient.create();
  static String? _currentToken;

  static Future<void> init() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidSettings, iOS: iosSettings),
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    NotificationSettings settings = await _firebaseMessaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      _currentToken = await _firebaseMessaging.getToken();
      await _registerToken();

      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationOpened);
      FirebaseMessaging.onBackgroundMessage(_handleBackgroundMessage);
    }
  }

  static Future<String?> getToken() async {
    _currentToken ??= await _firebaseMessaging.getToken();
    return _currentToken;
  }

  static Future<void> _registerToken() async {
    if (_currentToken == null) return;
    try {
      await _dio.post('/api/fcm/register', data: {
        'fcm_token': _currentToken,
        'device_platform': Platform.isIOS ? 'ios' : 'android',
      });
    } catch (_) {}
  }

  static Future<void> registerAfterLogin() async {
    _currentToken = await _firebaseMessaging.getToken();
    await _registerToken();
  }

  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final title = message.notification?.title ?? message.data['title'] ?? '';
    final body = message.notification?.body ?? message.data['body'] ?? '';
    if (title.isNotEmpty || body.isNotEmpty) {
      await showLocalNotification(title, body, message.data.cast<String, String>());
    }
  }

  static Future<void> _handleBackgroundMessage(RemoteMessage message) async {
    final title = message.notification?.title ?? message.data['title'] ?? '';
    final body = message.notification?.body ?? message.data['body'] ?? '';
    if (title.isNotEmpty || body.isNotEmpty) {
      await showLocalNotification(title, body, message.data.cast<String, String>());
    }
  }

  static void _onNotificationTap(NotificationResponse response) {}

  static Future<void> _handleNotificationOpened(RemoteMessage message) async {}

  static Future<void> showLocalNotification(String title, String body, [Map<String, String>? data]) async {
    const androidDetails = AndroidNotificationDetails(
      'labcoop_notifications',
      'LabCoop Notifications',
      channelDescription: 'Notifications from LabCoop',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );
    const iosDetails = DarwinNotificationDetails();
    const details = NotificationDetails(android: androidDetails, iOS: iosDetails);

    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      details,
      payload: data?.toString(),
    );
  }
}
