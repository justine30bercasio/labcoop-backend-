import 'package:flutter/material.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';

class StatementPage extends StatefulWidget {
  final String accountId;
  const StatementPage({super.key, required this.accountId});

  @override
  State<StatementPage> createState() => _StatementPageState();
}

class _StatementPageState extends State<StatementPage> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await BankingApiService.getStatement(widget.accountId);
      if (!mounted) return;
      if (data == null) {
        setState(() { _loading = false; _error = 'Failed to load statement'; });
      } else {
        setState(() { _data = data; _loading = false; });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = 'Something went wrong loading the statement.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Passbook Statement')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _accountHeader(),
                      const SizedBox(height: 16),
                      _transactionsSection(),
                      const SizedBox(height: 16),
                      _goalsSection(),
                      const SizedBox(height: 16),
                      _loansSection(),
                    ],
                  ),
                ),
    );
  }

  Widget _accountHeader() {
    final acct = _data!['account'] as Map<String, dynamic>;
    final name = acct['child_name'] ?? '';
    final memberId = acct['member_id'] ?? '';
    final balance = (acct['balance'] ?? 0).toDouble();
    final interestEarned = (acct['interest_earned'] ?? 0).toDouble();
    final savingsProduct = acct['savings_product'];

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
            Text(name, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('Member ID: $memberId', style: const TextStyle(color: Colors.white70, fontSize: 13)),
            if (savingsProduct != null) ...[
              const SizedBox(height: 2),
              Text(savingsProduct.toString(), style: const TextStyle(color: Colors.white60, fontSize: 12)),
            ],
            const SizedBox(height: 12),
            Text('PHP ${balance.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('Interest Earned: PHP ${interestEarned.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white70, fontSize: 14)),
          ],
        ),
      ),
    );
  }

  Widget _transactionsSection() {
    final txs = _data!['transactions'] as List<dynamic>;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            children: [
              Text('Transactions', style: AppTextStyle.heading3),
              const Spacer(),
              Text('${txs.length} entries', style: AppTextStyle.bodySmall),
            ],
          ),
        ),
        if (txs.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No transactions'))))
        else
          ...txs.map((t) => _txTile(t as Map<String, dynamic>)),
      ],
    );
  }

  Widget _txTile(Map<String, dynamic> t) {
    final type = t['type'] as String? ?? '';
    final isCredit = type == 'deposit' || type == 'interest_credit' || type == 'loan_disbursement' || type == 'interest';
    final amount = (t['amount'] ?? 0).toDouble();
    final balanceAfter = (t['balance_after'] ?? 0).toDouble();
    final rawDate = t['created_at'] as String? ?? '';
    final dateStr = rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate;
    final description = t['description'] as String? ?? '';

    Color typeColor;
    IconData typeIcon;
    switch (type) {
      case 'deposit':
        typeColor = Colors.green;
        typeIcon = Icons.arrow_downward;
        break;
      case 'withdrawal':
        typeColor = Colors.red;
        typeIcon = Icons.arrow_upward;
        break;
      case 'interest':
      case 'interest_credit':
        typeColor = AppTheme.coinGold;
        typeIcon = Icons.monetization_on;
        break;
      case 'loan_disbursement':
        typeColor = AppTheme.waterBlue;
        typeIcon = Icons.request_page;
        break;
      case 'loan_payment':
        typeColor = AppTheme.xpPurple;
        typeIcon = Icons.payments;
        break;
      case 'transfer':
        typeColor = Colors.orange;
        typeIcon = Icons.swap_horiz;
        break;
      case 'fee':
        typeColor = Colors.grey;
        typeIcon = Icons.money_off;
        break;
      case 'allocation':
        typeColor = Colors.teal;
        typeIcon = Icons.account_balance_wallet;
        break;
      default:
        typeColor = Colors.grey;
        typeIcon = Icons.receipt;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: typeColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(typeIcon, color: typeColor, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(description.isNotEmpty ? description : type, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(dateStr, style: AppTextStyle.bodySmall),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${isCredit ? '+' : '-'}PHP ${amount.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: isCredit ? Colors.green : Colors.red,
                    fontSize: 13,
                  ),
                ),
                Text(
                  'Bal: PHP ${balanceAfter.toStringAsFixed(2)}',
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _goalsSection() {
    final goals = _data!['goals'] as List<dynamic>;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            children: [
              Text('Savings Goals', style: AppTextStyle.heading3),
              const Spacer(),
              Text('${goals.length} goals', style: AppTextStyle.bodySmall),
            ],
          ),
        ),
        if (goals.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No goals'))))
        else
          ...goals.map((g) => _goalTile(g as Map<String, dynamic>)),
      ],
    );
  }

  Widget _goalTile(Map<String, dynamic> g) {
    final title = g['title'] ?? '';
    final target = (g['target'] ?? 0).toDouble();
    final allocated = (g['allocated'] ?? 0).toDouble();
    final progress = (g['progress'] ?? 0).toDouble();
    final completed = g['completed'] == true;

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(title.toString(), style: const TextStyle(fontWeight: FontWeight.w600))),
                if (completed)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: Colors.green.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
                    child: const Text('Completed', style: TextStyle(color: Colors.green, fontSize: 11, fontWeight: FontWeight.w600)),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress.clamp(0, 1),
                backgroundColor: Colors.grey.shade200,
                color: completed ? Colors.green : AppTheme.primaryGreen,
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 4),
            Text('PHP ${allocated.toStringAsFixed(2)} / PHP ${target.toStringAsFixed(2)}', style: AppTextStyle.bodySmall),
          ],
        ),
      ),
    );
  }

  Widget _loansSection() {
    final loans = _data!['loans'] as List<dynamic>;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            children: [
              Text('Loans', style: AppTextStyle.heading3),
              const Spacer(),
              Text('${loans.length} loans', style: AppTextStyle.bodySmall),
            ],
          ),
        ),
        if (loans.isEmpty)
          const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No loans'))))
        else
          ...loans.map((l) => _loanTile(l as Map<String, dynamic>)),
      ],
    );
  }

  Widget _loanTile(Map<String, dynamic> l) {
    final purpose = l['purpose'] ?? '';
    final principal = (l['principal'] ?? 0).toDouble();
    final remaining = (l['remaining'] ?? 0).toDouble();
    final status = l['status'] ?? '';
    final monthly = (l['monthly'] ?? 0).toDouble();
    final paid = principal > 0 ? ((principal - remaining) / principal).clamp(0, 1) : 0.0;

    Color statusColor;
    String statusLabel;
    switch (status.toString()) {
      case 'pending':
        statusColor = Colors.orange;
        statusLabel = 'Pending';
        break;
      case 'approved':
        statusColor = AppTheme.waterBlue;
        statusLabel = 'Approved';
        break;
      case 'active':
        statusColor = AppTheme.primaryGreen;
        statusLabel = 'Active';
        break;
      case 'paid':
        statusColor = Colors.grey;
        statusLabel = 'Paid';
        break;
      case 'defaulted':
        statusColor = Colors.red;
        statusLabel = 'Defaulted';
        break;
      default:
        statusColor = Colors.grey;
        statusLabel = status.toString();
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(child: Text(purpose.toString().isNotEmpty ? purpose.toString() : 'Loan', style: const TextStyle(fontWeight: FontWeight.w600))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
                  child: Text(statusLabel, style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Text('Principal: PHP ${principal.toStringAsFixed(2)}', style: AppTextStyle.bodySmall),
                const SizedBox(width: 12),
                Text('Balance: PHP ${remaining.toStringAsFixed(2)}', style: const TextStyle(color: Colors.red, fontSize: 12)),
              ],
            ),
            if (status == 'active' || status == 'paid') ...[
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: paid,
                  backgroundColor: Colors.grey.shade200,
                  color: status == 'paid' ? Colors.green : AppTheme.primaryGreen,
                  minHeight: 5,
                ),
              ),
              const SizedBox(height: 2),
              Text('Monthly: PHP ${monthly.toStringAsFixed(2)}', style: AppTextStyle.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
}
