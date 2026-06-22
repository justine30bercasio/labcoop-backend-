import 'package:flutter/material.dart';

class AnimatedCounter extends StatefulWidget {
  final double value;
  final int decimals;
  final TextStyle? style;
  final String prefix;
  final String suffix;
  final Duration duration;

  const AnimatedCounter({
    super.key,
    required this.value,
    this.decimals = 0,
    this.style,
    this.prefix = '',
    this.suffix = '',
    this.duration = const Duration(milliseconds: 800),
  });

  @override
  State<AnimatedCounter> createState() => _AnimatedCounterState();
}

class _AnimatedCounterState extends State<AnimatedCounter>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;
  double _displayValue = 0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.duration);
    _animation = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    _controller.addListener(() {
      setState(() {
        _displayValue = _animation.value * widget.value;
      });
    });
    _controller.forward();
  }

  @override
  void didUpdateWidget(AnimatedCounter oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _displayValue = 0;
      _controller.reset();
      _animation = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
      _controller.addListener(() {
        setState(() {
          _displayValue = _animation.value * widget.value;
        });
      });
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final formatted = widget.decimals > 0
        ? _displayValue.toStringAsFixed(widget.decimals)
        : _displayValue.round().toString();
    return Text(
      '${widget.prefix}$formatted${widget.suffix}',
      style: widget.style,
    );
  }
}
