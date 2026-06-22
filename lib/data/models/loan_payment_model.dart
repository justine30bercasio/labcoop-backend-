import '../../domain/entities/loan_payment.dart';

class LoanPaymentModel {
  final String id;
  final String loanId;
  final double amount;
  final double principalPaid;
  final double interestPaid;
  final double balanceBefore;
  final double balanceAfter;
  final String? dueDate;
  final String paidAt;

  const LoanPaymentModel({
    required this.id,
    required this.loanId,
    required this.amount,
    required this.principalPaid,
    required this.interestPaid,
    required this.balanceBefore,
    required this.balanceAfter,
    this.dueDate,
    required this.paidAt,
  });

  factory LoanPaymentModel.fromJson(Map<String, dynamic> json) {
    return LoanPaymentModel(
      id: json['payment_id'] as String,
      loanId: json['loan_id'] as String,
      amount: (json['amount'] as num).toDouble(),
      principalPaid: (json['principal_paid'] as num).toDouble(),
      interestPaid: (json['interest_paid'] as num).toDouble(),
      balanceBefore: (json['balance_before'] as num).toDouble(),
      balanceAfter: (json['balance_after'] as num).toDouble(),
      dueDate: json['due_date'] as String?,
      paidAt: json['paid_at'] as String? ?? DateTime.now().toIso8601String(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'payment_id': id,
      'loan_id': loanId,
      'amount': amount,
      'principal_paid': principalPaid,
      'interest_paid': interestPaid,
      'balance_before': balanceBefore,
      'balance_after': balanceAfter,
      'due_date': dueDate,
      'paid_at': paidAt,
    };
  }

  LoanPayment toEntity() {
    return LoanPayment(
      id: id,
      loanId: loanId,
      amount: amount,
      principalPaid: principalPaid,
      interestPaid: interestPaid,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      dueDate: dueDate != null ? DateTime.parse(dueDate!) : null,
      paidAt: DateTime.parse(paidAt),
    );
  }
}
