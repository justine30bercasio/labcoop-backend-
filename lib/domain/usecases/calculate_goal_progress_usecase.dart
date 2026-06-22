import '../entities/goal_jar.dart';

class CalculateGoalProgressUseCase {
  const CalculateGoalProgressUseCase();

  double call(GoalJar goal) => goal.progressPercentage;

  int daysToCompletion({
    required GoalJar goal,
    required double averageWeeklyDeposit,
  }) {
    if (averageWeeklyDeposit <= 0) return -1;
    final weeks = goal.remainingAmount / averageWeeklyDeposit;
    return (weeks * 7).ceil();
  }

  double amountToReachNextMilestone(GoalJar goal) {
    const milestones = [0.25, 0.5, 0.75, 1.0];
    final current = goal.progressPercentage;

    for (final milestone in milestones) {
      if (current < milestone) {
        return (milestone * goal.targetAmount) - goal.currentAllocated;
      }
    }
    return 0;
  }
}
