import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/network/banking_api_service.dart';
import '../../domain/entities/transaction.dart';
import '../blocs/banking_bloc.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_event.dart';
import '../blocs/savings_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import 'auto_save_page.dart';
import 'loan_apply_page.dart';
import 'loan_products_page.dart';
import 'my_loans_page.dart';
import 'online_deposit_page.dart';
import 'savings_open_page.dart';
import 'statement_page.dart';
import 'transaction_history_page.dart';
import 'withdrawal_request_page.dart';
import '../../core/helpers/number_helpers.dart';

class BankingPage extends StatefulWidget {
  final String accountId;
  const BankingPage({super.key, required this.accountId});

  @override
  State<BankingPage> createState() => _BankingPageState();
}

class _BankingPageState extends State<BankingPage> {
  bool _balanceVisible = true;
  Map<String, dynamic>? _interestData;
  bool _interestLoading = false;
  Timer? _withdrawPollTimer;
  final Map<String, String> _knownStatuses = {};
  List<dynamic> _withdrawalRequests = [];
  bool _withdrawLoading = true;

  @override
  void initState() {
    super.initState();
    context.read<BankingBloc>().add(LoadTransactions(widget.accountId));
    _loadInterest();
    _startWithdrawPolling();
  }

  @override
  void dispose() {
    _withdrawPollTimer?.cancel();
    super.dispose();
  }

  void _startWithdrawPolling() {
    _checkWithdrawStatus();
    _withdrawPollTimer = Timer.periodic(const Duration(seconds: 30), (_) => _checkWithdrawStatus());
  }

