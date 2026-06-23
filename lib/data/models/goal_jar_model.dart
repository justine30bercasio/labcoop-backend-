import '../../domain/entities/goal_jar.dart';

class GoalJarModel {
  final String goalId;
  final String accountId;
  final String title;
  final double targetAmount;
  final double currentAllocated;
  final String categoryIcon;

  const GoalJarModel({
    required this.goalId,
    required this.accountId,
    required this.title,
    required this.targetAmount,
    required this.currentAllocated,
    required this.categoryIcon,
  });

  factory GoalJarModel.fromJson(Map<String, dynamic> json) {
    double n(v) => v is String ? double.parse(v) : (v as num).toDouble();
    return GoalJarModel(
      goalId: json['goal_id'] as String,
      accountId: json['account_id'] as String,
      title: json['title'] as String,
      targetAmount: n(json['target_amount']),
      currentAllocated: n(json['current_allocated']),
      categoryIcon: json['category_icon'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'goal_id': goalId,
      'account_id': accountId,
      'title': title,
      'target_amount': targetAmount,
      'current_allocated': currentAllocated,
      'category_icon': categoryIcon,
    };
  }

  GoalJar toEntity() {
    return GoalJar(
      goalId: goalId,
      accountId: accountId,
      title: title,
      targetAmount: targetAmount,
      currentAllocated: currentAllocated,
      categoryIcon: categoryIcon,
    );
  }

  factory GoalJarModel.fromEntity(GoalJar entity) {
    return GoalJarModel(
      goalId: entity.goalId,
      accountId: entity.accountId,
      title: entity.title,
      targetAmount: entity.targetAmount,
      currentAllocated: entity.currentAllocated,
      categoryIcon: entity.categoryIcon,
    );
  }
}
