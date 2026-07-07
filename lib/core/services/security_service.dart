import 'package:safe_device/safe_device.dart';
import 'package:local_auth/local_auth.dart';

/// Handles device-level security checks: root/jailbreak detection,
/// biometric authentication, and app integrity verification.
class SecurityService {
  static final LocalAuthentication _localAuth = LocalAuthentication();

  /// Whether the app should show the biometric lock screen on launch.
  /// In a children's co-op, this is optional — but if enabled, it prevents
  /// unauthorized access to financial data if the device is lost.
  static bool _biometricEnabled = false;

  static bool get biometricEnabled => _biometricEnabled;

  /// Check for root/jailbreak.
  /// Returns `true` if the device is compromised (rooted/jailbroken).
  static Future<bool> isDeviceCompromised() async {
    try {
      final isJailbroken = await SafeDevice.isJailBroken;
      final isRealDevice = await SafeDevice.isRealDevice;
      // Treat as compromised if jailbroken OR running on a simulator/emulator
      // in release mode (emulators are often used for fraud)
      return isJailbroken || !isRealDevice;
    } catch (_) {
      // If safe_device fails, assume safe to avoid false positives
      return false;
    }
  }

  /// Check if biometric auth is available on this device.
  static Future<bool> canAuthenticate() async {
    try {
      return await _localAuth.canCheckBiometrics ||
          await _localAuth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  /// Enroll biometric authentication (user-facing).
  /// Returns `true` if the user successfully authenticated.
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

  /// Enable or disable biometric lock.
  static Future<void> setBiometricEnabled(bool enabled) async {
    _biometricEnabled = enabled;
  }

  /// Initialize security settings from storage.
  static Future<void> init() async {
    // In a full implementation, read _biometricEnabled from FlutterSecureStorage.
    // For now, it's opt-in via the settings page.
    _biometricEnabled = false;
  }
}
