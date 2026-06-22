import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../domain/entities/goal_jar.dart';
import '../../domain/usecases/calculate_goal_progress_usecase.dart';
import '../widgets/animated_jar_widget.dart';

class GoalDetailsPage extends StatelessWidget {
  final GoalJar goal;

  const GoalDetailsPage({super.key, required this.goal});

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
              style: const TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.bold,
                color: AppTheme.textDark,
              ),
            ),
            Text(
              'of ₱${goal.targetAmount.toStringAsFixed(0)}',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
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
                color: Colors.grey.shade600,
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
                    const Text(
                      'Next Milestone',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textDark,
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
          ],
        ),
      ),
    );
  }
}
