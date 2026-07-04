import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/design_system.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';
import '../../data/models/shop_items.dart';
import '../blocs/savings_bloc.dart';
import '../blocs/savings_state.dart';
import '../widgets/animated_counter.dart';
import '../widgets/app_card.dart';
import '../../core/network/banking_api_service.dart';
import 'kyc_page.dart';
import 'login_page.dart';
import 'terms_page.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> with TickerProviderStateMixin {
  final _source = LocalDbSource();
  final _picker = ImagePicker();
  String _avatar = '🐱';
  int _coins = 0;
  int _streak = 0;
  String _borderId = 'b_default';
  Uint8List? _profileImageBytes;
  bool _loading = true;
  late AnimationController _borderAnimController;
  List<BorderItem> _allBorders = fallbackBorderItems;
  final Map<String, Uint8List> _profileBorderCache = {};

  @override
  void initState() {
    super.initState();
    _borderAnimController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat();
    _load();
  }

  @override
  void dispose() {
    _borderAnimController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final avatar = await _source.getAvatar();
    final coins = await _source.getCoins();
    final streak = await _source.getStreakData();
    final borderId = await _source.getAvatarBorder();
    final imgBytes = await _source.getProfileImageBytes();
    List<BorderItem> borders = fallbackBorderItems;
    try {
      final api = GetIt.instance<RemoteApiSource>();
      final raw = await api.fetchShopItems(type: 'border');
      borders = raw.map((j) => BorderItem.fromJson(j)).toList();
      for (final b in borders) {
        if (b.imageUrl.isNotEmpty && !_profileBorderCache.containsKey(b.id)) {
          final url = b.imageUrl.startsWith('http') ? b.imageUrl : '${AppConstants.baseUrl}${b.imageUrl}';
          try {
            final resp = await http.get(Uri.parse(url));
            if (resp.statusCode == 200) _profileBorderCache[b.id] = resp.bodyBytes;
          } catch (_) {}
        }
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _avatar = avatar;
      _coins = coins;
      _streak = streak.streak;
      _borderId = borderId;
      _profileImageBytes = imgBytes;
      _loading = false;
      _allBorders = borders;
    });
  }

  Future<void> _pickImage() async {
    final xFile = await _picker.pickImage(source: ImageSource.gallery, maxWidth: 256, maxHeight: 256);
    if (xFile != null) {
      final bytes = await xFile.readAsBytes();
      await _source.setProfileImageBytes(bytes);
      setState(() => _profileImageBytes = bytes);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final state = context.watch<SavingsBloc>().state;
    final accountName = state is SavingsLoaded ? state.account.childName : _nameFromStorage();
    final totalSaved = state is SavingsLoaded
        ? state.goals.fold<double>(0, (s, g) => s + g.currentAllocated)
        : 0.0;

    return Scaffold(
      appBar: AppBar(title: const Text('My Profile')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(Spacing.lg),
        child: Column(
          children: [
            _buildAvatarSection(accountName),
            const SizedBox(height: Spacing.lg),
            _buildCoinsBar(),
            const SizedBox(height: Spacing.lg),
            _buildStats(totalSaved),
            const SizedBox(height: Spacing.lg),
            _buildQuickActions(),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatarSection(String accountName) {
    final border = _allBorders.firstWhere((b) => b.id == _borderId, orElse: () => _allBorders.isNotEmpty ? _allBorders[0] : fallbackBorderItems[0]);
    final isAnimatable = border.rarity == 'Special' || border.rarity == 'Mythic';

    return GestureDetector(
      onTap: _pickImage,
      child: Column(
        children: [
          AnimatedBuilder(
            animation: _borderAnimController,
            builder: (context, child) {
              final hasImageBorder = border.imageUrl.isNotEmpty && _profileBorderCache.containsKey(border.id);
              return SizedBox(
                width: 192,
                height: 192,
                child: hasImageBorder
                    ? Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox(
                            width: 120, height: 120,
                            child: _avatarCircle(),
                          ),
                          Container(
                            width: 192, height: 192,
                            decoration: BoxDecoration(
                              image: DecorationImage(
                                image: MemoryImage(_profileBorderCache[border.id]!),
                                fit: BoxFit.contain,
                              ),
                            ),
                          ),
                        ],
                      )
                    : Container(
                        padding: EdgeInsets.all(isAnimatable ? 8 + (_borderAnimController.value * 4) : 8),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: isAnimatable
                              ? SweepGradient(
                                  colors: [border.color1, border.color2, border.color1],
                                  stops: const [0, 0.5, 1],
                                )
                              : null,
                          color: !isAnimatable ? border.color1 : null,
                          boxShadow: [
                            BoxShadow(
                              color: border.color1.withValues(alpha: 0.4),
                              blurRadius: 12,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: _avatarCircle(),
                      ),
              );
            },
          ),
          const SizedBox(height: 8),
          Text(accountName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          Text('Tap avatar to change photo', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
        ],
      ),
    );
  }

  Widget _buildCoinsBar() {
    return AppCard(
      borderRadius: RadiusTokens.lg,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Spacing.lg, vertical: Spacing.md),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.orange.shade700, Colors.orange.shade500],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(RadiusTokens.lg),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.monetization_on, color: Colors.white, size: 28),
            const SizedBox(width: Spacing.sm),
            AnimatedCounter(
              value: _coins.toDouble(),
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(width: Spacing.xs),
            const Text('coins', style: TextStyle(fontSize: 16, color: Colors.white70)),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(RadiusTokens.sm - 4),
              ),
              child: Row(
                children: [
                  const Icon(Icons.local_fire_department, color: Colors.white, size: 16),
                  const SizedBox(width: Spacing.xs),
                  Text('$_streak', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStats(double totalSaved) {
    return AppCard(
      padding: const EdgeInsets.all(Spacing.md),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _statItem(Icons.savings, totalSaved, 'Saved', prefix: '₱'),
          _statItem(Icons.local_fire_department, _streak.toDouble(), 'Day Streak'),
          _statItem(Icons.stars, _coins.toDouble(), 'Coins'),
        ],
      ),
    );
  }

  Widget _statItem(IconData icon, double value, String label, {String prefix = ''}) {
    return Column(
      children: [
        Icon(icon, color: AppTheme.primaryGreen, size: 28),
        const SizedBox(height: Spacing.xs),
        AnimatedCounter(
          value: value,
          prefix: prefix,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: AppTheme.textDark),
        ),
        Text(label, style: AppTextStyle.bodySmall),
      ],
    );
  }

  Widget _buildQuickActions() {
    final state = context.watch<SavingsBloc>().state;
    final kycStatus = state is SavingsLoaded ? state.account.kycStatus : '';
    final kycLabel = kycStatus == 'verified'
        ? 'Verified'
        : kycStatus == 'pending'
            ? 'Under Review'
            : kycStatus == 'rejected'
                ? 'Rejected — Resubmit'
                : 'Verify Identity';
    final kycIcon = kycStatus == 'verified' ? Icons.verified : Icons.verified_user;
    final kycColor = kycStatus == 'verified'
        ? Colors.green
        : kycStatus == 'rejected'
            ? Colors.red.shade400
            : const Color(0xFF8B4513);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (kycStatus != 'verified')
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _actionButton(kycIcon, 'KYC: $kycLabel', kycColor, () {
              Navigator.push(context, PageTransition.slideUp(const KycPage())).then((_) => _load());
            }),
          ),
        if (kycStatus == 'verified')
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.green.shade200),
              ),
              child: Row(
                children: [
                  const Icon(Icons.verified, color: Colors.green, size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('Identity Verified', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.green.shade800, fontSize: 13)),
                  ),
                  Icon(Icons.check_circle, color: Colors.green.shade400, size: 18),
                ],
              ),
            ),
          ),
        _actionButton(Icons.auto_awesome, 'Rare Unlocks', AppTheme.coinGold, _showRareUnlocks),
        const SizedBox(height: Spacing.sm),
        const SizedBox(height: Spacing.sm),
        _actionButton(Icons.store, 'Shop — Avatars & Borders', AppTheme.accentAmber, () {
          Navigator.push(context, PageTransition.slideUp(const _ShopPage())).then((_) => _load());
        }),
        const SizedBox(height: Spacing.sm),
        _actionButton(Icons.emoji_events, 'Leaderboard', AppTheme.primaryGreen, () {
          Navigator.push(context, PageTransition.slideUp(const _LeaderboardPage()));
        }),
        const SizedBox(height: Spacing.sm),
        _actionButton(Icons.settings, 'Settings', Colors.grey.shade600, () {
          Navigator.push(context, PageTransition.slideUp(const _SettingsPage())).then((_) => _load());
        }),
        const SizedBox(height: Spacing.sm),
        _actionButton(Icons.description_outlined, 'Terms & Conditions', const Color(0xFF6366F1), () {
          Navigator.push(context, PageTransition.slideUp(const TermsPage()));
        }),
        const SizedBox(height: Spacing.sm),
        _actionButton(Icons.logout, 'Logout', Colors.red.shade400, () async {
          final confirm = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Logout'),
              content: const Text('This will clear all local data. Continue?'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Logout')),
              ],
            ),
          );
          if (confirm != true) return;
          await const FlutterSecureStorage().deleteAll();
          await LocalDbSource().clearAll();
          if (!context.mounted) return;
          Navigator.pushAndRemoveUntil(
            context,
            PageTransition.slideUp(const LoginPage()),
            (route) => false,
          );
        }),
      ],
    );
  }

  Widget _actionButton(IconData icon, String label, Color color, VoidCallback onTap) {
    return SizedBox(
      height: 56,
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon: Icon(icon),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: Spacing.md),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(RadiusTokens.lg)),
          elevation: 2,
          shadowColor: color.withValues(alpha: 0.3),
        ),
      ),
    );
  }

  String _nameFromStorage() => 'User';

  void _showRareUnlocks() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Row(
          children: [
            Icon(Icons.auto_awesome, color: AppTheme.coinGold),
            SizedBox(width: 8),
            Text('Rare Unlocks', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _UnlockRow(emoji: '🐉', title: 'Legendary Pet', desc: 'Evolve Piggy to max stage'),
            SizedBox(height: 8),
            _UnlockRow(emoji: '🏰', title: 'Dream Town Complete', desc: 'Build all 10 buildings'),
            SizedBox(height: 8),
            _UnlockRow(emoji: '🏆', title: 'Quiz Champion', desc: 'Score 100+ in Financial Quiz'),
            SizedBox(height: 8),
            _UnlockRow(emoji: '👑', title: 'Savings King', desc: 'Save ₱5,000 total'),
            SizedBox(height: 8),
            _UnlockRow(emoji: '🎭', title: 'All Avatars', desc: 'Collect every avatar in the shop'),
            SizedBox(height: 8),
            _UnlockRow(emoji: '🌈', title: 'Mythic Border', desc: 'Unlock all borders'),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryGreen, foregroundColor: Colors.white),
            child: const Text('Keep Going!'),
          ),
        ],
      ),
    );
  }

  Widget _avatarCircle() {
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: Colors.white, width: 3),
        image: _profileImageBytes != null
            ? DecorationImage(
                image: MemoryImage(_profileImageBytes!),
                fit: BoxFit.cover,
              )
            : null,
      ),
      child: _profileImageBytes == null
          ? Center(child: Text(_avatar, style: const TextStyle(fontSize: 48)))
          : null,
    );
  }
}

