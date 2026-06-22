import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../domain/entities/loan.dart';
import '../../domain/entities/loan_product.dart';
import '../blocs/loan_bloc.dart';

class LoanApplyPage extends StatefulWidget {
  final LoanProduct? product;
  const LoanApplyPage({super.key, this.product});

  @override
  State<LoanApplyPage> createState() => _LoanApplyPageState();
}

class _LoanApplyPageState extends State<LoanApplyPage> {
  final _formKey = GlobalKey<FormState>();
  final _purposeCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _storage = const FlutterSecureStorage();

  LoanProduct? _selectedProduct;
  int _termMonths = 3;
  String _accountId = '';

  @override
  void initState() {
    super.initState();
    _selectedProduct = widget.product;
    _loadAccount();
    context.read<LoanBloc>().add(const LoadLoanProducts());
  }

  Future<void> _loadAccount() async {
    final id = await _storage.read(key: 'account_id');
    if (id != null) setState(() => _accountId = id);
  }

  @override
  void dispose() {
    _purposeCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedProduct == null) return;

    final amount = double.parse(_amountCtrl.text);
    final loan = Loan(
      id: '',
      accountId: _accountId,
      productId: _selectedProduct!.id,
      principal: amount,
      interestRate: _selectedProduct!.interestRate,
      interestType: _selectedProduct!.interestType,
      termMonths: _termMonths,
      monthlyAmortization: 0,
      totalPayable: 0,
      amountPaid: 0,
      remainingBalance: amount,
      status: LoanStatus.pending,
      purpose: _purposeCtrl.text,
      createdAt: DateTime.now(),
    );

    context.read<LoanBloc>().add(ApplyForLoan(loan));

    if (!mounted) return;
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Loan application submitted! Pending approval.'), backgroundColor: AppTheme.primaryGreen),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Apply for Loan')),
      body: BlocBuilder<LoanBloc, LoanState>(
        builder: (context, state) {
          final products = state.loanProducts;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Select Loan Product', style: AppTextStyle.heading3),
                  const SizedBox(height: 12),
                  if (_selectedProduct != null)
                    Card(
                      color: AppTheme.primaryGreen.withValues(alpha: 0.05),
                      child: ListTile(
                        title: Text(_selectedProduct!.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${(_selectedProduct!.interestRate * 100).toStringAsFixed(1)}% ${_selectedProduct!.interestType == InterestType.flat ? 'Flat' : 'Diminishing'}'),
                        trailing: const Icon(Icons.check_circle, color: AppTheme.primaryGreen),
                        onTap: () => _pickProduct(products),
                      ),
                    )
                  else
                    ...products.map((p) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(p.name),
                        subtitle: Text('${(p.interestRate * 100).toStringAsFixed(1)}% • PHP ${p.minAmount.toStringAsFixed(0)} - PHP ${p.maxAmount.toStringAsFixed(0)}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => setState(() => _selectedProduct = p),
                      ),
                    )),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: _amountCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Loan Amount (PHP)',
                      prefixIcon: Icon(Icons.monetization_on),
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Enter amount';
                      final amt = double.tryParse(v);
                      if (amt == null) return 'Invalid amount';
                      if (_selectedProduct != null) {
                        if (amt < _selectedProduct!.minAmount) return 'Minimum is PHP ${_selectedProduct!.minAmount.toStringAsFixed(0)}';
                        if (amt > _selectedProduct!.maxAmount) return 'Maximum is PHP ${_selectedProduct!.maxAmount.toStringAsFixed(0)}';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  Text('Term (months)', style: AppTextStyle.label),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [3, 6, 9, 12].map((m) => ChoiceChip(
                      label: Text('$m mo'),
                      selected: _termMonths == m,
                      onSelected: (v) => setState(() => _termMonths = m),
                    )).toList(),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _purposeCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Purpose of Loan',
                      hintText: 'What will you use the money for?',
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) => v == null || v.isEmpty ? 'Enter a purpose' : null,
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: _submit,
                      icon: const Icon(Icons.send),
                      label: const Text('Submit Application'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryGreen,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _pickProduct(List<LoanProduct> products) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => ListView(
        children: products.map((p) => ListTile(
          title: Text(p.name),
          subtitle: Text('${(p.interestRate * 100).toStringAsFixed(1)}%'), onTap: () { setState(() => _selectedProduct = p); Navigator.pop(ctx); },
        )).toList(),
      ),
    );
  }
}
