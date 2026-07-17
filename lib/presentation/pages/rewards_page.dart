import 'package:flutter/material.dart';
import '../../core/network/dio_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';
import '../../domain/entities/badge.dart' as entities;
import '../widgets/animated_counter.dart';
import '../widgets/app_card.dart';
import '../widgets/fortune_wheel.dart';
import '../widgets/interactive_badge_card.dart';
import '../widgets/notification_bell.dart';
import '../widgets/support_bell.dart';
import '../widgets/treasure_chest.dart';
import '../widgets/xp_bar_widget.dart';

class RewardsPage extends StatefulWidget {
  final int currentXp;
  final int? lastGainedXp;
  final List<entities.Badge> badges;
  final String accountId;

  const RewardsPage({
    super.key,
    required this.currentXp,
    this.lastGainedXp,
    required this.badges,
    required this.accountId,
  });

  @override
  State<RewardsPage> createState() => _RewardsPageState();
}

class _RewardsPageState extends State<RewardsPage> {
  final _source = LocalDbSource();
  final _api = RemoteApiSource(DioClient.create());
  int _petLevel = 1;
  int _quizHighScore = 0;
  int _townBuildings = 0;
  int _coins = 0;
  bool _canSpin = true;
  bool _spinExpanded = false;

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
    final coins = await _source.getCoins();
    if (!mounted) return;

    bool canSpin = false;
    try {
      canSpin = await _api.canSpinWheel(widget.accountId);
    } catch (_) {
      canSpin = true;
    }

