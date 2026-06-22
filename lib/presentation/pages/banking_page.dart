import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../domain/entities/transaction.dart';
import '../blocs/banking_bloc.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_state.dart';
import 'auto_save_page.dart';
import 'loan_products_page.dart';
import 'my_loans_page.dart';
import 'savings_open_page.dart';
import 'statement_page.dart';
import 'transaction_history_page.dart';
import 'loan_apply_page.dart';
import 'withdrawal_request_page.dart';

class BankingPage extends StatefulWidget {
  final String accountId;
  const BankingPage({super.key, required this.accountId});

  @override
  State<BankingPage> createState() => _BankingPageState();
}

class _BankingPageState extends State<BankingPage> {
  Map<String, dynamic>? _interestData;
  bool _interestLoading = false;

  @override
  void initState() {
    super.initState();
    context.read<BankingBloc>().add(LoadTransactions(widget.accountId));
    _loadInterest();
  }

  Future<void> _loadInterest() async {
    setState(() => _interestLoading = true);
    final data = await BankingApiService.getInterest(widget.accountId);
    if (!mounted) return;
    setState(() { _interestData = data; _interestLoading = false; });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Microbanking'), actions: [
        TextButton.icon(
          onPressed: () => Navigator.push(context, PageTransition.slideUp(const LoanProductsPage())),
          icon: const Icon(Icons.request_page, color: Colors.white),
          label: const Text('Loans', style: TextStyle(color: Colors.white)),
        ),
      ]),
      body: BlocBuilder<SavingsBloc, SavingsState>(
        builder: (context, savingsState) {
          final balance = savingsState is SavingsLoaded ? savingsState.account.actualBalance : 0.0;
          final unallocated = savingsState is SavingsLoaded ? savingsState.account.unallocatedBalance : 0.0;

          return BlocBuilder<BankingBloc, BankingState>(
            builder: (context, state) {
              return SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _balanceCard(balance, unallocated),
                    const SizedBox(height: 16),
                    _quickActions(context, balance),
                    const SizedBox(height: 20),
                    _interestSection(),
                    const SizedBox(height: 24),
                    _recentTransactions(state.transactions),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _balanceCard(double balance, double unallocated) {
    return Card(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.primaryGreen, Color(0xFF1B5E20)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.all(Radius.circular(16)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Total Balance', style: TextStyle(color: Colors.white70, fontSize: 14)),
            const SizedBox(height: 4),
            Text('PHP ${balance.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Available: PHP ${unallocated.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white60, fontSize: 14)),
          ],
        ),
      ),
    );
  }

  Widget _quickActions(BuildContext context, double currentBalance) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Quick Actions', style: AppTextStyle.heading3),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _actionChip(Icons.request_page, 'Apply Loan', AppTheme.waterBlue, () {
              Navigator.push(context, PageTransition.slideUp(const LoanApplyPage()));
            }),
            _actionChip(Icons.account_balance, 'My Loans', AppTheme.xpPurple, () {
              Navigator.push(context, PageTransition.slideUp(MyLoansPage(accountId: widget.accountId)));
            }),
            _actionChip(Icons.receipt_long, 'History', AppTheme.accentAmber, () {
              Navigator.push(context, PageTransition.slideUp(TransactionHistoryPage(accountId: widget.accountId)));
            }),
            _actionChip(Icons.store, 'Loan Products', AppTheme.coinGold, () {
              Navigator.push(context, PageTransition.slideUp(const LoanProductsPage()));
            }),
            _actionChip(Icons.receipt_long, 'Statement', AppTheme.primaryGreen, () {
              Navigator.push(context, PageTransition.slideUp(StatementPage(accountId: widget.accountId)));
            }),
            _actionChip(Icons.account_balance, 'Open Savings', AppTheme.waterBlue, () {
              Navigator.push(context, PageTransition.slideUp(SavingsOpenPage(accountId: widget.accountId)));
            }),
            _actionChip(Icons.timer, 'Auto-Save', AppTheme.coinGold, () {
              Navigator.push(context, PageTransition.slideUp(AutoSavePage(accountId: widget.accountId)));
            }),
            _actionChip(Icons.money_off, 'Withdraw Request', AppTheme.accentAmber, () {
              Navigator.push(context, PageTransition.slideUp(WithdrawalRequestPage(
                accountId: widget.accountId,
                currentBalance: currentBalance,
              )));
            }),
          ],
        ),
      ],
    );
  }

  Widget _actionChip(IconData icon, String label, Color color, VoidCallback onTap) {
    return Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _recentTransactions(List<Transaction> transactions) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Recent Transactions', style: AppTextStyle.heading3),
            TextButton(
              onPressed: () => Navigator.push(context, PageTransition.slideUp(TransactionHistoryPage(accountId: widget.accountId))),
              child: const Text('See All'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (transactions.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No transactions yet'))))
        else
          ...transactions.take(5).map((t) => _transactionTile(t)),
      ],
    );
  }

  Widget _transactionTile(Transaction t) {
    final isCredit = t.type == TransactionType.deposit || t.type == TransactionType.loanDisbursement || t.type == TransactionType.interestCredit;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: (isCredit ? Colors.green : Colors.red).withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            isCredit ? Icons.arrow_downward : Icons.arrow_upward,
            color: isCredit ? Colors.green : Colors.red,
            size: 20,
          ),
        ),
        title: Text(t.description, style: const TextStyle(fontWeight: FontWeight.w500)),
        subtitle: Text(_formatDate(t.createdAt), style: AppTextStyle.bodySmall),
        trailing: Text(
          '${isCredit ? '+' : '-'}PHP ${t.amount.toStringAsFixed(2)}',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: isCredit ? Colors.green : Colors.red,
            fontSize: 15,
          ),
        ),
      ),
    );
  }

  Widget _interestSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.monetization_on, color: AppTheme.coinGold, size: 20),
                const SizedBox(width: 8),
                Text('Interest Earned', style: AppTextStyle.heading3),
              ],
            ),
            const SizedBox(height: 8),
            if (_interestLoading)
              const SizedBox(height: 30, child: Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))))
            else if (_interestData == null)
              const Text('Unable to load interest data', style: TextStyle(color: Colors.grey))
            else ...[
              Text(
                'PHP ${(_interestData!['interest_earned'] ?? 0).toDouble().toStringAsFixed(2)}',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppTheme.primaryGreen),
              ),
              if (_interestData!['projected_yearly'] != null)
                Text('Projected yearly: PHP ${(_interestData!['projected_yearly']).toDouble().toStringAsFixed(2)}',
                  style: AppTextStyle.bodySmall),
              if (_interestData!['recent_interest'] != null && (_interestData!['recent_interest'] as List).isNotEmpty) ...[
                const SizedBox(height: 8),
                const Divider(),
                ...(_interestData!['recent_interest'] as List).take(3).map((tx) {
                  final t = tx as Map<String, dynamic>;
                  final amt = (t['amount'] ?? 0).toDouble();
                  final desc = t['description']?.toString() ?? 'Interest';
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Expanded(child: Text(desc, style: const TextStyle(fontSize: 13))),
                        Text('+PHP ${amt.toStringAsFixed(2)}', style: const TextStyle(color: Colors.green, fontWeight: FontWeight.w600, fontSize: 13)),
                      ],
                    ),
                  );
                }),
              ],
            ],
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    return '${dt.month}/${dt.day}/${dt.year} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