class _UnlockRow extends StatelessWidget {
  final String emoji;
  final String title;
  final String desc;
  const _UnlockRow({required this.emoji, required this.title, required this.desc});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 24)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              Text(desc, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ],
          ),
        ),
      ],
    );
  }
}

class _ShopPage extends StatefulWidget {
  const _ShopPage();

  @override
  State<_ShopPage> createState() => _ShopPageState();
}

class _ShopPageState extends State<_ShopPage> with TickerProviderStateMixin {
  final _source = LocalDbSource();
  int _coins = 0;
  String _currentAvatar = '🐱';
  String _currentBorder = 'b_default';
  List<String> _purchased = [];
  int _tabIndex = 0;
  String? _message;
  late AnimationController _glowController;
  List<ShopItem> _avatars = fallbackAvatarItems;
  List<BorderItem> _borders = fallbackBorderItems;
  bool _shopLoading = true;
  final Map<String, Uint8List> _borderImageCache = {};

  @override
  void initState() {
    super.initState();
    _glowController = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);
    _load();
  }

  @override
  void dispose() {
    _glowController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    _coins = await _source.getCoins();
    _currentAvatar = await _source.getAvatar();
    _currentBorder = await _source.getAvatarBorder();
    _purchased = await _source.getPurchasedItems();
    try {
      final api = GetIt.instance<RemoteApiSource>();
      final rawBorders = await api.fetchShopItems(type: 'border');
      final rawAvatars = await api.fetchShopItems(type: 'avatar');
      final borders = rawBorders.map((j) => BorderItem.fromJson(j)).toList();
      for (final b in borders) {
        if (b.imageUrl.isNotEmpty && !_borderImageCache.containsKey(b.id)) {
          final url = b.imageUrl.startsWith('http') ? b.imageUrl : '${AppConstants.baseUrl}${b.imageUrl}';
          try {
            final resp = await http.get(Uri.parse(url));
            if (resp.statusCode == 200) _borderImageCache[b.id] = resp.bodyBytes;
          } catch (_) {}
        }
      }
      if (mounted) {
        setState(() {
          _borders = borders;
          _avatars = rawAvatars.map((j) => ShopItem.fromJson(j)).toList();
          _shopLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _shopLoading = false);
    }
  }

  Future<void> _buyAvatar(ShopItem item) async {
    if (_purchased.contains(item.id)) {
      await _source.setAvatar(item.emoji);
      setState(() => _currentAvatar = item.emoji);
      _showMsg('${item.emoji} equipped!');
      return;
    }
    final success = await _source.spendCoins(item.cost);
    if (!success) { _showMsg('Need ${item.cost} 🪙'); return; }
    await _source.addPurchasedItem(item.id);
    await _source.setAvatar(item.emoji);
    setState(() { _currentAvatar = item.emoji; _coins -= item.cost; _purchased.add(item.id); });
    _showMsg('${item.emoji} purchased!');
  }

  Future<void> _buyBorder(BorderItem item) async {
    if (_purchased.contains(item.id)) {
      await _source.setAvatarBorder(item.id);
      setState(() => _currentBorder = item.id);
      _showMsg('${item.name} border equipped!');
      return;
    }
    final success = await _source.spendCoins(item.cost);
    if (!success) { _showMsg('Need ${item.cost} 🪙'); return; }
    await _source.addPurchasedItem(item.id);
    await _source.setAvatarBorder(item.id);
    setState(() { _currentBorder = item.id; _coins -= item.cost; _purchased.add(item.id); });
    _showMsg('${item.name} border purchased!');
  }

  void _showMsg(String msg) {
    setState(() => _message = msg);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _message = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Shop'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Row(
              children: [
                const Icon(Icons.monetization_on, color: AppTheme.coinGold, size: 20),
                const SizedBox(width: 4),
                Text('$_coins', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              ],
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Row(
            children: [
              Expanded(child: _tabBtn('Avatars', 0)),
              Expanded(child: _tabBtn('Borders', 1)),
            ],
          ),
          if (_message != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              color: AppTheme.primaryGreen.withValues(alpha: 0.1),
              child: Text(_message!, textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primaryGreen)),
            ),
          Expanded(
            child: _shopLoading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: _tabIndex == 0
                        ? _avatars.map(_avatarCard).toList()
                        : _borders.map(_borderCard).toList(),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _tabBtn(String label, int index) {
    final active = _tabIndex == index;
    return GestureDetector(
      onTap: () => setState(() => _tabIndex = index),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: active ? AppTheme.primaryGreen : Colors.transparent, width: 3)),
        ),
        child: Center(
          child: Text(label, style: TextStyle(fontWeight: FontWeight.bold, color: active ? AppTheme.primaryGreen : Colors.grey)),
        ),
      ),
    );
  }

  Widget _avatarCard(ShopItem item) {
    final owned = _purchased.contains(item.id);
    final equipped = item.emoji == _currentAvatar;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ListTile(
        leading: Container(
          width: 48, height: 48,
          decoration: BoxDecoration(
            color: AppTheme.primaryGreen.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Center(child: Text(item.emoji, style: const TextStyle(fontSize: 24))),
        ),
        title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
        subtitle: Text(owned ? (equipped ? '✅ Equipped' : 'Owned') : '${item.cost} 🪙', overflow: TextOverflow.ellipsis),
        trailing: equipped
            ? const Icon(Icons.check_circle, color: AppTheme.primaryGreen)
            : SizedBox(
                height: 36,
                child: ElevatedButton(
                  onPressed: () => _buyAvatar(item),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: owned ? Colors.grey.shade300 : AppTheme.accentAmber,
                    foregroundColor: owned ? Colors.grey.shade700 : AppTheme.textDark,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: Text(owned ? 'Use' : 'Buy', style: const TextStyle(fontSize: 12)),
                ),
              ),
      ),
    );
  }

  Widget _borderCard(BorderItem item) {
    final owned = _purchased.contains(item.id);
    final equipped = item.id == _currentBorder;
    final rColor = borderRarityColor(item.rarity);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: equipped ? Border.all(color: rColor, width: 2) : null,
        ),
        child: ListTile(
          leading: item.imageUrl.isNotEmpty && _borderImageCache.containsKey(item.id)
              ? SizedBox(
                  width: 44, height: 44,
                  child: Stack(
                    children: [
                      ClipOval(
                        child: Image.memory(
                          _borderImageCache[item.id]!,
                          width: 44, height: 44,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return const SizedBox.shrink();
                          },
                        ),
                      ),
                      Center(
                        child: Container(
                          width: 26, height: 26,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white,
                            border: Border.all(color: Colors.grey.shade200, width: 1),
                          ),
                        ),
                      ),
                    ],
                  ),
                )
              : item.imageUrl.isNotEmpty
                  ? ClipOval(
                      child: Image.network(
                        item.imageUrl.startsWith('http') ? item.imageUrl : '${AppConstants.baseUrl}${item.imageUrl}',
                        width: 44, height: 44,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => _borderColorPreview(item),
                        loadingBuilder: (context, child, loadingProgress) {
                          if (loadingProgress == null) return child;
                          return _borderColorPreview(item);
                        },
                      ),
                    )
                  : _borderColorPreview(item),
          title: Row(
            children: [
              Flexible(
                child: Text(item.name, style: const TextStyle(fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: rColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(item.rarity, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: rColor)),
              ),
            ],
          ),
          subtitle: Text(owned ? (equipped ? '✅ Equipped' : 'Owned') : '${item.cost} 🪙'),
          trailing: equipped
              ? const Icon(Icons.check_circle, color: AppTheme.primaryGreen)
              : SizedBox(
                  height: 36,
                  child: ElevatedButton(
                    onPressed: () => _buyBorder(item),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: owned ? Colors.grey.shade300 : AppTheme.accentAmber,
                      foregroundColor: owned ? Colors.grey.shade700 : AppTheme.textDark,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  child: Text(owned ? 'Use' : 'Buy', style: const TextStyle(fontSize: 12)),
                ),
              ),
        ),
      ),
    );
  }

  Widget _borderColorPreview(BorderItem item) {
    return Container(
      width: 44, height: 44,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: item.color1, width: 3),
        boxShadow: [BoxShadow(color: item.color1.withValues(alpha: 0.3), blurRadius: 6)],
      ),
    );
  }
}

