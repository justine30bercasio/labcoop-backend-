import 'package:flutter/material.dart';

class SavingsOpenPage extends StatefulWidget {
  final String accountId;
  const SavingsOpenPage({super.key, required this.accountId});

  @override
  State<SavingsOpenPage> createState() => _SavingsOpenPageState();
}

class _SavingsOpenPageState extends State<SavingsOpenPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(title: const Text('Open Savings Account')),
      body: const Center(
        child: Text('HELLO WORLD - Savings Page Loaded',
          style: TextStyle(fontSize: 24, color: Colors.green, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
