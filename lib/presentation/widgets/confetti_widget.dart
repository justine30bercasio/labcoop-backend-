import 'dart:math';
import 'package:flutter/material.dart';

class ConfettiWidget extends StatefulWidget {
  final int particleCount;
  final List<Color> colors;
  final List<String> emojis;
  final Duration duration;
  final bool explode;

  const ConfettiWidget({
    super.key,
    this.particleCount = 40,
    this.colors = const [
      Color(0xFFFF6B6B),
      Color(0xFFFFE66D),
      Color(0xFF4ECDC4),
      Color(0xFFA8E6CF),
      Color(0xFFFF8B94),
      Color(0xFFC084FC),
      Color(0xFF60A5FA),
      Color(0xFFF97316),
    ],
    this.emojis = const ['✨', '⭐', '🎉', '🎊', '💫', '🌟', '🎀', '🪄'],
    this.duration = const Duration(seconds: 3),
    this.explode = true,
  });

  @override
  State<ConfettiWidget> createState() => _ConfettiWidgetState();
}

class _ConfettiWidgetState extends State<ConfettiWidget>
    with TickerProviderStateMixin {
  late List<_Particle> _particles;
  late AnimationController _controller;
  final _random = Random();

  @override
  void initState() {
    super.initState();
    _particles = List.generate(widget.particleCount, (_) => _Particle(
      x: _random.nextDouble(),
      y: widget.explode ? 0.5 : -0.1 - _random.nextDouble() * 0.3,
      speedY: 0.01 + _random.nextDouble() * 0.03,
      speedX: (_random.nextDouble() - 0.5) * 0.015,
      rotation: _random.nextDouble() * 6.28,
      rotationSpeed: (_random.nextDouble() - 0.5) * 0.1,
      size: 6 + _random.nextDouble() * 12,
      color: widget.colors[_random.nextInt(widget.colors.length)],
      isEmoji: _random.nextDouble() < 0.3,
      emoji: widget.emojis[_random.nextInt(widget.emojis.length)],
      delay: _random.nextDouble(),
    ));

    _controller = AnimationController(vsync: this, duration: widget.duration);
    _controller.addListener(() => setState(() {}));
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = _controller.value;
    return ClipRect(
      child: CustomPaint(
        size: Size.infinite,
        painter: _ConfettiPainter(_particles, elapsed, _random),
      ),
    );
  }
}

class _Particle {
  double x, y, speedY, speedX, rotation, rotationSpeed, size, delay;
  Color color;
  bool isEmoji;
  String emoji;

  _Particle({
    required this.x, required this.y, required this.speedY, required this.speedX,
    required this.rotation, required this.rotationSpeed, required this.size,
    required this.color, required this.isEmoji, required this.emoji,
    this.delay = 0,
  });
}

class _ConfettiPainter extends CustomPainter {
  final List<_Particle> particles;
  final double elapsed;
  final Random random;

  _ConfettiPainter(this.particles, this.elapsed, this.random);

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in particles) {
      final t = (elapsed - p.delay).clamp(0, 1);
      if (t <= 0 || t >= 1) continue;

      final opacity = t < 0.1 ? t / 0.1 : (1 - t) / 0.9;
      final x = p.x + p.speedX * t * 100;
      final y = p.y + p.speedY * t * 100;
      final rot = p.rotation + p.rotationSpeed * t * 100;

      canvas.save();
      canvas.translate(x * size.width, y * size.height);
      canvas.rotate(rot);

      if (p.isEmoji) {
        final textSpan = TextSpan(text: p.emoji, style: TextStyle(fontSize: p.size, color: p.color.withValues(alpha: opacity)));
        final tp = TextPainter(text: textSpan, textDirection: TextDirection.ltr);
        tp.layout();
        tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
      } else {
        final paint = Paint()..color = p.color.withValues(alpha: opacity);
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(center: Offset.zero, width: p.size * 1.5, height: p.size * 0.6),
            const Radius.circular(2),
          ),
          paint,
        );
        canvas.drawCircle(Offset(p.size * 0.5, 0), p.size * 0.2, paint..color = p.color.withValues(alpha: opacity * 0.5));
      }

      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter old) => elapsed != old.elapsed;
}
