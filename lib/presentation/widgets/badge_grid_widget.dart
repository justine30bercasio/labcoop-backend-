import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../domain/entities/badge.dart' as entities;

class BadgeGridWidget extends StatelessWidget {
  final List<entities.Badge> badges;

  const BadgeGridWidget({super.key, required this.badges});

  @override
  Widget build(BuildContext context) {
    if (badges.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Text(
            'Start saving to earn badges!',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 16),
          ),
        ),
      );
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.85,
      ),
      itemCount: badges.length,
      itemBuilder: (context, index) {
        final badge = badges[index];
        return _BadgeItem(badge: badge);
      },
    );
  }
}

class _BadgeItem extends StatelessWidget {
  final entities.Badge badge;

  const _BadgeItem({required this.badge});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: badge.isUnlocked
            ? AppTheme.coinGold.withValues(alpha: 0.15)
            : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: badge.isUnlocked
              ? AppTheme.coinGold
              : Colors.grey.shade300,
          width: 2,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            badge.isUnlocked ? Icons.emoji_events : Icons.lock,
            size: 32,
            color: badge.isUnlocked
                ? AppTheme.coinGold
                : Colors.grey.shade400,
          ),
          const SizedBox(height: 6),
          Text(
            badge.name,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: badge.isUnlocked ? Theme.of(context).colorScheme.onSurface : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
