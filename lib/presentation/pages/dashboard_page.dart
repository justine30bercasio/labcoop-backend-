import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../domain/entities/goal_jar.dart';
import '../../domain/entities/savings_account.dart';
import '../../domain/entities/badge.dart' as entities;
import '../blocs/savings_bloc.dart';
import '../blocs/savings_event.dart';
import '../blocs/savings_state.dart';
import '../widgets/xp_bar_widget.dart';
import '../widgets/badge_grid_widget.dart';
import '../widgets/celebration_overlay.dart';
import '../widgets/wishlist_item_card.dart';
import '../widgets/streak_widget.dart';
import '../widgets/growth_projection_widget.dart';
import '../widgets/growable_piggy_widget.dart';
import '../widgets/savings_tips_widget.dart';
import '../widgets/challenges_widget.dart';
import '../widgets/chore_list_widget.dart';
import '../widgets/staggered_animation.dart';
import '../widgets/animated_counter.dart';
import 'add_item_page.dart';
import 'goal_details_page.dart';
import 'play_page.dart';

class DashboardPage extends StatefulWidget {
  final String accountId;

  const DashboardPage({super.key, required this.accountId});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  bool _showCelebration = false;
  double _lastAmount = 0;
  int? _lastXp;
  bool _justSaved = false;
  SavingsLoaded? _lastLoadedState;

  double get _horizontalPadding {
    final width = MediaQuery.of(context).size.width;
    if (width > 900) return 40;
    if (width > 600) return 28;
    return Spacing.md;
  }

