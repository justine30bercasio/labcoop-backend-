import 'package:flutter/material.dart';

class Spacing {
  const Spacing._();
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;
}

class RadiusTokens {
  const RadiusTokens._();
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
}

class AppTextStyle {
  const AppTextStyle._();

  static TextStyle heading1(BuildContext context) => TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: Theme.of(context).colorScheme.onSurface,
  );
  static TextStyle heading2(BuildContext context) => TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.bold,
    color: Theme.of(context).colorScheme.onSurface,
  );
  static TextStyle heading3(BuildContext context) => TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.bold,
    color: Theme.of(context).colorScheme.onSurface,
  );
  static TextStyle body(BuildContext context) => TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.normal,
    color: Theme.of(context).colorScheme.onSurface,
  );
  static TextStyle bodySmall(BuildContext context) => TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.normal,
    color: Theme.of(context).colorScheme.onSurfaceVariant,
  );
  static TextStyle label(BuildContext context) => TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: Theme.of(context).colorScheme.onSurface,
  );
  static TextStyle titleLarge(BuildContext context) => TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.bold,
    color: Theme.of(context).colorScheme.onSurface,
  );
}

class PageTransition {
  const PageTransition._();

  static Route<T> slideUp<T>(Widget page) {
    return PageRouteBuilder<T>(
      pageBuilder: (context, animation, secondaryAnimation) => page,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        const begin = Offset(0, 0.08);
        const end = Offset.zero;
        const curve = Curves.easeInOutCubic;
        var tween = Tween(begin: begin, end: end).chain(CurveTween(curve: curve));
        var fadeTween = Tween<double>(begin: 0, end: 1).chain(CurveTween(curve: curve));
        return SlideTransition(
          position: animation.drive(tween),
          child: FadeTransition(
            opacity: animation.drive(fadeTween),
            child: child,
          ),
        );
      },
      transitionDuration: const Duration(milliseconds: 350),
    );
  }
}

class AnimDurations {
  const AnimDurations._();
  static const Duration fast = Duration(milliseconds: 200);
  static const Duration normal = Duration(milliseconds: 350);
  static const Duration slow = Duration(milliseconds: 600);
}
