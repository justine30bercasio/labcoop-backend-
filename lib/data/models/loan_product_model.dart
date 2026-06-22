import '../../domain/entities/loan.dart';
import '../../domain/entities/loan_product.dart';

class LoanProductModel {
  final String id;
  final String name;
  final String description;
  final double interestRate;
  final String interestType;
  final double minAmount;
  final double maxAmount;
  final int minTerm;
  final int maxTerm;
  final bool isActive;

  const LoanProductModel({
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

  factory LoanProductModel.fromJson(Map<String, dynamic> json) {
    return LoanProductModel(
      id: json['product_id'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      interestRate: (json['interest_rate'] as num).toDouble(),
      interestType: json['interest_type'] as String,
      minAmount: (json['min_amount'] as num).toDouble(),
      maxAmount: (json['max_amount'] as num).toDouble(),
      minTerm: json['min_term'] as int,
      maxTerm: json['max_term'] as int,
      isActive: json['is_active'] == 1,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'product_id': id,
      'name': name,
      'description': description,
      'interest_rate': interestRate,
      'interest_type': interestType,
      'min_amount': minAmount,
      'max_amount': maxAmount,
      'min_term': minTerm,
      'max_term': maxTerm,
      'is_active': isActive ? 1 : 0,
    };
  }

  LoanProduct toEntity() {
    return LoanProduct(
      id: id,
      name: name,
      description: description,
      interestRate: interestRate,
      interestType: interestType == 'diminishing' ? InterestType.diminishing : InterestType.flat,
      minAmount: minAmount,
      maxAmount: maxAmount,
      minTerm: minTerm,
      maxTerm: maxTerm,
      isActive: isActive,
    );
  }
}
