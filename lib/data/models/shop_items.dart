import 'package:flutter/material.dart';

class ShopItem {
  final String id;
  final String name;
  final String emoji;
  final int cost;
  final bool isAvatar;
  final String imageUrl;

  const ShopItem({
    required this.id,
    required this.name,
    required this.emoji,
    required this.cost,
    required this.isAvatar,
    this.imageUrl = '',
  });

  factory ShopItem.fromJson(Map<String, dynamic> json) {
    return ShopItem(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      emoji: json['emoji'] as String? ?? '',
      cost: (json['cost'] as num?)?.toInt() ?? 0,
      isAvatar: json['type'] == 'avatar',
      imageUrl: json['image_url'] as String? ?? '',
    );
  }
}

const fallbackAvatarItems = [
  ShopItem(id: 'av_cat', name: 'Kitty', emoji: '🐱', cost: 0, isAvatar: true),
  ShopItem(id: 'av_dog', name: 'Puppy', emoji: '🐶', cost: 5, isAvatar: true),
  ShopItem(id: 'av_lion', name: 'Lion', emoji: '🦁', cost: 10, isAvatar: true),
  ShopItem(id: 'av_tiger', name: 'Tiger', emoji: '🐯', cost: 10, isAvatar: true),
  ShopItem(id: 'av_bear', name: 'Bear', emoji: '🐻', cost: 15, isAvatar: true),
  ShopItem(id: 'av_panda', name: 'Panda', emoji: '🐼', cost: 15, isAvatar: true),
  ShopItem(id: 'av_fox', name: 'Fox', emoji: '🦊', cost: 20, isAvatar: true),
  ShopItem(id: 'av_unicorn', name: 'Unicorn', emoji: '🦄', cost: 30, isAvatar: true),
  ShopItem(id: 'av_monkey', name: 'Monkey', emoji: '🐵', cost: 20, isAvatar: true),
  ShopItem(id: 'av_frog', name: 'Frog', emoji: '🐸', cost: 25, isAvatar: true),
  ShopItem(id: 'av_owl', name: 'Owl', emoji: '🦉', cost: 25, isAvatar: true),
  ShopItem(id: 'av_dino', name: 'Dino', emoji: '🦖', cost: 40, isAvatar: true),
  ShopItem(id: 'av_robot', name: 'Robot', emoji: '🤖', cost: 50, isAvatar: true),
  ShopItem(id: 'av_ghost', name: 'Ghost', emoji: '👻', cost: 45, isAvatar: true),
  ShopItem(id: 'av_alien', name: 'Alien', emoji: '👽', cost: 55, isAvatar: true),
  ShopItem(id: 'av_dragon', name: 'Dragon', emoji: '🐉', cost: 80, isAvatar: true),
];

class BorderItem {
  final String id;
  final String name;
  final int cost;
  final String rarity;
  final Color color1;
  final Color color2;
  final String imageUrl;

  const BorderItem({
    required this.id,
    required this.name,
    required this.cost,
    required this.rarity,
    required this.color1,
    required this.color2,
    this.imageUrl = '',
  });

  factory BorderItem.fromJson(Map<String, dynamic> json) {
    return BorderItem(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      cost: (json['cost'] as num?)?.toInt() ?? 0,
      rarity: json['rarity'] as String? ?? 'Common',
      color1: _parseColor(json['color1'] as String? ?? '#2E7D32'),
      color2: _parseColor(json['color2'] as String? ?? '#2E7D32'),
      imageUrl: json['image_url'] as String? ?? '',
    );
  }

  static Color _parseColor(String hex) {
    hex = hex.replaceFirst('#', '');
    if (hex.length == 3) {
      hex = hex.split('').map((c) => '$c$c').join();
    }
    return Color(int.parse('FF$hex', radix: 16));
  }
}

const fallbackBorderItems = [
  BorderItem(id: 'b_default', name: 'Basic', cost: 0, rarity: 'Common', color1: Color(0xFF2E7D32), color2: Color(0xFF2E7D32)),
  BorderItem(id: 'b_silver', name: 'Silver', cost: 10, rarity: 'Uncommon', color1: Color(0xFFC0C0C0), color2: Color(0xFF9E9E9E)),
  BorderItem(id: 'b_gold', name: 'Gold', cost: 25, rarity: 'Rare', color1: Color(0xFFFFD700), color2: Color(0xFFFFA000)),
  BorderItem(id: 'b_purple', name: 'Epic', cost: 40, rarity: 'Epic', color1: Color(0xFF9C27B0), color2: Color(0xFF6A1B9A)),
  BorderItem(id: 'b_legendary', name: 'Legendary', cost: 60, rarity: 'Legendary', color1: Color(0xFFD32F2F), color2: Color(0xFFFF6F00)),
  BorderItem(id: 'b_rainbow', name: 'Rainbow', cost: 85, rarity: 'Special', color1: Color(0xFFE91E63), color2: Color(0xFF2196F3)),
  BorderItem(id: 'b_mythic', name: 'Mythic', cost: 120, rarity: 'Mythic', color1: Color(0xFF00BCD4), color2: Color(0xFF304FFE)),
];

Color borderRarityColor(String rarity) {
  switch (rarity) {
    case 'Uncommon': return const Color(0xFF9E9E9E);
    case 'Rare': return const Color(0xFFFFA000);
    case 'Epic': return const Color(0xFF9C27B0);
    case 'Legendary': return const Color(0xFFD32F2F);
    case 'Special': return const Color(0xFFE91E63);
    case 'Mythic': return const Color(0xFF00BCD4);
    default: return const Color(0xFF2E7D32);
  }
}
