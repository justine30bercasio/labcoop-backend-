import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../domain/entities/loan.dart';
import '../../domain/entities/loan_payment.dart';
import '../blocs/loan_bloc.dart';

class LoanDetailPage extends StatefulWidget {
  final String loanId;
  final String accountId;
  const LoanDetailPage({super.key, required this.loanId, required this.accountId});

  @override
  State<LoanDetailPage> createState() => _LoanDetailPageState();
}

class _LoanDetailPageState extends State<LoanDetailPage> {
  final _paymentCtrl = TextEditingController();
  final _storage = const FlutterSecureStorage();
  bool _scheduleExpanded = false;
  List<dynamic>? _schedule;
  bool _scheduleLoading = false;

  @override
  void initState() {
    super.initState();
    context.read<LoanBloc>().add(LoadLoanSchedule(widget.loanId));
  }

  @override
  void dispose() {
    _paymentCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSchedule() async {
    setState(() => _scheduleLoading = true);
    final data = await BankingApiService.getLoanSchedule(widget.loanId);
    if (!mounted) return;
    if (data != null && data['schedule'] != null) {
      setState(() { _schedule = data['schedule'] as List<dynamic>; _scheduleLoading = false; });
    } else {
      setState(() => _scheduleLoading = false);
    }
  }

  Future<void> _makePayment(Loan loan) async {
    final amount = double.tryParse(_paymentCtrl.text);
    if (amount == null || amount <= 0) return;

    context.read<LoanBloc>().add(MakeLoanPaymentEvent(widget.loanId, amount, widget.accountId));
    _paymentCtrl.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Loan Details')),
      body: BlocListener<LoanBloc, LoanState>(
        listenWhen: (prev, curr) => prev.submitStatus != curr.submitStatus,
        listener: (context, state) {
          if (state.submitStatus == LoanSubmitStatus.success) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Payment recorded!'), backgroundColor: AppTheme.primaryGreen),
            );
          } else if (state.submitStatus == LoanSubmitStatus.error) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Payment failed: ${state.errorMessage}'), backgroundColor: Colors.red),
            );
          }
        },
        child: BlocBuilder<LoanBloc, LoanState>(
        builder: (context, state) {
          final loan = state.loans.where((l) => l.id == widget.loanId).firstOrNull;
          if (loan == null) return const Center(child: CircularProgressIndicator());

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _summaryCard(loan),
                const SizedBox(height: 20),
                if (loan.status == LoanStatus.active) _paymentSection(loan),
                const SizedBox(height: 20),
                Text('Payment History', style: AppTextStyle.heading3),
                const SizedBox(height: 8),
                if (state.loanPayments.isEmpty)
                  const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No payments yet'))))
                else
                  ...state.loanPayments.map((p) => _paymentTile(p)),
                const SizedBox(height: 20),
                _amortizationSection(loan, state.loanPayments.length),
              ],
            ),
          );
        },
      ),
      ),
    );
  }

  Widget _amortizationSection(Loan loan, int paymentsMade) {
    return Card(
      child: ExpansionTile(
        title: Text('Amortization Schedule', style: AppTextStyle.heading3),
        subtitle: Text('${loan.termMonths} payments', style: AppTextStyle.bodySmall),
        initiallyExpanded: _scheduleExpanded,
        onExpansionChanged: (expanded) {
          setState(() => _scheduleExpanded = expanded);
          if (expanded && _schedule == null) _loadSchedule();
        },
        children: [
          if (_scheduleLoading)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_schedule == null)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: Text('Unable to load schedule')),
            )
          else ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _schedHeader('#', flex: 1),
                  _schedHeader('Due Date', flex: 2),
                  _schedHeader('Principal', flex: 2),
                  _schedHeader('Interest', flex: 2),
                  _schedHeader('Total', flex: 2),
                  _schedHeader('Balance', flex: 2),
                ],
              ),
            ),
            const Divider(),
            ...List.generate(_schedule!.length, (i) {
              final s = _schedule![i] as Map<String, dynamic>;
              final month = s['month'] ?? (i + 1);
              final principal = (s['principalPortion'] ?? 0).toDouble();
              final interest = (s['interestPortion'] ?? 0).toDouble();
              final total = (s['totalPayment'] ?? 0).toDouble();
              final balance = (s['endingBalance'] ?? 0).toDouble();

              final isPaid = i < paymentsMade;
              final dueDate = DateTime.now().add(Duration(days: 30 * (i + 1)));

              return Container(
                color: isPaid ? Colors.green.withValues(alpha: 0.05) : null,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    _schedCell(month.toString(), flex: 1),
                    _schedCell('${dueDate.month}/${dueDate.year}', flex: 2),
                    _schedCell('PHP ${principal.toStringAsFixed(0)}', flex: 2),
                    _schedCell('PHP ${interest.toStringAsFixed(0)}', flex: 2),
                    _schedCell('PHP ${total.toStringAsFixed(0)}', flex: 2),
                    _schedCell('PHP ${balance.toStringAsFixed(0)}', flex: 2),
                  ],
                ),
              );
            }),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  Widget _schedHeader(String label, {int flex = 1}) {
    return Expanded(
      flex: flex,
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 10, color: Colors.grey)),
    );
  }

  Widget _schedCell(String text, {int flex = 1}) {
    return Expanded(
      flex: flex,
      child: Text(text, style: const TextStyle(fontSize: 10)),
    );
  }

  Widget _summaryCard(Loan loan) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Loan Summary', style: AppTextStyle.heading3),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: (loan.status == LoanStatus.paid ? Colors.green : AppTheme.accentAmber).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(loan.status == LoanStatus.paid ? 'Paid' : '${(loan.progress * 100).toStringAsFixed(1)}%', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
                ),
              ],
            ),
            const Divider(),
            _row('Principal', 'PHP ${loan.principal.toStringAsFixed(2)}'),
            _row('Interest Rate', '${(loan.interestRate * 100).toStringAsFixed(1)}% ${loan.interestType == InterestType.flat ? 'Flat' : 'Diminishing'}'),
            _row('Term', '${loan.termMonths} months'),
            _row('Monthly Amortization', 'PHP ${loan.monthlyAmortization.toStringAsFixed(2)}'),
            _row('Total Payable', 'PHP ${loan.totalPayable.toStringAsFixed(2)}'),
            _row('Amount Paid', 'PHP ${loan.amountPaid.toStringAsFixed(2)}', valueColor: Colors.green),
            _row('Remaining Balance', 'PHP ${loan.remainingBalance.toStringAsFixed(2)}', valueColor: Colors.red),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          Text(value, style: TextStyle(fontWeight: FontWeight.w600, color: valueColor)),
        ],
      ),
    );
  }

  Widget _paymentSection(Loan loan) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Make a Payment', style: AppTextStyle.heading3),
            const SizedBox(height: 4),
            Text('Monthly due: PHP ${loan.monthlyAmortization.toStringAsFixed(2)}', style: AppTextStyle.bodySmall),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _paymentCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                      hintText: 'Amount',
                      prefixText: 'PHP ',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton(
                  onPressed: () => _makePayment(loan),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryGreen,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  ),
                  child: const Text('Pay'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _paymentTile(LoanPayment p) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.green.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Icon(Icons.check_circle, color: Colors.green, size: 20),
        ),
        title: Text('PHP ${p.amount.toStringAsFixed(2)} payment'),
        subtitle: Text('${p.paidAt.month}/${p.paidAt.day}/${p.paidAt.year}', style: AppTextStyle.bodySmall),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('Principal: PHP ${p.principalPaid.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
            Text('Interest: PHP ${p.interestPaid.toStringAsFixed(2)}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
