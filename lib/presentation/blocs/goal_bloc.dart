import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/repositories/savings_repository.dart';
import 'goal_event.dart';
import 'goal_state.dart';

class GoalBloc extends Bloc<GoalEvent, GoalState> {
  final SavingsRepository _repository;

  GoalBloc(this._repository) : super(GoalInitial()) {
    on<LoadGoals>(_onLoadGoals);
    on<SelectGoal>(_onSelectGoal);
    on<UpdateGoalProgress>(_onUpdateGoalProgress);
  }

  Future<void> _onLoadGoals(
    LoadGoals event,
    Emitter<GoalState> emit,
  ) async {
    emit(GoalLoading());
    try {
      final goals = await _repository.getGoals(event.accountId);
      emit(GoalsLoaded(goals: goals));
    } catch (e) {
      emit(GoalError(e.toString()));
    }
  }

  void _onSelectGoal(SelectGoal event, Emitter<GoalState> emit) {
    if (state is GoalsLoaded) {
      final current = state as GoalsLoaded;
      emit(GoalsLoaded(goals: current.goals, selectedGoal: event.goal));
    }
  }

  Future<void> _onUpdateGoalProgress(
    UpdateGoalProgress event,
    Emitter<GoalState> emit,
  ) async {
    try {
      await _repository.updateGoal(event.goal);
      emit(GoalUpdated(event.goal));
    } catch (e) {
      emit(GoalError(e.toString()));
    }
  }
}
