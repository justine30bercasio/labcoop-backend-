import 'loan.dart';

class LoanProduct {
  final String id;
  final String name;
  final String description;
  final double interestRate;
  final InterestType interestType;
  final double minAmount;
  final double maxAmount;
  final int minTerm;
  final int maxTerm;
  final bool isActive;

  const LoanProduct({
    required this.id,
    required this.name,
    required this.description,
    required this.interestRate,
    required this.interestType,
    required this.minAmount,
    required this.maxAmount,
    required this.minTerm,
    required this.maxTerm,
    required this.isActive,
  });
}