class _LeaderboardPage extends StatefulWidget {
  const _LeaderboardPage();

  @override
  State<_LeaderboardPage> createState() => _LeaderboardPageState();
}

class _LeaderboardPageState extends State<_LeaderboardPage> {
  final _source = LocalDbSource();
  Uint8List? _myImageBytes;
  String _myName = '';

  @override
  void initState() {
    super.initState();
    _loadMyData();
  }

  Future<void> _loadMyData() async {
    final bytes = await _source.getProfileImageBytes();
    final state = context.read<SavingsBloc>().state;
    final name = state is SavingsLoaded ? state.account.childName : 'User';
    if (!mounted) return;
    setState(() {
      _myImageBytes = bytes;
      _myName = name;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Leaderboard — Top Savers')),
      body: BlocBuilder<SavingsBloc, SavingsState>(
        builder: (context, state) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildHeader(),
              const SizedBox(height: 16),
              _leaderboardCard(
                rank: 1, name: _myName, saved: state is SavingsLoaded ? state.goals.fold<double>(0, (s, g) => s + g.currentAllocated) : 0,
                avatar: '🐱', isYou: true,
                borderId: 'b_gold', imageBytes: _myImageBytes,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [AppTheme.primaryGreen, Color(0xFF1B5E20)]),
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Column(
        children: [
          Icon(Icons.emoji_events, color: AppTheme.coinGold, size: 48),
          SizedBox(height: 8),
          Text('Who saves the most?', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          Text('Save more to reach the top!', style: TextStyle(color: Colors.white70, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildRankWidget(int rank) {
    if (rank == 1) {
      return Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.amber.shade100,
          border: Border.all(color: Colors.amber.shade700, width: 2),
        ),
        child: const Center(child: Text('👑', style: TextStyle(fontSize: 20))),
      );
    } else if (rank == 2) {
      return Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.grey.shade200,
          border: Border.all(color: Colors.grey.shade500, width: 2),
        ),
        child: const Center(child: Text('👑', style: TextStyle(fontSize: 20))),
      );
    } else if (rank == 3) {
      return Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.orange.shade100,
          border: Border.all(color: Colors.orange.shade700, width: 2),
        ),
        child: const Center(child: Text('👑', style: TextStyle(fontSize: 20))),
      );
    }
    return Container(
      width: 36, height: 36,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.grey.shade100,
      ),
      child: Center(
        child: Text('$rank', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.grey.shade600)),
      ),
    );
  }

  Widget _leaderboardCard({
    required int rank,
    required String name,
    required double saved,
    required String avatar,
    required bool isYou,
    required String borderId,
    Uint8List? imageBytes,
  }) {
    final border = fallbackBorderItems.firstWhere((b) => b.id == borderId, orElse: () => fallbackBorderItems[0]);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      color: isYou ? AppTheme.primaryGreen.withValues(alpha: 0.08) : null,
      child: ListTile(
        leading: _buildRankWidget(rank),
        title: Row(
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: border.color1, width: 2),
                color: Colors.white,
                image: imageBytes != null
                    ? DecorationImage(image: MemoryImage(imageBytes), fit: BoxFit.cover)
                    : null,
              ),
              child: imageBytes == null
                  ? Center(child: Text(avatar, style: const TextStyle(fontSize: 18)))
                  : null,
            ),
            const SizedBox(width: 8),
            Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
            if (isYou)
              Container(
                margin: const EdgeInsets.only(left: 8),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.primaryGreen,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text('YOU', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
              ),
          ],
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('₱${saved.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textDark)),
            Text('saved', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
          ],
        ),
      ),
    );
  }
}

