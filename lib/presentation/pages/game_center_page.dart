import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../data/datasources/game_api_service.dart';
import '../widgets/staggered_animation.dart';
import 'coin_catcher_page.dart';
import 'memory_match_page.dart';
import 'quiz_page.dart';
import 'game_web_view_page.dart';

class GameCenterPage extends StatefulWidget {
  const GameCenterPage({super.key});

  @override
  State<GameCenterPage> createState() => _GameCenterPageState();
}

class _GameCenterPageState extends State<GameCenterPage> {
  String _selectedCategory = 'All';

  static const _categories = [
    'All', 'Arcade', 'Puzzle', 'Strategy',
    'Sports', 'Simulation', 'Educational',
  ];

  static const _categoryColors = <String, Color>{
    'All': AppTheme.primaryGreen,
    'Arcade': Color(0xFFE53935),
    'Puzzle': Color(0xFF7B1FA2),
    'Strategy': Color(0xFF5D4037),
    'Sports': Color(0xFFFDD835),
    'Simulation': Color(0xFF039BE5),
    'Educational': Color(0xFFFF9800),
  };

  List<GameInfo> get _filteredGames {
    if (_selectedCategory == 'All') return GameApiService.localGames;
    return GameApiService.localGames
        .where((g) => g.category == _selectedCategory)
        .toList();
  }

  Color _colorForCategory(String cat) {
    return _categoryColors[cat] ?? AppTheme.primaryGreen;
  }

  void _openGame(GameInfo game) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => GameWebViewPage(
          url: game.embedUrl,
          gameTitle: game.title,
          gameEmoji: game.emoji,
          coinReward: 3,
          xpReward: 2,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final games = _filteredGames;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
            _sectionHeader('🎮 Play Offline', 'Native games — no internet needed'),
            const SizedBox(height: Spacing.sm),
            _GameCard(
              title: 'Coin Catcher',
              desc: 'Catch falling coins with your piggy basket! Avoid rocks!',
              color: AppTheme.coinGold,
              emojiWidget: Image.asset('assets/images/coincatcher.png', width: 64, height: 64,
                errorBuilder: (_, __, ___) => const Icon(Icons.pets, color: AppTheme.coinGold, size: 36)),
              onTap: () => Navigator.push(context, PageTransition.slideUp(const CoinCatcherPage())),
            ),
            const SizedBox(height: Spacing.sm),
            _GameCard(
              emoji: '🧠',
              title: 'Memory Match',
              desc: 'Match pairs of financial-themed cards!',
              color: AppTheme.xpPurple,
              onTap: () => Navigator.push(context, PageTransition.slideUp(const MemoryMatchPage())),
            ),
            const SizedBox(height: Spacing.sm),
            _GameCard(
              emoji: '💡',
              title: 'Savings Quiz',
              desc: 'Test your financial literacy knowledge!',
              color: Colors.blue,
              onTap: () => Navigator.push(context, PageTransition.slideUp(const QuizPage())),
            ),
            const SizedBox(height: Spacing.lg),
            _sectionHeader('🌐 Online Games', 'Tap any game to play instantly'),
            const SizedBox(height: Spacing.sm + 4),
            SizedBox(
              height: 36,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _categories.length,
                itemBuilder: (ctx, i) {
                  final cat = _categories[i];
                  final selected = _selectedCategory == cat;
                  final color = _colorForCategory(cat);
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(cat, style: TextStyle(
                        fontSize: 13,
                        fontWeight: selected ? FontWeight.bold : FontWeight.normal,
                        color: selected ? color : Theme.of(ctx).colorScheme.onSurfaceVariant,
                      )),
                      selected: selected,
                      onSelected: (_) => setState(() => _selectedCategory = cat),
                      selectedColor: color.withValues(alpha: 0.15),
                      checkmarkColor: color,
                      side: BorderSide(
                        color: selected ? color : Colors.grey.shade300,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(RadiusTokens.xl),
                      ),
                      showCheckmark: false,
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: Spacing.sm + 4),
            if (games.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 32),
                child: Center(
                  child: Text('No games in this category',
                      style: AppTextStyle.body(context).copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ),
              )
            else
              StaggeredAnimation(
                itemDelay: const Duration(milliseconds: 60),
                children: List.generate((games.length / 3).ceil(), (rowIndex) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        for (int col = 0; col < 3; col++) ...[
                          if (rowIndex * 3 + col < games.length)
                            _buildGameCard(games[rowIndex * 3 + col])
                          else
                            const Expanded(child: SizedBox()),
                          if (col < 2) const SizedBox(width: 8),
                        ],
                      ],
                    ),
                  );
                }),
            ),
        ],
      );
  }

  Widget _buildGameCard(GameInfo game) {
    final color = _colorForCategory(game.category);
    return Expanded(
      child: _AnimatedGameCard(
        game: game,
        color: color,
        onTap: () => _openGame(game),
      ),
    );
  }

  Widget _sectionHeader(String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppTextStyle.heading2(context)),
        const SizedBox(height: 2),
        Text(subtitle, style: AppTextStyle.bodySmall(context).copyWith(fontSize: 13)),
      ],
    );
  }
}

