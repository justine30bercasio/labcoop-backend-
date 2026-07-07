import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../../firebase_options.dart';
import '../network/dio_client.dart';

/// Local notifications plugin instance for foreground use.
final FlutterLocalNotificationsPlugin _localNotifs = FlutterLocalNotificationsPlugin();

/// Top-level background message handler — MUST be a top-level function
/// (not a class method) for Firebase to invoke it in a separate isolate.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase must be re-initialized in the background isolate
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // Initialize local notifications in the background isolate
  const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
  const iosSettings = DarwinInitializationSettings();
  await _localNotifs.initialize(
    const InitializationSettings(android: androidSettings, iOS: iosSettings),
  );

  final title = message.notification?.title ?? message.data['title'] ?? '';
  final body = message.notification?.body ?? message.data['body'] ?? '';
  if (title.isNotEmpty || body.isNotEmpty) {
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
    await _localNotifs.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      details,
      payload: message.data.toString(),
    );
  }
}

class NotificationService {
  static final _firebaseMessaging = FirebaseMessaging.instance;
  static final _dio = DioClient.create();
  static String? _currentToken;

  static Future<void> init() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _localNotifs.initialize(
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
      stderr.writeln('[FCM] Token obtained: ${_currentToken?.substring(0, 20)}...');
      await _registerToken();

      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationOpened);
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    } else {
      stderr.writeln('[FCM] Notification permission denied');
    }
  }

  static Future<String?> getToken() async {
    _currentToken ??= await _firebaseMessaging.getToken();
    return _currentToken;
  }

  static Future<void> _registerToken() async {
    if (_currentToken == null) {
      stderr.writeln('[FCM] No token to register');
      return;
    }
    try {
      final resp = await _dio.post('/api/fcm/register', data: {
        'fcm_token': _currentToken,
        'device_platform': Platform.isIOS ? 'ios' : 'android',
      });
      stderr.writeln('[FCM] Token registered: ${resp.statusCode}');
    } catch (e) {
      stderr.writeln('[FCM] Token registration failed: $e');
    }
  }

  static Future<void> registerAfterLogin() async {
    _currentToken = await _firebaseMessaging.getToken();
    stderr.writeln('[FCM] Re-registering after login: ${_currentToken?.substring(0, 20)}...');
    await _registerToken();
  }

  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    stderr.writeln('[FCM] Foreground message: ${message.notification?.title}');
    final title = message.notification?.title ?? message.data['title'] ?? '';
    final body = message.notification?.body ?? message.data['body'] ?? '';
    if (title.isNotEmpty || body.isNotEmpty) {
      await showLocalNotification(title, body, message.data.cast<String, String>());
    }
  }

  static void _onNotificationTap(NotificationResponse response) {}

  static Future<void> _handleNotificationOpened(RemoteMessage message) async {
    stderr.writeln('[FCM] Opened from notification: ${message.notification?.title}');
  }

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

    await _localNotifs.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      details,
      payload: data?.toString(),
    );
    stderr.writeln('[FCM] Local notification shown: $title');
  }
}
