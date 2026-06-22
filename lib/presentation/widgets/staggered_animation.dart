import 'package:flutter/material.dart';

class StaggeredAnimation extends StatefulWidget {
  final List<Widget> children;
  final Duration itemDelay;
  final Duration staggerDuration;
  final Offset slideOffset;
  final bool fade;

  const StaggeredAnimation({
    super.key,
    required this.children,
    this.itemDelay = const Duration(milliseconds: 80),
    this.staggerDuration = const Duration(milliseconds: 350),
    this.slideOffset = const Offset(0, 20),
    this.fade = true,
  });

  @override
  State<StaggeredAnimation> createState() => _StaggeredAnimationState();
}

class _StaggeredAnimationState extends State<StaggeredAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late List<Animation<double>> _alphas;
  late List<Animation<Offset>> _slides;

  @override
  void initState() {
    super.initState();
    final totalMs = widget.staggerDuration.inMilliseconds +
        widget.itemDelay.inMilliseconds * widget.children.length;
    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: totalMs),
    );
    _alphas = List.generate(widget.children.length, (i) {
      final start = (widget.itemDelay.inMilliseconds * i) / totalMs;
      final end = (widget.itemDelay.inMilliseconds * i +
              widget.staggerDuration.inMilliseconds) /
          totalMs;
      return Tween<double>(begin: 0, end: 1).animate(
        CurvedAnimation(
          parent: _controller,
          curve: Interval(
            start.clamp(0.0, 1.0),
            end.clamp(0.0, 1.0),
            curve: Curves.easeOut,
          ),
        ),
      );
    });
    _slides = List.generate(widget.children.length, (i) {
      final start = (widget.itemDelay.inMilliseconds * i) / totalMs;
      final end = (widget.itemDelay.inMilliseconds * i +
              widget.staggerDuration.inMilliseconds) /
          totalMs;
      return Tween<Offset>(
        begin: widget.slideOffset,
        end: Offset.zero,
      ).animate(
        CurvedAnimation(
          parent: _controller,
          curve: Interval(
            start.clamp(0.0, 1.0),
            end.clamp(0.0, 1.0),
            curve: Curves.easeOutCubic,
          ),
        ),
      );
    });
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(widget.children.length, (i) {
        return AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Opacity(
              opacity: widget.fade ? _alphas[i].value : 1,
              child: Transform.translate(
                offset: _slides[i].value,
                child: child,
              ),
            );
          },
          child: widget.children[i],
        );
      }),
    );
  }
}