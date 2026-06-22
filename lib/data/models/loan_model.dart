import '../../domain/entities/loan.dart';

class LoanModel {
  final String id;
  final String accountId;
  final String productId;
  final double principal;
  final double interestRate;
  final String interestType;
  final int termMonths;
  final double monthlyAmortization;
  final double totalPayable;
  final double amountPaid;
  final double remainingBalance;
  final String status;
  final String? approvedBy;
  final String? approvedAt;
  final String? disbursedAt;
  final String purpose;
  final String createdAt;

  const LoanModel({
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

  factory LoanModel.fromJson(Map<String, dynamic> json) {
    return LoanModel(
      id: json['loan_id'] as String,
      accountId: json['account_id'] as String,
      productId: json['product_id'] as String? ?? '',
      principal: (json['principal'] as num).toDouble(),
      interestRate: (json['interest_rate'] as num).toDouble(),
      interestType: json['interest_type'] as String? ?? 'flat',
      termMonths: json['term_months'] as int,
      monthlyAmortization: (json['monthly_amortization'] as num).toDouble(),
      totalPayable: (json['total_payable'] as num).toDouble(),
      amountPaid: (json['amount_paid'] as num?)?.toDouble() ?? 0,
      remainingBalance: (json['remaining_balance'] as num).toDouble(),
      status: json['status'] as String,
      approvedBy: json['approved_by'] as String?,
      approvedAt: json['approved_at'] as String?,
      disbursedAt: json['disbursed_at'] as String?,
      purpose: json['purpose'] as String? ?? '',
      createdAt: json['created_at'] as String? ?? DateTime.now().toIso8601String(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'loan_id': id,
      'account_id': accountId,
      'product_id': productId,
      'principal': principal,
      'interest_rate': interestRate,
      'interest_type': interestType,
      'term_months': termMonths,
      'monthly_amortization': monthlyAmortization,
      'total_payable': totalPayable,
      'amount_paid': amountPaid,
      'remaining_balance': remainingBalance,
      'status': status,
      'approved_by': approvedBy,
      'approved_at': approvedAt,
      'disbursed_at': disbursedAt,
      'purpose': purpose,
      'created_at': createdAt,
    };
  }

  Loan toEntity() {
    return Loan(
      id: id,
      accountId: accountId,
      productId: productId,
      principal: principal,
      interestRate: interestRate,
      interestType: interestType == 'diminishing' ? InterestType.diminishing : InterestType.flat,
      termMonths: termMonths,
      monthlyAmortization: monthlyAmortization,
      totalPayable: totalPayable,
      amountPaid: amountPaid,
      remainingBalance: remainingBalance,
      status: _parseStatus(status),
      approvedBy: approvedBy,
      approvedAt: approvedAt != null ? DateTime.parse(approvedAt!) : null,
      disbursedAt: disbursedAt != null ? DateTime.parse(disbursedAt!) : null,
      purpose: purpose,
      createdAt: DateTime.parse(createdAt),
    );
  }

  factory LoanModel.fromEntity(Loan entity) {
    return LoanModel(
      id: entity.id,
      accountId: entity.accountId,
      productId: entity.productId,
      principal: entity.principal,
      interestRate: entity.interestRate,
      interestType: entity.interestType == InterestType.diminishing ? 'diminishing' : 'flat',
      termMonths: entity.termMonths,
      monthlyAmortization: entity.monthlyAmortization,
      totalPayable: entity.totalPayable,
      amountPaid: entity.amountPaid,
      remainingBalance: entity.remainingBalance,
      status: _statusToString(entity.status),
      approvedBy: entity.approvedBy,
      approvedAt: entity.approvedAt?.toIso8601String(),
      disbursedAt: entity.disbursedAt?.toIso8601String(),
      purpose: entity.purpose,
      createdAt: entity.createdAt.toIso8601String(),
    );
  }

  static LoanStatus _parseStatus(String s) {
    switch (s) {
      case 'pending': return LoanStatus.pending;
      case 'approved': return LoanStatus.approved;
      case 'active': return LoanStatus.active;
      case 'paid': return LoanStatus.paid;
      case 'defaulted': return LoanStatus.defaulted;
      default: return LoanStatus.pending;
    }
  }

  static String _statusToString(LoanStatus s) {
    switch (s) {
      case LoanStatus.pending: return 'pending';
      case LoanStatus.approved: return 'approved';
      case LoanStatus.active: return 'active';
      case LoanStatus.paid: return 'paid';
      case LoanStatus.defaulted: return 'defaulted';
    }
  }
}
