class Badge {
  final String badgeId;
  final String name;
  final String description;
  final String iconUrl;
  final int requiredXp;
  final bool isUnlocked;
  final DateTime? unlockedAt;

  const Badge({
    required this.badgeId,
    required this.name,
    required this.description,
    required this.iconUrl,
    required this.requiredXp,
    this.isUnlocked = false,
    this.unlockedAt,
  });

  Badge copyWith({
    String? badgeId,
    String? name,
    String? description,
    String? iconUrl,
    int? requiredXp,
    bool? isUnlocked,
    DateTime? unlockedAt,
  }) {
    return Badge(
      badgeId: badgeId ?? this.badgeId,
      name: name ?? this.name,
      description: description ?? this.description,
      iconUrl: iconUrl ?? this.iconUrl,
      requiredXp: requiredXp ?? this.requiredXp,
      isUnlocked: isUnlocked ?? this.isUnlocked,
      unlockedAt: unlockedAt ?? this.unlockedAt,
    );
  }
}
