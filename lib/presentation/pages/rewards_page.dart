import 'package:flutter/material.dart';
import '../../core/network/dio_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';
import '../../domain/entities/badge.dart' as entities;
import '../../domain/entities/certificate.dart';
import '../../domain/entities/milestone.dart';
import '../widgets/animated_counter.dart';
import '../widgets/app_card.dart';
import '../widgets/confetti_widget.dart';
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
  int _quizHighScore = 0;
  int _townBuildings = 0;
  int _coins = 0;
  bool _canSpin = true;
  bool _spinExpanded = false;
  List<Milestone> _milestones = [];
  List<Certificate> _certificates = [];
  double _totalSaved = 0;
  bool _milestonesReady = false;
  String? _claimingId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final quiz = await _source.getQuizHighScore();
    final buildings = await _source.getTownBuildings();
    final unlocked = buildings.where((b) => b['isUnlocked'] == true).length;
    final coins = await _source.getCoins();

    List<Milestone> milestones = [];
    List<Certificate> certificates = [];
    double totalSaved = 0;
    bool ready = false;
    try {
      final data = await _api.fetchMilestones(widget.accountId);
      totalSaved = (data['total_saved'] as num?)?.toDouble() ?? 0;
      milestones = ((data['milestones'] as List?) ?? [])
          .map((e) => Milestone.fromJson(e as Map<String, dynamic>))
          .toList();
      certificates = ((data['certificates'] as List?) ?? [])
          .map((e) => Certificate.fromJson(e as Map<String, dynamic>))
          .toList();
      ready = true;
    } catch (_) {
      ready = false;
    }

    if (!mounted) return;

    bool canSpin = false;
    try {
      canSpin = await _api.canSpinWheel(widget.accountId);
    } catch (_) {
      canSpin = true;
    }

    setState(() {
      _quizHighScore = quiz;
      _townBuildings = unlocked;
      _coins = coins;
      _milestones = milestones;
      _certificates = certificates;
      _totalSaved = totalSaved;
      _milestonesReady = ready;
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
      body: RefreshIndicator(
        color: AppTheme.primaryGreen,
        onRefresh: _load,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
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
              _buildSavingsRecognition(),
              const SizedBox(height: Spacing.md),
              _buildTreasureChests(),
              const SizedBox(height: Spacing.md),
              _buildFortuneWheelSection(),
              const SizedBox(height: Spacing.md),
              _buildProgressCards(),
              const SizedBox(height: Spacing.md),
              _buildBadgesSection(),
              const SizedBox(height: Spacing.md),
              _buildMilestones(),
              const SizedBox(height: 24),
            ],
          ),
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
    final claimedCount = _milestones.where((m) => m.claimed).length;
    final totalCount = _milestones.length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          Expanded(child: _progressCard(Icons.military_tech, 'Milestones', claimedCount.toDouble(), totalCount > 0 ? totalCount.toDouble() : 1, AppTheme.primaryGreen)),
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

  Widget _buildSavingsRecognition() {
    final achieved = _milestones.where((m) => m.achieved && !m.claimed).length;
    final next = _milestones.where((m) => !m.achieved).toList()
      ..sort((a, b) => a.threshold.compareTo(b.threshold));
    final nextM = next.isNotEmpty ? next.first : null;
    final remaining = nextM != null ? nextM.threshold - _totalSaved : 0.0;
    final progress = nextM != null
        ? (_totalSaved / nextM.threshold).clamp(0.0, 1.0)
        : 1.0;

    return AppCard(
      padding: const EdgeInsets.all(Spacing.lg),
      borderRadius: RadiusTokens.xl,
      elevation: 0,
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFE8F5E9), Color(0xFFFFF8E1)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(RadiusTokens.xl),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.emoji_events, color: AppTheme.coinGold, size: 22),
                const SizedBox(width: Spacing.sm),
                Expanded(
                  child: Text('My Savings Journey', style: AppTextStyle.heading3(context)),
                ),
                if (achieved > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryGreen.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '$achieved reward ready!',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.primaryGreen,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: Spacing.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Text('\u{1F3C6}', style: TextStyle(fontSize: 36)),
                const SizedBox(width: 8),
                Expanded(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: AnimatedCounter(
                      value: _totalSaved,
                      prefix: '\u{20B1}',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.coinGold,
                      ),
                    ),
                  ),
                ),
                if (nextM != null)
                  Flexible(
                    child: Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Text(
                        'Goal: \u{20B1}${_formatMoney(nextM.threshold)}',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: Spacing.sm),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: progress.toDouble(),
                backgroundColor: Colors.grey.shade200,
                valueColor: const AlwaysStoppedAnimation(AppTheme.coinGold),
                minHeight: 10,
              ),
            ),
            const SizedBox(height: Spacing.sm),
            Text(
              nextM != null
                  ? 'Save \u{20B1}${_formatMoney(remaining)} more to earn "${nextM.title}"!'
                  : 'You reached every milestone — keep saving!',
              style: TextStyle(
                fontSize: 13,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMilestones() {
    return AppCard(
      padding: const EdgeInsets.all(Spacing.lg),
      borderRadius: RadiusTokens.xl,
      elevation: 0,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.military_tech, color: AppTheme.coinGold, size: 22),
              const SizedBox(width: Spacing.sm),
              Expanded(child: Text('Savings Milestones', style: AppTextStyle.heading3(context))),
              Text(
                '${_milestones.where((m) => m.claimed).length}/${_milestones.length} claimed',
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: Spacing.sm + 4),
          if (!_milestonesReady)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: Text(
                  'Connect to the internet to see your milestones.',
                  style: TextStyle(
                    fontSize: 13,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            )
          else if (_milestones.isEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: Text(
                  'No milestones yet — check back soon!',
                  style: TextStyle(
                    fontSize: 13,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            )
          else
            ..._milestones.map((m) => _milestoneCard(m)),
        ],
      ),
    );
  }

  Widget _milestoneCard(Milestone m) {
    final progress = m.achieved
        ? 1.0
        : (_totalSaved / m.threshold).clamp(0.0, 1.0);
    final isClaiming = _claimingId == m.id;
    Certificate? cert;
    if (m.rewardType == 'certificate') {
      for (final c in _certificates) {
        if (c.title == m.title) {
          cert = c;
          break;
        }
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: Spacing.sm + 4),
      decoration: BoxDecoration(
        color: m.achieved
            ? AppTheme.primaryGreen.withValues(alpha: 0.06)
            : Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(
          color: m.achieved
              ? AppTheme.primaryGreen.withValues(alpha: 0.3)
              : Colors.grey.shade200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (m.achieved)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 5),
              decoration: const BoxDecoration(
                color: AppTheme.primaryGreen,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(RadiusTokens.lg - 1),
                  topRight: Radius.circular(RadiusTokens.lg - 1),
                ),
              ),
              child: const Center(
                child: Text(
                  'ACHIEVED',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(Spacing.sm + 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: m.achieved
                              ? [AppTheme.coinGold, Color(0xFFFF8F00)]
                              : [Colors.grey.shade300, Colors.grey.shade400],
                        ),
                        borderRadius: BorderRadius.circular(RadiusTokens.md),
                      ),
                      child: Center(
                        child: Text(m.icon, style: const TextStyle(fontSize: 24)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            m.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: m.achieved
                                  ? Theme.of(context).colorScheme.onSurface
                                  : Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Save \u{20B1}${_formatMoney(m.threshold)} total',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(child: _rewardChip(m)),
                  ],
                ),
                const SizedBox(height: Spacing.sm + 2),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: progress,
                    backgroundColor: Colors.grey.shade200,
                    valueColor: AlwaysStoppedAnimation(
                      m.achieved ? AppTheme.primaryGreen : AppTheme.accentAmber,
                    ),
                    minHeight: 8,
                  ),
                ),
                const SizedBox(height: Spacing.sm),
                if (m.claimed)
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      const Icon(Icons.check_circle, color: AppTheme.primaryGreen, size: 16),
                      Text(
                        'Reward claimed!',
                        style: TextStyle(fontSize: 12, color: AppTheme.primaryGreen),
                      ),
                      if (cert != null)
                        TextButton.icon(
                          onPressed: () => _viewCertificate(cert!),
                          icon: const Icon(Icons.receipt_long, size: 16),
                          label: const Text('View Certificate'),
                          style: TextButton.styleFrom(
                            foregroundColor: AppTheme.accentAmber,
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                      if (m.claimedAt != null)
                        Text(
                          m.claimedAt!,
                          style: TextStyle(
                            fontSize: 11,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                        ),
                    ],
                  )
                else if (m.achieved)
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: isClaiming ? null : () => _claimMilestone(m),
                      icon: const Icon(Icons.emoji_events, size: 18),
                      label: Text(isClaiming ? 'Claiming...' : 'Claim Reward'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryGreen,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  )
                else
                  Row(
                    children: [
                      const Icon(Icons.lock_clock, size: 16, color: Colors.grey),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Save \u{20B1}${_formatMoney(m.threshold - _totalSaved)} more to reach this',
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _rewardChip(Milestone m) {
    final Color bg;
    final Color fg;
    switch (m.rewardType) {
      case 'coins':
        bg = AppTheme.coinGold.withValues(alpha: 0.15);
        fg = AppTheme.coinGold;
        break;
      case 'xp':
        bg = AppTheme.xpPurple.withValues(alpha: 0.12);
        fg = AppTheme.xpPurple;
        break;
      case 'border':
        bg = AppTheme.primaryGreen.withValues(alpha: 0.12);
        fg = AppTheme.primaryGreen;
        break;
      default:
        bg = AppTheme.accentAmber.withValues(alpha: 0.15);
        fg = AppTheme.accentAmber;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        m.rewardLabel,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        softWrap: false,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: fg),
      ),
    );
  }

  Future<void> _claimMilestone(Milestone m) async {
    if (_claimingId != null) return;
    setState(() => _claimingId = m.id);
    try {
      final result = await _api.claimMilestone(widget.accountId, m.id);
      final granted = result['granted'] as Map<String, dynamic>? ?? const {};
      final coins = (granted['coins'] as num?)?.toInt() ?? 0;
      if (coins > 0) {
        await _source.addCoins(coins);
        setState(() => _coins += coins);
      }
      final border = granted['border'] as String?;
      if (border != null && border.isNotEmpty) {
        await _source.addPurchasedItem(border);
      }
      if (!mounted) return;
      await _load();
      if (mounted) _showClaimCelebration(m, granted);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not claim reward. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _claimingId = null);
    }
  }

  void _showClaimCelebration(Milestone m, Map<String, dynamic> granted) {
    final coins = (granted['coins'] as num?)?.toInt() ?? 0;
    final xp = (granted['xp'] as num?)?.toInt() ?? 0;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        backgroundColor: Colors.transparent,
        child: Stack(
          children: [
            Container(
              margin: const EdgeInsets.all(8),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFFFF8E1), Color(0xFFFFF3E0)],
                ),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: AppTheme.coinGold.withValues(alpha: 0.5), width: 2),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.coinGold.withValues(alpha: 0.25),
                    blurRadius: 30,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [AppTheme.coinGold, Color(0xFFFF8F00)],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.coinGold.withValues(alpha: 0.5),
                          blurRadius: 16,
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Text('\u{1F3C6}', style: TextStyle(fontSize: 36)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'MILESTONE UNLOCKED',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 2,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    m.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.coinGold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'You saved \u{20B1}${_formatMoney(m.threshold)} in total!',
                    style: TextStyle(
                      fontSize: 13,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        if (coins > 0) _rewardRow('\u{1FA99}', '+$coins coins', AppTheme.coinGold),
                        if (xp > 0) _rewardRow('\u{2B50}', '+$xp XP', AppTheme.xpPurple),
                        if (m.rewardType == 'border')
                          _rewardRow('\u{1F3C6}', 'Free ${m.rewardItemName ?? 'border'} unlocked!', AppTheme.primaryGreen),
                        if (m.rewardType == 'certificate')
                          _rewardRow('\u{1F396}\u{FE0F}', 'Certificate earned in your name!', AppTheme.accentAmber),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  ElevatedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryGreen,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: const Text('Awesome!'),
                  ),
                ],
              ),
            ),
            Positioned.fill(
              child: IgnorePointer(
                child: ConfettiWidget(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _viewCertificate(Certificate cert) {
    final issued = cert.issuedAt != null ? _formatDate(cert.issuedAt!) : '';
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: Colors.transparent,
        child: Container(
          margin: const EdgeInsets.all(4),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFFFDF3), Color(0xFFFFF3D6)],
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppTheme.coinGold.withValues(alpha: 0.6), width: 2),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.15),
                blurRadius: 24,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Text('🏅', style: TextStyle(fontSize: 28)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      cert.certificateNumber,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        letterSpacing: 1.5,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                'Certificate of Achievement',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              const Text('This certifies that', style: TextStyle(fontSize: 14, fontStyle: FontStyle.italic)),
              const SizedBox(height: 8),
              Text(
                cert.childName,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  fontFamily: 'serif',
                  color: AppTheme.primaryGreen,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'has achieved the milestone:',
                style: TextStyle(
                  fontSize: 13,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                cert.title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.coinGold,
                ),
              ),
              if (cert.description.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  cert.description,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Text(
                'Total savings: \u{20B1}${_formatMoney(cert.thresholdAmount)}',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              if (issued.isNotEmpty)
                Text(
                  'Issued on $issued',
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  TextButton.icon(
                    onPressed: () => Navigator.pop(ctx),
                    icon: const Icon(Icons.close, size: 18),
                    label: const Text('Close'),
                    style: TextButton.styleFrom(
                      foregroundColor: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    onPressed: () => Navigator.pop(ctx),
                    icon: const Icon(Icons.share, size: 18),
                    label: const Text('Share'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryGreen,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso).toLocal();
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${months[d.month - 1]} ${d.day}, ${d.year}';
    } catch (_) {
      return iso;
    }
  }

  String _formatMoney(double value) {
    final v = value.round();
    final s = v.toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      buf.write(s[i]);
      final rem = s.length - 1 - i;
      if (rem > 0 && rem % 3 == 0) buf.write(',');
    }
    return buf.toString();
  }
}
