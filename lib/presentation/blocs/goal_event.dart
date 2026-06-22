import 'package:equatable/equatable.dart';
import '../../domain/entities/goal_jar.dart';

abstract class GoalEvent extends Equatable {
  const GoalEvent();

  @override
  List<Object?> get props => [];
}

class LoadGoals extends GoalEvent {
  final String accountId;

  const LoadGoals(this.accountId);

  @override
  List<Object?> get props => [accountId];
}

class SelectGoal extends GoalEvent {
  final GoalJar goal;

  const SelectGoal(this.goal);

  @override
  List<Object?> get props => [goal];
}

class UpdateGoalProgress extends GoalEvent {
  final GoalJar goal;

  const UpdateGoalProgress(this.goal);

  @override
  List<Object?> get props => [goal];
}
