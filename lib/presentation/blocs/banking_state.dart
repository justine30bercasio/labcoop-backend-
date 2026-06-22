part of 'banking_bloc.dart';

enum TransactionStatus { initial, loading, loaded, error }

class BankingState extends Equatable {
  final TransactionStatus transactionStatus;
  final List<Transaction> transactions;
  final List<SavingsProduct> savingsProducts;
  final String? errorMessage;

  const BankingState({
    this.transactionStatus = TransactionStatus.initial,
    this.transactions = const [],
    this.savingsProducts = const [],
    this.errorMessage,
  });

  BankingState copyWith({
    TransactionStatus? transactionStatus,
    List<Transaction>? transactions,
    List<SavingsProduct>? savingsProducts,
    String? errorMessage,
  }) {
    return BankingState(
      transactionStatus: transactionStatus ?? this.transactionStatus,
      transactions: transactions ?? this.transactions,
      savingsProducts: savingsProducts ?? this.savingsProducts,
      errorMessage: errorMessage,
    );
  }

  @override
  List<Object?> get props => [transactionStatus, transactions, savingsProducts, errorMessage];
}
