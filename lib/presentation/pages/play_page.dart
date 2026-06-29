import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/theme/app_theme.dart';

import '../../domain/entities/goal_jar.dart';
import '../../domain/entities/transaction.dart';
import '../blocs/banking_bloc.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_state.dart';
import 'game_center_page.dart';

class PlayPage extends StatefulWidget {
  const PlayPage({super.key});

  @override
  State<PlayPage> createState() => _PlayPageState();
}

class _PlayPageState extends State<PlayPage> {
  bool _showGoals = false;

  @override
  Widget build(BuildContext context) {
    final savings = context.watch<SavingsBloc>().state;
    final banking = context.watch<BankingBloc>().state;

    final goals = savings is SavingsLoaded ? savings.goals : <GoalJar>[];
    final allocations = banking.transactions
        .where((t) => t.type == TransactionType.allocation)
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Play & Learn'),
        backgroundColor: AppTheme.primaryGreen,
        foregroundColor: Colors.white,
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFE8F5E9), Color(0xFFF1F8E9)],
          ),
        ),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const GameCenterPage(),
            const SizedBox(height: 16),
            if (goals.isNotEmpty) ...[
              Card(
                child: InkWell(
                  onTap: () => setState(() => _showGoals = !_showGoals),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        const Icon(Icons.emoji_events, color: AppTheme.coinGold),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Savings Goals',
                                  style: Theme.of(context).textTheme.titleMedium),
                              Text('${goals.length} goals • ${goals.where((g) => g.isCompleted).length} completed',
                                  style: Theme.of(context).textTheme.bodySmall),
                            ],
                          ),
                        ),
                        Icon(_showGoals ? Icons.expand_less : Icons.expand_more, color: Colors.grey),
                      ],
                    ),
                  ),
                ),
              ),
              if (_showGoals)
                ...goals.map((g) => _goalCard(g)),
              const SizedBox(height: 12),
            ],
            if (allocations.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text('Goal Allocations',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              ...allocations.take(5).map((t) => _allocationTile(t)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _goalCard(GoalJar goal) {
    final progress = goal.targetAmount > 0
        ? (goal.currentAllocated / goal.targetAmount).clamp(0.0, 1.0)
        : 0.0;
    return Card(
      margin: const EdgeInsets.only(bottom: 6, left: 16, right: 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(goal.categoryIcon.isNotEmpty ? goal.categoryIcon : '🎯', style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(goal.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
                Text('PHP ${goal.currentAllocated.toStringAsFixed(0)} / PHP ${goal.targetAmount.toStringAsFixed(0)}',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: progress,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                    goal.isCompleted ? AppTheme.coinGold : AppTheme.primaryGreen),
                minHeight: 8,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _allocationTile(Transaction t) {
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.teal.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(Icons.account_balance_wallet, color: Colors.teal, size: 20),
        ),
        title: Text(t.description, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
        subtitle: Text(_formatDate(t.createdAt), style: Theme.of(context).textTheme.bodySmall),
        trailing: Text(
          '-PHP ${t.amount.toStringAsFixed(2)}',
          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.teal, fontSize: 13),
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }
}
