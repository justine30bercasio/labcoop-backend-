part of 'loan_bloc.dart';

abstract class LoanEvent extends Equatable {
  const LoanEvent();

  @override
  List<Object?> get props => [];
}

class LoadMyLoans extends LoanEvent {
  final String accountId;
  const LoadMyLoans(this.accountId);

  @override
  List<Object?> get props => [accountId];
}

class LoadLoanProducts extends LoanEvent {
  const LoadLoanProducts();
}

class ApplyForLoan extends LoanEvent {
  final Loan loan;
  const ApplyForLoan(this.loan);

  @override
  List<Object?> get props => [loan];
}

class ApproveLoanEvent extends LoanEvent {
  final String loanId;
  final String approvedBy;
  final String accountId;
  const ApproveLoanEvent(this.loanId, this.approvedBy, this.accountId);

  @override
  List<Object?> get props => [loanId, approvedBy];
}

class DisburseLoanEvent extends LoanEvent {
  final String loanId;
  final String accountId;
  const DisburseLoanEvent(this.loanId, this.accountId);

  @override
  List<Object?> get props => [loanId];
}

class MakeLoanPaymentEvent extends LoanEvent {
  final String loanId;
  final double amount;
  final String accountId;
  const MakeLoanPaymentEvent(this.loanId, this.amount, this.accountId);

  @override
  List<Object?> get props => [loanId, amount, accountId];
}

class LoadLoanSchedule extends LoanEvent {
  final String loanId;
  const LoadLoanSchedule(this.loanId);

  @override
  List<Object?> get props => [loanId];
}
