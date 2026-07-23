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
    debugPrint('Firebase init failed — $e');
  }

  runApp(const LabCoopApp());
}

class LabCoopApp extends StatefulWidget {
  const LabCoopApp({super.key});

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
    const home = SplashPage();

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


