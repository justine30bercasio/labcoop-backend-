import 'package:flutter/material.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';

class WithdrawalRequestPage extends StatefulWidget {
  final String accountId;
  final double currentBalance;
  const WithdrawalRequestPage({super.key, required this.accountId, this.currentBalance = 0});

  @override
  State<WithdrawalRequestPage> createState() => _WithdrawalRequestPageState();
}

class _WithdrawalRequestPageState extends State<WithdrawalRequestPage> {
  final _amountCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  List<dynamic> _requests = [];
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final requests = await BankingApiService.getWithdrawalRequests(widget.accountId);
      if (!mounted) return;
      setState(() { _requests = requests; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid amount'), backgroundColor: Colors.red));
      return;
    }
    if (amount > widget.currentBalance) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Amount exceeds available balance'), backgroundColor: Colors.red));
      return;
    }

    setState(() => _submitting = true);
    final result = await BankingApiService.requestWithdrawal(widget.accountId, amount, _reasonCtrl.text);
    setState(() => _submitting = false);

    if (!mounted) return;
    if (result != null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Withdrawal request submitted!'),
        backgroundColor: AppTheme.primaryGreen,
      ));
      _amountCtrl.clear();
      _reasonCtrl.clear();
      _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Failed to submit request. Check balance.'),
        backgroundColor: Colors.red,
      ));
    }
  }

  String _formatDate(String raw) {
    if (raw.length >= 10) return raw.substring(0, 10);
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Withdrawal Request')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _requestForm(),
            const SizedBox(height: 24),
            Text('Request History', style: AppTextStyle.heading3),
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (_requests.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No withdrawal requests'))))
            else
              ..._requests.map((r) => _requestTile(r as Map<String, dynamic>)),
          ],
        ),
      ),
    );
  }

  Widget _requestForm() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Request a Withdrawal', style: AppTextStyle.heading3),
            const SizedBox(height: 4),
            Text('Available: PHP ${widget.currentBalance.toStringAsFixed(2)}', style: AppTextStyle.bodySmall),
            const SizedBox(height: 12),
            TextField(
              controller: _amountCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Amount',
                prefixText: 'PHP ',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reasonCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Reason',
                hintText: 'Why do you need the money?',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryGreen,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Submit Request'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _requestTile(Map<String, dynamic> r) {
    final amount = (r['amount'] ?? 0).toDouble();
    final reason = r['reason']?.toString() ?? '';
    final status = r['status']?.toString() ?? 'pending';
    final createdAt = r['created_at']?.toString() ?? '';

    Color statusColor;
    String statusLabel;
    IconData statusIcon;
    switch (status) {
      case 'approved':
        statusColor = Colors.green;
        statusLabel = 'Approved';
        statusIcon = Icons.check_circle;
        break;
      case 'rejected':
        statusColor = Colors.red;
        statusLabel = 'Rejected';
        statusIcon = Icons.cancel;
        break;
      case 'paid':
        statusColor = Colors.grey;
        statusLabel = 'Paid';
        statusIcon = Icons.money;
        break;
      default:
        statusColor = Colors.amber.shade700;
        statusLabel = 'Pending';
        statusIcon = Icons.hourglass_empty;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(statusIcon, color: statusColor, size: 22),
        ),
        title: Text('PHP ${amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(reason.isNotEmpty ? reason : 'No reason given', style: AppTextStyle.bodySmall),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(statusLabel, style: TextStyle(color: statusColor, fontWeight: FontWeight.w600, fontSize: 11)),
            ),
            const SizedBox(height: 2),
            Text(_formatDate(createdAt), style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
          ],
        ),
      ),
    );
  }
}
