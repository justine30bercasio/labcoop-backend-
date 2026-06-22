class GoalJar {
  final String goalId;
  final String accountId;
  final String title;
  final double targetAmount;
  final double currentAllocated;
  final String categoryIcon;

  const GoalJar({
    required this.goalId,
    this.accountId = '',
    required this.title,
    required this.targetAmount,
    required this.currentAllocated,
    required this.categoryIcon,
  });

  double get progressPercentage =>
      (currentAllocated / targetAmount).clamp(0.0, 1.0);

  double get remainingAmount =>
      (targetAmount - currentAllocated).clamp(0.0, double.infinity);

  bool get isCompleted => currentAllocated >= targetAmount;

  GoalJar copyWith({
    String? goalId,
    String? accountId,
    String? title,
    double? targetAmount,
    double? currentAllocated,
    String? categoryIcon,
  }) {
    return GoalJar(
      goalId: goalId ?? this.goalId,
      accountId: accountId ?? this.accountId,
      title: title ?? this.title,
      targetAmount: targetAmount ?? this.targetAmount,
      currentAllocated: currentAllocated ?? this.currentAllocated,
      categoryIcon: categoryIcon ?? this.categoryIcon,
    );
  }
}
