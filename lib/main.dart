import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'core/di/injection.dart' as di;
import 'core/theme/app_theme.dart';
import 'presentation/blocs/savings_bloc.dart';
import 'presentation/blocs/goal_bloc.dart';
import 'presentation/blocs/banking_bloc.dart';
import 'presentation/blocs/loan_bloc.dart';
import 'presentation/pages/splash_page.dart';
import 'core/services/notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await di.initDependencies();
  try {
    await Firebase.initializeApp();
    await NotificationService.init();
  } catch (e) {
    debugPrint('Firebase init skipped: $e');
  }
  runApp(const LabCoopApp());
}

class LabCoopApp extends StatelessWidget {
  const LabCoopApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<SavingsBloc>(create: (_) => di.sl<SavingsBloc>()),
        BlocProvider<GoalBloc>(create: (_) => di.sl<GoalBloc>()),
        BlocProvider<BankingBloc>(create: (_) => di.sl<BankingBloc>()),
        BlocProvider<LoanBloc>(create: (_) => di.sl<LoanBloc>()),
      ],
      child: MaterialApp(
        title: 'LabCoop',
        theme: AppTheme.lightTheme,
        debugShowCheckedModeBanner: false,
        home: const SplashPage(),
      ),
    );
  }
}
