import '../../domain/entities/savings_product.dart';

class SavingsProductModel {
  final String id;
  final String name;
  final String description;
  final double interestRate;
  final String interestFrequency;
  final double minBalance;
  final double? withdrawalLimit;
  final bool isActive;

  const SavingsProductModel({
    required this.id,
    required this.name,
    required this.description,
    required this.interestRate,
    required this.interestFrequency,
    required this.minBalance,
    this.withdrawalLimit,
    required this.isActive,
  });

  factory SavingsProductModel.fromJson(Map<String, dynamic> json) {
    return SavingsProductModel(
      id: json['product_id'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      interestRate: (json['interest_rate'] as num).toDouble(),
      interestFrequency: json['interest_frequency'] as String,
      minBalance: (json['min_balance'] as num).toDouble(),
      withdrawalLimit: (json['withdrawal_limit'] as num?)?.toDouble(),
      isActive: json['is_active'] == 1,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'product_id': id,
      'name': name,
      'description': description,
      'interest_rate': interestRate,
      'interest_frequency': interestFrequency,
      'min_balance': minBalance,
      'withdrawal_limit': withdrawalLimit,
      'is_active': isActive ? 1 : 0,
    };
  }

  SavingsProduct toEntity() {
    return SavingsProduct(
      id: id,
      name: name,
      description: description,
      interestRate: interestRate,
      interestFrequency: _parseFrequency(interestFrequency),
      minBalance: minBalance,
      withdrawalLimit: withdrawalLimit,
      isActive: isActive,
    );
  }

  static InterestFrequency _parseFrequency(String f) {
    switch (f) {
      case 'daily': return InterestFrequency.daily;
      case 'monthly': return InterestFrequency.monthly;
      case 'yearly': return InterestFrequency.yearly;
      default: return InterestFrequency.monthly;
    }
  }
}
