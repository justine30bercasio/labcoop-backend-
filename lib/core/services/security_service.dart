import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:safe_device/safe_device.dart';
import 'package:local_auth/local_auth.dart';

class SecurityService {
  static final LocalAuthentication _localAuth = LocalAuthentication();
  static const FlutterSecureStorage _secure = FlutterSecureStorage();

  static bool _biometricEnabled = false;
  static bool get biometricEnabled => _biometricEnabled;

  static Future<bool> isDeviceCompromised() async {
    try {
      final isJailbroken = await SafeDevice.isJailBroken;
      final isRealDevice = await SafeDevice.isRealDevice;
      return isJailbroken || !isRealDevice;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> canAuthenticate() async {
    try {
      return await _localAuth.canCheckBiometrics ||
          await _localAuth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  static Future<bool> authenticate({
    String reason = 'Authenticate to access LabCoop',
  }) async {
    try {
      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,
        ),
      );
    } catch (_) {
      return false;
    }
  }

  static Future<void> setBiometricEnabled(bool enabled) async {
    _biometricEnabled = enabled;
    await _secure.write(key: 'bio_lock_enabled', value: enabled ? 'true' : 'false');
  }

  static Future<void> init() async {
    _biometricEnabled = await _secure.read(key: 'bio_lock_enabled') == 'true';
  }

  // ---- Biometric Login (GCash-style) ----

  /// Whether biometric login is enabled.
  static Future<bool> isBioLoginEnabled() async {
    return await _secure.read(key: 'bio_login_enabled') == 'true';
  }

  /// Saved member ID for biometric login display.
  static Future<String?> getSavedUsername() async {
    return await _secure.read(key: 'bio_username');
  }

  static Future<void> setSavedUsername(String username) async {
    await _secure.write(key: 'bio_username', value: username);
  }

  /// Store password in secure storage (OS-level encrypted).
  static Future<void> saveBioPassword(String password) async {
    await _secure.write(key: 'bio_password', value: password);
  }

  static Future<String?> readBioPassword() async {
    return await _secure.read(key: 'bio_password');
  }

  /// Enable or disable biometric login.
  static Future<void> setBioLoginEnabled(bool enabled) async {
    await _secure.write(key: 'bio_login_enabled', value: enabled ? 'true' : 'false');
    if (!enabled) {
      await _secure.delete(key: 'bio_password');
      await _secure.delete(key: 'bio_username');
    }
  }
}
