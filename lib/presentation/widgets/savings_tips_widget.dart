import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class SavingsTipsWidget extends StatefulWidget {
  const SavingsTipsWidget({super.key});

  @override
  State<SavingsTipsWidget> createState() => _SavingsTipsWidgetState();
}

class _SavingsTipsWidgetState extends State<SavingsTipsWidget> {
  int _currentTip = 0;
  late Timer _timer;

  static const _tips = [
    _Tip('A little saved each day adds up big! 🪙', Icons.savings),
    _Tip('Save 10% of everything you get — future you will thank you!', Icons.trending_up),
    _Tip('Before you buy, ask: "Do I really need this?" 🤔', Icons.help_outline),
    _Tip('A goal without a plan is just a wish. Make a savings plan! 📋', Icons.list_alt),
    _Tip('Waiting 24 hours before buying helps you spend less! ⏳', Icons.timer),
    _Tip('Saving is like planting a money tree! 🌱💰', Icons.forest),
    _Tip('Every peso you save is a step toward your dream! ⭐', Icons.star),
    _Tip('Share your savings goal with family — they can help! 👨‍👩‍👧‍👦', Icons.family_restroom),
    _Tip('Turn saving into a game — challenge yourself! 🎮', Icons.sports_esports),
    _Tip('Save first, spend later. You got this! 💪', Icons.thumb_up),
  ];

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (mounted) {
        setState(() => _currentTip = (_currentTip + 1) % _tips.length);
      }
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tip = _tips[_currentTip];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.accentAmber.withValues(alpha: 0.3)),
          boxShadow: [
            BoxShadow(
              color: AppTheme.accentAmber.withValues(alpha: 0.1),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppTheme.accentAmber.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(tip.icon, color: AppTheme.accentAmber, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 500),
                child: Text(
                  tip.message,
                  key: ValueKey(_currentTip),
                  style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurface, height: 1.3),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tip {
  final String message;
  final IconData icon;
  const _Tip(this.message, this.icon);
}
