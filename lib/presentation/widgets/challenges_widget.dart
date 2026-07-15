import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/dio_client.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';

class ChallengesWidget extends StatefulWidget {
  final double totalSaved;

  const ChallengesWidget({super.key, required this.totalSaved});

  @override
  State<ChallengesWidget> createState() => _ChallengesWidgetState();
}

class _ChallengesWidgetState extends State<ChallengesWidget> {
  final _source = LocalDbSource();
  final _api = RemoteApiSource(DioClient.create());
  final _secureStorage = const FlutterSecureStorage();
  List<Map<String, dynamic>> _challenges = [];
  bool _loading = true;

  static const _defaultChallenges = [
    {'title': 'Save ₱500 Total', 'target': 500, 'rewardCoins': 50, 'emoji': '🎯', 'claimed': false},
    {'title': 'Save ₱1,000 Total', 'target': 1000, 'rewardCoins': 100, 'emoji': '🏆', 'claimed': false},
    {'title': 'Save ₱2,500 Total', 'target': 2500, 'rewardCoins': 250, 'emoji': '👑', 'claimed': false},
    {'title': 'Save ₱5,000 Total', 'target': 5000, 'rewardCoins': 500, 'emoji': '💎', 'claimed': false},
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    var challenges = await _source.getChallenges();
    if (challenges.isEmpty) {
      challenges = _defaultChallenges.map((c) => Map<String, dynamic>.from(c)).toList();
      await _source.saveChallenges(challenges);
    }
    if (!mounted) return;
    setState(() {
      _challenges = challenges;
      _loading = false;
    });
  }

  Future<void> _claimReward(int index) async {
    final challenge = _challenges[index];
    final reward = challenge['rewardCoins'] as int;
    await _source.addCoins(reward);
    // Sync to server (fire-and-forget)
    _syncCoinsToServer(reward);
    setState(() {
      _challenges[index]['claimed'] = true;
    });
    await _source.saveChallenges(_challenges);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.celebration, color: Colors.white),
            const SizedBox(width: 12),
            Text('+$reward 🪙 Challenge complete!', style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        backgroundColor: AppTheme.primaryGreen,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Future<void> _syncCoinsToServer(int amount) async {
    try {
      final accountId = await _secureStorage.read(key: 'account_id');
      if (accountId == null) return;
      await _api.addCoins(accountId, amount, 'challenge_reward');
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();

    if (_challenges.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: Center(
            child: Text('No active challenges. Add one in settings!', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (int i = 0; i < _challenges.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          _ChallengeCard(
            challenge: _challenges[i],
            totalSaved: widget.totalSaved,
            onClaim: _challenges[i]['claimed'] == true ? null : () => _claimReward(i),
          ),
        ],
      ],
    );
  }
}

class _ChallengeCard extends StatelessWidget {
  final Map<String, dynamic> challenge;
  final double totalSaved;
  final VoidCallback? onClaim;

  const _ChallengeCard({
    required this.challenge,
    required this.totalSaved,
    this.onClaim,
  });

  @override
  Widget build(BuildContext context) {
    final title = challenge['title'] as String;
    final target = (challenge['target'] as num).toDouble();
    final reward = challenge['rewardCoins'] as int;
    final emoji = challenge['emoji'] as String? ?? '🏆';
    final claimed = challenge['claimed'] == true;

    final progress = (totalSaved / target).clamp(0.0, 1.0);
    final completed = progress >= 1.0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: completed
                ? AppTheme.primaryGreen.withValues(alpha: 0.3)
                : Colors.grey.shade200,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(emoji, style: const TextStyle(fontSize: 24)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                ),
                if (claimed)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.green.shade100,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('✅ Done', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.green)),
                  )
                else if (completed && onClaim != null)
                  ElevatedButton.icon(
                    onPressed: onClaim,
                    icon: const Icon(Icons.coffee, size: 16),
                    label: Text('+$reward 🪙', style: const TextStyle(fontSize: 12)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentAmber,
                      foregroundColor: Theme.of(context).colorScheme.onSurface,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: progress,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                  completed ? AppTheme.primaryGreen : AppTheme.waterBlue,
                ),
                minHeight: 8,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '₱${totalSaved.toStringAsFixed(0)} / ₱${target.toStringAsFixed(0)}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
                Text(
                  '${(progress * 100).toStringAsFixed(0)}%',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey.shade600),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