  Future<void> _checkWithdrawStatus() async {
    try {
      final requests = await BankingApiService.getWithdrawalRequests(widget.accountId);
      if (!mounted) return;
      _withdrawalRequests = requests;
      _withdrawLoading = false;
      if (mounted) setState(() {});
      for (final r in requests) {
        final id = r['request_id']?.toString() ?? '';
        final status = r['status']?.toString() ?? '';
        if (id.isEmpty) continue;
        final prevStatus = _knownStatuses[id];
        if (prevStatus == null) {
          _knownStatuses[id] = status;
        } else if (prevStatus != status && prevStatus == 'pending') {
          _knownStatuses[id] = status;
          if (!mounted) return;
          String msg;
          Color bg;
          switch (status) {
            case 'approved':
              msg = 'Withdrawal of PHP ${(r['amount'] ?? 0).toDouble().toStringAsFixed(2)} has been approved!';
              bg = Colors.green;
              break;
            case 'rejected':
              msg = 'Withdrawal request was rejected.';
              bg = Colors.red;
              break;
            case 'paid':
              msg = 'Withdrawal of PHP ${(r['amount'] ?? 0).toDouble().toStringAsFixed(2)} has been paid out!';
              bg = Colors.green;
              break;
            default:
              continue;
          }
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(msg),
            backgroundColor: bg,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 4),
          ));
        }
      }
    } catch (_) {
      _withdrawLoading = false;
    }
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
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Microbanking'), actions: [
        TextButton.icon(
          onPressed: () => Navigator.push(context, PageTransition.slideUp(const LoanProductsPage())),
          icon: const Icon(Icons.request_page, color: Colors.white),
          label: const Text('Loans', style: TextStyle(color: Colors.white)),
        ),
      ]),
      body: BlocBuilder<SavingsBloc, SavingsState>(
        builder: (context, savingsState) {
          final acct = savingsState is SavingsLoaded ? savingsState.account : null;
          final balance = acct?.actualBalance ?? 0.0;
          final unallocated = acct?.unallocatedBalance ?? 0.0;
          final withdrawable = acct?.withdrawableBalance ?? 0.0;

          return BlocBuilder<BankingBloc, BankingState>(
            builder: (context, state) {
              return RefreshIndicator(
                onRefresh: () async {
                  context.read<SavingsBloc>().add(LoadSavings(widget.accountId));
                  context.read<BankingBloc>().add(LoadTransactions(widget.accountId));
                  await context.read<BankingBloc>().stream.firstWhere(
                    (s) => s.transactionStatus != TransactionStatus.loading,
                  );
                  await _loadInterest();
                  _knownStatuses.clear();
                  await _checkWithdrawStatus();
                },
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _balanceCard(balance, unallocated, withdrawable),
                      const SizedBox(height: 16),
                      _quickActions(context, balance),
                      const SizedBox(height: 20),
                      _interestSection(),
                      const SizedBox(height: 24),
                    _withdrawBanner(),
                    const SizedBox(height: 24),
                    _recentTransactions(state.transactions),
                  ],
                ),
              ),
            );
            },
          );
        },
      ),
    );
  }

  Widget _balanceCard(double balance, double unallocated, double withdrawable) {
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
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total Balance', style: TextStyle(color: Colors.white70, fontSize: 14)),
                IconButton(
                  icon: Icon(_balanceVisible ? Icons.visibility : Icons.visibility_off, color: Colors.white60, size: 22),
                  onPressed: () => setState(() => _balanceVisible = !_balanceVisible),
                  splashRadius: 20,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              _balanceVisible ? 'PHP ${balance.toStringAsFixed(2)}' : 'PHP ••••',
              style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold),
              key: ValueKey('balance_$_balanceVisible'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.account_balance_wallet, color: Colors.white.withValues(alpha: 0.6), size: 14),
                const SizedBox(width: 4),
                Text(
                  'Withdrawable: ${_balanceVisible ? 'PHP ${withdrawable.toStringAsFixed(2)}' : 'PHP ••••'}',
                  style: const TextStyle(color: Colors.white60, fontSize: 13),
                ),
                const SizedBox(width: 16),
                Icon(Icons.check_circle_outline, color: Colors.white.withValues(alpha: 0.6), size: 14),
                const SizedBox(width: 4),
                Text(
                  'Available: ${_balanceVisible ? 'PHP ${unallocated.toStringAsFixed(2)}' : 'PHP ••••'}',
                  style: const TextStyle(color: Colors.white60, fontSize: 13),
                ),
              ],
            ),
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
              Navigator.push(context, MaterialPageRoute(builder: (_) => SavingsOpenPage(accountId: widget.accountId)));
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
            _actionChip(Icons.payments, 'GCash Deposit', AppTheme.primaryGreen, () async {
              await Navigator.push(context, PageTransition.slideUp(OnlineDepositPage(accountId: widget.accountId)));
              context.read<SavingsBloc>().add(LoadSavings(widget.accountId));
              context.read<BankingBloc>().add(LoadTransactions(widget.accountId));
              _loadInterest();
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
    final filtered = transactions.where((t) => t.type != TransactionType.allocation).toList();
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
        if (filtered.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No transactions yet'))))
        else
          ...filtered.take(5).map((t) => _transactionTile(t)),
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
                  final amt = parseAmount(t['amount']);
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

  Widget _withdrawBanner() {
    if (_withdrawLoading) return const SizedBox.shrink();
    final pending = _withdrawalRequests.where((r) => r['status'] == 'pending').toList();
    final approved = _withdrawalRequests.where((r) => r['status'] == 'approved').toList();
    if (pending.isEmpty && approved.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (pending.isNotEmpty)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            color: Colors.amber.shade50,
            child: ListTile(
              leading: const Icon(Icons.hourglass_empty, color: Colors.amber),
              title: Text('${pending.length} pending withdrawal request${pending.length > 1 ? 's' : ''}'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, PageTransition.slideUp(WithdrawalRequestPage(
                accountId: widget.accountId,
                currentBalance: _getBalance(),
              ))),
            ),
          ),
        if (approved.isNotEmpty)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            color: Colors.green.shade50,
            child: ListTile(
              leading: const Icon(Icons.check_circle, color: Colors.green),
              title: Text('${approved.length} approved withdrawal${approved.length > 1 ? 's' : ''} awaiting payout'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, PageTransition.slideUp(WithdrawalRequestPage(
                accountId: widget.accountId,
                currentBalance: _getBalance(),
              ))),
            ),
          ),
      ],
    );
  }

  double _getBalance() {
    try {
      final s = context.read<SavingsBloc>().state;
      return s is SavingsLoaded ? s.account.actualBalance : 0.0;
    } catch (_) {
      return 0.0;
    }
  }

  String _formatDate(DateTime dt) {
    return '${dt.month}/${dt.day}/${dt.year} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
