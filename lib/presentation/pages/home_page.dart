import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/services/inactivity_timer.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_event.dart';
import '../blocs/savings_state.dart';
import 'dashboard_page.dart';
import 'rewards_page.dart';
import 'profile_page.dart';
import 'coop_page.dart';
import 'transfer_page.dart';
import 'play_page.dart';
import 'banking_page.dart';
import 'login_page.dart';
import 'support_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _currentIndex = 0;
  String _accountId = '';
  bool _loading = true;
  int _unreadMessages = 0;
  Timer? _msgPollTimer;
  InactivityTimer? _inactivityTimer;

  @override
  void initState() {
    super.initState();
    _loadSession();
  }

  void _startMsgPolling() {
    _msgPollTimer?.cancel();
    _fetchUnreadMsgs();
    _msgPollTimer = Timer.periodic(const Duration(seconds: 12), (_) => _fetchUnreadMsgs());
  }

  Future<void> _fetchUnreadMsgs() async {
    if (_accountId.isEmpty) return;
    final count = await BankingApiService.getMessageUnreadCount(_accountId);
    if (mounted) setState(() => _unreadMessages = count);
  }

  @override
  void dispose() {
    _msgPollTimer?.cancel();
    _inactivityTimer?.dispose();
    super.dispose();
  }

  void _onSessionExpired() {
    if (!mounted) return;
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
    _startMsgPolling();
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
        final childName = state is SavingsLoaded ? state.account.childName : '';

        final pages = [
          DashboardPage(accountId: accountId),
          if (state is SavingsLoaded)
            RewardsPage(
              currentXp: state.account.currentXp,
              lastGainedXp: state.lastXpGained,
              badges: state.badges,
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
          drawer: _buildDrawer(state),
        ),

        // Floating chat bubble
        Positioned(
          right: 16,
          bottom: MediaQuery.of(context).padding.bottom + 80,
          child: AnimatedScale(
            scale: 1.0,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutBack,
            child: GestureDetector(
              onTap: () {
                Navigator.push(
                  context,
                  PageTransition.slideUp(SupportPage(
                    accountId: _accountId,
                    childName: childName,
                  )),
                ).then((_) => _fetchUnreadMsgs());
              },
              child: Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF0284c7), Color(0xFF0369a1)],
                  ),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF0284c7).withValues(alpha: 0.4),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    const Center(child: Icon(Icons.chat_bubble_outline, color: Colors.white, size: 24)),
                    if (_unreadMessages > 0)
                      Positioned(
                        top: -4,
                        right: -4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: const BoxDecoration(
                            color: Color(0xFFef4444),
                            borderRadius: BorderRadius.all(Radius.circular(10)),
                          ),
                          constraints: const BoxConstraints(minWidth: 20, minHeight: 16),
                          child: Text(
                            _unreadMessages > 99 ? '99+' : '$_unreadMessages',
                            style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  },
);

}

  Widget _buildDrawer(SavingsState state) {
    return Drawer(
      width: min(320, MediaQuery.of(context).size.width * 0.75),
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppTheme.primaryGreen, Color(0xFF1B5E20)],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const Icon(Icons.account_balance, color: Colors.white, size: 40),
                const SizedBox(height: 8),
                Text(
                  state is SavingsLoaded ? state.account.childName : 'LabCoop',
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  state is SavingsLoaded ? '₱${state.account.actualBalance.toStringAsFixed(2)}' : 'Loading...',
                  style: const TextStyle(color: Colors.white70, fontSize: 14),
                ),
              ],
            ),
          ),
          ListTile(
            leading: const Icon(Icons.account_balance),
            title: const Text('Microbanking'),
            horizontalTitleGap: 8,
            selected: true,
            onTap: () {
              Navigator.pop(context);
              setState(() => _currentIndex = 3);
            },
          ),
          ListTile(
            leading: const Icon(Icons.groups),
            title: const Text('Co-op Goals'),
            horizontalTitleGap: 8,
            onTap: () {
              Navigator.pop(context);
              Navigator.push(context, PageTransition.slideUp(const CoopPage()));
            },
          ),
          ListTile(
            leading: const Icon(Icons.swap_horiz),
            title: const Text('Transfer'),
            horizontalTitleGap: 8,
            onTap: () {
              Navigator.pop(context);
              Navigator.push(context, PageTransition.slideUp(const TransferPage()));
            },
          ),
          const Divider(indent: 16, endIndent: 16),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('About LabCoop'),
            horizontalTitleGap: 8,
            onTap: () {
              Navigator.pop(context);
              showAboutDialog(
                context: context,
                applicationName: 'LabCoop',
                applicationVersion: '1.0.0',
                children: [
                  const Text('Gamified Cooperative Passbook for children — save, earn, and learn!'),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
