import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../domain/entities/loan.dart';
import '../blocs/loan_bloc.dart';
import 'loan_detail_page.dart';

class MyLoansPage extends StatefulWidget {
  final String accountId;
  const MyLoansPage({super.key, required this.accountId});

  @override
  State<MyLoansPage> createState() => _MyLoansPageState();
}

class _MyLoansPageState extends State<MyLoansPage> {
  @override
  void initState() {
    super.initState();
    context.read<LoanBloc>().add(LoadMyLoans(widget.accountId));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Loans')),
      body: BlocBuilder<LoanBloc, LoanState>(
        builder: (context, state) {
          if (state.loanStatus == LoanStatusBloc.loading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.loans.isEmpty) {
            return const Center(child: Text('No loans yet'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: state.loans.length,
            itemBuilder: (context, index) => _loanCard(state.loans[index]),
          );
        },
      ),
    );
  }

  Widget _loanCard(Loan loan) {
    final statusColors = {
      LoanStatus.pending: Colors.orange,
      LoanStatus.approved: AppTheme.waterBlue,
      LoanStatus.active: AppTheme.primaryGreen,
      LoanStatus.paid: Colors.grey,
      LoanStatus.defaulted: Colors.red,
    };
    final statusLabels = {
      LoanStatus.pending: 'Pending',
      LoanStatus.approved: 'Approved',
      LoanStatus.active: 'Active',
      LoanStatus.paid: 'Paid',
      LoanStatus.defaulted: 'Defaulted',
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.push(context, PageTransition.slideUp(LoanDetailPage(loanId: loan.id, accountId: loan.accountId))),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(loan.purpose.isNotEmpty ? loan.purpose : 'Loan', style: AppTextStyle.heading3(context)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: (statusColors[loan.status] ?? Colors.grey).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      statusLabels[loan.status] ?? 'Unknown',
                      style: TextStyle(color: statusColors[loan.status] ?? Colors.grey, fontWeight: FontWeight.w600, fontSize: 12),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('Principal: ', style: TextStyle(color: Colors.grey)),
                  Text('PHP ${loan.principal.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(width: 16),
                  const Text('Balance: ', style: TextStyle(color: Colors.grey)),
                  Text('PHP ${loan.remainingBalance.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.red)),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Text('Monthly: PHP ${loan.monthlyAmortization.toStringAsFixed(2)}', style: AppTextStyle.bodySmall(context)),
                  const Spacer(),
                  Text('${loan.termMonths} months', style: AppTextStyle.bodySmall(context)),
                ],
              ),
              if (loan.status == LoanStatus.active || loan.status == LoanStatus.paid) ...[
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: loan.progress,
                    backgroundColor: Colors.grey.shade200,
                    color: loan.status == LoanStatus.paid ? Colors.green : AppTheme.primaryGreen,
                    minHeight: 6,
                  ),
                ),
                const SizedBox(height: 4),
                Text('${(loan.progress * 100).toStringAsFixed(1)}% paid', style: AppTextStyle.bodySmall(context)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
