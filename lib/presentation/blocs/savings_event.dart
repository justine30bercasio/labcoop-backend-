import 'package:equatable/equatable.dart';
import '../../domain/entities/goal_jar.dart';

abstract class SavingsEvent extends Equatable {
  const SavingsEvent();

  @override
  List<Object?> get props => [];
}

class LoadSavings extends SavingsEvent {
  final String accountId;

  const LoadSavings(this.accountId);

  @override
  List<Object?> get props => [accountId];
}

class AllocateFunds extends SavingsEvent {
  final GoalJar goal;
  final double amount;

  const AllocateFunds({required this.goal, required this.amount});

  @override
  List<Object?> get props => [goal, amount];
}

class TransferFunds extends SavingsEvent {
  final GoalJar from;
  final GoalJar to;
  final double amount;

  const TransferFunds({
    required this.from,
    required this.to,
    required this.amount,
  });

  @override
  List<Object?> get props => [from, to, amount];
}

class SyncWithServer extends SavingsEvent {
  final String? accountId;

  const SyncWithServer({this.accountId});
}

class CreateGoal extends SavingsEvent {
  final String title;
  final double targetAmount;
  final String categoryIcon;
  final String accountId;

  const CreateGoal({
    required this.title,
    required this.targetAmount,
    required this.categoryIcon,
    required this.accountId,
  });

  @override
  List<Object?> get props => [title, targetAmount, categoryIcon, accountId];
}

class CheckSyncStatus extends SavingsEvent {
  const CheckSyncStatus();
}
