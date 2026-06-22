class Pet {
  final String petId;
  final int level;
  final int evolutionStage;
  final String name;
  final int happiness;
  final int coinsFed;
  final String accessory;
  final DateTime? lastFed;

  const Pet({
    required this.petId,
    this.level = 1,
    this.evolutionStage = 0,
    this.name = 'Piggy',
    this.happiness = 100,
    this.coinsFed = 0,
    this.accessory = '',
    this.lastFed,
  });

  String get evolutionEmoji {
    const stages = ['🥚', '🐷', '🐖', '🐗', '🦔', '🦄', '🐉'];
    return stages[evolutionStage.clamp(0, stages.length - 1)];
  }

  String get evolutionName {
    const names = ['Egg', 'Baby Pig', 'Teen Pig', 'Adult Pig', 'Golden Pig', 'Diamond Pig', 'Legendary Pig'];
    return names[evolutionStage.clamp(0, names.length - 1)];
  }

  int get nextLevelThreshold => level * 100;
  int get happinessPercent => happiness.clamp(0, 100);
  bool get isHungry => happiness < 30;
  bool get isHappy => happiness >= 70;

  Pet copyWith({
    int? level,
    int? evolutionStage,
    String? name,
    int? happiness,
    int? coinsFed,
    String? accessory,
    DateTime? lastFed,
  }) {
    return Pet(
      petId: petId,
      level: level ?? this.level,
      evolutionStage: evolutionStage ?? this.evolutionStage,
      name: name ?? this.name,
      happiness: happiness ?? this.happiness,
      coinsFed: coinsFed ?? this.coinsFed,
      accessory: accessory ?? this.accessory,
      lastFed: lastFed ?? this.lastFed,
    );
  }
}
