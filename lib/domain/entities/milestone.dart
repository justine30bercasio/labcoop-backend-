class Milestone {
  final String id;
  final double threshold;
  final String title;
  final String description;
  final String icon;
  final String rewardType;
  final int rewardValue;
  final String? rewardItemId;
  final String? rewardItemName;
  final String? rewardItemEmoji;
  final bool achieved;
  final bool claimed;
  final String? claimedAt;

  const Milestone({
    required this.id,
    required this.threshold,
    required this.title,
    required this.description,
    required this.icon,
    required this.rewardType,
    required this.rewardValue,
    this.rewardItemId,
    this.rewardItemName,
    this.rewardItemEmoji,
    required this.achieved,
    required this.claimed,
    this.claimedAt,
  });

  factory Milestone.fromJson(Map<String, dynamic> json) {
    return Milestone(
      id: json['id'] as String,
      threshold: _toDouble(json['threshold']),
      title: json['title'] as String? ?? 'Milestone',
      description: json['description'] as String? ?? '',
      icon: json['icon'] as String? ?? '🏆',
      rewardType: json['reward_type'] as String? ?? 'coins',
      rewardValue: _toInt(json['reward_value']),
      rewardItemId: json['reward_item_id'] as String?,
      rewardItemName: json['reward_item_name'] as String?,
      rewardItemEmoji: json['reward_item_emoji'] as String?,
      achieved: json['achieved'] as bool? ?? false,
      claimed: json['claimed'] as bool? ?? false,
      claimedAt: json['claimed_at'] as String?,
    );
  }

  static double _toDouble(Object? v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v) ?? 0;
    return 0;
  }

  static int _toInt(Object? v) {
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }

  String get rewardLabel {
    switch (rewardType) {
      case 'coins':
        return '+$rewardValue coins';
      case 'xp':
        return '+$rewardValue XP';
      case 'border':
        return rewardItemName != null
            ? 'Free: ${rewardItemEmoji ?? ''} $rewardItemName border'
            : 'Free shop border';
      case 'certificate':
        return '🏅 Certificate & title';
      default:
        return 'Reward';
    }
  }
}
