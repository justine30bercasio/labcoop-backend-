import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive/hive.dart';
import '../../core/errors/exceptions.dart';
import '../../domain/entities/savings_account.dart';
import '../../domain/entities/goal_jar.dart';
import '../../domain/entities/badge.dart';
import '../../domain/repositories/savings_repository.dart';
import '../datasources/remote_api_source.dart';
import '../datasources/local_db_source.dart';
import '../datasources/sample_api_source.dart';
import '../models/savings_account_model.dart';
import '../models/goal_jar_model.dart';

class SavingsRepositoryImpl implements SavingsRepository {
  final RemoteApiSource _remoteSource;
  final LocalDbSource _localSource;
  final Connectivity _connectivity;
  final SampleApiSource _sampleSource;

  SavingsRepositoryImpl(
    this._remoteSource,
    this._localSource,
    this._connectivity,
    this._sampleSource,
  );

  Future<bool> get _isOnline async {
    try {
      final result = await _connectivity.checkConnectivity();
      return result != ConnectivityResult.none;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<SavingsAccount> getAccount(String accountId) async {
    if (await _isOnline) {
      try {
        final model = await _remoteSource.fetchAccount(accountId);
        await _localSource.saveAccount(model);
        return model.toEntity();
      } catch (_) {}
    }

    final cached = await _localSource.getAccount(accountId);
    if (cached != null) return cached.toEntity();

    throw NetworkException('No internet connection');
  }

  @override
  Future<List<GoalJar>> getGoals(String accountId) async {
    if (await _isOnline) {
      try {
        final models = await _remoteSource.fetchGoals(accountId);
        await _localSource.saveGoals(models);
        return models.map((m) => m.toEntity()).toList();
      } catch (_) {}
    }

    final cached = await _localSource.getGoals(accountId);
    if (cached.isNotEmpty) return cached.map((m) => m.toEntity()).toList();

    throw NetworkException('No internet connection');
  }

  @override
  Future<List<Badge>> getBadges(String accountId) async {
    if (await _isOnline) {
      try {
        final models = await _remoteSource.fetchBadges(accountId);
        await _localSource.saveBadges(models);
        return models.map((m) => m.toEntity()).toList();
      } catch (_) {}
    }

    final cached = await _localSource.getBadges(accountId);
    if (cached.isNotEmpty) return cached.map((m) => m.toEntity()).toList();

    throw NetworkException('No internet connection');
  }

  @override
  Future<SavingsAccount> updateAccount(SavingsAccount account) async {
    final model = SavingsAccountModel.fromEntity(account);

    if (await _isOnline) {
      try {
        final updated = await _remoteSource.updateAccount(model);
        await _localSource.saveAccount(updated);
        return updated.toEntity();
      } on NetworkException {
        // Offline, queue it
      } catch (_) {}
    }

    await _localSource.saveAccount(model);
    await _localSource.addPendingOp({
      'type': 'UPDATE_ACCOUNT',
      'payload': model.toJson(),
      'createdAt': DateTime.now().toIso8601String(),
      'retryCount': 0,
    });
    return account;
  }

  @override
  Future<GoalJar> updateGoal(GoalJar goal) async {
    final model = GoalJarModel.fromEntity(goal);

    if (await _isOnline) {
      try {
        final updated = await _remoteSource.updateGoal(model);
        await _localSource.saveGoals([updated]);
        return updated.toEntity();
      } on NetworkException {
        // Offline, queue it
      } catch (_) {}
    }

    await _localSource.saveGoals([model]);
    await _localSource.addPendingOp({
      'type': 'UPDATE_GOAL',
      'payload': model.toJson(),
      'createdAt': DateTime.now().toIso8601String(),
      'retryCount': 0,
    });
    return goal;
  }

  @override
  Future<GoalJar> createGoal(GoalJar goal) async {
    final model = GoalJarModel.fromEntity(goal);

    if (await _isOnline) {
      try {
        final created = await _remoteSource.createGoal(model);
        await _localSource.saveGoal(created);
        return created.toEntity();
      } on NetworkException {
        // Offline, queue it
      } catch (_) {}
    }

    await _localSource.saveGoal(model);
    await _localSource.addPendingOp({
      'type': 'CREATE_GOAL',
      'payload': model.toJson(),
      'createdAt': DateTime.now().toIso8601String(),
      'retryCount': 0,
    });
    return goal;
  }

  @override
  Future<void> deleteGoal(String goalId) async {
    if (await _isOnline) {
      try {
        await _remoteSource.deleteGoal(goalId);
        return;
      } on NetworkException {
        // Offline, queue it
      } catch (_) {}
    }

    await _localSource.addPendingOp({
      'type': 'DELETE_GOAL',
      'payload': {'goalId': goalId},
      'createdAt': DateTime.now().toIso8601String(),
      'retryCount': 0,
    });
  }

  @override
  Future<SavingsAccount> pullAccountFromServer(String accountId) async {
    final model = await _remoteSource.fetchAccount(accountId);
    await _localSource.saveAccount(model);
    return model.toEntity();
  }

  @override
  Future<List<GoalJar>> pullGoalsFromServer(String accountId) async {
    final models = await _remoteSource.fetchGoals(accountId);
    await _localSource.saveGoals(models);
    return models.map((m) => m.toEntity()).toList();
  }

  @override
  Future<List<Badge>> pullBadgesFromServer(String accountId) async {
    final models = await _remoteSource.fetchBadges(accountId);
    await _localSource.saveBadges(models);
    return models.map((m) => m.toEntity()).toList();
  }

  @override
  Future<void> syncWithServer() async {
    if (!await _isOnline) throw NetworkException('No internet connection');

    final ops = await _localSource.getPendingOps();
    if (ops.isNotEmpty) {
      await _processOps(ops);
    }

    final accountsBox = await Hive.openBox('accounts');
    for (final raw in accountsBox.values) {
      final model = SavingsAccountModel.fromJson(
        jsonDecode(raw as String) as Map<String, dynamic>,
      );
      try {
        await _remoteSource.updateAccount(model);
      } on NetworkException {
        rethrow;
      } catch (_) {}
    }
  }

  Future<void> _processOps(List<Map<String, dynamic>> ops) async {
    for (int i = ops.length - 1; i >= 0; i--) {
      final op = ops[i];
      if (((op['retryCount'] as int?) ?? 0) >= 5) {
        await _localSource.removePendingOp(i);
        continue;
      }

      try {
        switch (op['type'] as String) {
          case 'CREATE_GOAL':
            final goalModel = GoalJarModel.fromJson(
              op['payload'] as Map<String, dynamic>,
            );
            await _remoteSource.createGoal(goalModel);
            break;
          case 'UPDATE_GOAL':
            final goalModel = GoalJarModel.fromJson(
              op['payload'] as Map<String, dynamic>,
            );
            await _remoteSource.updateGoal(goalModel);
            break;
          case 'UPDATE_ACCOUNT':
            final accountModel = SavingsAccountModel.fromJson(
              op['payload'] as Map<String, dynamic>,
            );
            await _remoteSource.updateAccount(accountModel);
            break;
          case 'DELETE_GOAL':
            final goalId = op['payload']['goalId'] as String;
            await _remoteSource.deleteGoal(goalId);
            break;
        }
        await _localSource.removePendingOp(i);
      } on NetworkException {
        op['retryCount'] = ((op['retryCount'] as int?) ?? 0) + 1;
      } catch (_) {
        op['retryCount'] = ((op['retryCount'] as int?) ?? 0) + 1;
      }
    }
  }

  @override
  Future<int> getPendingOpsCount() async {
    return await _localSource.getPendingOpsCount();
  }

  @override
  Future<void> processPendingOps() async {
    if (!await _isOnline) return;
    final ops = await _localSource.getPendingOps();
    if (ops.isNotEmpty) {
      await _processOps(ops);
    }
  }
}
