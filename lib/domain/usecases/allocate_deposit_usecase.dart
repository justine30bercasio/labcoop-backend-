import '../entities/savings_account.dart';
import '../entities/goal_jar.dart';
import '../repositories/savings_repository.dart';

class AllocateDepositUseCase {
  final SavingsRepository _repository;

  AllocateDepositUseCase(this._repository);

  Future<AllocateResult> call({
    required SavingsAccount account,
    required GoalJar goal,
    required double amount,
  }) async {
    if (amount <= 0) {
      throw ArgumentError('Allocation amount must be positive');
    }

    if (account.unallocatedBalance < amount) {
      throw InsufficientUnallocatedBalanceException(
        available: account.unallocatedBalance,
        requested: amount,
      );
    }

    final updatedAccount = account.copyWith(
      unallocatedBalance: account.unallocatedBalance - amount,
    );

    final updatedGoal = goal.copyWith(
      currentAllocated: goal.currentAllocated + amount,
    );

    try {
      await _repository.updateAccount(updatedAccount);
    } catch (e) {
      throw AllocationException('Failed to update account: $e');
    }

    try {
      await _repository.updateGoal(updatedGoal);
    } catch (e) {
      // Rollback account deduction
      try {
        await _repository.updateAccount(account);
      } catch (_) {}
      throw AllocationException('Failed to update goal, rolled back account: $e');
    }

    return AllocateResult(
      account: updatedAccount,
      goal: updatedGoal,
      xpGained: _calculateXpGain(amount),
    );
  }

  int _calculateXpGain(double amount) {
    return (amount / 10).floor();
  }
}

class AllocateResult {
  final SavingsAccount account;
  final GoalJar goal;
  final int xpGained;

  const AllocateResult({
    required this.account,
    required this.goal,
    required this.xpGained,
  });
}

class InsufficientUnallocatedBalanceException implements Exception {
  final double available;
  final double requested;

  const InsufficientUnallocatedBalanceException({
    required this.available,
    required this.requested,
  });

  @override
  String toString() =>
      'Insufficient unallocated balance: ₱$available available, ₱$requested requested';
}

class AllocationException implements Exception {
  final String message;
  const AllocationException(this.message);

  @override
  String toString() => message;
}
