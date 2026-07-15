import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/dio_client.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';

class StreakWidget extends StatefulWidget {
  final String accountId;

  const StreakWidget({super.key, required this.accountId});

  @override
  State<StreakWidget> createState() => _StreakWidgetState();
}

class _StreakWidgetState extends State<StreakWidget> {
  final _source = LocalDbSource();
  final _api = RemoteApiSource(DioClient.create());
  final _secureStorage = const FlutterSecureStorage();
  int _streak = 0;
  bool _isLoading = true;
  bool _claimedToday = false;

  static const _milestones = {3: 10, 7: 25, 14: 50, 30: 100};

  String _nextMilestoneHint() {
    final sorted = _milestones.keys.toList()..sort();
    for (final m in sorted) {
      if (_streak < m) {
        final diff = m - _streak;
        return '$diff more days for +${_milestones[m]} 🪙 bonus!';
      }
    }
    if (_streak >= 30) return '🔥 On fire! Keep it up!';
    return '';
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await _source.getStreakData();
    final bonusDate = await _source.getDailyBonusDate();
    final today = DateTime.now();
    final isSameDay = bonusDate != null &&
        bonusDate.year == today.year &&
        bonusDate.month == today.month &&
        bonusDate.day == today.day;

    if (!mounted) return;
    setState(() {
      _streak = data.streak;
      _claimedToday = isSameDay;
      _isLoading = false;
    });
  }

  Future<void> _claimDaily() async {
    final today = DateTime.now();
    final newStreak = _streak + 1;
    await _source.saveDailyBonusDate(today);
    await _source.saveStreakData(streak: newStreak, lastDate: today);
    await _source.addCoins(5);
    // Sync daily reward to server (fire-and-forget)
    _syncCoinsToServer(5);

    int? bonus;
    if (_milestones.containsKey(newStreak)) {
      bonus = _milestones[newStreak]!;
      await _source.addCoins(bonus);
      _syncCoinsToServer(bonus);
    }

    if (!mounted) return;
    setState(() {
      _streak = newStreak;
      _claimedToday = true;
    });

    if (bonus != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.celebration, color: Colors.white, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  '🎉 $newStreak-day streak! +$bonus bonus 🪙!',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                ),
              ),
            ],
          ),
          backgroundColor: Colors.deepPurple,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          duration: const Duration(seconds: 4),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.local_fire_department, color: Colors.white),
              const SizedBox(width: 12),
              Text('Day $_streak streak! +5 🪙', style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
          backgroundColor: Colors.orange,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
  }

  Future<void> _syncCoinsToServer(int amount) async {
    try {
      final accountId = await _secureStorage.read(key: 'account_id');
      if (accountId == null) return;
      await _api.addCoins(accountId, amount, 'streak_reward');
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const SizedBox.shrink();

    final fireColor = _streak >= 7 ? Colors.deepOrange : Colors.orange;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: fireColor.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.local_fire_department, color: fireColor, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        '$_streak',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: fireColor,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'day streak',
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                  Text(
                    _nextMilestoneHint(),
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                  ),
                ],
              ),
            ),
            if (!_claimedToday)
              SizedBox(
                height: 36,
                child: ElevatedButton.icon(
                  onPressed: _claimDaily,
                  icon: const Icon(Icons.today, size: 16),
                  label: const Text('Check-in', style: TextStyle(fontSize: 12)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.accentAmber,
                    foregroundColor: Theme.of(context).colorScheme.onSurface,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                ),
              )
            else
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppTheme.primaryGreen.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.check, size: 16, color: AppTheme.primaryGreen),
                    SizedBox(width: 4),
                    Text('Done!', style: TextStyle(fontSize: 12, color: AppTheme.primaryGreen, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
