import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/theme/app_theme.dart';
import '../../domain/entities/goal_jar.dart';
import '../../domain/usecases/calculate_goal_progress_usecase.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_event.dart';
import '../blocs/savings_state.dart';
import '../widgets/animated_jar_widget.dart';

class GoalDetailsPage extends StatelessWidget {
  final GoalJar goal;

  const GoalDetailsPage({super.key, required this.goal});

  GoalJar _liveGoal(BuildContext context) {
    final state = context.read<SavingsBloc>().state;
    if (state is SavingsLoaded) {
      for (final g in state.goals) {
        if (g.goalId == goal.goalId) return g;
      }
    }
    return goal;
  }

  void _showWithdrawDialog(BuildContext context, GoalJar liveGoal) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Withdraw from Goal',
            style: TextStyle(fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'This moves money back to your available balance so you can withdraw it.',
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(ctx).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Saved toward "${liveGoal.title}": ₱${liveGoal.currentAllocated.toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Amount to withdraw',
                prefixText: '₱ ',
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
                filled: true,
                fillColor: Colors.white,
              ),
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
              final amount = double.tryParse(controller.text) ?? 0;
              if (amount <= 0) {
                ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(
                    content: Text('Enter a valid amount'),
                    backgroundColor: Colors.red));
                return;
              }
              if (amount > liveGoal.currentAllocated) {
                ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(
                    content: Text('Amount exceeds what is saved in this goal'),
                    backgroundColor: Colors.red));
                return;
              }
              context.read<SavingsBloc>().add(
                    DeallocateFunds(goal: liveGoal, amount: amount),
                  );
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Row(
                    children: [
                      const Icon(Icons.check_circle,
                          color: Colors.white, size: 20),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                            '₱${amount.toStringAsFixed(2)} moved back to your available balance!'),
                      ),
                    ],
                  ),
                  backgroundColor: AppTheme.primaryGreen,
                  behavior: SnackBarBehavior.floating,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  duration: const Duration(seconds: 3),
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SavingsBloc, SavingsState>(
      builder: (context, state) {
        final liveGoal = _liveGoal(context);
        return _GoalDetailsBody(
          goal: liveGoal,
          onWithdraw: () => _showWithdrawDialog(context, liveGoal),
        );
      },
    );
  }
}

class _GoalDetailsBody extends StatelessWidget {
  final GoalJar goal;
  final VoidCallback onWithdraw;

  const _GoalDetailsBody({required this.goal, required this.onWithdraw});

  @override
  Widget build(BuildContext context) {
    const calc = CalculateGoalProgressUseCase();
    final progress = goal.progressPercentage;
    final nextMilestone = calc.amountToReachNextMilestone(goal);

    return Scaffold(
      appBar: AppBar(
        title: Text(goal.title),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const SizedBox(height: 16),
            SizedBox(
              width: 120,
              height: 180,
              child: AnimatedJarWidget(goal: goal),
            ),
            const SizedBox(height: 24),
            Text(
              '₱${goal.currentAllocated.toStringAsFixed(0)}',
              style: TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            Text(
              'of ₱${goal.targetAmount.toStringAsFixed(0)}',
              style: TextStyle(
                fontSize: 16,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 16,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                  goal.isCompleted
                      ? AppTheme.primaryGreen
                      : AppTheme.waterBlue,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${(progress * 100).toInt()}% complete',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 32),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Next Milestone',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (goal.isCompleted)
                      const Row(
                        children: [
                          Icon(Icons.celebration,
                              color: AppTheme.coinGold, size: 20),
                          SizedBox(width: 8),
                          Text(
                            'Goal completed! 🎉',
                            style: TextStyle(
                              color: AppTheme.primaryGreen,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      )
                    else
                      Text(
                        'Deposit ₱${nextMilestone.toStringAsFixed(0)} more to reach the next milestone!',
                        style: const TextStyle(fontSize: 14),
                      ),
                  ],
                ),
              ),
            ),
            if (goal.currentAllocated > 0) ...[
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onWithdraw,
                  icon: const Icon(Icons.money_off_csred_outlined),
                  label: const Text('Withdraw from Goal'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.orange,
                    side: const BorderSide(color: Colors.orange),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