class _AnimatedGameCard extends StatefulWidget {
  final GameInfo game;
  final Color color;
  final VoidCallback onTap;

  const _AnimatedGameCard({
    required this.game,
    required this.color,
    required this.onTap,
  });

  @override
  State<_AnimatedGameCard> createState() => _AnimatedGameCardState();
}

class _AnimatedGameCardState extends State<_AnimatedGameCard> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: AnimDurations.fast);
    _scale = Tween<double>(begin: 1, end: 1.05).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _scale,
      builder: (context, child) {
        return Transform.scale(
          scale: _scale.value,
          child: child,
        );
      },
      child: Card(
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(RadiusTokens.md + 2)),
        elevation: 1,
        child: InkWell(
          borderRadius: BorderRadius.circular(RadiusTokens.md + 2),
          onTap: widget.onTap,
          onTapDown: (_) => _ctrl.forward(),
          onTapUp: (_) => _ctrl.reverse(),
          onTapCancel: () => _ctrl.reverse(),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(widget.game.emoji, style: const TextStyle(fontSize: 26)),
                const SizedBox(height: Spacing.xs),
                Text(
                  widget.game.title,
                  style: AppTextStyle.label(context).copyWith(fontSize: 11),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: widget.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(RadiusTokens.sm),
                  ),
                  child: Text(
                    widget.game.category,
                    style: TextStyle(fontSize: 9, color: widget.color, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GameCard extends StatefulWidget {
  final String? emoji;
  final String title;
  final String desc;
  final Color color;
  final VoidCallback onTap;
  final Widget? emojiWidget;

  const _GameCard({
    this.emoji,
    required this.title,
    required this.desc,
    required this.color,
    required this.onTap,
    this.emojiWidget,
  });

  @override
  State<_GameCard> createState() => _GameCardState();
}

class _GameCardState extends State<_GameCard> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: AnimDurations.fast);
    _scale = Tween<double>(begin: 1, end: 1.02).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _scale,
      builder: (context, child) {
        return Transform.scale(
          scale: _scale.value,
          child: child,
        );
      },
      child: Card(
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(RadiusTokens.xl)),
        elevation: 2,
        child: InkWell(
          borderRadius: BorderRadius.circular(RadiusTokens.xl),
          onTap: widget.onTap,
          onTapDown: (_) => _ctrl.forward(),
          onTapUp: (_) => _ctrl.reverse(),
          onTapCancel: () => _ctrl.reverse(),
          child: Padding(
            padding: const EdgeInsets.all(Spacing.md),
            child: Row(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: widget.color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(RadiusTokens.lg),
                  ),
                  child: Center(
                    child: widget.emojiWidget ?? Text(widget.emoji ?? '', style: const TextStyle(fontSize: 30)),
                  ),
                ),
                const SizedBox(width: Spacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.title,
                          style: AppTextStyle.titleLarge(context)),
                      const SizedBox(height: Spacing.xs),
                      Text(widget.desc, style: AppTextStyle.bodySmall(context)),
                    ],
                  ),
                ),
                const SizedBox(width: Spacing.sm),
                Icon(Icons.play_circle_fill, color: widget.color, size: 36),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

