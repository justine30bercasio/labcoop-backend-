import 'dart:async';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import '../network/banking_api_service.dart';

/// Handles the user's opt-in "Live Location" sharing.
///
/// Privacy model (COPPA-friendly):
///  - Sharing is OFF by default.
///  - User enables it from Settings → Live Location (a one-time consent prompt).
///  - Location is only fetched & reported while the app is in the foreground.
///  - Turning it off (or logging out) removes the position from the live map.
class LocationService {
  static const _prefsKey = 'live_location_enabled';
  static const _storage = FlutterSecureStorage();

  static Timer? _heartbeat;
  static bool _reporting = false;

  static Future<bool> isEnabled() async {
    try {
      return await _storage.read(key: _prefsKey) == 'true';
    } catch (_) {
      return false;
    }
  }

  /// Request permission + set the opt-in flag. Returns whether sharing is active.
  static Future<bool> enable(String accountId) async {
    final granted = await _requestPermission();
    if (!granted) return false;
    await _storage.write(key: _prefsKey, value: 'true');
    await start(accountId);
    return true;
  }

  /// Turn sharing off — removes position from the live map immediately.
  static Future<void> disable() async {
    await _storage.delete(key: _prefsKey);
    await _stopAndClear();
  }

  /// Start reporting location every 60s while app is foreground.
  static Future<void> start(String accountId) async {
    if (!await isEnabled()) return;
    _reporting = true;
    await _reportNow();
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(const Duration(seconds: 60), (_) => _reportNow());
  }

  /// Stop heartbeat (e.g., app going to background) but keep the opt-in flag.
  static void pause() {
    _heartbeat?.cancel();
    _heartbeat = null;
    _reporting = false;
  }

  /// Stop heartbeat and delete the server-side position (logout / toggle off).
  static Future<void> _stopAndClear() async {
    _heartbeat?.cancel();
    _heartbeat = null;
    _reporting = false;
    try {
      await BankingApiService.clearLocation();
    } catch (_) {}
  }

  static Future<bool> _requestPermission() async {
    try {
      var serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return false;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> _reportNow() async {
    if (!_reporting) return;
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (!_reporting) return;
      await BankingApiService.reportLocation(
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
      );
    } catch (_) {
      // Silent — next heartbeat will retry.
    }
  }
}
