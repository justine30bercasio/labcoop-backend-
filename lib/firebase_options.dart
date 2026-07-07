import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return android;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for macos - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.windows:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for windows - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDLU6UDv8eZy-j2ZZvXOg1AdC-6Dwzl0uE',
    appId: '1:977618316551:android:5aee77f19f7b88808629a2',
    messagingSenderId: '977618316551',
    projectId: 'mycooppiggy',
    storageBucket: 'mycooppiggy.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyDLU6UDv8eZy-j2ZZvXOg1AdC-6Dwzl0uE',
    appId: '1:977618316551:android:5aee77f19f7b88808629a2',
    messagingSenderId: '977618316551',
    projectId: 'mycooppiggy',
    storageBucket: 'mycooppiggy.firebasestorage.app',
    iosBundleId: 'com.labcoop',
  );
}
