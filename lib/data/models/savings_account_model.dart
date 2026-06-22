import '../../domain/entities/savings_account.dart';

class SavingsAccountModel {
  final String accountId;
  final String childName;
  final double actualBalance;
  final double unallocatedBalance;
  final int currentXp;

  const SavingsAccountModel({
    required this.accountId,
    required this.childName,
    required this.actualBalance,
    required this.unallocatedBalance,
    required this.currentXp,
  });

  factory SavingsAccountModel.fromJson(Map<String, dynamic> json) {
    return SavingsAccountModel(
      accountId: json['account_id'] as String,
      childName: json['child_name'] as String,
      actualBalance: (json['actual_balance'] as num).toDouble(),
      unallocatedBalance: (json['unallocated_balance'] as num).toDouble(),
      currentXp: json['current_xp'] as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'account_id': accountId,
      'child_name': childName,
      'actual_balance': actualBalance,
      'unallocated_balance': unallocatedBalance,
      'current_xp': currentXp,
    };
  }

  SavingsAccount toEntity() {
    return SavingsAccount(
      accountId: accountId,
      childName: childName,
      actualBalance: actualBalance,
      unallocatedBalance: unallocatedBalance,
      currentXp: currentXp,
    );
  }

  factory SavingsAccountModel.fromEntity(SavingsAccount entity) {
    return SavingsAccountModel(
      accountId: entity.accountId,
      childName: entity.childName,
      actualBalance: entity.actualBalance,
      unallocatedBalance: entity.unallocatedBalance,
      currentXp: entity.currentXp,
    );
  }
}
