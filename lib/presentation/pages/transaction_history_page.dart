import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/theme/design_system.dart';
import '../../domain/entities/transaction.dart';
import '../blocs/banking_bloc.dart';

class TransactionHistoryPage extends StatefulWidget {
  final String accountId;
  const TransactionHistoryPage({super.key, required this.accountId});

  @override
  State<TransactionHistoryPage> createState() => _TransactionHistoryPageState();
}

class _TransactionHistoryPageState extends State<TransactionHistoryPage> {
  @override
  void initState() {
    super.initState();
    context.read<BankingBloc>().add(LoadTransactions(widget.accountId));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction History')),
      body: BlocBuilder<BankingBloc, BankingState>(
        builder: (context, state) {
          if (state.transactionStatus == TransactionStatus.loading) {
            return const Center(child: CircularProgressIndicator());
          }
          final filtered = state.transactions.where((t) => t.type != TransactionType.allocation).toList();
          if (filtered.isEmpty) {
            return const Center(child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.receipt_long, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('No transactions yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
              ],
            ));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: filtered.length + 1,
            itemBuilder: (context, index) {
              if (index == 0) return _headerEntry(filtered.length);
              final t = filtered[index - 1];
              return _transactionTile(t);
            },
          );
        },
      ),
    );
  }

  Widget _headerEntry(int count) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Text('Passbook Ledger', style: AppTextStyle.heading2),
          const Spacer(),
          Text('$count entries', style: AppTextStyle.bodySmall),
        ],
      ),
    );
  }

  Widget _transactionTile(Transaction t) {
    final isCredit = t.type == TransactionType.deposit || t.type == TransactionType.loanDisbursement || t.type == TransactionType.interestCredit;
    final typeLabels = {
      TransactionType.deposit: 'Deposit',
      TransactionType.withdrawal: 'Withdrawal',
      TransactionType.transfer: 'Transfer',
      TransactionType.loanDisbursement: 'Loan Disbursement',
      TransactionType.loanPayment: 'Loan Payment',
      TransactionType.interestCredit: 'Interest',
      TransactionType.fee: 'Fee',
      TransactionType.allocation: 'Allocation',
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: (isCredit ? Colors.green : Colors.red).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                color: isCredit ? Colors.green : Colors.red,
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(typeLabels[t.type] ?? t.type.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(t.description, style: AppTextStyle.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text('${t.createdAt.month}/${t.createdAt.day}/${t.createdAt.year} ${t.createdAt.hour.toString().padLeft(2, '0')}:${t.createdAt.minute.toString().padLeft(2, '0')}',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${isCredit ? '+' : '-'}PHP ${t.amount.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: isCredit ? Colors.green : Colors.red,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Bal: PHP ${t.balanceAfter.toStringAsFixed(2)}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
