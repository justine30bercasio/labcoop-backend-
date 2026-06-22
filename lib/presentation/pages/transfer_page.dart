import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../domain/entities/goal_jar.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_event.dart';
import '../blocs/savings_state.dart';

class TransferPage extends StatefulWidget {
  const TransferPage({super.key});

  @override
  State<TransferPage> createState() => _TransferPageState();
}

class _TransferPageState extends State<TransferPage> {
  GoalJar? _from;
  GoalJar? _to;
  final _amountController = TextEditingController();
  bool _isTransferring = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  bool get _canTransfer {
    if (_from == null || _to == null) return false;
    final amount = double.tryParse(_amountController.text) ?? 0;
    if (amount <= 0) return false;
    if (amount > _from!.currentAllocated) return false;
    return true;
  }

  void _transfer() {
    final amount = double.tryParse(_amountController.text) ?? 0;
    if (!_canTransfer) return;

    setState(() {
      _isTransferring = true;
      _error = null;
    });

    context.read<SavingsBloc>().add(
          TransferFunds(from: _from!, to: _to!, amount: amount),
        );

    Future.delayed(const Duration(milliseconds: 600), () {
      if (!mounted) return;
      setState(() {
        _isTransferring = false;
        _from = null;
        _to = null;
        _amountController.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.check_circle, color: Colors.white),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  '₱${amount.toStringAsFixed(0)} moved from ${_from?.title ?? ""} to ${_to?.title ?? ""}!',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          backgroundColor: AppTheme.primaryGreen,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 3),
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transfer Between Jars')),
      body: BlocConsumer<SavingsBloc, SavingsState>(
        listener: (context, state) {
          if (state is SavingsError && _isTransferring) {
            setState(() {
              _isTransferring = false;
              _error = state.message;
            });
          }
        },
        builder: (context, state) {
          if (state is! SavingsLoaded) {
            return const Center(child: CircularProgressIndicator());
          }

          final goals = state.goals;
          final amount = double.tryParse(_amountController.text) ?? 0;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildGoalDropdown('From', Icons.remove_circle_outline, goals, _from,
                    (v) => setState(() { _from = v; _error = null; })),
                const SizedBox(height: 12),
                Center(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryGreen.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.arrow_downward, color: AppTheme.primaryGreen, size: 28),
                  ),
                ),
                const SizedBox(height: 12),
                _buildGoalDropdown('To', Icons.add_circle_outline, goals, _to,
                    (v) => setState(() { _to = v; _error = null; })),
                const SizedBox(height: 28),
                TextField(
                  controller: _amountController,
                  keyboardType: TextInputType.number,
                  onChanged: (_) => setState(() => _error = null),
                  decoration: InputDecoration(
                    labelText: 'Amount (₱)',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                    prefixText: '₱ ',
                    filled: true,
                    fillColor: Colors.white,
                    suffixText: _from != null
                        ? 'Available: ₱${_from!.currentAllocated.toStringAsFixed(0)}'
                        : null,
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: Colors.red, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                        ),
                      ],
                    ),
                  ),
                ],
                if (_from != null && amount > _from!.currentAllocated) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.warning_amber, color: Colors.orange, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '"${_from!.title}" only has ₱${_from!.currentAllocated.toStringAsFixed(0)}',
                            style: TextStyle(color: Colors.orange.shade800, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  height: 56,
                  child: ElevatedButton.icon(
                    onPressed: _canTransfer && !_isTransferring ? _transfer : null,
                    icon: _isTransferring
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.swap_horiz),
                    label: Text(_isTransferring ? 'Transferring...' : 'Transfer'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryGreen,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                if (_from != null && _to != null)
                  _buildTransferPreview(_from!, _to!, amount),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildGoalDropdown(
    String label,
    IconData icon,
    List<GoalJar> goals,
    GoalJar? selected,
    ValueChanged<GoalJar?> onChanged,
  ) {
    final isFrom = label == 'From';
    return DropdownButtonFormField<GoalJar>(
      value: selected,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: AppTheme.primaryGreen),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
        filled: true,
        fillColor: Colors.white,
      ),
      items: goals
          .where((g) => !isFrom || g.currentAllocated > 0)
          .where((g) => isFrom || g.goalId != _from?.goalId)
          .map((g) => DropdownMenuItem(
                value: g,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(AppConstants.displayIcon(g.categoryIcon), style: const TextStyle(fontSize: 20)),
                    const SizedBox(width: 12),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 140),
                      child: Text(g.title, style: const TextStyle(fontSize: 14), overflow: TextOverflow.ellipsis),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: isFrom ? Colors.orange.shade50 : AppTheme.primaryGreen.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '₱${g.currentAllocated.toStringAsFixed(0)}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: isFrom ? Colors.orange.shade700 : AppTheme.primaryGreen,
                        ),
                      ),
                    ),
                  ],
                ),
              ))
          .toList(),
      onChanged: onChanged,
    );
  }

  Widget _buildTransferPreview(GoalJar from, GoalJar to, double amount) {
    final fromAfter = from.currentAllocated - amount;
    final toAfter = to.currentAllocated + amount;
    final isValid = amount > 0 && amount <= from.currentAllocated;

    return Card(
      margin: const EdgeInsets.only(top: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Transfer Preview',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 16),
            if (isValid) ...[
              _previewRow(from.categoryIcon, from.title, from.currentAllocated, fromAfter, Colors.orange),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    const SizedBox(width: 28),
                    const Icon(Icons.arrow_forward, color: AppTheme.primaryGreen, size: 20),
                    const SizedBox(width: 12),
                    Text('₱${amount.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.primaryGreen)),
                  ],
                ),
              ),
              _previewRow(to.categoryIcon, to.title, to.currentAllocated, toAfter, AppTheme.primaryGreen),
            ] else ...[
              _previewRow(from.categoryIcon, from.title, from.currentAllocated, null, Colors.grey),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    SizedBox(width: 28),
                    Icon(Icons.arrow_forward, color: Colors.grey, size: 20),
                    SizedBox(width: 12),
                    Text('Enter an amount', style: TextStyle(color: Colors.grey)),
                  ],
                ),
              ),
              _previewRow(to.categoryIcon, to.title, to.currentAllocated, null, Colors.grey),
            ],
          ],
        ),
      ),
    );
  }

  Widget _previewRow(String icon, String title, double current, double? after, Color color) {
    return Row(
      children: [
        Text(AppConstants.displayIcon(icon), style: const TextStyle(fontSize: 24)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
              if (after != null)
                Text(
                  '₱${current.toStringAsFixed(0)} → ₱${after.toStringAsFixed(0)}',
                  style: TextStyle(fontSize: 13, color: color, fontWeight: FontWeight.w600),
                )
              else
                Text(
                  '₱${current.toStringAsFixed(0)}',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
