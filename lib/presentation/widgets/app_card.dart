import 'package:flutter/material.dart';
import '../../core/theme/design_system.dart';

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double? elevation;
  final double borderRadius;
  final Color? backgroundColor;
  final Gradient? gradient;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Color? borderColor;
  final double borderWidth;

  const AppCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.elevation,
    this.borderRadius = RadiusTokens.lg,
    this.backgroundColor,
    this.gradient,
    this.onTap,
    this.onLongPress,
    this.borderColor,
    this.borderWidth = 1,
  });

  factory AppCard.primary({
    required Widget child,
    VoidCallback? onTap,
    EdgeInsetsGeometry? padding,
  }) {
    return AppCard(
      onTap: onTap,
      padding: padding,
      elevation: 4,
      child: child,
    );
  }

  factory AppCard.flat({
    required Widget child,
    VoidCallback? onTap,
    Color? color,
  }) {
    return AppCard(
      onTap: onTap,
      elevation: 0,
      backgroundColor: color,
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: margin ?? EdgeInsets.zero,
      elevation: elevation ?? 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(borderRadius),
        side: borderColor != null ? BorderSide(color: borderColor!, width: borderWidth) : BorderSide.none,
      ),
      color: backgroundColor,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(borderRadius),
        child: Container(
          decoration: gradient != null
              ? BoxDecoration(
                  gradient: gradient,
                  borderRadius: BorderRadius.circular(borderRadius),
                )
              : null,
          child: padding != null
              ? Padding(padding: padding!, child: child)
              : child,
        ),
      ),
    );
  }
}
