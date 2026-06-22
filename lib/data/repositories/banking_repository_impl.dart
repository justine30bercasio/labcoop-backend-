import 'package:connectivity_plus/connectivity_plus.dart';
import '../../core/errors/exceptions.dart';
import '../../domain/entities/transaction.dart';
import '../../domain/entities/loan.dart';
import '../../domain/entities/loan_product.dart';
import '../../domain/entities/loan_payment.dart';
import '../../domain/entities/savings_product.dart';
import '../../domain/repositories/banking_repository.dart';
import '../datasources/remote_api_source.dart';
import '../datasources/local_db_source.dart';
import '../models/transaction_model.dart';
import '../models/loan_model.dart';


class BankingRepositoryImpl implements BankingRepository {
  final RemoteApiSource _remoteSource;
  final LocalDbSource _localSource;
  final Connectivity _connectivity;

  BankingRepositoryImpl(
    this._remoteSource,
    this._localSource,
    this._connectivity,
  );

  Future<bool> get _isOnline async {
    try {
      final result = await _connectivity.checkConnectivity();
      return result != ConnectivityResult.none;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<List<Transaction>> getTransactions(String accountId, {int limit = 50, int offset = 0}) async {
    if (await _isOnline) {
      try {
        final models = await _remoteSource.fetchTransactions(accountId, limit: limit, offset: offset);
        await _localSource.saveTransactions(models);
        return models.map((m) => m.toEntity()).toList();
      } catch (_) {}
    }

    final cached = await _localSource.getTransactions(accountId, limit: limit, offset: offset);
    if (cached.isNotEmpty) return cached.map((m) => m.toEntity()).toList();
    return [];
  }

  @override
  Future<Transaction> createTransaction(Transaction transaction) async {
    final model = TransactionModel.fromEntity(transaction);
    if (await _isOnline) {
      try {
        final created = await _remoteSource.createTransaction(model);
        await _localSource.saveTransactions([created]);
        return created.toEntity();
      } on NetworkException {
        // offline, queue it
      } catch (_) {}
    }

    await _localSource.saveTransactions([model]);
    await _localSource.addPendingOp({
      'type': 'CREATE_TRANSACTION',
      'payload': model.toJson(),
      'createdAt': DateTime.now().toIso8601String(),
      'retryCount': 0,
    });
    return transaction;
  }

  @override
  Future<List<Transaction>> pullTransactionsFromServer(String accountId) async {
    final models = await _remoteSource.fetchTransactions(accountId);
    await _localSource.saveTransactions(models);
    return models.map((m) => m.toEntity()).toList();
  }

  @override
  Future<List<Loan>> getLoans(String accountId) async {
    if (await _isOnline) {
      try {
        final models = await _remoteSource.fetchLoans(accountId);
        await _localSource.saveLoans(models);
        return models.map((m) => m.toEntity()).toList();
      } on NetworkException {
        // fall through
      } catch (_) {}
    }
    final cached = await _localSource.getLoans(accountId);
    return cached.map((m) => m.toEntity()).toList();
  }

  @override
  Future<Loan> getLoan(String loanId) async {
    if (await _isOnline) {
      try {
        final model = await _remoteSource.fetchLoan(loanId);
        await _localSource.saveLoan(model);
        return model.toEntity();
      } on NetworkException {
        // fall through
      } catch (_) {}
    }
    final cached = await _localSource.getLoan(loanId);
    if (cached != null) return cached.toEntity();
    throw ServerException(message: 'Loan not found', statusCode: 404);
  }

  @override
  Future<Loan> applyForLoan(Loan loan) async {
    final model = LoanModel.fromEntity(loan);
    if (await _isOnline) {
      try {
        final created = await _remoteSource.applyLoan(model);
        await _localSource.saveLoan(created);
        return created.toEntity();
      } on NetworkException {
        // offline, queue it
      } catch (_) {}
    }
    await _localSource.saveLoan(model);
    await _localSource.addPendingOp({
      'type': 'APPLY_LOAN',
      'payload': model.toJson(),
      'createdAt': DateTime.now().toIso8601String(),
      'retryCount': 0,
    });
    return loan;
  }

  @override
  Future<Loan> approveLoan(String loanId, String approvedBy) async {
    final model = await _remoteSource.approveLoan(loanId, approvedBy);
    await _localSource.saveLoan(model);
    return model.toEntity();
  }

  @override
  Future<Loan> disburseLoan(String loanId) async {
    final model = await _remoteSource.disburseLoan(loanId);
    await _localSource.saveLoan(model);
    return model.toEntity();
  }

  @override
  Future<Loan> makeLoanPayment({
    required String loanId,
    required double amount,
    required String accountId,
  }) async {
    final result = await _remoteSource.makeLoanPayment(loanId, amount: amount, accountId: accountId);
    final model = LoanModel.fromJson(result['loan'] as Map<String, dynamic>);
    await _localSource.saveLoan(model);
    return model.toEntity();
  }

  @override
  Future<List<LoanProduct>> getLoanProducts() async {
    if (await _isOnline) {
      try {
        final models = await _remoteSource.fetchLoanProducts();
        await _localSource.saveLoanProducts(models);
        return models.map((m) => m.toEntity()).toList();
      } on NetworkException {
        // fall through
      } catch (_) {}
    }
    final cached = await _localSource.getLoanProducts();
    return cached.map((m) => m.toEntity()).toList();
  }

  @override
  Future<List<SavingsProduct>> getSavingsProducts() async {
    if (await _isOnline) {
      try {
        final models = await _remoteSource.fetchSavingsProducts();
        await _localSource.saveSavingsProducts(models);
        return models.map((m) => m.toEntity()).toList();
      } on NetworkException {
        // fall through
      } catch (_) {}
    }
    final cached = await _localSource.getSavingsProducts();
    return cached.map((m) => m.toEntity()).toList();
  }

  @override
  Future<List<LoanPayment>> getLoanPayments(String loanId) async {
    if (await _isOnline) {
      try {
        final payments = await _remoteSource.fetchLoanPayments(loanId);
        await _localSource.saveLoanPayments(payments);
        return payments.map((m) => m.toEntity()).toList();
      } on NetworkException {
        // fall through
      } catch (_) {}
    }
    final cached = await _localSource.getLoanPayments(loanId);
    return cached.map((m) => m.toEntity()).toList();
  }

  @override
  Future<void> syncWithServer() async {
    if (!await _isOnline) throw NetworkException('No internet connection');
    final ops = await _localSource.getPendingOps();
    for (int i = ops.length - 1; i >= 0; i--) {
      final op = ops[i];
      if (((op['retryCount'] as int?) ?? 0) >= 5) {
        await _localSource.removePendingOp(i);
        continue;
      }
      try {
        switch (op['type'] as String) {
          case 'CREATE_TRANSACTION':
            final m = TransactionModel.fromJson(op['payload'] as Map<String, dynamic>);
            await _remoteSource.createTransaction(m);
            break;
          case 'APPLY_LOAN':
            final m = LoanModel.fromJson(op['payload'] as Map<String, dynamic>);
            await _remoteSource.applyLoan(m);
            break;
        }
        await _localSource.removePendingOp(i);
      } on NetworkException {
        op['retryCount'] = ((op['retryCount'] as int?) ?? 0) + 1;
      } catch (_) {
        op['retryCount'] = ((op['retryCount'] as int?) ?? 0) + 1;
      }
    }
  }
}
