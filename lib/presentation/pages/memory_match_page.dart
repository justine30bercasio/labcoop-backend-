import 'dart:math';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';

class MemoryMatchPage extends StatefulWidget {
  const MemoryMatchPage({super.key});

  @override
  State<MemoryMatchPage> createState() => _MemoryMatchPageState();
}

class _MemoryMatchPageState extends State<MemoryMatchPage> {
  final _source = LocalDbSource();
  final _rng = Random();

  static const List<_CardItem> _allCards = [
    _CardItem('🪙', 'Coin'),
    _CardItem('🐷', 'Piggy'),
    _CardItem('💰', 'Money Bag'),
    _CardItem('🏦', 'Bank'),
    _CardItem('💎', 'Diamond'),
    _CardItem('⭐', 'Star'),
    _CardItem('🎯', 'Target'),
    _CardItem('🏆', 'Trophy'),
  ];

  late List<_CardState> _cards;
  int _flippedIndex = -1;
  int _matches = 0;
  int _attempts = 0;
  int _coinsEarned = 0;
  bool _isChecking = false;
  bool _gameStarted = false;
  bool _gameOver = false;
  int _gridCols = 4;

  @override
  void initState() {
    super.initState();
    _initGame();
  }

  void _initGame() {
    final pairs = _allCards.take(8).toList();
    final deck = [...pairs, ...pairs];
    deck.shuffle(_rng);

    _cards = deck
        .map((item) => _CardState(
              emoji: item.emoji,
              name: item.name,
              id: item.name,
            ))
        .toList();

    _flippedIndex = -1;
    _matches = 0;
    _attempts = 0;
    _coinsEarned = 0;
    _isChecking = false;
    _gameOver = false;
    _gameStarted = false;
  }

  void startGame() {
    _initGame();
    setState(() => _gameStarted = true);
  }

  void _flipCard(int index) {
    if (_isChecking) return;
    if (_cards[index].isMatched) return;
    if (_cards[index].isFlipped) return;

    setState(() {
      _cards[index].isFlipped = true;

      if (_flippedIndex == -1) {
        _flippedIndex = index;
      } else {
        _attempts++;
        _isChecking = true;
        _checkMatch(_flippedIndex, index);
      }
    });
  }

  void _checkMatch(int a, int b) {
    final match = _cards[a].id == _cards[b].id;

    Future.delayed(const Duration(milliseconds: 800), () {
      if (!mounted) return;
      setState(() {
        if (match) {
          _cards[a].isMatched = true;
          _cards[b].isMatched = true;
          _matches++;
          _coinsEarned += 2;
          if (_matches >= 8) {
            _gameOver = true;
            _awardCoins();
          }
        } else {
          _cards[a].isFlipped = false;
          _cards[b].isFlipped = false;
        }
        _flippedIndex = -1;
        _isChecking = false;
      });
    });
  }

  Future<void> _awardCoins() async {
    await _source.addCoins(_coinsEarned);
  }

  @override
  Widget build(BuildContext context) {
    if (!_gameStarted || _gameOver) return _buildMenu();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Memory Match'),
        backgroundColor: AppTheme.xpPurple,
        foregroundColor: Colors.white,
        actions: [
          _headerItem(Icons.monetization_on, '$_coinsEarned', AppTheme.coinGold),
          const SizedBox(width: 12),
          _headerItem(Icons.compare_arrows, '$_attempts', Colors.orange),
          const SizedBox(width: 16),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF3E5F5), Color(0xFFF1F8E9)],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('Matches: ', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  Text('$_matches/8', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.xpPurple)),
                ],
              ),
              const SizedBox(height: 12),
              Expanded(
                child: GridView.builder(
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: _gridCols,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 0.85,
                  ),
                  itemCount: _cards.length,
                  itemBuilder: (_, i) => _buildCard(i),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCard(int index) {
    final card = _cards[index];
    final isFlipped = card.isFlipped || card.isMatched;

    return GestureDetector(
      onTap: () => _flipCard(index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        decoration: BoxDecoration(
          color: isFlipped ? Colors.white : AppTheme.xpPurple,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: card.isMatched ? AppTheme.primaryGreen : AppTheme.xpPurple.withValues(alpha: 0.3),
            width: card.isMatched ? 2.5 : 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: (isFlipped ? Colors.black : AppTheme.xpPurple).withValues(alpha: 0.1),
              blurRadius: 6,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Center(
          child: isFlipped
              ? Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(card.emoji, style: const TextStyle(fontSize: 36)),
                    if (card.isMatched)
                      const Icon(Icons.check_circle, color: AppTheme.primaryGreen, size: 18),
                  ],
                )
              : const Icon(Icons.help_outline, color: Colors.white, size: 28),
        ),
      ),
    );
  }

  Widget _buildMenu() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Memory Match'),
        backgroundColor: AppTheme.xpPurple,
        foregroundColor: Colors.white,
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF3E5F5), Color(0xFFF1F8E9)],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('🧠', style: TextStyle(fontSize: 80)),
              const SizedBox(height: 16),
              Text(
                _gameOver ? 'You Win!' : 'Memory Match',
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: AppTheme.textDark),
              ),
              if (_gameOver) ...[
                const SizedBox(height: 8),
                const Text('All pairs matched!', style: TextStyle(fontSize: 18, color: Colors.grey)),
                const SizedBox(height: 4),
                Text('$_attempts attempts · $_coinsEarned 🪙 earned',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.xpPurple)),
                if (_coinsEarned > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppTheme.coinGold.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text('+$_coinsEarned coins added!',
                          style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.coinGold)),
                    ),
                  ),
              ] else ...[
                const SizedBox(height: 8),
                const Text('Match all the pairs!', style: TextStyle(fontSize: 16, color: Colors.grey)),
                const Text('🧮 16 cards · 8 pairs', style: TextStyle(fontSize: 14, color: Colors.grey)),
              ],
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: startGame,
                icon: Icon(_gameOver ? Icons.refresh : Icons.play_arrow),
                label: Text(_gameOver ? 'Play Again' : 'Start Game',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.xpPurple,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _headerItem(IconData icon, String text, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: color)),
      ],
    );
  }
}

class _CardItem {
  final String emoji;
  final String name;
  const _CardItem(this.emoji, this.name);
}

class _CardState {
  final String emoji;
  final String name;
  final String id;
  bool isFlipped;
  bool isMatched;

  _CardState({
    required this.emoji,
    required this.name,
    required this.id,
    this.isFlipped = false,
    this.isMatched = false,
  });
}
