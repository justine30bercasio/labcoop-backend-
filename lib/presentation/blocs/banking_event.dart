part of 'banking_bloc.dart';

abstract class BankingEvent extends Equatable {
  const BankingEvent();

  @override
  List<Object?> get props => [];
}

class LoadTransactions extends BankingEvent {
  final String accountId;
  const LoadTransactions(this.accountId);

  @override
  List<Object?> get props => [accountId];
}

class LoadSavingsProducts extends BankingEvent {
  const LoadSavingsProducts();
}

class CreateTransactionEvent extends BankingEvent {
  final Transaction transaction;
  const CreateTransactionEvent(this.transaction);

  @override
  List<Object?> get props => [transaction];
}
