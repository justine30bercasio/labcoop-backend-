import 'package:flutter/material.dart';
import '../../core/network/banking_api_service.dart';

class ReceiptDialog extends StatelessWidget {
  final Map<String, dynamic> data;

  const ReceiptDialog({super.key, required this.data});

  static Future<void> show(BuildContext context, String txId) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _ReceiptLoader(txId: txId),
    );
  }

  String _typeLabel(String type) {
    switch (type) {
      case 'deposit': return 'Deposit';
      case 'withdrawal': return 'Withdrawal';
      case 'transfer': return 'Transfer';
      case 'interest':
      case 'interest_credit': return 'Interest Credit';
      case 'loan_disbursement': return 'Loan Disbursement';
      case 'loan_payment': return 'Loan Payment';
      case 'fee': return 'Fee';
      case 'allocation': return 'Allocation';
      default: return type;
    }
  }

  @override
  Widget build(BuildContext context) {
    final receiptId = data['receipt_id']?.toString() ?? 'N/A';
    final date = data['date']?.toString() ?? '';
    final type = data['type']?.toString() ?? '';
    final amount = (data['amount'] ?? 0).toDouble();
    final description = data['description']?.toString() ?? '';
    final childName = data['child_name']?.toString() ?? '';
    final memberId = data['member_id']?.toString() ?? '';
    final balanceBefore = (data['balance_before'] ?? 0).toDouble();
    final balanceAfter = (data['balance_after'] ?? 0).toDouble();
    final isCredit = type == 'deposit' || type == 'interest_credit' || type == 'interest' || type == 'loan_disbursement';

    final dateStr = date.length >= 19 ? date.substring(0, 19).replaceAll('T', ' ') : date;

    return Dialog(
      backgroundColor: const Color(0xFF1A1A2E),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.receipt, color: Colors.white70, size: 24),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: const Icon(Icons.close, color: Colors.white54, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(receiptId, style: const TextStyle(
              fontFamily: 'monospace',
              color: Colors.white70,
              fontSize: 11,
              letterSpacing: 2,
            )),
            const SizedBox(height: 16),
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: (isCredit ? Colors.green : Colors.red).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(30),
              ),
              child: Icon(
                isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                color: isCredit ? Colors.green : Colors.red,
                size: 28,
              ),
            ),
            const SizedBox(height: 12),
            Text('${isCredit ? '+' : '-'}PHP ${amount.toStringAsFixed(2)}', style: TextStyle(
              fontFamily: 'monospace',
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: isCredit ? Colors.green : Colors.red,
            )),
            const SizedBox(height: 8),
            Text(_typeLabel(type), style: const TextStyle(
              color: Colors.white70,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            )),
            const Divider(color: Colors.white12, height: 24),
            _receiptRow('Date', dateStr),
            _receiptRow('Description', description.isNotEmpty ? description : _typeLabel(type)),
            _receiptRow('Account', childName.isNotEmpty ? '$childName ($memberId)' : memberId),
            const Divider(color: Colors.white12, height: 16),
            _receiptRow('Balance Before', 'PHP ${balanceBefore.toStringAsFixed(2)}'),
            _receiptRow('Balance After', 'PHP ${balanceAfter.toStringAsFixed(2)}'),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close', style: TextStyle(color: Colors.white70)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _receiptRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 12, fontFamily: 'monospace')),
          Flexible(
            child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'monospace'),
              textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }
}

class _ReceiptLoader extends StatefulWidget {
  final String txId;
  const _ReceiptLoader({required this.txId});

  @override
  State<_ReceiptLoader> createState() => _ReceiptLoaderState();
}

class _ReceiptLoaderState extends State<_ReceiptLoader> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await BankingApiService.getReceipt(widget.txId);
    if (!mounted) return;
    if (data != null) {
      setState(() { _data = data; _loading = false; });
    } else {
      setState(() { _error = 'Receipt not found'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Dialog(
        backgroundColor: Color(0xFF1A1A2E),
        child: Padding(
          padding: EdgeInsets.all(40),
          child: CircularProgressIndicator(color: Colors.white54),
        ),
      );
    }
    if (_error != null) {
      return Dialog(
        backgroundColor: const Color(0xFF1A1A2E),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.red, size: 48),
              const SizedBox(height: 16),
              Text(_error!, style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 16),
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close', style: TextStyle(color: Colors.white70))),
            ],
          ),
        ),
      );
    }
    return ReceiptDialog(data: _data!);
  }
}