    setState(() {
      _petLevel = petData['level'] as int? ?? 1;
      _quizHighScore = quiz;
      _townBuildings = unlocked;
      _coins = coins;
      _canSpin = canSpin;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rewards & Progress'),
        actions: [const SupportBell(), const NotificationBell()],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildCoinHeader(),
            const SizedBox(height: Spacing.md),
            XpBarWidget(
              currentXp: widget.currentXp,
              lastGainedXp: widget.lastGainedXp,
            ),
            const SizedBox(height: Spacing.md),
            _buildTreasureChests(),
            const SizedBox(height: Spacing.md),
            _buildFortuneWheelSection(),
            const SizedBox(height: Spacing.md),
            _buildProgressCards(),
            const SizedBox(height: Spacing.md),
            _buildBadgesSection(),
            const SizedBox(height: Spacing.md),
            _buildRareUnlocks(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildCoinHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.coinGold.withValues(alpha: 0.2),
            AppTheme.accentAmber.withValues(alpha: 0.1),
          ],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.coinGold.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                colors: [AppTheme.coinGold, Color(0xFFFF8F00)],
              ),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.coinGold.withValues(alpha: 0.4),
                  blurRadius: 8,
                ),
              ],
            ),
            child: const Center(
              child: Text('\u{1FA99}', style: TextStyle(fontSize: 24)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your Coins', style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                )),
                AnimatedCounter(
                  value: _coins.toDouble(),
                  prefix: '\u{1FA99} ',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.coinGold,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.savings, color: AppTheme.coinGold, size: 28),
        ],
      ),
    );
  }

  Widget _buildTreasureChests() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Row(
            children: [
              Icon(Icons.card_giftcard, color: AppTheme.accentAmber, size: 18),
              const SizedBox(width: 6),
              Text('XP Milestone Chests', style: AppTextStyle.heading3(context)),
            ],
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: [
              TreasureChestWidget(
                currentXp: widget.currentXp,
                xpRequired: 100,
                label: 'Starter',
                icon: Icons.star,
                color: AppTheme.primaryGreen,
                onOpen: () => _showChestReward('Starter Chest', '\u{1F389} You unlocked 10 bonus coins!'),
              ),
              const SizedBox(width: 8),
              TreasureChestWidget(
                currentXp: widget.currentXp,
                xpRequired: 300,
                label: 'Silver',
                icon: Icons.auto_awesome,
                color: Colors.blue,
                onOpen: () => _showChestReward('Silver Chest', '\u{1F31F} 25 coins + 15 XP bonus!'),
              ),
              const SizedBox(width: 8),
              TreasureChestWidget(
                currentXp: widget.currentXp,
                xpRequired: 600,
                label: 'Gold',
                icon: Icons.workspace_premium,
                color: AppTheme.coinGold,
                onOpen: () => _showChestReward('Gold Chest', '\u{1F451} 50 coins + 30 XP bonus!'),
              ),
              const SizedBox(width: 8),
              TreasureChestWidget(
                currentXp: widget.currentXp,
                xpRequired: 1000,
                label: 'Diamond',
                icon: Icons.diamond,
                color: Colors.purple,
                onOpen: () => _showChestReward('Diamond Chest', '\u{1F48E} 100 coins + 50 XP bonus!'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _showChestReward(String title, String message) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const Icon(Icons.card_giftcard, color: AppTheme.coinGold),
            const SizedBox(width: 8),
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('\u{1F381}', style: TextStyle(fontSize: 48)),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Claim!'),
          ),
        ],
      ),
    );
  }

  Widget _buildFortuneWheelSection() {
    return AppCard(
      padding: const EdgeInsets.all(Spacing.md),
      borderRadius: RadiusTokens.xl,
      elevation: 0,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.amber.shade50, Colors.orange.shade50],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(RadiusTokens.xl),
        ),
        child: Column(
          children: [
            InkWell(
              onTap: () => setState(() => _spinExpanded = !_spinExpanded),
              borderRadius: BorderRadius.circular(RadiusTokens.xl),
              child: Padding(
                padding: const EdgeInsets.all(Spacing.md),
                child: Row(
                  children: [
                    const Icon(Icons.casino, color: AppTheme.coinGold, size: 24),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Daily Fortune Spin', style: AppTextStyle.heading3(context)),
                          Text(
                            _canSpin ? 'Spin once per day for rewards!' : 'Come back tomorrow!',
                            style: TextStyle(
                              fontSize: 12,
                              color: _canSpin ? AppTheme.primaryGreen : Colors.grey,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      _spinExpanded ? Icons.expand_less : Icons.expand_more,
                      color: Colors.amber.shade700,
                    ),
                  ],
                ),
              ),
            ),
            AnimatedCrossFade(
              firstChild: const SizedBox.shrink(),
              secondChild: FortuneWheel(
                canSpin: _canSpin,
                onSpin: () async {
                  final result = await _api.spinWheel(widget.accountId);
                  final reward = result['reward'] as Map<String, dynamic>;
                  final coins = (reward['coins'] as num?)?.toInt() ?? 0;
                  if (coins > 0) {
                    await _source.addCoins(coins);
                    setState(() => _coins += coins);
                  }
                  setState(() => _canSpin = false);
                  _showSpinResult(reward);
                  return result;
                },
                onRewardClaimed: () {},
              ),
              crossFadeState: _spinExpanded
                  ? CrossFadeState.showSecond
                  : CrossFadeState.showFirst,
              duration: const Duration(milliseconds: 300),
            ),
          ],
        ),
      ),
    );
  }

  void _showSpinResult(Map<String, dynamic> reward) {
    final label = reward['label'] as String? ?? '';
    final coins = (reward['coins'] as num?)?.toInt() ?? 0;
    final xp = (reward['xp'] as num?)?.toInt() ?? 0;
    final streak = (reward['streakBonus'] as num?)?.toInt() ?? 0;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        backgroundColor: Colors.amber.shade50,
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('\u{1F389}', style: TextStyle(fontSize: 56)),
            const SizedBox(height: 12),
            Text(
              label,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: AppTheme.coinGold,
              ),
            ),
            const SizedBox(height: 16),
            if (coins > 0) _rewardRow('\u{1FA99}', '+$coins coins', AppTheme.coinGold),
            if (xp > 0) _rewardRow('\u{2B50}', '+$xp XP', AppTheme.xpPurple),
            if (streak > 0) _rewardRow('\u{1F525}', '+$streak streak days', Colors.orange),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _load();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryGreen,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: const Text('Collect!'),
          ),
        ],
      ),
    );
  }

  Widget _rewardRow(String emoji, String text, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 8),
          Text(text, style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: color,
          )),
        ],
      ),
    );
  }

  Widget _buildProgressCards() {
    final maxLevel = _petLevel >= 7 ? _petLevel.toDouble() : _petLevel.toDouble();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          Expanded(child: _progressCard(Icons.pets, 'Pet Level', maxLevel, 7, AppTheme.primaryGreen)),
          const SizedBox(width: Spacing.sm),
          Expanded(child: _progressCard(Icons.location_city, 'Town', _townBuildings.toDouble(), 10, Colors.blue)),
          const SizedBox(width: Spacing.sm),
          Expanded(child: _progressCard(Icons.quiz, 'Quiz Score', _quizHighScore.toDouble(), 100, AppTheme.xpPurple)),
        ],
      ),
    );
  }

  Widget _progressCard(IconData icon, String label, double value, double max, Color color) {
    final progress = (value / max).clamp(0.0, 1.0);
    return Container(
      padding: const EdgeInsets.all(Spacing.md),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 26),
          const SizedBox(height: 6),
          AnimatedCounter(
            value: value,
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: color),
          ),
          Text(label, style: TextStyle(fontSize: 11, color: color)),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: color.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation(color),
              minHeight: 4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBadgesSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Row(
            children: [
              Icon(Icons.emoji_events, color: AppTheme.coinGold, size: 18),
              const SizedBox(width: 6),
              Text('Your Badges', style: AppTextStyle.heading3(context)),
              const Spacer(),
              Text(
                '${widget.badges.where((b) => b.isUnlocked).length}/${widget.badges.length}',
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        if (widget.badges.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Text(
                'Start saving to earn badges!',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontSize: 14,
                ),
              ),
            ),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 4,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 0.85,
            ),
            itemCount: widget.badges.length,
            itemBuilder: (context, index) {
              return InteractiveBadgeCard(badge: widget.badges[index]);
            },
          ),
      ],
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
                Text('Rare Unlocks', style: AppTextStyle.heading3(context)),
              ],
            ),
            const SizedBox(height: Spacing.sm + 4),
            _unlockItem(
              '\u{1F437} \u{2192} \u{1F409}',
              'Evolve Piggy to Legendary',
              _petLevel >= 7,
              _petLevel >= 7 ? 1.0 : (_petLevel / 7).clamp(0.0, 1.0),
            ),
            _unlockItem(
              '\u{1F3E0} \u{2192} \u{1F3F0}',
              'Build the full Dream Town',
              _townBuildings >= 10,
              (_townBuildings / 10).clamp(0.0, 1.0),
            ),
            _unlockItem(
              '\u{1F4DD} \u{2192} \u{1F3C6}',
              'Score 100+ in Quiz',
              _quizHighScore >= 100,
              (_quizHighScore / 100).clamp(0.0, 1.0),
            ),
            _unlockItem(
              '\u{1FA99} \u{2192} \u{1F451}',
              'Save \u{20B1}5,000 total',
              widget.currentXp >= 5000,
              (widget.currentXp / 5000).clamp(0.0, 1.0),
            ),
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

  Widget _unlockItem(String emoji, String description, bool unlocked, double progress) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Spacing.sm),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: unlocked
                      ? AppTheme.primaryGreen.withValues(alpha: 0.1)
                      : Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(RadiusTokens.sm),
                ),
                child: Center(
                  child: Icon(
                    unlocked ? Icons.check_circle : Icons.lock,
                    color: unlocked
                        ? AppTheme.primaryGreen
                        : Theme.of(context).colorScheme.onSurfaceVariant,
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
                    color: unlocked
                        ? Theme.of(context).colorScheme.onSurface
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: Colors.grey.shade200,
              valueColor: AlwaysStoppedAnimation(
                unlocked ? AppTheme.primaryGreen : AppTheme.accentAmber,
              ),
              minHeight: 4,
            ),
          ),
        ],
      ),
    );
  }
}
