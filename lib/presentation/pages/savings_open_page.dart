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
  String _status = 'init';
  String? _error;

  @override
  void initState() {
    super.initState();
    _status = 'loading';
    _load();
  }

  Future<void> _load() async {
    _error = null;
    _status = 'loading';
    try {
      final p = await BankingApiService.getSavingsProducts().timeout(const Duration(seconds: 15));
      if (!mounted) return;
      await BankingApiService.getSavingsInfo(widget.accountId).timeout(const Duration(seconds: 15));
      if (!mounted) return;
      _status = 'ok_' + p.length.toString();
      setState(() {});
    } on TimeoutException {
      if (!mounted) return;
      _error = 'timeout'; _status = 'error'; setState(() {});
    } catch (e) {
      if (!mounted) return;
      _error = e.toString(); _status = 'error'; setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Open Savings Account')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Status: $_status', style: const TextStyle(fontSize: 20)),
            if (_error != null) Text('Error: $_error', style: const TextStyle(color: Colors.red)),
            if (_status == 'loading') const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
            if (_status != 'loading') ElevatedButton(
              onPressed: _load,
              child: const Text('Reload'),
            ),
          ],
        ),
      ),
    );
  }
}
