import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';

class SavingsOpenPage extends StatefulWidget {
  final String accountId;
  const SavingsOpenPage({super.key, required this.accountId});

  @override
  State<SavingsOpenPage> createState() => _SavingsOpenPageState();
}

class _SavingsOpenPageState extends State<SavingsOpenPage> {
  List<Map<String, dynamic>> _products = [];
  Map<String, dynamic>? _currentSavings;
  bool _loading = false;
  String? _error;
  bool _initialLoadDone = false;

  @override
  void initState() {
    super.initState();
    Future(() {
      if (mounted) _load();
    });
  }

  Future<void> _load() async {
    if (_loading) return;
    _error = null;
    if (!mounted) return;
    setState(() { _loading = true; _products = []; _currentSavings = null; });
    try {
      final p = await BankingApiService.getSavingsProducts().timeout(const Duration(seconds: 15));
      if (!mounted) return;
      final i = await BankingApiService.getSavingsInfo(widget.accountId).timeout(const Duration(seconds: 15));
      if (!mounted) return;
      setState(() {
        _products = p.whereType<Map<String, dynamic>>().toList();
        _currentSavings = i;
        _loading = false;
        _initialLoadDone = true;
      });
    } on TimeoutException {
      if (!mounted) return;
      setState(() { _loading = false; _error = 'Server not responding. Tap Retry.'; _initialLoadDone = true; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = 'Failed to load savings data'; _initialLoadDone = true; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Open Savings Account')),
      body: Center(
        child: _loading
            ? const Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Loading...', style: TextStyle(color: Colors.grey, fontSize: 16)),
                ],
              )
            : _error != null
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 16)),
                      const SizedBox(height: 16),
                      ElevatedButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  )
                : _buildContent(),
      ),
    );
  }

  Widget _buildContent() {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_currentSavings?['savings_product'] != null)
            _currentProductCard(_currentSavings!['savings_product'] as Map<String, dynamic>),
          if (_currentSavings?['savings_product'] != null) const SizedBox(height: 16),
          Text('Available Savings Products', style: AppTextStyle.heading3),
          const SizedBox(height: 12),
          if (_products.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No products available'))))
          else
            ..._products.map((p) {
              try { return _productCard(p); } catch (_) { return const SizedBox.shrink(); }
            }),
        ],
      ),
    );
  }

  Widget _currentProductCard(Map<String, dynamic> product) {
    final rate = (product['interest_rate'] ?? 0).toDouble();
    final freq = product['interest_frequency'] ?? '';
    final earned = ((_currentSavings?['interest_earned'] ?? 0) as num).toDouble();
    return Card(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.primaryGreen, Color(0xFF1B5E20)],
            begin: Alignment.topLeft, end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.all(Radius.circular(16)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.check_circle, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              const Text('Your Savings Product', style: TextStyle(color: Colors.white70, fontSize: 13)),
            ]),
            const SizedBox(height: 8),
            Text(product['name']?.toString() ?? '', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(product['description']?.toString() ?? '', style: const TextStyle(color: Colors.white70, fontSize: 13)),
            const SizedBox(height: 8),
            Row(children: [
              Text('${(rate * 100).toStringAsFixed(1)}% p.${freq == 'yearly' ? 'a.' : freq == 'monthly' ? 'm.' : 'd.'}',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              const Spacer(),
              Text('Earned: PHP ${earned.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white70, fontSize: 13)),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _productCard(Map<String, dynamic> product) {
    final name = product['name']?.toString() ?? '';
    final desc = product['description']?.toString() ?? '';
    final rate = (product['interest_rate'] ?? 0).toDouble();
    final freq = product['interest_frequency'] ?? 'monthly';
    final minBalance = (product['min_balance'] ?? 0).toDouble();
    final wl = product['withdrawal_limit'];
    String fl;
    switch (freq.toString()) {
      case 'daily': fl = 'per day'; break;
      case 'yearly': fl = 'per year'; break;
      default: fl = 'per month';
    }
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(child: Text(name, style: AppTextStyle.heading3)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryGreen.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text('${(rate * 100).toStringAsFixed(1)}%',
                    style: const TextStyle(color: AppTheme.primaryGreen, fontWeight: FontWeight.bold, fontSize: 16)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(desc, style: AppTextStyle.body),
            const SizedBox(height: 8),
            Wrap(spacing: 16, children: [
              _infoChip(Icons.calendar_today, fl),
              _infoChip(Icons.money_off, 'Min: PHP ${minBalance.toStringAsFixed(0)}'),
              if (wl != null && (wl is num) && wl == 0) _infoChip(Icons.lock, 'No withdrawals'),
            ]),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => _apply(product['product_id']?.toString() ?? '', name),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryGreen,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: const Text('Apply Now'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoChip(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: Colors.grey),
        const SizedBox(width: 4),
        Text(label, style: AppTextStyle.bodySmall),
      ],
    );
  }

  Future<void> _apply(String productId, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Apply for Savings'),
        content: Text('Apply for $name?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryGreen, foregroundColor: Colors.white),
            child: const Text('Apply'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final r = await BankingApiService.applySavingsAccount(widget.accountId, productId);
    if (!mounted) return;
    if (r != null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Application submitted successfully!'),
        backgroundColor: AppTheme.primaryGreen,
      ));
      _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Failed to apply. You may already have a savings product or pending application.'),
        backgroundColor: Colors.red,
      ));
    }
  }
}
