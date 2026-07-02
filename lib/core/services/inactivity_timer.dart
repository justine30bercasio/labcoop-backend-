import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class InactivityTimer with WidgetsBindingObserver {
  static const _inactivityKey = 'last_active_timestamp';
  static const _timeout = Duration(hours: 1);
  static final _secureStorage = FlutterSecureStorage();

  final VoidCallback _onExpired;

  InactivityTimer(this._onExpired) {
    WidgetsBinding.instance.addObserver(this);
  }

  static Future<void> recordActivity() async {
    await _secureStorage.write(
      key: _inactivityKey,
      value: DateTime.now().toIso8601String(),
    );
  }

  static Future<void> clear() async {
    await _secureStorage.delete(key: _inactivityKey);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkInactivity();
    }
  }

  Future<void> _checkInactivity() async {
    final stored = await _secureStorage.read(key: _inactivityKey);
    if (stored == null) return;

    final lastActive = DateTime.tryParse(stored);
    if (lastActive == null) return;

    if (DateTime.now().difference(lastActive) > _timeout) {
      await clear();
      await FlutterSecureStorage().deleteAll();
      _onExpired();
    }
  }

  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
  }
}
