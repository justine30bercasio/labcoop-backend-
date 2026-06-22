import 'dart:math';
import 'package:flutter/material.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../domain/entities/goal_jar.dart';

class WishlistItemCard extends StatefulWidget {
  final GoalJar goal;
  final VoidCallback? onTap;
  final VoidCallback? onAllocate;

  const WishlistItemCard({
    super.key,
    required this.goal,
    this.onTap,
    this.onAllocate,
  });

  @override
  State<WishlistItemCard> createState() => _WishlistItemCardState();
}

class _WishlistItemCardState extends State<WishlistItemCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
    _pulseAnimation = CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeInOut,
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final goal = widget.goal;
    final progress = goal.progressPercentage;
    final isComplete = goal.isCompleted;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: isComplete ? 4 : 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: isComplete
            ? const BorderSide(color: AppTheme.coinGold, width: 2)
            : BorderSide.none,
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: widget.onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: isComplete
                ? const LinearGradient(
                    colors: [
                      Color(0xFFFFF8E1),
                      Color(0xFFFFF3CD),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  )
                : null,
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                _buildIconSection(goal, progress, isComplete),
                const SizedBox(width: 16),
                Expanded(child: _buildDetails(goal, progress, isComplete)),
                if (!isComplete) _buildAllocateButton() ?? const SizedBox.shrink(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildIconSection(GoalJar goal, double progress, bool isComplete) {
    return SizedBox(
      width: 72,
      height: 92,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 72,
            height: 72,
            child: CustomPaint(
              painter: _ArcProgressPainter(
                progress: progress,
                isComplete: isComplete,
              ),
            ),
          ),
          AnimatedBuilder(
            animation: _pulseAnimation,
            builder: (context, child) {
              final scale = isComplete
                  ? 1.0 + (_pulseAnimation.value * 0.08)
                  : 1.0;
              return Transform.scale(
                scale: scale,
                child: SizedBox(
                  width: 72,
                  height: 72,
                  child: Center(
                    child: Text(
                      AppConstants.displayIcon(goal.categoryIcon),
                      style: TextStyle(fontSize: 28 + (progress * 8)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              );
            },
          ),
          if (isComplete)
            const Positioned(
              right: 4,
              top: 4,
              child: Icon(Icons.check_circle, color: AppTheme.primaryGreen, size: 20),
            ),
        ],
      ),
    );
  }

  Widget _buildDetails(GoalJar goal, double progress, bool isComplete) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          goal.title,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: isComplete ? AppTheme.textDark : Colors.black87,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Text(
              '₱${goal.currentAllocated.toStringAsFixed(0)}',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: isComplete ? AppTheme.primaryGreen : AppTheme.waterBlue,
              ),
            ),
            Text(
              ' / ₱${goal.targetAmount.toStringAsFixed(0)}',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 8,
                  backgroundColor: Colors.grey.shade200,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    isComplete ? AppTheme.primaryGreen : AppTheme.waterBlue,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${(progress * 100).toInt()}%',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
        if (!isComplete && progress > 0) ...[
          const SizedBox(height: 6),
          Text(
            '${(goal.remainingAmount / max(goal.currentAllocated, 1) * 7).ceil()} days ago',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade400),
          ),
        ],
      ],
    );
  }

  Widget? _buildAllocateButton() {
    if (widget.onAllocate == null) return null;
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: GestureDetector(
        onTap: widget.onAllocate,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          decoration: BoxDecoration(
            color: AppTheme.primaryGreen.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.add_circle, color: AppTheme.primaryGreen, size: 28),
              SizedBox(height: 2),
              Text(
                'Add',
                style: TextStyle(fontSize: 10, color: AppTheme.primaryGreen, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ArcProgressPainter extends CustomPainter {
  final double progress;
  final bool isComplete;

  _ArcProgressPainter({required this.progress, required this.isComplete});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;
    const startAngle = -pi / 2;
    final sweepAngle = 2 * pi * progress;

    final bgPaint = Paint()
      ..color = Colors.grey.shade200
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, bgPaint);

    final fillPaint = Paint()
      ..color = isComplete ? AppTheme.primaryGreen : AppTheme.waterBlue
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      fillPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _ArcProgressPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.isComplete != isComplete;
}
