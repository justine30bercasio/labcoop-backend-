import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class XpBarWidget extends StatelessWidget {
  final int currentXp;
  final int? lastGainedXp;

  const XpBarWidget({
    super.key,
    required this.currentXp,
    this.lastGainedXp,
  });

  @override
  Widget build(BuildContext context) {
    final nextLevelXp = _nextLevelXp(currentXp);
    final progress = currentXp / nextLevelXp;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.xpPurple, Color(0xFF9C27B0)],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text(
                'LVL ${_levelFromXp(currentXp)}',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              const Spacer(),
              Text(
                '$currentXp / $nextLevelXp XP',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: Colors.white.withValues(alpha: 0.2),
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppTheme.coinGold),
              minHeight: 8,
            ),
          ),
          if (lastGainedXp != null && lastGainedXp! > 0) ...[
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const Icon(Icons.add, color: Colors.greenAccent, size: 14),
                const SizedBox(width: 2),
                Text(
                  '+$lastGainedXp XP',
                  style: const TextStyle(
                    color: Colors.greenAccent,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  int _levelFromXp(int xp) {
    if (xp < 100) return 1;
    return (xp / 100).floor() + 1;
  }

  int _nextLevelXp(int xp) {
    final level = _levelFromXp(xp);
    return level * 100;
  }
}
