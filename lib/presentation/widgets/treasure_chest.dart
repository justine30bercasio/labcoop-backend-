import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'animated_counter.dart';

class TreasureChestWidget extends StatefulWidget {
  final int currentXp;
  final int xpRequired;
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback? onOpen;

  const TreasureChestWidget({
    super.key,
    required this.currentXp,
    required this.xpRequired,
    required this.label,
    required this.icon,
    required this.color,
    this.onOpen,
  });

  @override
  State<TreasureChestWidget> createState() => _TreasureChestWidgetState();
}

class _TreasureChestWidgetState extends State<TreasureChestWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _openController;
  late Animation<double> _openAnimation;
  bool _isOpen = false;

  @override
  void initState() {
    super.initState();
    _openController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _openAnimation = CurvedAnimation(
      parent: _openController,
      curve: Curves.elasticOut,
    );
  }

  @override
  void dispose() {
    _openController.dispose();
    super.dispose();
  }

  void _open() {
    if (_isOpen || !_isAvailable) return;
    setState(() => _isOpen = true);
    _openController.forward();
    widget.onOpen?.call();
  }

  bool get _isAvailable => widget.currentXp >= widget.xpRequired;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _isAvailable ? _open : null,
      child: AnimatedBuilder(
        animation: _openAnimation,
        builder: (context, child) {
          return Transform(
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.001)
              ..rotateX(_openAnimation.value * math.pi),
            alignment: Alignment.bottomCenter,
            child: Opacity(
              opacity: _isOpen ? (1 - _openAnimation.value * 0.3) : 1,
              child: _buildChest(),
            ),
          );
        },
      ),
    );
  }

  Widget _buildChest() {
    return Container(
      width: 90,
      height: 100,
      decoration: BoxDecoration(
        color: _isAvailable
            ? widget.color.withValues(alpha: 0.15)
            : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _isAvailable
              ? widget.color
              : Colors.grey.shade300,
          width: 2,
        ),
        boxShadow: _isAvailable
            ? [
                BoxShadow(
                  color: widget.color.withValues(alpha: 0.3),
                  blurRadius: 12,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            _isOpen ? Icons.card_giftcard : (_isAvailable ? Icons.inventory_2 : Icons.lock),
            size: 36,
            color: _isAvailable
                ? widget.color
                : Colors.grey.shade400,
          ),
          const SizedBox(height: 4),
          AnimatedCounter(
            value: widget.xpRequired.toDouble(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: _isAvailable ? widget.color : Colors.grey,
            ),
          ),
          Text(
            widget.label,
            style: TextStyle(
              fontSize: 9,
              color: _isAvailable ? widget.color : Colors.grey.shade500,
            ),
          ),
        ],
      ),
    );
  }
}
