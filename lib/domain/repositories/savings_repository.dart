import '../entities/savings_account.dart';
import '../entities/goal_jar.dart';
import '../entities/badge.dart';

abstract class SavingsRepository {
  Future<SavingsAccount> getAccount(String accountId);
  Future<List<GoalJar>> getGoals(String accountId);
  Future<List<Badge>> getBadges(String accountId);
  Future<SavingsAccount> updateAccount(SavingsAccount account);
  Future<GoalJar> updateGoal(GoalJar goal);
  Future<GoalJar> createGoal(GoalJar goal);
  Future<void> deleteGoal(String goalId);
  Future<void> syncWithServer();
  Future<List<GoalJar>> pullGoalsFromServer(String accountId);
  Future<List<Badge>> pullBadgesFromServer(String accountId);
  Future<SavingsAccount> pullAccountFromServer(String accountId);
  Future<int> getPendingOpsCount();
  Future<void> processPendingOps();
}
