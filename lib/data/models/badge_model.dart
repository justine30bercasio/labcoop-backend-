import '../../domain/entities/badge.dart';

class BadgeModel {
  final String badgeId;
  final String name;
  final String description;
  final String iconUrl;
  final int requiredXp;
  final bool isUnlocked;
  final DateTime? unlockedAt;

  const BadgeModel({
    required this.badgeId,
    required this.name,
    required this.description,
    required this.iconUrl,
    required this.requiredXp,
    this.isUnlocked = false,
    this.unlockedAt,
  });

  factory BadgeModel.fromJson(Map<String, dynamic> json) {
    int i(v) => v is String ? int.parse(v) : v as int;
    return BadgeModel(
      badgeId: json['badge_id'] as String,
      name: json['name'] as String,
      description: json['description'] as String,
      iconUrl: json['icon_url'] as String,
      requiredXp: i(json['required_xp']),
      isUnlocked: json['is_unlocked'] as bool? ?? false,
      unlockedAt: json['unlocked_at'] != null
          ? DateTime.parse(json['unlocked_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'badge_id': badgeId,
      'name': name,
      'description': description,
      'icon_url': iconUrl,
      'required_xp': requiredXp,
      'is_unlocked': isUnlocked,
      'unlocked_at': unlockedAt?.toIso8601String(),
    };
  }

  Badge toEntity() {
    return Badge(
      badgeId: badgeId,
      name: name,
      description: description,
      iconUrl: iconUrl,
      requiredXp: requiredXp,
      isUnlocked: isUnlocked,
      unlockedAt: unlockedAt,
    );
  }

  factory BadgeModel.fromEntity(Badge entity) {
    return BadgeModel(
      badgeId: entity.badgeId,
      name: entity.name,
      description: entity.description,
      iconUrl: entity.iconUrl,
      requiredXp: entity.requiredXp,
      isUnlocked: entity.isUnlocked,
      unlockedAt: entity.unlockedAt,
    );
  }
}
