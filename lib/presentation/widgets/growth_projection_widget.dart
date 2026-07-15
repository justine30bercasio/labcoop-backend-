import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class GrowthProjectionWidget extends StatelessWidget {
  final double currentBalance;
  final List<double> goalTargets;

  const GrowthProjectionWidget({
    super.key,
    required this.currentBalance,
    required this.goalTargets,
  });

  @override
  Widget build(BuildContext context) {
    final totalGoals = goalTargets.fold<double>(0, (a, b) => a + b);
    final progress = totalGoals > 0 ? (currentBalance / totalGoals).clamp(0.0, 1.0) : 0.0;
    final remaining = totalGoals - currentBalance;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.trending_up, color: AppTheme.primaryGreen, size: 20),
                SizedBox(width: 8),
                Text(
                  'Overall Progress',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 12,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                  progress >= 1.0 ? AppTheme.primaryGreen : AppTheme.waterBlue,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '₱${currentBalance.toStringAsFixed(0)} saved',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Theme.of(context).colorScheme.onSurface),
                ),
                Text(
                  'of ₱${totalGoals.toStringAsFixed(0)}',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                ),
              ],
            ),
            if (remaining > 0) ...[
              const SizedBox(height: 6),
              Text(
                '₱${remaining.toStringAsFixed(0)} more to reach all goals',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
              ),
            ],
            if (remaining <= 0)
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppTheme.primaryGreen.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.celebration, color: AppTheme.primaryGreen, size: 18),
                    SizedBox(width: 6),
                    Text(
                      'All goals reached!',
                      style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryGreen, fontSize: 13),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
