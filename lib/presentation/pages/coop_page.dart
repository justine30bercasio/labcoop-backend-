import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/dio_client.dart';
import '../../core/theme/app_theme.dart';

class CoopPage extends StatefulWidget {
  const CoopPage({super.key});

  @override
  State<CoopPage> createState() => _CoopPageState();
}

class _CoopPageState extends State<CoopPage> {
  final _titleCtrl = TextEditingController();
  final _targetCtrl = TextEditingController();
  List<dynamic> _goals = [];
  bool _loading = true;
  bool _showCreate = false;

  late final Dio _dio;

  @override
  void initState() {
    super.initState();
    _dio = DioClient.create();
    _load();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _targetCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await _dio.get('/api/coop/goals');
      final data = res.data as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _goals = (data['goals'] as List<dynamic>).reversed.toList();
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createGoal() async {
    final title = _titleCtrl.text.trim();
    final target = double.tryParse(_targetCtrl.text.trim()) ?? 0;
    if (title.isEmpty || target <= 0) return;

    const storage = FlutterSecureStorage();
    final childName = await storage.read(key: 'child_name') ?? '';

    try {
      await _dio.post('/api/coop/goals', data: {
        'title': title,
        'targetAmount': target,
        'categoryIcon': '🎯',
        'createdBy': childName,
      });
      _titleCtrl.clear();
      _targetCtrl.clear();
      setState(() => _showCreate = false);
      await _load();
    } catch (e) {
    }
  }

  Future<void> _contribute(String goalId) async {
    const storage = FlutterSecureStorage();
    final accountId = await storage.read(key: 'account_id');
    if (accountId == null) return;

    final amountCtrl = TextEditingController();
    final result = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Contribute to Goal'),
        content: TextField(
          controller: amountCtrl,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: 'Amount (₱)',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            prefixText: '₱ ',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, double.tryParse(amountCtrl.text) ?? 0),
            child: const Text('Contribute'),
          ),
        ],
      ),
    );

    if (result == null || result <= 0) return;

    try {
      await _dio.post('/api/coop/goals/$goalId/contribute', data: {
        'accountId': accountId,
        'amount': result,
      });
      await _load();
    } catch (e) {
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('🤝 Co-op Goals'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      extendBodyBehindAppBar: true,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF1B5E20), Color(0xFF2E7D32), Color(0xFF388E3C)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: Colors.white))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: CustomScrollView(
                    slivers: [
                      SliverToBoxAdapter(child: _buildHeader()),
                      if (_showCreate) SliverToBoxAdapter(child: _buildCreateForm()),
                      if (_goals.isEmpty)
                        SliverFillRemaining(child: _buildEmpty())
                      else
                        SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (ctx, i) => _buildGoalCard(_goals[i]),
                            childCount: _goals.length,
                          ),
                        ),
                    ],
                  ),
                ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => setState(() => _showCreate = !_showCreate),
        backgroundColor: AppTheme.accentAmber,
        icon: Icon(_showCreate ? Icons.close : Icons.add),
        label: Text(_showCreate ? 'Cancel' : 'New Goal'),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          const Icon(Icons.groups, color: Colors.white, size: 48),
          const SizedBox(height: 8),
          const Text('Work Together!', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('${_goals.length} active goal(s)', style: const TextStyle(color: Colors.white70, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildCreateForm() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          TextField(
            controller: _titleCtrl,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Goal title',
              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
              prefixIcon: Icon(Icons.flag, color: Colors.white.withValues(alpha: 0.7)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.1),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _targetCtrl,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Target amount (₱)',
              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
              prefixIcon: Icon(Icons.monetization_on, color: Colors.white.withValues(alpha: 0.7)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.1),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _createGoal,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accentAmber,
                foregroundColor: AppTheme.textDark,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Create Goal', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGoalCard(dynamic goal) {
    final pct = goal['target_amount'] > 0 ? (goal['current_allocated'] / goal['target_amount']) : 0.0;
    final completed = goal['is_completed'] == 1;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: completed ? Colors.green.withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: completed ? AppTheme.coinGold : Colors.white.withValues(alpha: 0.1),
          width: completed ? 2 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(goal['category_icon'] ?? '🎯', style: const TextStyle(fontSize: 28)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(goal['title'], style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                      if (goal['created_by'] != null && goal['created_by'].isNotEmpty)
                        Text('by ${goal['created_by']}', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
                    ],
                  ),
                ),
                if (completed)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.coinGold,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.check_circle, color: Colors.white, size: 14),
                        SizedBox(width: 4),
                        Text('Done!', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Container(
                height: 20,
                color: Colors.white.withValues(alpha: 0.1),
                child: Stack(
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 500),
                      width: (MediaQuery.of(context).size.width - 80) * pct.clamp(0, 1),
                      height: 20,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: completed ? [AppTheme.coinGold, Colors.orange] : [AppTheme.primaryGreen, Colors.lightGreen],
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '₱${(goal['current_allocated'] as num).toStringAsFixed(0)} / ₱${(goal['target_amount'] as num).toStringAsFixed(0)}',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13),
                ),
                Text(
                  '${(pct * 100).toInt()}%',
                  style: TextStyle(
                    color: completed ? AppTheme.coinGold : Colors.white.withValues(alpha: 0.7),
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
            if (!completed) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => _contribute(goal['goal_id']),
                  icon: const Icon(Icons.add_circle, size: 18),
                  label: const Text('Contribute'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(color: Colors.white.withValues(alpha: 0.3)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.groups, color: Colors.white24, size: 80),
          const SizedBox(height: 16),
          const Text('No co-op goals yet', style: TextStyle(color: Colors.white38, fontSize: 18)),
          const SizedBox(height: 8),
          Text('Create a goal to save together!', style: TextStyle(color: Colors.white.withValues(alpha: 0.3))),
        ],
      ),
    );
  }
}