class _SettingsPage extends StatefulWidget {
  const _SettingsPage();

  @override
  State<_SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<_SettingsPage> {
  final _source = LocalDbSource();
  final _nameController = TextEditingController();
  final _gcashNumberCtrl = TextEditingController();
  final _gcashNameCtrl = TextEditingController();
  bool _nameSaved = false;
  bool _loadingGcash = true;
  bool _gcashSaving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final state = context.read<SavingsBloc>().state;
    final name = state is SavingsLoaded ? state.account.childName : await _source.getChildName();
    _nameController.text = name;

    final gcash = await BankingApiService.getGcashSettings();
    if (!mounted) return;
    setState(() {
      _gcashNumberCtrl.text = gcash['gcash_number']?.toString() ?? '09171234567';
      _gcashNameCtrl.text = gcash['gcash_name']?.toString() ?? 'LabCoop Savings';
      _loadingGcash = false;
    });
  }

  Future<void> _saveName() async {
    final newName = _nameController.text.trim();
    if (newName.isEmpty) return;
    await _source.setChildName(newName);
    setState(() => _nameSaved = true);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Name saved!'), backgroundColor: AppTheme.primaryGreen),
      );
    }
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _nameSaved = false);
    });
  }

  Future<void> _saveGcash() async {
    final number = _gcashNumberCtrl.text.trim();
    final name = _gcashNameCtrl.text.trim();
    if (number.isEmpty || name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in both GCash fields'), backgroundColor: Colors.red),
      );
      return;
    }
    setState(() => _gcashSaving = true);
    final ok = await BankingApiService.updateGcashSettings(number, name);
    if (!mounted) return;
    setState(() => _gcashSaving = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? 'GCash settings saved!' : 'Failed to save GCash settings'),
        backgroundColor: ok ? AppTheme.primaryGreen : Colors.red,
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _gcashNumberCtrl.dispose();
    _gcashNameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.person, size: 64, color: AppTheme.primaryGreen),
            const SizedBox(height: 24),
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: 'Your Name',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                prefixIcon: const Icon(Icons.edit, color: AppTheme.primaryGreen),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: _saveName,
                icon: Icon(_nameSaved ? Icons.check : Icons.save),
                label: Text(_nameSaved ? 'Saved!' : 'Save Name'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _nameSaved ? AppTheme.primaryGreen : AppTheme.accentAmber,
                  foregroundColor: _nameSaved ? Colors.white : AppTheme.textDark,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ),
            const SizedBox(height: 32),
            const Divider(),
            const SizedBox(height: 16),
            const Text('\u{1F4B1} GCash Settings',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (_loadingGcash)
              const Center(child: CircularProgressIndicator())
            else ...[
              const SizedBox(height: 12),
              TextField(
                controller: _gcashNumberCtrl,
                decoration: InputDecoration(
                  labelText: 'GCash Number',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                  prefixIcon: const Icon(Icons.phone_android, color: AppTheme.primaryGreen),
                  filled: true,
                  fillColor: Colors.white,
                ),
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _gcashNameCtrl,
                decoration: InputDecoration(
                  labelText: 'GCash Account Name',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                  prefixIcon: const Icon(Icons.person_outline, color: AppTheme.primaryGreen),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: _gcashSaving ? null : _saveGcash,
                  icon: _gcashSaving
                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.save),
                  label: Text(_gcashSaving ? 'Saving...' : 'Save GCash Settings'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryGreen,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
