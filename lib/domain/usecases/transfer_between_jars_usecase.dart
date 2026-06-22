import '../entities/goal_jar.dart';
import '../repositories/savings_repository.dart';

class TransferBetweenJarsUseCase {
  final SavingsRepository _repository;

  TransferBetweenJarsUseCase(this._repository);

  Future<TransferResult> call({
    required GoalJar from,
    required GoalJar to,
    required double amount,
  }) async {
    if (amount <= 0) {
      throw ArgumentError('Transfer amount must be positive');
    }

    if (from.currentAllocated < amount) {
      throw InsufficientJarBalanceException(
        jarTitle: from.title,
        available: from.currentAllocated,
        requested: amount,
      );
    }

    final updatedFrom = from.copyWith(
      currentAllocated: from.currentAllocated - amount,
    );

    final updatedTo = to.copyWith(
      currentAllocated: to.currentAllocated + amount,
    );

    await _repository.updateGoal(updatedFrom);
    await _repository.updateGoal(updatedTo);

    return TransferResult(from: updatedFrom, to: updatedTo, amount: amount);
  }
}

class TransferResult {
  final GoalJar from;
  final GoalJar to;
  final double amount;

  const TransferResult({
    required this.from,
    required this.to,
    required this.amount,
  });
}

class InsufficientJarBalanceException implements Exception {
  final String jarTitle;
  final double available;
  final double requested;

  const InsufficientJarBalanceException({
    required this.jarTitle,
    required this.available,
    required this.requested,
  });

  @override
  String toString() =>
      '"$jarTitle" has only ₱$available — cannot transfer ₱$requested';
}
