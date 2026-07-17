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
import 'kyc_page.dart';
import 'loan_apply_page.dart';
import 'loan_products_page.dart';
import 'my_loans_page.dart';
import 'online_deposit_page.dart';
import 'statement_page.dart';
import 'transaction_history_page.dart';
import 'withdrawal_request_page.dart';
import '../../core/helpers/number_helpers.dart';
import '../widgets/notification_bell.dart';
import '../widgets/support_bell.dart';

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
      backgroundColor: Theme.of(context).colorScheme.surface,
      appBar: AppBar(
        title: const Text('LabCoop Bank', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
        centerTitle: true,
        actions: [
          const SupportBell(),
          const NotificationBell(),
        ],
      ),
      body: BlocBuilder<SavingsBloc, SavingsState>(
        builder: (context, savingsState) {
          final acct = savingsState is SavingsLoaded ? savingsState.account : null;
          final kyc = acct?.kycStatus ?? '';

          if (kyc != 'verified') {
            return _buildKycGate(kyc);
          }

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
                  child: Column(
                    children: [
                      _balanceCard(balance, unallocated, withdrawable),
                      const SizedBox(height: 12),
                      _quickActions(context, balance),
                      const SizedBox(height: 16),
                      _withdrawBanner(),
                      if (_withdrawBannerVisible()) const SizedBox(height: 12),
                      _interestSection(),
                      const SizedBox(height: 16),
                      _recentTransactions(state.transactions),
                      const SizedBox(height: 24),
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

  Widget _buildKycGate(String kyc) {
    final isPending = kyc == 'pending';
    final isRejected = kyc == 'rejected';

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Column(
        children: [
          const SizedBox(height: 20),
          // ── decorative icon ──
          Container(
            width: 100, height: 100,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isPending
                    ? [const Color(0xFFF59E0B), const Color(0xFFF97316)]
                    : isRejected
                        ? [const Color(0xFFEF4444), const Color(0xFFDC2626)]
                        : [const Color(0xFF2E7D32), const Color(0xFF1B5E20)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: (isPending ? const Color(0xFFF59E0B) : isRejected ? const Color(0xFFEF4444) : const Color(0xFF2E7D32)).withValues(alpha: 0.3),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Icon(
              isPending ? Icons.hourglass_empty : Icons.verified_user,
              color: Colors.white, size: 44,
            ),
          ),
          const SizedBox(height: 36),
          // ── main card ──
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 24, offset: const Offset(0, 8)),
                BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2)),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
              child: Column(
                children: [
                  // ── status badge ──
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    decoration: BoxDecoration(
                      color: isPending
                          ? const Color(0xFFFEF3C7)
                          : isRejected
                              ? const Color(0xFFFEE2E2)
                              : const Color(0xFFE8F5E9),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          isPending ? Icons.schedule : isRejected ? Icons.cancel : Icons.verified,
                          size: 16,
                          color: isPending
                              ? const Color(0xFFD97706)
                              : isRejected
                                  ? const Color(0xFFDC2626)
                                  : const Color(0xFF2E7D32),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          isPending ? 'UNDER REVIEW' : isRejected ? 'REJECTED' : 'NOT STARTED',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1,
                            color: isPending
                                ? const Color(0xFFD97706)
                                : isRejected
                                    ? const Color(0xFFDC2626)
                                    : const Color(0xFF2E7D32),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  // ── title ──
                  Text(
                    isPending
                        ? 'KYC Under Review'
                        : isRejected
                            ? 'Verification Rejected'
                            : 'Verify Your Identity',
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1F2937)),
                  ),
                  const SizedBox(height: 10),
                  // ── description ──
                  Text(
                    isPending
                        ? 'Your documents are being reviewed by our team. This usually takes 1–2 business days.'
                        : isRejected
                            ? 'Your previous submission did not pass verification. Please submit correct documents to proceed.'
                            : 'You need to verify your identity before you can use banking features.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.5),
                  ),
                  const SizedBox(height: 32),
                  // ── progress stepper ──
                  _kycStepper(isPending ? 1 : 0),
                  const SizedBox(height: 32),
                  // ── button (only for not-started / rejected) ──
                  if (!isPending)
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: () => Navigator.push(context, PageTransition.slideUp(const KycPage())).then((_) {
                          context.read<SavingsBloc>().add(LoadSavings(widget.accountId));
                        }),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2E7D32),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                        child: const Text('Submit KYC Now'),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          // ── info footer ──
          if (isPending)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFFDE68A)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 18, color: Color(0xFFD97706)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'You\'ll be able to access all banking features once your identity is verified.',
                      style: TextStyle(fontSize: 12, color: const Color(0xFF92400E), height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _kycStepper(int activeStep) {
    final steps = ['Submit', 'Review', 'Approved'];
    return Row(
      children: List.generate(steps.length * 2 - 1, (i) {
        if (i.isOdd) {
          final stepIdx = i ~/ 2;
          final done = stepIdx < activeStep;
          return Expanded(
            child: Container(
              height: 3,
              decoration: BoxDecoration(
                color: done ? const Color(0xFF2E7D32) : Colors.grey.shade200,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }
        final stepIdx = i ~/ 2;
        final isActive = stepIdx == activeStep;
        final done = stepIdx < activeStep;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done
                    ? const Color(0xFF2E7D32)
                    : isActive
                        ? const Color(0xFFF59E0B)
                        : Colors.grey.shade200,
                boxShadow: isActive
                    ? [BoxShadow(color: const Color(0xFFF59E0B).withValues(alpha: 0.4), blurRadius: 8)]
                    : [],
              ),
              child: Center(
                child: done
                    ? const Icon(Icons.check, color: Colors.white, size: 18)
                    : isActive
                        ? const SizedBox(
                            width: 16, height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                          )
                        : Text('${stepIdx + 1}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontWeight: FontWeight.w600, fontSize: 14)),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              steps[stepIdx],
              style: TextStyle(
                fontSize: 11,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                color: isActive ? const Color(0xFFF59E0B) : done ? const Color(0xFF2E7D32) : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        );
      }),
    );
  }

  Widget _balanceCard(double balance, double unallocated, double withdrawable) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1B5E20), Color(0xFF2E7D32), Color(0xFF43A047)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(color: const Color(0xFF2E7D32).withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.account_balance_wallet, color: Colors.white, size: 18),
                  ),
                  const SizedBox(width: 10),
                  const Text('Savings Wallet', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w500)),
                ],
              ),
              GestureDetector(
                onTap: () => setState(() => _balanceVisible = !_balanceVisible),
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
                  child: Icon(_balanceVisible ? Icons.visibility : Icons.visibility_off, color: Colors.white70, size: 18),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            _balanceVisible ? 'PHP ${balance.toStringAsFixed(2)}' : 'PHP ••••••',
            style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold),
            key: ValueKey('balance_$_balanceVisible'),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _balanceBadge(Icons.check_circle, 'Available: ${_balanceVisible ? 'PHP ${unallocated.toStringAsFixed(2)}' : '••••'}'),
              const SizedBox(width: 12),
              _balanceBadge(Icons.money_off, 'Withdrawable: ${_balanceVisible ? 'PHP ${withdrawable.toStringAsFixed(2)}' : '••••'}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _balanceBadge(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white.withValues(alpha: 0.7), size: 12),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11)),
        ],
      ),
    );
  }

  bool _withdrawBannerVisible() {
    if (_withdrawLoading) return false;
    final pending = _withdrawalRequests.where((r) => r['status'] == 'pending').toList();
    final approved = _withdrawalRequests.where((r) => r['status'] == 'approved').toList();
    return pending.isNotEmpty || approved.isNotEmpty;
  }

  Widget _quickActions(BuildContext context, double currentBalance) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 8, bottom: 12),
            child: Text('Quick Actions', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ),
          _actionGrid([
            _ActionItem(Icons.add_circle_outline, 'Deposit', AppTheme.primaryGreen, () {
              Navigator.push(context, PageTransition.slideUp(OnlineDepositPage(accountId: widget.accountId))).then((_) {
                context.read<SavingsBloc>().add(LoadSavings(widget.accountId));
                context.read<BankingBloc>().add(LoadTransactions(widget.accountId));
                _loadInterest();
              });
            }),
            _ActionItem(Icons.money_off_outlined, 'Withdraw', Colors.orange, () {
              Navigator.push(context, PageTransition.slideUp(WithdrawalRequestPage(
                accountId: widget.accountId,
                currentBalance: currentBalance,
              )));
            }),
            _ActionItem(Icons.receipt_long_outlined, 'History', AppTheme.waterBlue, () {
              Navigator.push(context, PageTransition.slideUp(TransactionHistoryPage(accountId: widget.accountId)));
            }),
            _ActionItem(Icons.article_outlined, 'Statement', AppTheme.xpPurple, () {
              Navigator.push(context, PageTransition.slideUp(StatementPage(accountId: widget.accountId)));
            }),
            _ActionItem(Icons.request_page_outlined, 'Apply Loan', AppTheme.accentAmber, () {
              Navigator.push(context, PageTransition.slideUp(const LoanApplyPage()));
            }),
            _ActionItem(Icons.account_balance_outlined, 'My Loans', AppTheme.waterBlue, () {
              Navigator.push(context, PageTransition.slideUp(MyLoansPage(accountId: widget.accountId)));
            }),
            _ActionItem(Icons.store_outlined, 'Loan Products', AppTheme.coinGold, () {
              Navigator.push(context, PageTransition.slideUp(const LoanProductsPage()));
            }),
            _ActionItem(Icons.timer_outlined, 'Auto-Save', AppTheme.primaryGreen, () {
              Navigator.push(context, PageTransition.slideUp(AutoSavePage(accountId: widget.accountId)));
            }),
          ]),
        ],
      ),
    );
  }

  Widget _actionGrid(List<_ActionItem> items) {
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 4) {
      final rowItems = items.sublist(i, i + 4 > items.length ? items.length : i + 4);
      rows.add(
        Padding(
          padding: EdgeInsets.only(top: i > 0 ? 16 : 0),
          child: Row(
            children: rowItems.map((item) => Expanded(child: _actionButton(item))).toList(),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(children: rows),
    );
  }

  Widget _actionButton(_ActionItem item) {
    return GestureDetector(
      onTap: item.onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: item.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(item.icon, color: item.color, size: 22),
          ),
          const SizedBox(height: 6),
          Text(
            item.label,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.onSurfaceVariant),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _interestSection() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.coinGold.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.monetization_on, color: AppTheme.coinGold, size: 20),
              ),
              const SizedBox(width: 12),
              Text('Interest Earned', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurfaceVariant)),
              const Spacer(),
              if (!_interestLoading && _interestData != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text('Active', style: TextStyle(fontSize: 11, color: Colors.green.shade700, fontWeight: FontWeight.w600)),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_interestLoading)
            const SizedBox(height: 40, child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))))
          else if (_interestData == null)
            Text('Unable to load interest data', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13))
          else ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  'PHP ${(_interestData!['interest_earned'] ?? 0).toDouble().toStringAsFixed(2)}',
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: AppTheme.primaryGreen),
                ),
                const SizedBox(width: 8),
                if (_interestData!['projected_yearly'] != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      '+ PHP ${(_interestData!['projected_yearly']).toDouble().toStringAsFixed(2)}/yr projected',
                      style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant, fontWeight: FontWeight.w500),
                    ),
                  ),
              ],
            ),
            if (_interestData!['recent_interest'] != null && (_interestData!['recent_interest'] as List).isNotEmpty) ...[
              const SizedBox(height: 12),
              Divider(height: 1, color: Colors.grey.shade200),
              const SizedBox(height: 8),
              ...(_interestData!['recent_interest'] as List).take(3).map((tx) {
                final t = tx as Map<String, dynamic>;
                final amt = parseAmount(t['amount']);
                final desc = t['description']?.toString() ?? 'Interest';
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      Container(
                        width: 28, height: 28,
                        decoration: BoxDecoration(
                          color: Colors.green.shade50,
                          borderRadius: BorderRadius.circular(7),
                        ),
                        child: Icon(Icons.add, color: Colors.green.shade600, size: 16),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text(desc, style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant))),
                      Text('+PHP ${amt.toStringAsFixed(2)}',
                        style: TextStyle(color: Colors.green.shade600, fontWeight: FontWeight.w700, fontSize: 13)),
                    ],
                  ),
                );
              }),
            ],
          ],
        ],
      ),
    );
  }

  Widget _withdrawBanner() {
    if (_withdrawLoading) return const SizedBox.shrink();
    final pending = _withdrawalRequests.where((r) => r['status'] == 'pending').toList();
    final approved = _withdrawalRequests.where((r) => r['status'] == 'approved').toList();
    if (pending.isEmpty && approved.isEmpty) return const SizedBox.shrink();

    return Column(
      children: [
        if (pending.isNotEmpty)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.orange.shade50,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.orange.shade200),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.hourglass_empty, color: Colors.orange, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${pending.length} Pending Withdrawal${pending.length > 1 ? 's' : ''}',
                        style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Colors.orange.shade800)),
                      Text('Waiting for admin approval', style: TextStyle(fontSize: 11, color: Colors.orange.shade600)),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.push(context, PageTransition.slideUp(WithdrawalRequestPage(
                    accountId: widget.accountId, currentBalance: _getBalance(),
                  ))),
                  child: Icon(Icons.chevron_right, color: Colors.orange.shade400),
                ),
              ],
            ),
          ),
        if (approved.isNotEmpty) ...[
          if (pending.isNotEmpty) const SizedBox(height: 8),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.green.shade200),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.shade100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.check_circle, color: Colors.green, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${approved.length} Approved Withdrawal${approved.length > 1 ? 's' : ''}',
                        style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Colors.green.shade800)),
                      Text('Awaiting payout', style: TextStyle(fontSize: 11, color: Colors.green.shade600)),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.push(context, PageTransition.slideUp(WithdrawalRequestPage(
                    accountId: widget.accountId, currentBalance: _getBalance(),
                  ))),
                  child: Icon(Icons.chevron_right, color: Colors.green.shade400),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _recentTransactions(List<Transaction> transactions) {
    final filtered = transactions.where((t) => t.type != TransactionType.allocation).toList();
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Recent Transactions', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurfaceVariant)),
              TextButton(
                onPressed: () => Navigator.push(context, PageTransition.slideUp(TransactionHistoryPage(accountId: widget.accountId))),
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8), minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                child: Text('See All', style: TextStyle(fontSize: 12, color: AppTheme.primaryGreen, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (filtered.isEmpty)
            SizedBox(
              height: 80,
                child: Center(child: Text('No transactions yet', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13))),
            )
          else
            ...filtered.take(5).map((t) => _transactionTile(t)),
        ],
      ),
    );
  }

  Widget _transactionTile(Transaction t) {
    final isCredit = t.type == TransactionType.deposit || t.type == TransactionType.loanDisbursement || t.type == TransactionType.interestCredit;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: (isCredit ? Colors.green : Colors.red).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isCredit ? Icons.arrow_downward : Icons.arrow_upward,
              color: isCredit ? Colors.green : Colors.red,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(t.description, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                const SizedBox(height: 2),
                Text(_formatDate(t.createdAt), style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
          Text(
            '${isCredit ? '+' : '-'}PHP ${t.amount.toStringAsFixed(2)}',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: isCredit ? Colors.green : Colors.red,
              fontSize: 14,
            ),
          ),
        ],
      ),
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

class _ActionItem {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  _ActionItem(this.icon, this.label, this.color, this.onTap);
}
