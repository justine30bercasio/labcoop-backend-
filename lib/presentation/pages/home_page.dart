import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../core/services/inactivity_timer.dart';
import '../../core/services/location_service.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_event.dart';
import '../blocs/savings_state.dart';
import 'dashboard_page.dart';
import 'rewards_page.dart';
import 'profile_page.dart';
import 'play_page.dart';
import 'banking_page.dart';
import 'login_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with WidgetsBindingObserver {
  int _currentIndex = 0;
  String _accountId = '';
  bool _loading = true;
  InactivityTimer? _inactivityTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadSession();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      LocationService.pause();
    } else if (state == AppLifecycleState.resumed && _accountId.isNotEmpty) {
      LocationService.start(_accountId);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    LocationService.pause();
    _inactivityTimer?.dispose();
    super.dispose();
  }

  void _onSessionExpired() {
    if (!mounted) return;
    LocationService.disable();
    const FlutterSecureStorage().deleteAll();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Session expired. Please log in again.'),
        backgroundColor: Colors.red,
        duration: Duration(seconds: 4),
      ),
    );
  }

  Future<void> _loadSession() async {
    const storage = FlutterSecureStorage();
    final accountId = await storage.read(key: 'account_id');
    final token = await storage.read(key: 'auth_token');
    if (accountId == null || token == null) {
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const LoginPage()),
        );
      }
      return;
    }

    setState(() {
      _accountId = accountId;
      _loading = false;
    });

    _inactivityTimer = InactivityTimer(_onSessionExpired);
    LocationService.start(accountId);
    if (!mounted) return;
    context.read<SavingsBloc>().add(LoadSavings(accountId));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        backgroundColor: Theme.of(context).colorScheme.surface,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return BlocBuilder<SavingsBloc, SavingsState>(
      builder: (context, state) {
        final accountId = _accountId;

        final pages = [
          DashboardPage(accountId: accountId),
          if (state is SavingsLoaded)
            RewardsPage(
              currentXp: state.account.currentXp,
              lastGainedXp: state.lastXpGained,
              badges: state.badges,
              accountId: accountId,
            )
          else
            const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            ),
          const PlayPage(),
          BankingPage(accountId: accountId),
          const ProfilePage(),
        ];

        return Stack(
          children: [
            Scaffold(
              backgroundColor: Theme.of(context).colorScheme.surface,
              body: SafeArea(
                top: false,
                bottom: false,
                child: Column(
                  children: [
                    Expanded(
                      child: AnimatedSwitcher(
                        duration: AnimDurations.normal,
                        switchInCurve: Curves.easeInOutCubic,
                        switchOutCurve: Curves.easeInOutCubic,
                        child: KeyedSubtree(
                          key: ValueKey(_currentIndex),
                          child: IndexedStack(
                            index: _currentIndex,
                            children: pages,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              bottomNavigationBar: Container(
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.08),
                  blurRadius: 8,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: NavigationBar(
              selectedIndex: _currentIndex,
              onDestinationSelected: (i) {
                setState(() => _currentIndex = i);
                if (i == 0) {
                  context.read<SavingsBloc>().add(LoadSavings(_accountId));
                }
              },
              backgroundColor: Theme.of(context).colorScheme.surface,
              elevation: 0,
              indicatorColor: AppTheme.primaryGreen.withValues(alpha: 0.12),
              animationDuration: AnimDurations.fast,
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              height: MediaQuery.of(context).padding.bottom > 0 ? 72 : 64,
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home),
                  label: 'Dashboard',
                ),
                NavigationDestination(
                  icon: Icon(Icons.emoji_events_outlined),
                  selectedIcon: Icon(Icons.emoji_events),
                  label: 'Rewards',
                ),
                NavigationDestination(
                  icon: Icon(Icons.sports_esports_outlined),
                  selectedIcon: Icon(Icons.sports_esports),
                  label: 'Play',
                ),
                NavigationDestination(
                  icon: Icon(Icons.account_balance_outlined),
                  selectedIcon: Icon(Icons.account_balance),
                  label: 'Banking',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Profile',
                ),
              ],
            ),
          ),
        ),

      ],
    );
  },
);

}


}
