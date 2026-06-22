import '../models/savings_account_model.dart';
import '../models/goal_jar_model.dart';
import '../models/badge_model.dart';

class SampleApiSource {
  static const _sampleAccountId = 'sample-account-1';

  final _account = const SavingsAccountModel(
    accountId: _sampleAccountId,
    childName: 'Alex',
    actualBalance: 150.00,
    unallocatedBalance: 50.00,
    currentXp: 120,
  );

  final _goals = const [
    GoalJarModel(
      goalId: 'goal-1',
      accountId: _sampleAccountId,
      title: 'Lego Set',
      targetAmount: 80.00,
      currentAllocated: 35.00,
      categoryIcon: '🧩',
    ),
    GoalJarModel(
      goalId: 'goal-2',
      accountId: _sampleAccountId,
      title: 'Video Game',
      targetAmount: 60.00,
      currentAllocated: 20.00,
      categoryIcon: '🎮',
    ),
    GoalJarModel(
      goalId: 'goal-3',
      accountId: _sampleAccountId,
      title: 'New Bike',
      targetAmount: 200.00,
      currentAllocated: 0.00,
      categoryIcon: '🚲',
    ),
  ];

  final _badges = const [
    BadgeModel(
      badgeId: 'badge-1',
      name: 'First Save',
      description: 'Saved money for the first time',
      iconUrl: 'badges/first_save.png',
      requiredXp: 10,
      isUnlocked: true,
    ),
    BadgeModel(
      badgeId: 'badge-2',
      name: 'Super Saver',
      description: 'Earned 100 XP',
      iconUrl: 'badges/super_saver.png',
      requiredXp: 100,
      isUnlocked: true,
    ),
    BadgeModel(
      badgeId: 'badge-3',
      name: 'Goal Crusher',
      description: 'Completed a savings goal',
      iconUrl: 'badges/goal_crusher.png',
      requiredXp: 200,
    ),
  ];

  SavingsAccountModel fetchAccount(String accountId) =>
      SavingsAccountModel(
        accountId: accountId,
        childName: _account.childName,
        actualBalance: _account.actualBalance,
        unallocatedBalance: _account.unallocatedBalance,
        currentXp: _account.currentXp,
      );

  List<GoalJarModel> fetchGoals(String accountId) =>
      _goals.map((g) => GoalJarModel(
        goalId: g.goalId,
        accountId: accountId,
        title: g.title,
        targetAmount: g.targetAmount,
        currentAllocated: g.currentAllocated,
        categoryIcon: g.categoryIcon,
      )).where((g) => g.accountId == accountId).toList();

  List<BadgeModel> fetchBadges(String accountId) => _badges;

  SavingsAccountModel updateAccount(SavingsAccountModel account) => account;

  GoalJarModel updateGoal(GoalJarModel goal) => goal;

  void createGoal(GoalJarModel goal) {}
}
