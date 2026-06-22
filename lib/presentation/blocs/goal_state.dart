import 'package:equatable/equatable.dart';
import '../../domain/entities/goal_jar.dart';

abstract class GoalState extends Equatable {
  const GoalState();

  @override
  List<Object?> get props => [];
}

class GoalInitial extends GoalState {}

class GoalLoading extends GoalState {}

class GoalsLoaded extends GoalState {
  final List<GoalJar> goals;
  final GoalJar? selectedGoal;

  const GoalsLoaded({required this.goals, this.selectedGoal});

  @override
  List<Object?> get props => [goals, selectedGoal];
}

class GoalUpdated extends GoalState {
  final GoalJar goal;

  const GoalUpdated(this.goal);

  @override
  List<Object?> get props => [goal];
}

class GoalError extends GoalState {
  final String message;

  const GoalError(this.message);

  @override
  List<Object?> get props => [message];
}
