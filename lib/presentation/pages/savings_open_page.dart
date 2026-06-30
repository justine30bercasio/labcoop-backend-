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
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    _error = null;
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final raw = await BankingApiService.getSavingsProducts().timeout(const Duration(seconds: 15));
      if (!mounted) return;
      _products = raw.whereType<Map<String, dynamic>>().toList();
      final info = await BankingApiService.getSavingsInfo(widget.accountId).timeout(const Duration(seconds: 15));
      if (!mounted) return;
      _currentSavings = info;
      setState(() => _loading = false);
    } on TimeoutException {
      if (!mounted) return;
      _error = 'Request timed out. Check your connection.';
      setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      _error = 'Failed to load: $e';
      setState(() => _loading = false);
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
            _currentProductCard(_currentSavings!),
          Text('Available Savings Products', style: AppTextStyle.heading3),
          const SizedBox(height: 12),
          if (_products.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: Text('No products available', style: AppTextStyle.bodySmall),
                ),
              ),
            )
          else
            ..._products.map((p) => _productCard(p)),
        ],
      ),
    );
  }

  Widget _currentProductCard(Map<String, dynamic> info) {
    final prod = (info['savings_product'] ?? <String, dynamic>{}) as Map<String, dynamic>;
    return Card(
      color: AppTheme.primaryGreen,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.account_balance, color: Colors.white, size: 32),
            const SizedBox(height: 8),
            Text(prod['name'] ?? 'Current Plan', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('Balance: ₱${(info['balance'] ?? 0).toStringAsFixed(2)}', style: const TextStyle(color: Colors.white70, fontSize: 14)),
            Text('Interest Rate: ${prod['interest_rate'] ?? 0}%', style: const TextStyle(color: Colors.white70, fontSize: 14)),
            Text('Frequency: ${prod['frequency'] ?? 'monthly'}', style: const TextStyle(color: Colors.white70, fontSize: 14)),
          ],
        ),
      ),
    );
  }

  Widget _productCard(Map<String, dynamic> prod) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(prod['name'] ?? 'Unnamed', style: AppTextStyle.heading3),
            const SizedBox(height: 4),
            Text(prod['description'] ?? '', style: AppTextStyle.bodySmall),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Rate: ${prod['interest_rate'] ?? 0}%', style: AppTextStyle.bodySmall),
                Text('Min: ₱${(prod['min_balance'] ?? 0).toStringAsFixed(2)}', style: AppTextStyle.bodySmall),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryGreen, foregroundColor: Colors.white),
                onPressed: () => _apply(prod),
                child: Text(_currentSavings != null ? 'Switch' : 'Open Account'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _apply(Map<String, dynamic> prod) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Confirm ${_currentSavings != null ? "Switch" : "Open"}'),
        content: Text('Are you sure you want to ${_currentSavings != null ? "switch to" : "open"} ${prod['name']}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }
}
