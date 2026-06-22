import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../domain/entities/goal_jar.dart';

class AnimatedJarWidget extends StatefulWidget {
  final GoalJar goal;

  const AnimatedJarWidget({super.key, required this.goal});

  @override
  State<AnimatedJarWidget> createState() => _AnimatedJarWidgetState();
}

class _AnimatedJarWidgetState extends State<AnimatedJarWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fillAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fillAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    );
    _controller.forward();
  }

  @override
  void didUpdateWidget(AnimatedJarWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.goal.currentAllocated != widget.goal.currentAllocated) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final progress = widget.goal.progressPercentage;
    final progressLabel = '${(progress * 100).toInt()}%';

    return AnimatedBuilder(
      animation: _fillAnimation,
      builder: (context, child) {
        final animatedProgress = progress * _fillAnimation.value;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 80,
              height: 120,
              child: CustomPaint(
                painter: _JarPainter(
                  fillLevel: animatedProgress,
                  isCompleted: widget.goal.isCompleted,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              progressLabel,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: widget.goal.isCompleted
                    ? AppTheme.primaryGreen
                    : AppTheme.textDark,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _JarPainter extends CustomPainter {
  final double fillLevel;
  final bool isCompleted;

  _JarPainter({required this.fillLevel, required this.isCompleted});

  @override
  void paint(Canvas canvas, Size size) {
    final jarPaint = Paint()
      ..color = Colors.grey.shade300
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;

    final fillPaint = Paint()
      ..color = isCompleted ? AppTheme.primaryGreen : AppTheme.waterBlue
      ..style = PaintingStyle.fill;

    final jarPath = Path()
      ..moveTo(size.width * 0.2, size.height * 0.15)
      ..lineTo(size.width * 0.15, size.height * 0.35)
      ..lineTo(size.width * 0.15, size.height * 0.9)
      ..quadraticBezierTo(
        size.width * 0.15,
        size.height,
        size.width * 0.3,
        size.height,
      )
      ..lineTo(size.width * 0.7, size.height)
      ..quadraticBezierTo(
        size.width * 0.85,
        size.height,
        size.width * 0.85,
        size.height * 0.9,
      )
      ..lineTo(size.width * 0.85, size.height * 0.35)
      ..lineTo(size.width * 0.8, size.height * 0.15)
      ..close();

    final fillHeight = (size.height * 0.65) * fillLevel;
    final fillRect = Rect.fromLTWH(
      0,
      size.height - fillHeight - size.height * 0.15,
      size.width,
      fillHeight + size.height * 0.15,
    );

    canvas.clipPath(jarPath);
    canvas.drawRect(fillRect, fillPaint);

    final neckPath = Path()
      ..moveTo(size.width * 0.3, size.height * 0.08)
      ..lineTo(size.width * 0.3, size.height * 0.15)
      ..lineTo(size.width * 0.7, size.height * 0.15)
      ..lineTo(size.width * 0.7, size.height * 0.08)
      ..close();
    canvas.drawPath(neckPath, jarPaint);
    canvas.drawPath(jarPath, jarPaint);

    if (isCompleted) {
      final starPaint = Paint()..color = AppTheme.coinGold;
      canvas.drawCircle(
        Offset(size.width / 2, size.height * 0.4),
        10,
        starPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_JarPainter oldDelegate) =>
      oldDelegate.fillLevel != fillLevel ||
      oldDelegate.isCompleted != isCompleted;
}
