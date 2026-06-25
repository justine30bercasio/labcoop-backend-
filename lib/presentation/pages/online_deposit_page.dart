import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../core/helpers/number_helpers.dart';

class OnlineDepositPage extends StatefulWidget {
  final String accountId;
  const OnlineDepositPage({super.key, required this.accountId});

  @override
  State<OnlineDepositPage> createState() => _OnlineDepositPageState();
}

class _OnlineDepositPageState extends State<OnlineDepositPage> {
  final _amountCtrl = TextEditingController();
  final _refCtrl = TextEditingController();
  final _senderCtrl = TextEditingController();
  List<dynamic> _deposits = [];
  bool _loading = true;
  bool _submitting = false;
  bool _paymongoMode = true;
  Timer? _pollTimer;

  String? _checkoutUrl;
  String? _paymentStatus;


  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _refCtrl.dispose();
    _senderCtrl.dispose();
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final deposits = await BankingApiService.getOnlineDeposits(widget.accountId);
      if (!mounted) return;
      setState(() { _deposits = deposits; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _payWithPaymongo() async {
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid amount'), backgroundColor: Colors.red));
      return;
    }
    setState(() => _submitting = true);
    try {
      final result = await BankingApiService.createPaymongoPayment(
        accountId: widget.accountId,
        amount: amount,
      );
      if (result != null && result['checkout_url'] != null) {
        setState(() {
          _checkoutUrl = result['checkout_url'];
          _paymentStatus = 'pending';
        });
        _startPolling(result['deposit_id']);
      } else {
        final msg = result?['message'] ?? 'Payment failed. Check backend logs.';
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: Colors.red),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    }
    setState(() => _submitting = false);
  }

  void _showPaymongoNotConfigured() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('PayMongo Not Configured'),
        content: const Text('PayMongo payment gateway is not configured. Please use the manual GCash deposit method instead.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
        ],
      ),
    );
  }

  void _startPolling(String depositId) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      final status = await BankingApiService.getPaymongoPaymentStatus(depositId);
      if (!mounted || status == null) return;
      final appStatus = status['status']?.toString() ?? '';
      if (appStatus == 'approved') {
        _pollTimer?.cancel();
        setState(() => _paymentStatus = 'approved');
        _showSuccess(status['amount']);
        _load();
      }
    });
    Future.delayed(const Duration(minutes: 5), () {
      _pollTimer?.cancel();
    });
  }

  void _showSuccess(dynamic amount) {
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Row(children: [
          Icon(Icons.check_circle, color: Colors.green, size: 28),
          SizedBox(width: 8),
          Text('Payment Successful!'),
        ]),
        content: Text('PHP ${(amount ?? 0).toStringAsFixed(2)} has been credited to your account.'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              setState(() { _checkoutUrl = null; _paymentStatus = null; });
              _amountCtrl.clear();
            },
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  Future<void> _submitManual() async {
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid amount'), backgroundColor: Colors.red));
      return;
    }
    if (_refCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter the GCash reference number'), backgroundColor: Colors.red));
      return;
    }
    setState(() => _submitting = true);
    final result = await BankingApiService.submitOnlineDeposit(
      accountId: widget.accountId,
      amount: amount,
      referenceNumber: _refCtrl.text.trim(),
      senderName: _senderCtrl.text.trim(),
    );
    setState(() => _submitting = false);
    if (!mounted) return;
    if (result != null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Deposit submitted for admin approval!'),
        backgroundColor: AppTheme.primaryGreen,
      ));
      _amountCtrl.clear();
      _refCtrl.clear();
      _senderCtrl.clear();
      _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Failed to submit deposit. Try again.'),
        backgroundColor: Colors.red,
      ));
    }
  }

  void _openCheckoutUrl() {
    if (_checkoutUrl == null) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _CheckoutWebView(checkoutUrl: _checkoutUrl!),
      ),
    );
  }

  String _formatDate(String raw) {
    if (raw.length >= 10) return raw.substring(0, 10);
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('GCash Deposit')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_paymentStatus == 'approved')
              _successBanner()
            else if (_checkoutUrl != null && _paymentStatus == 'pending')
              _paymongoCheckoutCard()
            else
              _depositForm(),
            const SizedBox(height: 8),
            if (_paymongoMode && _checkoutUrl == null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextButton.icon(
                  onPressed: () => setState(() => _paymongoMode = false),
                  icon: const Icon(Icons.edit_note, size: 16),
                  label: const Text('Use manual reference number instead', style: TextStyle(fontSize: 12)),
                ),
              )
            else if (!_paymongoMode)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextButton.icon(
                  onPressed: () => setState(() => _paymongoMode = true),
                  icon: const Icon(Icons.qr_code, size: 16),
                  label: const Text('Use GCash QR checkout instead', style: TextStyle(fontSize: 12)),
                ),
              ),
            const SizedBox(height: 16),
            Text('Deposit History', style: AppTextStyle.heading3),
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (_deposits.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No deposits yet'))))
            else
              ..._deposits.map((d) {
                try {
                  return _depositTile(d as Map<String, dynamic>);
                } catch (e) {
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text('Error rendering deposit: $e', style: const TextStyle(color: Colors.red, fontSize: 12)),
                    ),
                  );
                }
              }),
          ],
        ),
      ),
    );
  }

  Widget _successBanner() {
    return Card(
      color: Colors.green.shade50,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Icon(Icons.check_circle, color: Colors.green, size: 64),
            const SizedBox(height: 12),
            const Text('Payment Successful!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.green)),
            const SizedBox(height: 4),
            Text('Your GCash deposit via PayMongo has been credited.', style: AppTextStyle.bodySmall),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () {
                setState(() { _checkoutUrl = null; _paymentStatus = null; });
                _amountCtrl.clear();
              },
              child: const Text('Deposit Again'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Back to Banking'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _paymongoCheckoutCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Row(children: [
              Icon(Icons.qr_code_scanner, color: AppTheme.primaryGreen),
              SizedBox(width: 8),
              Text('Complete Your Payment', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ]),
            const SizedBox(height: 4),
            Text('Scan the QR code with another device or tap the button below to pay via GCash.', style: AppTextStyle.bodySmall),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: QrImageView(
                data: _checkoutUrl!,
                version: QrVersions.auto,
                size: 200,
                backgroundColor: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _openCheckoutUrl,
                icon: const Icon(Icons.open_in_browser),
                label: const Text('Pay with GCash'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryGreen,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const SizedBox(
              width: 20, height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(height: 4),
              Text('Waiting for payment confirmation...', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            TextButton(
              onPressed: () {
                _pollTimer?.cancel();
                setState(() { _checkoutUrl = null; _paymentStatus = null; });
              },
              child: const Text('Cancel', style: TextStyle(color: Colors.red)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _depositForm() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_paymongoMode) ...[
              Row(children: [
                const Text('\u{1F4B0}', style: TextStyle(fontSize: 24)),
                const SizedBox(width: 8),
                Text('GCash via PayMongo', style: AppTextStyle.heading3),
              ]),
              const SizedBox(height: 4),
              Text('Enter the amount and tap "Pay with GCash" to pay securely through PayMongo.', style: AppTextStyle.bodySmall),
            ] else ...[
              Row(children: [
                const Text('\u{1F4B0}', style: TextStyle(fontSize: 24)),
                const SizedBox(width: 8),
                Text('Send a GCash Deposit (Manual)', style: AppTextStyle.heading3),
              ]),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Send payment to our GCash account:', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(height: 4),
                    Text('\u{1F4F1} GCash Number: 09171234567', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.primaryGreen)),
                    Text('\u{1F464} Account Name: LabCoop Savings', style: TextStyle(fontSize: 13)),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _amountCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Amount',
                prefixText: 'PHP ',
                hintText: '0.00',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            if (!_paymongoMode) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _refCtrl,
                decoration: InputDecoration(
                  labelText: 'GCash Reference Number',
                  hintText: 'e.g. GCASH-1234567890',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _senderCtrl,
                decoration: InputDecoration(
                  labelText: 'Sender Name (optional)',
                  hintText: 'Your GCash registered name',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting ? null : (_paymongoMode ? _payWithPaymongo : _submitManual),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryGreen,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(_paymongoMode ? 'Pay with GCash' : 'Submit for Approval'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _depositTile(Map<String, dynamic> d) {
    final amount = parseAmount(d['amount']);
    final ref = d['reference_number']?.toString() ?? '';
    final sender = d['sender_name']?.toString() ?? '';
    final status = d['status']?.toString() ?? 'pending';
    final createdAt = d['created_at']?.toString() ?? '';
    final depositId = d['deposit_id']?.toString() ?? '';

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
      case 'paymongo_pending':
        statusColor = Colors.blue;
        statusLabel = 'Awaiting Payment';
        statusIcon = Icons.hourglass_bottom;
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
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (ref.isNotEmpty) Text('Ref: $ref', style: AppTextStyle.bodySmall),
            if (sender.isNotEmpty) Text('From: $sender', style: AppTextStyle.bodySmall),
          ],
        ),
        trailing: status == 'paymongo_pending'
            ? IconButton(
                icon: const Icon(Icons.cancel_outlined, color: Colors.red, size: 20),
                tooltip: 'Cancel deposit',
                onPressed: () => _cancelPendingDeposit(depositId),
              )
            : Column(
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

  Future<void> _cancelPendingDeposit(String depositId) async {
    final ok = await BankingApiService.cancelPaymongoDeposit(depositId);
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Deposit cancelled')));
      _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to cancel deposit'), backgroundColor: Colors.red));
    }
  }
}

class _CheckoutWebView extends StatefulWidget {
  final String checkoutUrl;
  const _CheckoutWebView({required this.checkoutUrl});

  @override
  State<_CheckoutWebView> createState() => _CheckoutWebViewState();
}

class _CheckoutWebViewState extends State<_CheckoutWebView> {
  double _progress = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('GCash Payment'),
        bottom: _progress < 1.0
            ? PreferredSize(
                preferredSize: const Size.fromHeight(2),
                child: LinearProgressIndicator(value: _progress),
              )
            : null,
      ),
      body: InAppWebView(
        initialUrlRequest: URLRequest(url: WebUri(widget.checkoutUrl)),
        onProgressChanged: (controller, progress) {
          setState(() => _progress = progress / 100.0);
        },
      ),
    );
  }
}
