import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/theme/design_system.dart';
import '../../domain/entities/loan.dart';
import '../blocs/loan_bloc.dart';
import 'loan_apply_page.dart';

class LoanProductsPage extends StatefulWidget {
  const LoanProductsPage({super.key});

  @override
  State<LoanProductsPage> createState() => _LoanProductsPageState();
}

class _LoanProductsPageState extends State<LoanProductsPage> {
  @override
  void initState() {
    super.initState();
    context.read<LoanBloc>().add(const LoadLoanProducts());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Loan Products')),
      body: BlocBuilder<LoanBloc, LoanState>(
        builder: (context, state) {
          if (state.loanProducts.isEmpty) {
            return const Center(child: Text('No loan products available'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: state.loanProducts.length,
            itemBuilder: (context, index) {
              final product = state.loanProducts[index];
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
                          Text(product.name, style: AppTextStyle.heading3),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.green.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text('${(product.interestRate * 100).toStringAsFixed(1)}% ${product.interestType == InterestType.flat ? 'Flat' : 'Diminishing'}',
                              style: const TextStyle(color: Colors.green, fontWeight: FontWeight.w600, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(product.description, style: AppTextStyle.body),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(child: _infoChip('Min', 'PHP ${product.minAmount.toStringAsFixed(0)}')),
                          const SizedBox(width: 8),
                          Expanded(child: _infoChip('Max', 'PHP ${product.maxAmount.toStringAsFixed(0)}')),
                          const SizedBox(width: 8),
                          Expanded(child: _infoChip('Term', '${product.minTerm}-${product.maxTerm} mo')),
                        ],
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () => Navigator.push(context, PageTransition.slideUp(LoanApplyPage(product: product))),
                          icon: const Icon(Icons.send, size: 18),
                          label: const Text('Apply Now'),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _infoChip(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Text(label, style: const TextStyle(color: Colors.grey, fontSize: 11)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      ),
    );
  }
}
