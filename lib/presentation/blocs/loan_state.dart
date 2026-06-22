part of 'loan_bloc.dart';

enum LoanStatusBloc { initial, loading, loaded, error }
enum LoanSubmitStatus { idle, submitting, success, error }

class LoanState extends Equatable {
  final LoanStatusBloc loanStatus;
  final LoanSubmitStatus submitStatus;
  final List<Loan> loans;
  final List<LoanProduct> loanProducts;
  final List<LoanPayment> loanPayments;
  final String? errorMessage;

  const LoanState({
    this.loanStatus = LoanStatusBloc.initial,
    this.submitStatus = LoanSubmitStatus.idle,
    this.loans = const [],
    this.loanProducts = const [],
    this.loanPayments = const [],
    this.errorMessage,
  });

  LoanState copyWith({
    LoanStatusBloc? loanStatus,
    LoanSubmitStatus? submitStatus,
    List<Loan>? loans,
    List<LoanProduct>? loanProducts,
    List<LoanPayment>? loanPayments,
    String? errorMessage,
  }) {
    return LoanState(
      loanStatus: loanStatus ?? this.loanStatus,
      submitStatus: submitStatus ?? this.submitStatus,
      loans: loans ?? this.loans,
      loanProducts: loanProducts ?? this.loanProducts,
      loanPayments: loanPayments ?? this.loanPayments,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [loanStatus, submitStatus, loans, loanProducts, loanPayments, errorMessage];
}
