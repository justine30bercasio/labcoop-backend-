class TownBuilding {
  final String id;
  final String name;
  final String emoji;
  final int cost;
  final String bonusType;
  final double bonusValue;
  final String description;
  final bool isUnlocked;
  final bool isPlaced;

  const TownBuilding({
    required this.id,
    required this.name,
    required this.emoji,
    required this.cost,
    required this.bonusType,
    required this.bonusValue,
    required this.description,
    this.isUnlocked = false,
    this.isPlaced = false,
  });

  TownBuilding copyWith({
    bool? isUnlocked,
    bool? isPlaced,
  }) {
    return TownBuilding(
      id: id,
      name: name,
      emoji: emoji,
      cost: cost,
      bonusType: bonusType,
      bonusValue: bonusValue,
      description: description,
      isUnlocked: isUnlocked ?? this.isUnlocked,
      isPlaced: isPlaced ?? this.isPlaced,
    );
  }
}
