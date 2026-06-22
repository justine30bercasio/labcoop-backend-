class Loan {
  final String id;
  final String accountId;
  final String productId;
  final double principal;
  final double interestRate;
  final InterestType interestType;
  final int termMonths;
  final double monthlyAmortization;
  final double totalPayable;
  final double amountPaid;
  final double remainingBalance;
  final LoanStatus status;
  final String? approvedBy;
  final DateTime? approvedAt;
  final DateTime? disbursedAt;
  final String purpose;
  final DateTime createdAt;

  const Loan({
    required this.id,
    required this.accountId,
    required this.productId,
    required this.principal,
    required this.interestRate,
    required this.interestType,
    required this.termMonths,
    required this.monthlyAmortization,
    required this.totalPayable,
    required this.amountPaid,
    required this.remainingBalance,
    required this.status,
    this.approvedBy,
    this.approvedAt,
    this.disbursedAt,
    required this.purpose,
    required this.createdAt,
  });

  double get progress => totalPayable > 0 ? amountPaid / totalPayable : 0;

  Loan copyWith({
    String? id,
    String? accountId,
    String? productId,
    double? principal,
    double? interestRate,
    InterestType? interestType,
    int? termMonths,
    double? monthlyAmortization,
    double? totalPayable,
    double? amountPaid,
    double? remainingBalance,
    LoanStatus? status,
    String? approvedBy,
    DateTime? approvedAt,
    DateTime? disbursedAt,
    String? purpose,
    DateTime? createdAt,
  }) {
    return Loan(
      id: id ?? this.id,
      accountId: accountId ?? this.accountId,
      productId: productId ?? this.productId,
      principal: principal ?? this.principal,
      interestRate: interestRate ?? this.interestRate,
      interestType: interestType ?? this.interestType,
      termMonths: termMonths ?? this.termMonths,
      monthlyAmortization: monthlyAmortization ?? this.monthlyAmortization,
      totalPayable: totalPayable ?? this.totalPayable,
      amountPaid: amountPaid ?? this.amountPaid,
      remainingBalance: remainingBalance ?? this.remainingBalance,
      status: status ?? this.status,
      approvedBy: approvedBy ?? this.approvedBy,
      approvedAt: approvedAt ?? this.approvedAt,
      disbursedAt: disbursedAt ?? this.disbursedAt,
      purpose: purpose ?? this.purpose,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}

enum InterestType { flat, diminishing }

enum LoanStatus { pending, approved, active, paid, defaulted }
