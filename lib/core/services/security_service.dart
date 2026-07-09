import 'package:safe_device/safe_device.dart';

class SecurityService {
  static Future<bool> isDeviceCompromised() async {
    // TODO(security): Re-enable root/jailbreak detection before production launch
    // try {
    //   final isJailbroken = await SafeDevice.isJailBroken;
    //   final isRealDevice = await SafeDevice.isRealDevice;
    //   return isJailbroken || !isRealDevice;
    // } catch (_) {
    //   return false;
    // }
    return false;
  }
}
