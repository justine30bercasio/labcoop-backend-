import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_state.dart';

class PetPage extends StatefulWidget {
  const PetPage({super.key});

  @override
  State<PetPage> createState() => _PetPageState();
}

class _PetPageState extends State<PetPage> with TickerProviderStateMixin {
  final _source = LocalDbSource();
  late AnimationController _bounceCtrl;
  late AnimationController _glowCtrl;
  late AnimationController _sparkleCtrl;
  bool _loading = true;

  int _petLevel = 1;
  int _evolutionStage = 0;
  String _petName = 'Piggy';
  int _happiness = 100;
  int _coinsFed = 0;
  String _accessory = '';
  int _currentXp = 0;

  @override
  void initState() {
    super.initState();
    _bounceCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat(reverse: true);
    _glowCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);
    _sparkleCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();
    _loadPet();
  }

  @override
  void dispose() {
    _bounceCtrl.dispose();
    _glowCtrl.dispose();
    _sparkleCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPet() async {
    final state = context.read<SavingsBloc>().state;
    if (state is SavingsLoaded) {
      _currentXp = state.account.currentXp;
    }
    final data = await _source.getPetData();
    final level = data['level'] as int? ?? 1;
    final stage = _calcEvolutionStage(_currentXp);
    if (!mounted) return;
    setState(() {
      _petLevel = level;
      _evolutionStage = stage;
      _petName = data['name'] as String? ?? 'Piggy';
      _happiness = data['happiness'] as int? ?? 100;
      _coinsFed = data['coinsFed'] as int? ?? 0;
      _accessory = data['accessory'] as String? ?? '';
      _loading = false;
    });
  }

  int _calcEvolutionStage(int xp) {
    final thresholds = AppConstants.petEvolutionXpThresholds;
    for (int i = thresholds.length - 1; i >= 0; i--) {
      if (xp >= thresholds[i]) return i;
    }
    return 0;
  }

  Future<void> _feedPet() async {
    final state = context.read<SavingsBloc>().state;
    if (state is! SavingsLoaded) return;
    final coins = await _source.getCoins();
    if (coins < 3) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Need 3 coins to feed Piggy!')),
        );
      }
      return;
    }
    await _source.spendCoins(3);
    final newHappiness = min(100, _happiness + 15);
    final newCoinsFed = _coinsFed + 1;
    final xpGain = 2;

    await _source.savePetData({
      'level': _petLevel,
      'evolutionStage': _evolutionStage,
      'name': _petName,
      'happiness': newHappiness,
      'coinsFed': newCoinsFed,
      'accessory': _accessory,
    });

    setState(() {
      _happiness = newHappiness;
      _coinsFed = newCoinsFed;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(children: [
            const Text('🍎 '),
            Text('Piggy is happy! +$xpGain XP'),
          ]),
          backgroundColor: AppTheme.primaryGreen,
        ),
      );
    }
  }

  Future<void> _renamePet() async {
    final ctrl = TextEditingController(text: _petName);
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Name Your Pet'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            labelText: 'Pet Name',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.edit),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    if (name != null && name.isNotEmpty) {
      await _source.savePetData({
        'level': _petLevel,
        'evolutionStage': _evolutionStage,
        'name': name,
        'happiness': _happiness,
        'coinsFed': _coinsFed,
        'accessory': _accessory,
      });
      setState(() => _petName = name);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final state = context.watch<SavingsBloc>().state;
    if (state is SavingsLoaded) {
      _currentXp = state.account.currentXp;
      final newStage = _calcEvolutionStage(_currentXp);
      if (newStage != _evolutionStage) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            setState(() => _evolutionStage = newStage);
            _savePetData();
            _showEvolutionDialog(newStage);
          }
        });
      }
    }

    final emoji = AppConstants.petEvolutionEmojis[_evolutionStage];
    final evoName = AppConstants.petEvolutionNames[_evolutionStage];
    final nextStage = min(_evolutionStage + 1, AppConstants.petEvolutionXpThresholds.length - 1);
    final nextThreshold = AppConstants.petEvolutionXpThresholds[nextStage];
    final currentThreshold = AppConstants.petEvolutionXpThresholds[_evolutionStage];
    final evoProgress = _currentXp > 0 && nextThreshold > currentThreshold
        ? (_currentXp - currentThreshold) / (nextThreshold - currentThreshold)
        : 1.0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Pet Piggy'),
        backgroundColor: AppTheme.primaryGreen,
        foregroundColor: Colors.white,
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFE8F5E9), Color(0xFFF1F8E9)],
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              _buildPetDisplay(emoji, evoName),
              const SizedBox(height: 20),
              _buildInfoCard(),
              const SizedBox(height: 16),
              _buildEvolutionBar(evoProgress, emoji, evoName),
              const SizedBox(height: 16),
              _buildActionButtons(),
              if (_accessory.isNotEmpty) ...[
                const SizedBox(height: 16),
                _buildAccessoryDisplay(),
              ],
              const SizedBox(height: 16),
              _buildHappinessBar(),
            ],
          ),
        ),
      ),
    );
  }

  void _savePetData() {
    _source.savePetData({
      'level': _petLevel,
      'evolutionStage': _evolutionStage,
      'name': _petName,
      'happiness': _happiness,
      'coinsFed': _coinsFed,
      'accessory': _accessory,
    });
  }

  Future<void> _showEvolutionDialog(int stage) async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        backgroundColor: Colors.amber.shade50,
        title: const Row(
          children: [
            Text('🌟 ', style: TextStyle(fontSize: 24)),
            Text('Evolution!', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(AppConstants.petEvolutionEmojis[stage], style: const TextStyle(fontSize: 64)),
            const SizedBox(height: 12),
            Text(
              'Your Piggy evolved to\n${AppConstants.petEvolutionNames[stage]}!',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textDark),
            ),
            const SizedBox(height: 8),
            Text(
              'Keep saving to evolve further!',
              style: TextStyle(color: Colors.grey.shade600),
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryGreen, foregroundColor: Colors.white),
            child: const Text('Awesome!'),
          ),
        ],
      ),
    );
  }

  Widget _buildPetDisplay(String emoji, String evoName) {
    final isMaxStage = _evolutionStage >= AppConstants.petEvolutionEmojis.length - 1;

    return AnimatedBuilder(
      animation: Listenable.merge([_bounceCtrl, _glowCtrl, _sparkleCtrl]),
      builder: (_, __) {
        final bounce = sin(_bounceCtrl.value * pi) * 8;
        final glow = 0.6 + _glowCtrl.value * 0.4;
        final sparkle = _sparkleCtrl.value;

        return GestureDetector(
          onTap: _feedPet,
          child: Stack(
            alignment: Alignment.center,
            children: [
              if (isMaxStage)
                Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.coinGold.withValues(alpha: 0.3 * glow),
                        blurRadius: 30 + glow * 20,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                ),
              if (_evolutionStage >= 3)
                ...List.generate(3, (i) {
                  final angle = (sparkle * 2 * pi) + (i * 2 * pi / 3);
                  return Positioned(
                    left: 70 + cos(angle) * 60,
                    top: 20 + sin(angle) * 40,
                    child: Opacity(
                      opacity: 0.3 + (sin(sparkle * 2 * pi + i) * 0.3).abs(),
                      child: Text(['✨', '⭐', '💫'][i], style: const TextStyle(fontSize: 16)),
                    ),
                  );
                }),
              Transform.translate(
                offset: Offset(0, bounce),
                child: Column(
                  children: [
                    Container(
                      width: 140,
                      height: 140,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            Colors.white,
                            _evolutionStage >= 4 ? AppTheme.coinGold.withValues(alpha: 0.15) : AppTheme.primaryGreen.withValues(alpha: 0.08),
                          ],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: _evolutionStage >= 4
                                ? AppTheme.coinGold.withValues(alpha: 0.2 * glow)
                                : AppTheme.primaryGreen.withValues(alpha: 0.15 * glow),
                            blurRadius: 20,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Center(
                        child: Text(emoji, style: TextStyle(fontSize: 64 + (_evolutionStage * 4).toDouble())),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: _evolutionStage >= 4 ? AppTheme.coinGold.withValues(alpha: 0.2) : AppTheme.primaryGreen.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: _evolutionStage >= 4 ? AppTheme.coinGold : AppTheme.primaryGreen,
                          width: 1.5,
                        ),
                      ),
                      child: Text(
                        evoName,
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                          color: _evolutionStage >= 4 ? Colors.orange.shade800 : AppTheme.primaryGreen,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildInfoCard() {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _infoItem(Icons.favorite, '$_happiness%', 'Happiness'),
            _infoItem(Icons.stars, 'Lv.$_petLevel', 'Pet Level'),
            _infoItem(Icons.restaurant, '$_coinsFed', 'Meals'),
          ],
        ),
      ),
    );
  }

  Widget _infoItem(IconData icon, String value, String label) {
    return Column(
      children: [
        Icon(icon, color: AppTheme.primaryGreen, size: 28),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: AppTheme.textDark)),
        Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
      ],
    );
  }

  Widget _buildEvolutionBar(double progress, String emoji, String evoName) {
    final isMax = _evolutionStage >= AppConstants.petEvolutionEmojis.length - 1;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, color: AppTheme.xpPurple, size: 18),
              const SizedBox(width: 8),
              const Text('Evolution Progress', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.textDark)),
              const Spacer(),
              Text('${(_evolutionStage + 1)}/${AppConstants.petEvolutionEmojis.length}',
                  style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Container(
              height: 20,
              color: Colors.grey.shade200,
              child: Stack(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 500),
                    width: max(0, progress * MediaQuery.of(context).size.width * 0.7),
                    height: 20,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [AppTheme.xpPurple, isMax ? AppTheme.coinGold : Colors.deepPurple.shade300],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  if (!isMax)
                    Center(
                      child: Text(
                        '${AppConstants.petEvolutionNames[_evolutionStage]} → ${AppConstants.petEvolutionNames[min(_evolutionStage + 1, AppConstants.petEvolutionEmojis.length - 1)]}',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                    ),
                  if (isMax)
                    const Center(
                      child: Text('MAX EVOLUTION ⭐', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    return Row(
      children: [
        Expanded(
          child: _actionBtn(Icons.restaurant, 'Feed (3 🪙)', AppTheme.primaryGreen, _feedPet),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _actionBtn(Icons.edit, 'Rename', Colors.orange, _renamePet),
        ),
      ],
    );
  }

  Widget _actionBtn(IconData icon, String label, Color color, VoidCallback onTap) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 20),
      label: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }

  Widget _buildAccessoryDisplay() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.accentAmber.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.checkroom, color: AppTheme.accentAmber, size: 20),
          const SizedBox(width: 8),
          Text('Equipped: $_accessory', style: const TextStyle(fontWeight: FontWeight.w500)),
          const Spacer(),
          const Text('🎀', style: TextStyle(fontSize: 20)),
        ],
      ),
    );
  }

  Widget _buildHappinessBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.favorite, color: Colors.red, size: 18),
              const SizedBox(width: 8),
              const Text('Happiness', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppTheme.textDark)),
              const Spacer(),
              Text('$_happiness%', style: TextStyle(color: _happiness > 50 ? AppTheme.primaryGreen : Colors.red, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Container(
              height: 12,
              color: Colors.grey.shade200,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 400),
                width: max(0, (_happiness / 100) * MediaQuery.of(context).size.width * 0.7),
                height: 12,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [_happiness > 50 ? Colors.green.shade300 : Colors.red.shade300, _happiness > 50 ? AppTheme.primaryGreen : Colors.red],
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _happiness < 30 ? '😟 Piggy is hungry! Feed some coins!' : _happiness >= 70 ? '😊 Piggy is very happy!' : '🙂 Piggy is content',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }
}
