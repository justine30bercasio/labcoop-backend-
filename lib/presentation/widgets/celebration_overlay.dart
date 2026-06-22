import 'dart:math';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import 'confetti_widget.dart';

class CelebrationOverlay extends StatefulWidget {
  final double amount;
  final int? xpGained;
  final String? message;
  final String? title;
  final Widget? child;
  final bool showCoinAnimation;

  const CelebrationOverlay({
    super.key,
    required this.amount,
    this.xpGained,
    this.message,
    this.title,
    this.child,
    this.showCoinAnimation = true,
  });

  @override
  State<CelebrationOverlay> createState() => _CelebrationOverlayState();
}

class _CelebrationOverlayState extends State<CelebrationOverlay>
    with TickerProviderStateMixin {
  late AnimationController _mainCtrl;
  late AnimationController _shakeCtrl;
  late AnimationController _coinBounceCtrl;
  late Animation<double> _scaleAnim;
  late Animation<double> _opacityAnim;
  late Animation<Offset> _coinSlideAnim;

  @override
  void initState() {
    super.initState();
    _mainCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));
    _shakeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
    _coinBounceCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));

    _scaleAnim = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _mainCtrl, curve: const Interval(0, 0.4, curve: Curves.elasticOut)),
    );
    _opacityAnim = Tween<double>(begin: 1, end: 0).animate(
      CurvedAnimation(parent: _mainCtrl, curve: const Interval(0.6, 1.0, curve: Curves.easeOut)),
    );
    _coinSlideAnim = Tween<Offset>(
      begin: const Offset(0, 2),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _coinBounceCtrl, curve: Curves.elasticOut));

    _mainCtrl.forward();
    _shakeCtrl.forward(from: 0);
    _coinBounceCtrl.repeat(reverse: true);

    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) _mainCtrl.reverse();
    });
  }

  @override
  void dispose() {
    _mainCtrl.dispose();
    _shakeCtrl.dispose();
    _coinBounceCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        if (widget.child != null) widget.child!,
        AnimatedBuilder(
          animation: _mainCtrl,
          builder: (context, child) {
            final shake = sin(_shakeCtrl.value * 20) * 2;
            return Transform.translate(
              offset: Offset(shake, shake * 0.5),
              child: Opacity(
                opacity: _opacityAnim.value,
                child: Transform.scale(
                  scale: _scaleAnim.value,
                  child: Container(
                    color: Colors.black.withValues(alpha: 0.35),
                    child: Stack(
                      children: [
                        const ConfettiWidget(particleCount: 50),
                        Center(
                          child: _buildCard(),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildCard() {
    return AnimatedBuilder(
      animation: _coinBounceCtrl,
      builder: (context, child) {
        return Transform.translate(
          offset: _coinSlideAnim.value * 20,
          child: Container(
            margin: const EdgeInsets.all(32),
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 28),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Colors.white, Color(0xFFFEF3C7)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.coinGold.withValues(alpha: 0.4),
                  blurRadius: 30,
                  spreadRadius: 5,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.title != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      widget.title!,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textDark),
                    ),
                  ),
                if (widget.showCoinAnimation) ...[
                  _buildCoinStack(),
                  const SizedBox(height: 12),
                ],
                Text(
                  '+₱${widget.amount.toStringAsFixed(0)} Added!',
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryGreen,
                  ),
                ),
                if (widget.xpGained != null) ...[
                  const SizedBox(height: 6),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.auto_awesome, color: AppTheme.xpPurple, size: 20),
                      const SizedBox(width: 6),
                      Text(
                        '+${widget.xpGained} XP',
                        style: const TextStyle(
                          fontSize: 20,
                          color: AppTheme.xpPurple,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
                if (widget.message != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    widget.message!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 15,
                      color: AppTheme.textDark.withValues(alpha: 0.7),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                const Text(
                  '✨ Great job! ✨',
                  style: TextStyle(fontSize: 14, color: AppTheme.coinGold, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildCoinStack() {
    return SizedBox(
      height: 60,
      child: Stack(
        children: [
          for (int i = 0; i < 5; i++)
            Positioned(
              left: 20.0 + i * 14,
              top: 10 + i * 3,
              child: Transform.rotate(
                angle: (i - 2) * 0.15,
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.coinGold, Color(0xFFFFB300)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFFD4A000), width: 2),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.coinGold.withValues(alpha: 0.3),
                        blurRadius: 6,
                        offset: const Offset(1, 2),
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Text('₱', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
