import '../entities/badge.dart';

class CheckBadgeUnlockUseCase {
  const CheckBadgeUnlockUseCase();

  List<Badge> getNewlyUnlockedBadges({
    required List<Badge> allBadges,
    required int currentXp,
  }) {
    final newlyUnlocked = <Badge>[];

    for (final badge in allBadges) {
      if (!badge.isUnlocked && currentXp >= badge.requiredXp) {
        newlyUnlocked.add(
          badge.copyWith(
            isUnlocked: true,
            unlockedAt: DateTime.now(),
          ),
        );
      }
    }

    return newlyUnlocked;
  }
}
