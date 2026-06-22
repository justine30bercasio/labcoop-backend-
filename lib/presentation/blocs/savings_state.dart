import 'package:equatable/equatable.dart';
import '../../domain/entities/savings_account.dart';
import '../../domain/entities/goal_jar.dart';
import '../../domain/entities/badge.dart';

abstract class SavingsState extends Equatable {
  const SavingsState();

  @override
  List<Object?> get props => [];
}

class SavingsInitial extends SavingsState {}

class SavingsLoading extends SavingsState {}

class SavingsSyncing extends SavingsState {}

class SavingsLoaded extends SavingsState {
  final SavingsAccount account;
  final List<GoalJar> goals;
  final List<Badge> badges;
  final int? lastXpGained;
  final SyncStatus syncStatus;

  const SavingsLoaded({
    required this.account,
    required this.goals,
    required this.badges,
    this.lastXpGained,
    this.syncStatus = SyncStatus.synced,
  });

  @override
  List<Object?> get props =>
      [account, goals, badges, lastXpGained, syncStatus];

  SavingsLoaded copyWith({
    SavingsAccount? account,
    List<GoalJar>? goals,
    List<Badge>? badges,
    int? lastXpGained,
    SyncStatus? syncStatus,
  }) {
    return SavingsLoaded(
      account: account ?? this.account,
      goals: goals ?? this.goals,
      badges: badges ?? this.badges,
      lastXpGained: lastXpGained ?? this.lastXpGained,
      syncStatus: syncStatus ?? this.syncStatus,
    );
  }
}

enum SyncStatus { synced, syncing, pendingOps, error }

class SavingsError extends SavingsState {
  final String message;

  const SavingsError(this.message);

  @override
  List<Object?> get props => [message];
}