  @override
  void initState() {
    super.initState();
    context.read<SavingsBloc>().add(LoadSavings(widget.accountId));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('LabCoop'),
        actions: [
          BlocSelector<SavingsBloc, SavingsState, SyncStatus>(
            selector: (state) =>
                state is SavingsLoaded ? state.syncStatus : SyncStatus.synced,
            builder: (context, syncStatus) {
              IconData icon;
              Color iconColor;
              String tooltip;

              switch (syncStatus) {
                case SyncStatus.syncing:
                  icon = Icons.sync;
                  iconColor = AppTheme.accentAmber;
                  tooltip = 'Syncing...';
                case SyncStatus.error:
                  icon = Icons.sync_problem;
                  iconColor = Colors.red;
                  tooltip = 'Sync failed — tap to retry';
                case SyncStatus.pendingOps:
                  icon = Icons.cloud_upload_outlined;
                  iconColor = AppTheme.accentAmber;
                  tooltip = 'Pending changes — tap to sync';
                case SyncStatus.synced:
                  icon = Icons.sync;
                  iconColor = Colors.white70;
                  tooltip = 'All synced';
              }

              return IconButton(
                icon: Icon(icon, color: iconColor),
                tooltip: tooltip,
                onPressed: () {
                  context.read<SavingsBloc>().add(
                        SyncWithServer(accountId: widget.accountId),
                      );
                },
              );
            },
          ),
        ],
      ),
      body: BlocConsumer<SavingsBloc, SavingsState>(
        listener: (context, state) {
          if (state is SavingsLoaded && state.lastXpGained != null) {
            setState(() {
              _showCelebration = true;
              _lastXp = state.lastXpGained;
              _justSaved = true;
            });
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Row(
                  children: [
                    const Icon(Icons.check_circle,
                        color: Colors.white, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                          '₱${_lastAmount.toStringAsFixed(0)} added to your goal!'),
                    ),
                  ],
                ),
                backgroundColor: AppTheme.primaryGreen,
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                duration: const Duration(seconds: 2),
              ),
            );
            Future.delayed(const Duration(seconds: 3), () {
              if (mounted) {
                setState(() {
                  _showCelebration = false;
                  _justSaved = false;
                });
              }
            });
          }
          if (state is SavingsError && _lastLoadedState != null) {
            _showAllocationError(context, state.message);
          }
        },
        builder: (context, state) {
          if (state is SavingsLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is SavingsError) {
            if (_lastLoadedState != null) {
              final s = _lastLoadedState!;
              return _buildDashboard(s.account, s.goals, s.badges,
                  lastXpGained: s.lastXpGained);
            }
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(state.message),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      context
                          .read<SavingsBloc>()
                          .add(LoadSavings(widget.accountId));
                    },
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }
          if (state is SavingsLoaded) {
            _lastLoadedState = state;
            final account = state.account;
            final goals = state.goals;
            final badges = state.badges;

            return _showCelebration
                ? CelebrationOverlay(
                    amount: _lastAmount,
                    xpGained: _lastXp,
                    message: 'Keep saving toward your goals!',
                    child: _buildDashboard(account, goals, badges,
                        lastXpGained: state.lastXpGained),
                  )
                : _buildDashboard(account, goals, badges,
                    lastXpGained: state.lastXpGained);
          }
          return const SizedBox.shrink();
        },
      ),
      floatingActionButton: Padding(
        padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).padding.bottom > 0 ? 0 : 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FloatingActionButton.small(
              heroTag: 'allocate',
              onPressed: _showAllocateDialog,
              backgroundColor: AppTheme.accentAmber,
              child: const Icon(Icons.payments, color: AppTheme.textDark),
            ),
            const SizedBox(height: 8),
            FloatingActionButton.extended(
              heroTag: 'add_wish',
              onPressed: () => Navigator.push(
                context,
                PageTransition.slideUp(
                    AddItemPage(accountId: widget.accountId)),
              ),
              icon: const Icon(Icons.auto_awesome),
              label: const Text('New Wish'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDashboard(
    SavingsAccount account,
    List<GoalJar> goals,
    List<entities.Badge> badges, {
    int? lastXpGained,
  }) {
    final totalSaved = goals.fold<double>(0, (s, g) => s + g.currentAllocated);
    final hp = _horizontalPadding;
    final isWide = MediaQuery.of(context).size.width > 600;

    return RefreshIndicator(
      onRefresh: () async {
        context.read<SavingsBloc>().add(LoadSavings(widget.accountId));
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).padding.bottom + 88,
          left: isWide ? hp : 0,
          right: isWide ? hp : 0,
        ),
        child: Center(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 600),
            child: StaggeredAnimation(
              children: [
                const SizedBox(height: Spacing.md),
                _buildBalanceHeader(account,
                    totalSavings: totalSaved,
                    totalTargetAmount:
                        goals.fold<double>(0, (s, g) => s + g.targetAmount)),
                const SizedBox(height: Spacing.md),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: XpBarWidget(
                    currentXp: account.currentXp,
                    lastGainedXp: lastXpGained,
                  ),
                ),
                const SizedBox(height: Spacing.sm),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: StreakWidget(accountId: widget.accountId),
                ),
                const SizedBox(height: Spacing.sm),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: const SavingsTipsWidget(),
                ),
                const SizedBox(height: Spacing.sm),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: GrowthProjectionWidget(
                    currentBalance: goals.fold<double>(
                        0, (sum, g) => sum + g.currentAllocated),
                    goalTargets: goals.map((g) => g.targetAmount).toList(),
                  ),
                ),
                const SizedBox(height: Spacing.lg),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: _buildSectionHeader('Goal Jars', Icons.savings),
                ),
                const SizedBox(height: Spacing.sm),
                if (goals.isEmpty)
                  Padding(
                    padding: EdgeInsets.all(hp),
                    child: Column(
                      children: [
                        Text(
                          '✨ Tap "New Wish" to add something you want to save for!',
                          textAlign: TextAlign.center,
                          style: AppTextStyle.body.copyWith(
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  ...goals.map(
                    (goal) => Padding(
                      padding: EdgeInsets.symmetric(horizontal: hp),
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: Spacing.sm),
                        child: WishlistItemCard(
                          goal: goal,
                          onTap: () {
                            Navigator.push(
                              context,
                              PageTransition.slideUp(
                                  GoalDetailsPage(goal: goal)),
                            );
                          },
                          onAllocate: () => _showQuickAllocate(goal),
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: Spacing.lg),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: _buildSectionHeader('Badges', Icons.emoji_events),
                ),
                const SizedBox(height: Spacing.sm),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: BadgeGridWidget(badges: badges),
                ),
                const SizedBox(height: Spacing.lg),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: _buildSectionHeader('Challenges', Icons.flag),
                ),
                const SizedBox(height: Spacing.sm),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: ChallengesWidget(totalSaved: totalSaved),
                ),
                const SizedBox(height: Spacing.lg),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: _buildSectionHeader('Chores', Icons.cleaning_services),
                ),
                const SizedBox(height: Spacing.sm),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: hp),
                  child: const ChoreListWidget(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBalanceHeader(SavingsAccount account,
      {double? totalSavings, double? totalTargetAmount}) {
    final saved = totalSavings ?? account.actualBalance;
    final target = totalTargetAmount ?? saved;
    final ratio = target > 0 ? saved / target : 0.0;

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: _horizontalPadding),
      child: GestureDetector(
        onTap: () {
          Navigator.push(
            context,
            PageTransition.slideUp(const _PlayRedirectPage()),
          );
        },
        child: Container(
          padding: const EdgeInsets.all(Spacing.lg),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppTheme.primaryGreen, Color(0xFF1B5E20)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(RadiusTokens.xl),
            boxShadow: [
              BoxShadow(
                color: AppTheme.primaryGreen.withValues(alpha: 0.3),
                blurRadius: 12,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              GrowablePiggyWidget(
                savingsRatio: ratio,
                size: 72,
                justSaved: _justSaved,
              ),
              const SizedBox(width: Spacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Hello, ${account.childName}!',
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 14),
                    ),
                    const SizedBox(height: Spacing.sm),
                    AnimatedCounter(
                      value: account.actualBalance,
                      prefix: '₱',
                      decimals: 2,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: Spacing.xs),
                    Text(
                      '₱${account.unallocatedBalance.toStringAsFixed(2)} available',
                      style:
                          const TextStyle(color: Colors.white60, fontSize: 14),
                    ),
                    const SizedBox(height: Spacing.xs),
                    Row(
                      children: [
                        Icon(Icons.pets,
                            color: Colors.white.withValues(alpha: 0.6),
                            size: 14),
                        const SizedBox(width: 4),
                        Text(
                          'Tap to play with Piggy!',
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.6),
                              fontSize: 11),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right,
                  color: Colors.white.withValues(alpha: 0.4)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, color: AppTheme.primaryGreen, size: 20),
        const SizedBox(width: Spacing.sm),
        Text(title, style: AppTextStyle.heading3),
      ],
    );
  }

  void _showQuickAllocate(GoalJar goal) {
    final amountController = TextEditingController();
    final available = context.read<SavingsBloc>().state is SavingsLoaded
        ? (context.read<SavingsBloc>().state as SavingsLoaded)
            .account
            .unallocatedBalance
        : 0.0;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Text(AppConstants.displayIcon(goal.categoryIcon),
                style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 12),
            Expanded(
                child: Text(goal.title, style: const TextStyle(fontSize: 18))),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: amountController,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: InputDecoration(
                labelText: 'Amount (₱)',
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                prefixText: '₱ ',
                filled: true,
                fillColor: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Available: ₱${available.toStringAsFixed(0)}',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final amount = double.tryParse(amountController.text) ?? 0;
              if (amount > 0) {
                if (amount > available) {
                  Navigator.pop(ctx);
                  _showAllocationError(
                      context,
                      'You only have ₱${available.toStringAsFixed(0)} available, '
                      'but you tried to allocate ₱${amount.toStringAsFixed(0)}.\n\n'
                      'Try a smaller amount or add more funds first.');
                  return;
                }
                setState(() => _lastAmount = amount);
                context.read<SavingsBloc>().add(
                      AllocateFunds(goal: goal, amount: amount),
                    );
                Navigator.pop(ctx);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryGreen,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  void _showAllocateDialog() {
    final state = context.read<SavingsBloc>().state;
    if (state is! SavingsLoaded) return;

    final goals = state.goals;
    final available = state.account.unallocatedBalance;
    GoalJar? selectedGoal;
    final amountController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Allocate Funds',
            style: TextStyle(fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<GoalJar>(
              value: null,
              decoration: InputDecoration(
                labelText: 'Select Goal Jar',
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                prefixIcon:
                    const Icon(Icons.savings, color: AppTheme.primaryGreen),
                filled: true,
                fillColor: Colors.white,
              ),
              items: goals
                  .map(
                    (g) => DropdownMenuItem(
                      value: g,
                      child: Row(
                        children: [
                          Text(AppConstants.displayIcon(g.categoryIcon),
                              style: const TextStyle(fontSize: 20)),
                          const SizedBox(width: 12),
                          Text(g.title),
                        ],
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (v) => selectedGoal = v,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: amountController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Amount (₱)',
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                prefixText: '₱ ',
                prefixIcon: const Icon(Icons.monetization_on,
                    color: AppTheme.primaryGreen),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Available: ₱${available.toStringAsFixed(0)}',
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (selectedGoal != null && amountController.text.isNotEmpty) {
                final amount = double.tryParse(amountController.text) ?? 0;
                if (amount > 0) {
                  if (amount > available) {
                    Navigator.pop(ctx);
                    _showAllocationError(
                        context,
                        'You only have ₱${available.toStringAsFixed(0)} available, '
                        'but you tried to allocate ₱${amount.toStringAsFixed(0)}.\n\n'
                        'Try a smaller amount or add more funds first.');
                    return;
                  }
                  setState(() => _lastAmount = amount);
                  context.read<SavingsBloc>().add(
                        AllocateFunds(
                          goal: selectedGoal!,
                          amount: amount,
                        ),
                      );
                  Navigator.pop(ctx);
                }
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryGreen,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Allocate'),
          ),
        ],
      ),
    );
  }

  void _showAllocationError(BuildContext context, String message) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const Icon(Icons.info_outline, color: Colors.orange, size: 28),
            const SizedBox(width: 12),
            const Text('Not Enough Balance', style: TextStyle(fontSize: 18)),
          ],
        ),
        content:
            Text(message, style: const TextStyle(fontSize: 15, height: 1.5)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK', style: TextStyle(fontSize: 16)),
          ),
        ],
      ),
    );
  }
}

class _PlayRedirectPage extends StatelessWidget {
  const _PlayRedirectPage();

  @override
  Widget build(BuildContext context) {
    return const PlayPage();
  }
}
