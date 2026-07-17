import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

const _sectorColors = [
  Color(0xFFFF6B6B),
  Color(0xFFFFB347),
  Color(0xFF4ECDC4),
  Color(0xFF45B7D1),
  Color(0xFF96CEB4),
  Color(0xFFFFEAA7),
  Color(0xFFDDA0DD),
  Color(0xFF98D8C8),
];

const _sectorIcons = [
  Icons.monetization_on,
  Icons.star,
  Icons.monetization_on,
  Icons.star,
  Icons.monetization_on,
  Icons.auto_awesome,
  Icons.local_fire_department,
  Icons.celebration,
];

const _labels = [
  '5 Coins',
  '10 XP',
  '10 Coins',
  '15 XP',
  '20 Coins',
  '25 XP',
  'Streak+3',
  'Jackpot!',
];

class FortuneWheel extends StatefulWidget {
  final bool canSpin;
  final Future<Map<String, dynamic>> Function() onSpin;
  final VoidCallback? onRewardClaimed;

  const FortuneWheel({
    super.key,
    required this.canSpin,
    required this.onSpin,
    this.onRewardClaimed,
  });

  @override
  State<FortuneWheel> createState() => _FortuneWheelState();
}

class _FortuneWheelState extends State<FortuneWheel> with TickerProviderStateMixin {
  late AnimationController _spinController;
  late Animation<double> _spinAnimation;
  double _currentAngle = 0;
  bool _isSpinning = false;
  int _targetSector = 0;

  @override
  void initState() {
    super.initState();
    _spinController = AnimationController(
      duration: const Duration(milliseconds: 3000),
      vsync: this,
    );
    _spinAnimation = CurvedAnimation(
      parent: _spinController,
      curve: Curves.easeOutCubic,
    );
    _spinController.addListener(() {
      setState(() {});
    });
    _spinController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        setState(() => _isSpinning = false);
      }
    });
  }

  @override
  void dispose() {
    _spinController.dispose();
    super.dispose();
  }

  Future<void> _spin() async {
    if (_isSpinning || !widget.canSpin) return;

    setState(() => _isSpinning = true);

    final result = await widget.onSpin();
    _targetSector = (result['reward']['index'] as int?) ?? 0;

    final sectorAngle = (2 * math.pi) / 8;
    final targetAngle = sectorAngle * _targetSector + sectorAngle / 2;

    final spins = 5 + math.Random().nextInt(3);
    final totalAngle = spins * 2 * math.pi + (2 * math.pi - targetAngle + _currentAngle % (2 * math.pi));

    _currentAngle += totalAngle;
    _spinController.reset();
    _spinController.forward();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Pointer indicator
        SizedBox(
          width: 24,
          height: 24,
          child: CustomPaint(
            painter: const _TrianglePainter(),
          ),
        ),
        const SizedBox(height: 4),
        Stack(
          alignment: Alignment.center,
          children: [
            // Wheel shadow
            Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.amber.withValues(alpha: 0.3),
                    blurRadius: 20,
                    spreadRadius: 4,
                  ),
                ],
              ),
            ),
            // Wheel
            AnimatedBuilder(
              animation: _spinAnimation,
              builder: (context, child) {
                return Transform.rotate(
                  angle: _spinAnimation.value * _currentAngle,
                  child: CustomPaint(
                    size: const Size(220, 220),
                    painter: const _WheelPainter(),
                  ),
                );
              },
            ),
            // Center hub
            GestureDetector(
              onTap: _canSpin ? _spin : null,
              child: Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [AppTheme.coinGold, Color(0xFFFF8F00)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.amber.withValues(alpha: 0.5),
                      blurRadius: 8,
                    ),
                  ],
                ),
                child: Center(
                  child: Icon(
                    _isSpinning ? Icons.sync : Icons.play_arrow,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: 200,
          height: 48,
          child: ElevatedButton(
            onPressed: _canSpin ? _spin : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryGreen,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              elevation: 4,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  _canSpin ? Icons.touch_app : Icons.check_circle,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  _isSpinning
                      ? 'Spinning...'
                      : _canSpin
                          ? 'SPIN THE WHEEL!'
                          : 'Come back tomorrow!',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  bool get _canSpin => widget.canSpin && !_isSpinning;
}

class _WheelPainter extends CustomPainter {
  const _WheelPainter();
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final sectorAngle = (2 * math.pi) / 8;

    for (int i = 0; i < 8; i++) {
      final startAngle = i * sectorAngle - math.pi / 2;

      final paint = Paint()
        ..color = _sectorColors[i]
        ..style = PaintingStyle.fill;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sectorAngle,
        true,
        paint,
      );

      final borderPaint = Paint()
        ..color = Colors.white.withValues(alpha: 0.3)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sectorAngle,
        true,
        borderPaint,
      );

      final midAngle = startAngle + sectorAngle / 2;
      final iconRadius = radius * 0.6;
      final iconCenter = Offset(
        center.dx + iconRadius * math.cos(midAngle),
        center.dy + iconRadius * math.sin(midAngle),
      );

      final icon = _sectorIcons[i];
      final iconPainter = TextPainter(
        text: TextSpan(
          text: String.fromCharCode(icon.codePoint),
          style: TextStyle(
            fontSize: 22,
            fontFamily: icon.fontFamily,
            color: Colors.white,
          ),
        ),
        textDirection: TextDirection.ltr,
      );
      iconPainter.layout();
      iconPainter.paint(
        canvas,
        iconCenter - Offset(iconPainter.width / 2, iconPainter.height / 2),
      );

      final labelRadius = radius * 0.38;
      final labelCenter = Offset(
        center.dx + labelRadius * math.cos(midAngle),
        center.dy + labelRadius * math.sin(midAngle),
      );

      canvas.save();
      canvas.translate(labelCenter.dx, labelCenter.dy);
      canvas.rotate(midAngle + math.pi / 2);
      final labelPainter = TextPainter(
        text: TextSpan(
          text: _labels[i],
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        textDirection: TextDirection.ltr,
      );
      labelPainter.layout();
      labelPainter.paint(
        canvas,
        Offset(-labelPainter.width / 2, -labelPainter.height / 2),
      );
      canvas.restore();
    }

    final ringPaint = Paint()
      ..color = Colors.amber.shade700
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;
    canvas.drawCircle(center, radius, ringPaint);

    final innerRingPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawCircle(center, radius * 0.15, innerRingPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _TrianglePainter extends CustomPainter {
  const _TrianglePainter();
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.amber.shade800
      ..style = PaintingStyle.fill;

    final path = Path()
      ..moveTo(size.width / 2, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
