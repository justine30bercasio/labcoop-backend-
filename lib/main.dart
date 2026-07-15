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
import 'core/services/notification_service.dart';
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  // app_settings only stores non-sensitive flags (terms_accepted).
  // No encryption to avoid key-loss issues on clearAll.
  if (Hive.isBoxOpen('app_settings')) await Hive.box('app_settings').close();
  try {
    await Hive.openBox('app_settings');
  } catch (_) {
    // Previously encrypted box with a now-lost key — delete and recreate
    await Hive.deleteBoxFromDisk('app_settings');
    await Hive.openBox('app_settings');
  }
  await di.initDependencies();
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

  runApp(const LabCoopApp());
}

enum _AppStartupPage { normal, compromised }

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
    final home = widget.initialPage == _AppStartupPage.compromised
        ? const _CompromisedDevicePage() as Widget
        : const SplashPage() as Widget;

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
        darkTheme: AppTheme.darkTheme,
        themeMode: ThemeMode.system,
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
