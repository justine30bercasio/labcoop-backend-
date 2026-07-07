import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
import 'core/di/injection.dart' as di;
import 'core/theme/app_theme.dart';
import 'core/network/dio_client.dart';
import 'core/services/inactivity_timer.dart';
import 'core/services/security_service.dart';
import 'presentation/blocs/savings_bloc.dart';
import 'presentation/blocs/goal_bloc.dart';
import 'presentation/blocs/banking_bloc.dart';
import 'presentation/blocs/loan_bloc.dart';
import 'presentation/pages/splash_page.dart';
import 'presentation/pages/login_page.dart';
import 'presentation/pages/biometric_lock_page.dart';
import 'core/services/notification_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';
import 'dart:typed_data';

Future<Uint8List> _getEncryptionKey() async {
  const storage = FlutterSecureStorage();
  final stored = await storage.read(key: 'encryption_key');
  if (stored != null && stored.isNotEmpty) {
    return base64Decode(stored);
  }
  final newKey = Hive.generateSecureKey();
  await storage.write(key: 'encryption_key', value: base64Encode(newKey));
  return Uint8List.fromList(newKey);
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  final key = await _getEncryptionKey();
  await Hive.openBox('app_settings', encryptionCipher: HiveAesCipher(key));
  await di.initDependencies();
  await SecurityService.init();
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    await NotificationService.init();
  } catch (e) {
    stderr.writeln('FATAL: Firebase init failed — $e');
    // App still works without push notifications
  }

  // Root/jailbreak detection — warn user on compromised devices
  final isCompromised = await SecurityService.isDeviceCompromised();
  if (isCompromised && !kDebugMode) {
    runApp(const LabCoopApp(initialPage: _AppStartupPage.compromised));
    return;
  }

  // Biometric lock — if enabled, show lock page before main app
  final bioAvailable = await SecurityService.canAuthenticate();
  if (SecurityService.biometricEnabled && bioAvailable) {
    runApp(const LabCoopApp(initialPage: _AppStartupPage.biometricLock));
    return;
  }

  runApp(const LabCoopApp());
}

enum _AppStartupPage { normal, compromised, biometricLock }

class LabCoopApp extends StatefulWidget {
  final _AppStartupPage initialPage;
  const LabCoopApp({super.key, this.initialPage = _AppStartupPage.normal});

  @override
  State<LabCoopApp> createState() => _LabCoopAppState();
}

class _LabCoopAppState extends State<LabCoopApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    DioClient.onSessionExpired = () {
      _navigatorKey.currentState?.pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginPage()),
        (route) => false,
      );
      ScaffoldMessenger.of(_navigatorKey.currentState!.context).showSnackBar(
        const SnackBar(
          content: Text('Session expired. Please log in again.'),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 4),
        ),
      );
    };
  }

  @override
  Widget build(BuildContext context) {
    Widget home;
    switch (widget.initialPage) {
      case _AppStartupPage.compromised:
        home = const _CompromisedDevicePage();
        break;
      case _AppStartupPage.biometricLock:
        home = const BiometricLockPage();
        break;
      case _AppStartupPage.normal:
      default:
        home = const SplashPage();
        break;
    }

    return MultiBlocProvider(
      providers: [
        BlocProvider<SavingsBloc>(create: (_) => di.sl<SavingsBloc>()),
        BlocProvider<GoalBloc>(create: (_) => di.sl<GoalBloc>()),
        BlocProvider<BankingBloc>(create: (_) => di.sl<BankingBloc>()),
        BlocProvider<LoanBloc>(create: (_) => di.sl<LoanBloc>()),
      ],
      child: MaterialApp(
        navigatorKey: _navigatorKey,
        title: 'LabCoop',
        theme: AppTheme.lightTheme,
        debugShowCheckedModeBanner: false,
        home: home,
        builder: (context, child) {
          return Listener(
            onPointerDown: (_) => InactivityTimer.recordActivity(),
            behavior: HitTestBehavior.translucent,
            child: child!,
          );
        },
      ),
    );
  }
}

/// Shown when the device is rooted/jailbroken — blocks access to financial data.
class _CompromisedDevicePage extends StatelessWidget {
  const _CompromisedDevicePage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A2E),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.security, color: Colors.redAccent, size: 72),
              const SizedBox(height: 24),
              Text(
                'Unsecure Device Detected',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 16),
              Text(
                'LabCoop has detected that this device has been modified '
                '(rooted/jailbroken). For the security of your financial data, '
                'this app cannot run on modified devices.\n\n'
                'Please use an unmodified device to access LabCoop.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.white70,
                      height: 1.5,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
