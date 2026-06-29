import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/goal_jar.dart';
import '../../domain/usecases/allocate_deposit_usecase.dart';
import '../../domain/usecases/transfer_between_jars_usecase.dart';
import '../../domain/usecases/check_badge_unlock_usecase.dart';
import '../../domain/repositories/savings_repository.dart';
import '../blocs/savings_event.dart';
import '../blocs/savings_state.dart';

class SavingsBloc extends Bloc<SavingsEvent, SavingsState> {
  final SavingsRepository _repository;
  final AllocateDepositUseCase _allocateUseCase;
  final TransferBetweenJarsUseCase _transferUseCase;
  final CheckBadgeUnlockUseCase _badgeUseCase;

  SavingsBloc(
    this._repository,
    this._allocateUseCase,
    this._transferUseCase,
    this._badgeUseCase,
  ) : super(SavingsInitial()) {
    on<LoadSavings>(_onLoadSavings);
    on<AllocateFunds>(_onAllocateFunds);
    on<TransferFunds>(_onTransferFunds);
    on<SyncWithServer>(_onSyncWithServer);
    on<CreateGoal>(_onCreateGoal);
    on<CheckSyncStatus>(_onCheckSyncStatus);
  }

  Future<void> _onLoadSavings(
    LoadSavings event,
    Emitter<SavingsState> emit,
  ) async {
    if (state is! SavingsLoaded) emit(SavingsLoading());
    try {
      final account = await _repository.getAccount(event.accountId);
      final goals = await _repository.getGoals(event.accountId);
      final badges = await _repository.getBadges(event.accountId);
      final pendingCount = await _repository.getPendingOpsCount();
      emit(SavingsLoaded(
        account: account,
        goals: goals,
        badges: badges,
        syncStatus: pendingCount > 0 ? SyncStatus.pendingOps : SyncStatus.synced,
      ));
      _repository.processPendingOps();
    } catch (e) {
      emit(SavingsError('Something went wrong.'));
    }
  }

  Future<void> _onAllocateFunds(
    AllocateFunds event,
    Emitter<SavingsState> emit,
  ) async {
    if (state is! SavingsLoaded) return;
    final current = state as SavingsLoaded;

    try {
      final result = await _allocateUseCase(
        account: current.account,
        goal: event.goal,
        amount: event.amount,
      );

      final allBadges = await _repository.getBadges(current.account.accountId);
      final updatedBadges = _badgeUseCase.getNewlyUnlockedBadges(
        allBadges: allBadges,
        currentXp: result.account.currentXp,
      );

      emit(
        current.copyWith(
          account: result.account.copyWith(
            currentXp: result.account.currentXp,
          ),
          goals: current.goals.map((g) {
            if (g.goalId == result.goal.goalId) return result.goal;
            return g;
          }).toList(),
          badges: [...current.badges, ...updatedBadges],
          lastXpGained: result.xpGained,
        ),
      );
    } catch (e) {
      emit(SavingsError('Something went wrong.'));
    }
  }

  Future<void> _onTransferFunds(
    TransferFunds event,
    Emitter<SavingsState> emit,
  ) async {
    if (state is! SavingsLoaded) return;
    final current = state as SavingsLoaded;

    try {
      final result = await _transferUseCase(
        from: event.from,
        to: event.to,
        amount: event.amount,
      );

      emit(
        current.copyWith(
          goals: current.goals.map((g) {
            if (g.goalId == result.from.goalId) return result.from;
            if (g.goalId == result.to.goalId) return result.to;
            return g;
          }).toList(),
        ),
      );
    } catch (e) {
      emit(SavingsError('Something went wrong.'));
    }
  }

  Future<void> _onCreateGoal(
    CreateGoal event,
    Emitter<SavingsState> emit,
  ) async {
    final goal = GoalJar(
      goalId: 'goal-${DateTime.now().millisecondsSinceEpoch}',
      accountId: event.accountId,
      title: event.title,
      targetAmount: event.targetAmount,
      currentAllocated: 0,
      categoryIcon: event.categoryIcon,
    );
    try {
      await _repository.createGoal(goal);
      final account = await _repository.getAccount(event.accountId);
      final goals = await _repository.getGoals(event.accountId);
      final badges = await _repository.getBadges(event.accountId);
      emit(SavingsLoaded(account: account, goals: goals, badges: badges));
    } catch (e) {
      emit(SavingsError('Failed to create goal: $e'));
    }
  }

  Future<void> _onSyncWithServer(
    SyncWithServer event,
    Emitter<SavingsState> emit,
  ) async {
    if (state is! SavingsLoaded) return;
    final current = state as SavingsLoaded;
    emit(current.copyWith(syncStatus: SyncStatus.syncing));

    try {
      await _repository.processPendingOps();
      if (event.accountId != null) {
        final account = await _repository.pullAccountFromServer(event.accountId!);
        final goals = await _repository.pullGoalsFromServer(event.accountId!);
        final badges = await _repository.pullBadgesFromServer(event.accountId!);
        emit(SavingsLoaded(
          account: account,
          goals: goals,
          badges: badges,
          syncStatus: SyncStatus.synced,
        ));
      } else {
        emit(current.copyWith(syncStatus: SyncStatus.synced));
      }
    } catch (e) {
      emit(current.copyWith(syncStatus: SyncStatus.error));
    }
  }

  Future<void> _onCheckSyncStatus(
    CheckSyncStatus event,
    Emitter<SavingsState> emit,
  ) async {
    if (state is! SavingsLoaded) return;
    final current = state as SavingsLoaded;
    try {
      final count = await _repository.getPendingOpsCount();
      if (count > 0 && current.syncStatus == SyncStatus.synced) {
        emit(current.copyWith(syncStatus: SyncStatus.pendingOps));
      } else if (count == 0 && current.syncStatus == SyncStatus.pendingOps) {
        emit(current.copyWith(syncStatus: SyncStatus.synced));
      }
    } catch (_) {}
  }
}
