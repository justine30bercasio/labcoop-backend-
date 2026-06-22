import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../domain/entities/loan.dart';
import '../../domain/entities/loan_product.dart';
import '../../domain/entities/loan_payment.dart';
import '../../domain/repositories/banking_repository.dart';

part 'loan_event.dart';
part 'loan_state.dart';

class LoanBloc extends Bloc<LoanEvent, LoanState> {
  final BankingRepository _repository;

  LoanBloc(this._repository) : super(const LoanState()) {
    on<LoadMyLoans>(_onLoadMyLoans);
    on<LoadLoanProducts>(_onLoadLoanProducts);
    on<ApplyForLoan>(_onApplyForLoan);
    on<ApproveLoanEvent>(_onApproveLoan);
    on<DisburseLoanEvent>(_onDisburseLoan);
    on<MakeLoanPaymentEvent>(_onMakeLoanPayment);
    on<LoadLoanSchedule>(_onLoadLoanSchedule);
  }

  Future<void> _onLoadMyLoans(LoadMyLoans event, Emitter<LoanState> emit) async {
    emit(state.copyWith(loanStatus: LoanStatusBloc.loading));
    try {
      final loans = await _repository.getLoans(event.accountId);
      emit(state.copyWith(loanStatus: LoanStatusBloc.loaded, loans: loans));
    } catch (e) {
      emit(state.copyWith(loanStatus: LoanStatusBloc.error, errorMessage: e.toString()));
    }
  }

  Future<void> _onLoadLoanProducts(LoadLoanProducts event, Emitter<LoanState> emit) async {
    try {
      final products = await _repository.getLoanProducts();
      emit(state.copyWith(loanProducts: products));
    } catch (_) {}
  }

  Future<void> _onApplyForLoan(ApplyForLoan event, Emitter<LoanState> emit) async {
    emit(state.copyWith(submitStatus: LoanSubmitStatus.submitting));
    try {
      await _repository.applyForLoan(event.loan);
      emit(state.copyWith(submitStatus: LoanSubmitStatus.success));
      add(LoadMyLoans(event.loan.accountId));
    } catch (e) {
      emit(state.copyWith(submitStatus: LoanSubmitStatus.error, errorMessage: e.toString()));
    }
  }

  Future<void> _onApproveLoan(ApproveLoanEvent event, Emitter<LoanState> emit) async {
    try {
      await _repository.approveLoan(event.loanId, event.approvedBy);
      add(LoadMyLoans(event.accountId));
    } catch (_) {}
  }

  Future<void> _onDisburseLoan(DisburseLoanEvent event, Emitter<LoanState> emit) async {
    try {
      await _repository.disburseLoan(event.loanId);
      add(LoadMyLoans(event.accountId));
    } catch (_) {}
  }

  Future<void> _onMakeLoanPayment(MakeLoanPaymentEvent event, Emitter<LoanState> emit) async {
    emit(state.copyWith(submitStatus: LoanSubmitStatus.submitting));
    try {
      await _repository.makeLoanPayment(
        loanId: event.loanId,
        amount: event.amount,
        accountId: event.accountId,
      );
      emit(state.copyWith(submitStatus: LoanSubmitStatus.success));
      add(LoadMyLoans(event.accountId));
    } catch (e) {
      emit(state.copyWith(submitStatus: LoanSubmitStatus.error, errorMessage: e.toString()));
    }
  }

  Future<void> _onLoadLoanSchedule(LoadLoanSchedule event, Emitter<LoanState> emit) async {
    try {
      final payments = await _repository.getLoanPayments(event.loanId);
      emit(state.copyWith(loanPayments: payments));
    } catch (_) {}
  }
}
