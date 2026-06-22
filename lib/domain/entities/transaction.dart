class Transaction {
  final String id;
  final String accountId;
  final TransactionType type;
  final double amount;
  final double balanceBefore;
  final double balanceAfter;
  final String description;
  final String? referenceType;
  final String? referenceId;
  final DateTime createdAt;

  const Transaction({
    required this.id,
    required this.accountId,
    required this.type,
    required this.amount,
    required this.balanceBefore,
    required this.balanceAfter,
    required this.description,
    this.referenceType,
    this.referenceId,
    required this.createdAt,
  });

  Transaction copyWith({
    String? id,
    String? accountId,
    TransactionType? type,
    double? amount,
    double? balanceBefore,
    double? balanceAfter,
    String? description,
    String? referenceType,
    String? referenceId,
    DateTime? createdAt,
  }) {
    return Transaction(
      id: id ?? this.id,
      accountId: accountId ?? this.accountId,
      type: type ?? this.type,
      amount: amount ?? this.amount,
      balanceBefore: balanceBefore ?? this.balanceBefore,
      balanceAfter: balanceAfter ?? this.balanceAfter,
      description: description ?? this.description,
      referenceType: referenceType ?? this.referenceType,
      referenceId: referenceId ?? this.referenceId,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

enum TransactionType {
  deposit,
  withdrawal,
  transfer,
  loanDisbursement,
  loanPayment,
  interestCredit,
  fee,
  allocation,
}
