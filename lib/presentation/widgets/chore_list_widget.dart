import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';

class ChoreListWidget extends StatefulWidget {
  const ChoreListWidget({super.key});

  @override
  State<ChoreListWidget> createState() => _ChoreListWidgetState();
}

class _ChoreListWidgetState extends State<ChoreListWidget> {
  final _source = LocalDbSource();
  List<Map<String, dynamic>> _chores = [];
  bool _loading = true;

  static const _defaultChores = [
    {'title': 'Make your bed', 'rewardCoins': 3, 'emoji': '🛏️'},
    {'title': 'Brush teeth (morning + night)', 'rewardCoins': 2, 'emoji': '🪥'},
    {'title': 'Tidy up your room', 'rewardCoins': 5, 'emoji': '🧹'},
    {'title': 'Read for 15 minutes', 'rewardCoins': 4, 'emoji': '📖'},
    {'title': 'Help set the table', 'rewardCoins': 3, 'emoji': '🍽️'},
    {'title': 'Water the plants', 'rewardCoins': 2, 'emoji': '🌱'},
    {'title': 'Finish homework on time', 'rewardCoins': 5, 'emoji': '📝'},
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    var chores = await _source.getChores();
    if (chores.isEmpty) {
      chores = _defaultChores.map((c) => Map<String, dynamic>.from(c)).toList();
      await _source.saveChores(chores);
    }
    if (!mounted) return;
    setState(() {
      _chores = chores;
      _loading = false;
    });
  }

  Future<void> _completeChore(int index) async {
    final chore = _chores[index];
    final reward = chore['rewardCoins'] as int;
    await _source.addCoins(reward);
    setState(() {
      _chores.removeAt(index);
    });
    await _source.saveChores(_chores);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.celebration, color: Colors.white),
            const SizedBox(width: 12),
            Text('+$reward 🪙 Chore done!', style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        backgroundColor: AppTheme.primaryGreen,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();

    if (_chores.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: Row(
            children: [
              const Icon(Icons.check_circle_outline, color: Colors.green, size: 20),
              const SizedBox(width: 12),
              Text('All chores done! 🎉', style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              const Icon(Icons.cleaning_services, color: AppTheme.waterBlue, size: 18),
              const SizedBox(width: 6),
              const Text('Chores', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const Spacer(),
              Text('${_chores.length} pending', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        for (int i = 0; i < _chores.length; i++) ...[
          if (i > 0) const SizedBox(height: 6),
          _ChoreTile(
            chore: _chores[i],
            onComplete: () => _completeChore(i),
          ),
        ],
      ],
    );
  }
}

class _ChoreTile extends StatelessWidget {
  final Map<String, dynamic> chore;
  final VoidCallback onComplete;

  const _ChoreTile({required this.chore, required this.onComplete});

  @override
  Widget build(BuildContext context) {
    final title = chore['title'] as String;
    final reward = chore['rewardCoins'] as int;
    final emoji = chore['emoji'] as String? ?? '✅';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.accentAmber.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('+$reward 🪙', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.textDark)),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: onComplete,
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: const BoxDecoration(
                    color: AppTheme.primaryGreen,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check, color: Colors.white, size: 18),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
