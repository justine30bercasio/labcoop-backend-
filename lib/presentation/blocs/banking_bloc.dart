import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../domain/entities/transaction.dart';
import '../../domain/entities/savings_product.dart';
import '../../domain/repositories/banking_repository.dart';

part 'banking_event.dart';
part 'banking_state.dart';

class BankingBloc extends Bloc<BankingEvent, BankingState> {
  final BankingRepository _repository;

  BankingBloc(this._repository) : super(const BankingState()) {
    on<LoadTransactions>(_onLoadTransactions);
    on<LoadSavingsProducts>(_onLoadSavingsProducts);
    on<CreateTransactionEvent>(_onCreateTransaction);
  }

  Future<void> _onLoadTransactions(LoadTransactions event, Emitter<BankingState> emit) async {
    emit(state.copyWith(transactionStatus: TransactionStatus.loading));
    try {
      final transactions = await _repository.getTransactions(event.accountId);
      emit(state.copyWith(
        transactionStatus: TransactionStatus.loaded,
        transactions: transactions,
      ));
    } catch (e) {
      emit(state.copyWith(
        transactionStatus: TransactionStatus.error,
        errorMessage: e.toString(),
      ));
    }
  }

  Future<void> _onLoadSavingsProducts(LoadSavingsProducts event, Emitter<BankingState> emit) async {
    try {
      final products = await _repository.getSavingsProducts();
      emit(state.copyWith(savingsProducts: products));
    } catch (_) {}
  }

  Future<void> _onCreateTransaction(CreateTransactionEvent event, Emitter<BankingState> emit) async {
    try {
      await _repository.createTransaction(event.transaction);
      add(LoadTransactions(event.transaction.accountId));
    } catch (_) {}
  }
}
