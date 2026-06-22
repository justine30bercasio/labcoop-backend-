class SavingsProduct {
  final String id;
  final String name;
  final String description;
  final double interestRate;
  final InterestFrequency interestFrequency;
  final double minBalance;
  final double? withdrawalLimit;
  final bool isActive;

  const SavingsProduct({
    required this.id,
    required this.name,
    required this.description,
    required this.interestRate,
    required this.interestFrequency,
    required this.minBalance,
    this.withdrawalLimit,
    required this.isActive,
  });
}

enum InterestFrequency { daily, monthly, yearly }
