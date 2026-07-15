import 'package:flutter/material.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../core/helpers/number_helpers.dart';

class AutoSavePage extends StatefulWidget {
  final String accountId;
  const AutoSavePage({super.key, required this.accountId});

  @override
  State<AutoSavePage> createState() => _AutoSavePageState();
}

class _AutoSavePageState extends State<AutoSavePage> {
  List<dynamic> _orders = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final orders = await BankingApiService.getStandingOrders(widget.accountId);
      if (!mounted) return;
      setState(() { _orders = orders; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _createOrder() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => const _CreateOrderSheet(),
    );
    if (result == null || !mounted) return;

    final order = await BankingApiService.createStandingOrder(
      accountId: widget.accountId,
      amount: parseAmount(result['amount']),
      frequency: result['frequency'] as String,
      description: result['description'] as String?,
    );
    if (!mounted) return;
    if (order != null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Standing order created!'),
        backgroundColor: AppTheme.primaryGreen,
      ));
      _load();
    }
  }

  Future<void> _deactivateOrder(String orderId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Deactivate Order'),
        content: const Text('Deactivate this standing order?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            child: const Text('Deactivate'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final ok = await BankingApiService.deleteStandingOrder(orderId);
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Standing order deactivated'),
        backgroundColor: AppTheme.primaryGreen,
      ));
      _load();
    }
  }

  String _freqLabel(String f) {
    switch (f) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      default: return f;
    }
  }

  String _formatDate(String raw) {
    if (raw.length >= 10) return raw.substring(0, 10);
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Auto-Save')),
      floatingActionButton: FloatingActionButton(
        onPressed: _createOrder,
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _orders.isEmpty
                  ? ListView(
                      children: [
                        SizedBox(height: MediaQuery.of(context).size.height * 0.3),
                        Center(child: Column(
                          children: [
                            Icon(Icons.timer_off, size: 64, color: Theme.of(context).colorScheme.onSurfaceVariant),
                            SizedBox(height: 16),
                            Text('No standing orders', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 16)),
                            SizedBox(height: 8),
                            Text('Tap + to create one', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                          ],
                        )),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _orders.length,
                      itemBuilder: (context, index) => _orderCard(_orders[index] is Map<String, dynamic> ? _orders[index] as Map<String, dynamic> : <String, dynamic>{}),
                    ),
            ),
    );
  }

  Widget _orderCard(Map<String, dynamic> order) {
    final amount = parseAmount(order['amount']);
    final frequency = order['frequency']?.toString() ?? '';
    final nextRun = order['next_run']?.toString() ?? '';
    final description = order['description']?.toString() ?? '';
    final isActive = order['is_active'] == 1 || order['is_active'] == true;
    final orderId = order['order_id']?.toString() ?? '';

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: isActive ? () => _deactivateOrder(orderId) : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: (isActive ? AppTheme.primaryGreen : Colors.grey).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  isActive ? Icons.timer : Icons.timer_off,
                  color: isActive ? AppTheme.primaryGreen : Colors.grey,
                  size: 24,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(description.isNotEmpty ? description : 'Auto-Save ${_freqLabel(frequency)}',
                      style: TextStyle(fontWeight: FontWeight.w600, color: isActive ? Theme.of(context).colorScheme.onSurface : Theme.of(context).colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 4),
                    Text('${_freqLabel(frequency)} \u2022 Next: ${_formatDate(nextRun)}', style: AppTextStyle.bodySmall(context)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('PHP ${amount.toStringAsFixed(2)}', style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: isActive ? Theme.of(context).colorScheme.onSurface : Theme.of(context).colorScheme.onSurfaceVariant,
                  )),
                  const SizedBox(height: 2),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: (isActive ? AppTheme.primaryGreen : Colors.grey).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(isActive ? 'Active' : 'Inactive', style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w600,
                      color: isActive ? AppTheme.primaryGreen : Theme.of(context).colorScheme.onSurfaceVariant,
                    )),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CreateOrderSheet extends StatefulWidget {
  const _CreateOrderSheet();

  @override
  State<_CreateOrderSheet> createState() => _CreateOrderSheetState();
}

class _CreateOrderSheetState extends State<_CreateOrderSheet> {
  final _amountCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String _frequency = 'weekly';

  @override
  void dispose() {
    _amountCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('New Standing Order', style: AppTextStyle.heading2(context)),
          const SizedBox(height: 20),
          TextField(
            controller: _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Amount',
              prefixText: 'PHP ',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            value: _frequency,
            decoration: InputDecoration(
              labelText: 'Frequency',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            items: const [
              DropdownMenuItem(value: 'daily', child: Text('Daily')),
              DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
              DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
            ],
            onChanged: (v) { if (v != null) setState(() => _frequency = v); },
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descCtrl,
            decoration: InputDecoration(
              labelText: 'Description (optional)',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                final amount = double.tryParse(_amountCtrl.text);
                if (amount == null || amount <= 0) return;
                Navigator.pop(context, {
                  'amount': amount,
                  'frequency': _frequency,
                  'description': _descCtrl.text.isNotEmpty ? _descCtrl.text : null,
                });
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryGreen,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: const Text('Create Order'),
            ),
          ),
        ],
      ),
    );
  }
}
