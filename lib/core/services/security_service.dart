import 'package:safe_device/safe_device.dart';

class SecurityService {
  static Future<bool> isDeviceCompromised() async {
    try {
      final isJailbroken = await SafeDevice.isJailBroken;
      final isRealDevice = await SafeDevice.isRealDevice;
      return isJailbroken || !isRealDevice;
    } catch (_) {
      return false;
    }
  }
}
