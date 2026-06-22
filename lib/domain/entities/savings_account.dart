class SavingsAccount {
  final String accountId;
  final String childName;
  final double actualBalance;
  final double unallocatedBalance;
  final int currentXp;

  const SavingsAccount({
    required this.accountId,
    required this.childName,
    required this.actualBalance,
    required this.unallocatedBalance,
    required this.currentXp,
  });

  double get allocatedBalance => actualBalance - unallocatedBalance;

  SavingsAccount copyWith({
    String? accountId,
    String? childName,
    double? actualBalance,
    double? unallocatedBalance,
    int? currentXp,
  }) {
    return SavingsAccount(
      accountId: accountId ?? this.accountId,
      childName: childName ?? this.childName,
      actualBalance: actualBalance ?? this.actualBalance,
      unallocatedBalance: unallocatedBalance ?? this.unallocatedBalance,
      currentXp: currentXp ?? this.currentXp,
    );
  }
}
