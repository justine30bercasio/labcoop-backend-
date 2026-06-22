class LoanPayment {
  final String id;
  final String loanId;
  final double amount;
  final double principalPaid;
  final double interestPaid;
  final double balanceBefore;
  final double balanceAfter;
  final DateTime? dueDate;
  final DateTime paidAt;

  const LoanPayment({
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
}
