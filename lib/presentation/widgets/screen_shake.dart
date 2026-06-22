import 'dart:math';
import 'package:flutter/material.dart';

class ScreenShake extends StatefulWidget {
  final Widget child;
  final double intensity;
  final Duration duration;
  final bool autoStart;

  const ScreenShake({
    super.key,
    required this.child,
    this.intensity = 4,
    this.duration = const Duration(milliseconds: 300),
    this.autoStart = false,
  });

  @override
  State<ScreenShake> createState() => ScreenShakeState();
}

class ScreenShakeState extends State<ScreenShake>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  final _random = Random();

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.duration);
    if (widget.autoStart) _trigger();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void trigger() {
    if (!_controller.isAnimating) _trigger();
  }

  void _trigger() {
    _controller.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final progress = _controller.value;
        final eased = 1 - (1 - progress) * (1 - progress);
        final intensity = widget.intensity * (1 - eased);
        final dx = (_random.nextDouble() - 0.5) * 2 * intensity;
        final dy = (_random.nextDouble() - 0.5) * 2 * intensity;
        final rot = (_random.nextDouble() - 0.5) * 0.04 * intensity;
        return Transform(
          transform: Matrix4.identity()
            ..translate(dx, dy)
            ..rotateZ(rot),
          child: widget.child,
        );
      },
    );
  }
}
