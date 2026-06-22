import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class GrowablePiggyWidget extends StatefulWidget {
  final double savingsRatio;
  final double size;
  final bool justSaved;

  const GrowablePiggyWidget({
    super.key,
    required this.savingsRatio,
    this.size = 100,
    this.justSaved = false,
  });

  @override
  State<GrowablePiggyWidget> createState() => _GrowablePiggyWidgetState();
}

class _GrowablePiggyWidgetState extends State<GrowablePiggyWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _bounceAnimation;
  bool _wasJustSaved = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _scaleAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.elasticOut,
    );
    _bounceAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
    );
    _controller.forward();
  }

  @override
  void didUpdateWidget(GrowablePiggyWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.savingsRatio != widget.savingsRatio) {
      _controller.forward(from: 0);
    }
    if (widget.justSaved && !_wasJustSaved) {
      _wasJustSaved = true;
      _controller.forward(from: 0);
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) setState(() => _wasJustSaved = false);
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String get _expression {
    if (_wasJustSaved || widget.justSaved) return '🎉';
    if (widget.savingsRatio >= 0.8) return '😆';
    if (widget.savingsRatio >= 0.5) return '😊';
    if (widget.savingsRatio > 0) return '🐷';
    return '💤';
  }

  String get _caption {
    if (_wasJustSaved || widget.justSaved) return 'Saved! 🎉';
    if (widget.savingsRatio >= 0.8) return 'Almost full!';
    if (widget.savingsRatio >= 0.5) return 'Half way!';
    if (widget.savingsRatio > 0) return 'Feed me!';
    return 'Empty...';
  }

  Color get _piggyColor {
    if (_wasJustSaved || widget.justSaved) return AppTheme.coinGold;
    if (widget.savingsRatio >= 0.8) return Colors.orange;
    if (widget.savingsRatio >= 0.5) return AppTheme.primaryGreen;
    if (widget.savingsRatio > 0) return AppTheme.waterBlue;
    return Colors.grey;
  }

  @override
  Widget build(BuildContext context) {
    final scale = 0.8 + (widget.savingsRatio * 0.4);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final animatedScale = 1 + ((scale - 1) * _scaleAnimation.value);
        final bounce = 1 + (0.15 * _bounceAnimation.value * (1 - _bounceAnimation.value));

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: widget.size,
              height: widget.size,
              decoration: BoxDecoration(
                color: _piggyColor.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Transform.scale(
                scale: animatedScale * bounce,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Text('🐷', style: TextStyle(fontSize: widget.size * 0.5)),
                    Positioned(
                      top: widget.size * 0.08,
                      right: widget.size * 0.08,
                      child: Text(
                        _expression,
                        style: TextStyle(fontSize: widget.size * 0.22),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              _caption,
              style: TextStyle(
                fontSize: 11,
                color: _piggyColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        );
      },
    );
  }
}
