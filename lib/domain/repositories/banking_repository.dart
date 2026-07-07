import '../entities/transaction.dart';
import '../entities/loan.dart';
import '../entities/loan_product.dart';
import '../entities/loan_payment.dart';
import '../entities/savings_product.dart';

abstract class BankingRepository {
  Future<List<Transaction>> getTransactions(String accountId, {int limit, int offset});
  Future<Transaction> createTransaction(Transaction transaction);
  Future<List<Transaction>> pullTransactionsFromServer(String accountId);

  Future<List<Loan>> getLoans(String accountId);
  Future<Loan> getLoan(String loanId);
  Future<Loan> applyForLoan(Loan loan);
  Future<Loan> approveLoan(String loanId, String approvedBy);
  Future<Loan> disburseLoan(String loanId);
  Future<Loan> makeLoanPayment({
    required String loanId,
    required double amount,
    required String accountId,
  });

  Future<List<LoanProduct>> getLoanProducts();
  Future<List<SavingsProduct>> getSavingsProducts();
  Future<List<LoanPayment>> getLoanPayments(String loanId);

  Future<void> syncWithServer();

  // ── Coin Management ──
  Future<int> getCoins(String accountId);
  Future<int> addCoins(String accountId, int amount, String reason);
  Future<int> spendCoins(String accountId, int amount, String reason);
  Future<List<Map<String, dynamic>>> getCoinHistory(String accountId);
}
