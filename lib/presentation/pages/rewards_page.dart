import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../data/datasources/local_db_source.dart';
import '../../domain/entities/badge.dart' as entities;
import '../widgets/xp_bar_widget.dart';
import '../widgets/badge_grid_widget.dart';
import '../widgets/animated_counter.dart';
import '../widgets/app_card.dart';

class RewardsPage extends StatefulWidget {
  final int currentXp;
  final int? lastGainedXp;
  final List<entities.Badge> badges;

  const RewardsPage({
    super.key,
    required this.currentXp,
    this.lastGainedXp,
    required this.badges,
  });

  @override
  State<RewardsPage> createState() => _RewardsPageState();
}

class _RewardsPageState extends State<RewardsPage> {
  final _source = LocalDbSource();
  int _petLevel = 1;
  int _quizHighScore = 0;
  int _townBuildings = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final petData = await _source.getPetData();
    final quiz = await _source.getQuizHighScore();
    final buildings = await _source.getTownBuildings();
    final unlocked = buildings.where((b) => b['isUnlocked'] == true).length;
    if (!mounted) return;
    setState(() {
      _petLevel = petData['level'] as int? ?? 1;
      _quizHighScore = quiz;
      _townBuildings = unlocked;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Rewards & Progress')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Spacing.sm),
              child: XpBarWidget(
                currentXp: widget.currentXp,
                lastGainedXp: widget.lastGainedXp,
              ),
            ),
            const SizedBox(height: Spacing.lg),
            _buildProgressCards(),
            const SizedBox(height: Spacing.lg),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Spacing.sm),
              child: Row(
                children: [
                  Icon(Icons.emoji_events, color: AppTheme.primaryGreen, size: 20),
                  const SizedBox(width: Spacing.sm),
                  Text('Your Badges', style: AppTextStyle.heading3),
                ],
              ),
            ),
            const SizedBox(height: Spacing.sm + 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Spacing.sm),
              child: BadgeGridWidget(badges: widget.badges),
            ),
            const SizedBox(height: Spacing.lg),
            _buildRareUnlocks(),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressCards() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Spacing.sm),
      child: Row(
        children: [
          Expanded(child: _progressCard(Icons.pets, 'Pet Level', _petLevel.toDouble(), AppTheme.primaryGreen, Colors.green.shade50)),
          const SizedBox(width: Spacing.sm),
          Expanded(child: _progressCard(Icons.location_city, 'Town', _townBuildings.toDouble(), Colors.blue, Colors.blue.shade50)),
          const SizedBox(width: Spacing.sm),
          Expanded(child: _progressCard(Icons.quiz, 'Quiz', _quizHighScore.toDouble(), AppTheme.xpPurple, Colors.purple.shade50)),
        ],
      ),
    );
  }

  Widget _progressCard(IconData icon, String label, double value, Color color, Color bgColor) {
    return Container(
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: Spacing.sm),
          AnimatedCounter(
            value: value,
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 22, color: color),
          ),
          Text(label, style: AppTextStyle.bodySmall),
        ],
      ),
    );
  }

  Widget _buildRareUnlocks() {
    return AppCard(
      padding: const EdgeInsets.all(Spacing.lg),
      borderRadius: RadiusTokens.xl,
      elevation: 0,
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFFFF8E1), Color(0xFFFFF3E0)],
          ),
          borderRadius: BorderRadius.circular(RadiusTokens.xl),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome, color: AppTheme.coinGold, size: 22),
                const SizedBox(width: Spacing.sm),
                Text('Rare Unlocks', style: AppTextStyle.heading3),
              ],
            ),
            const SizedBox(height: Spacing.sm + 4),
            _unlockItem('🐷 → 🐉', 'Evolve Piggy to Legendary', _petLevel >= 7),
            _unlockItem('🏠 → 🏰', 'Build the full Dream Town', _townBuildings >= 10),
            _unlockItem('📝 → 🏆', 'Score 100+ in Financial Quiz', _quizHighScore >= 100),
            _unlockItem('🪙 → 👑', 'Save ₱5,000 total', widget.currentXp >= 5000),
            const SizedBox(height: Spacing.sm + 4),
            Container(
              padding: const EdgeInsets.all(Spacing.sm + 4),
              decoration: BoxDecoration(
                color: AppTheme.accentAmber.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(RadiusTokens.md),
              ),
              child: const Row(
                children: [
                  Icon(Icons.star, color: AppTheme.coinGold, size: 16),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Complete all unlocks to earn exclusive avatars, borders, and pets!',
                      style: TextStyle(fontSize: 12, color: Colors.brown),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _unlockItem(String emoji, String description, bool unlocked) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: unlocked ? AppTheme.primaryGreen.withValues(alpha: 0.1) : Colors.grey.shade100,
              borderRadius: BorderRadius.circular(RadiusTokens.sm),
            ),
            child: Center(
              child: Icon(
                unlocked ? Icons.check_circle : Icons.lock,
                color: unlocked ? AppTheme.primaryGreen : Colors.grey,
                size: 18,
              ),
            ),
          ),
          const SizedBox(width: Spacing.sm + 4),
          Text(emoji, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: Spacing.sm),
          Expanded(
            child: Text(
              description,
              style: TextStyle(
                fontSize: 13,
                fontWeight: unlocked ? FontWeight.bold : FontWeight.normal,
                color: unlocked ? AppTheme.textDark : Colors.grey,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
