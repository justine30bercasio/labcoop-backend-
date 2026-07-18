import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import 'package:http/http.dart' as http;
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
import '../widgets/notification_bell.dart';
import '../widgets/support_bell.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/network/dio_client.dart';
import 'package:dio/dio.dart';
import 'kyc_page.dart';
import 'board_page.dart';
import 'login_page.dart';
import 'support_page.dart';
import 'terms_page.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage>
    with TickerProviderStateMixin {
  final _source = LocalDbSource();
  String _avatar = '🐱';
  int _coins = 0;
  int _streak = 0;
  String _borderId = 'b_default';
  Uint8List? _profileImageBytes;
  String _profilePicUrl = '';
  String _authToken = '';
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
    final state = context.read<SavingsBloc>().state;
    final picUrl = state is SavingsLoaded ? state.account.profilePicUrl : '';
    final token = await FlutterSecureStorage().read(key: 'auth_token');
    List<BorderItem> borders = fallbackBorderItems;
    try {
      final api = GetIt.instance<RemoteApiSource>();
      final raw = await api.fetchShopItems(type: 'border');
      borders = raw.map((j) => BorderItem.fromJson(j)).toList();
      for (final b in borders) {
        if (b.imageUrl.isNotEmpty && !_profileBorderCache.containsKey(b.id)) {
          final url = b.imageUrl.startsWith('http')
              ? b.imageUrl
              : '${AppConstants.baseUrl}${b.imageUrl}';
          try {
            final resp = await http.get(Uri.parse(url));
            if (resp.statusCode == 200)
              _profileBorderCache[b.id] = resp.bodyBytes;
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
      _profilePicUrl = picUrl;
      _authToken = token ?? '';
      _loading = false;
      _allBorders = borders;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading)
      return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final state = context.watch<SavingsBloc>().state;
    final accountName =
        state is SavingsLoaded ? state.account.childName : _nameFromStorage();
    final totalSaved = state is SavingsLoaded
        ? state.goals.fold<double>(0, (s, g) => s + g.currentAllocated)
        : 0.0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Profile'),
        actions: [const SupportBell(), const NotificationBell()],
      ),
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
    final border = _allBorders.firstWhere((b) => b.id == _borderId,
        orElse: () =>
            _allBorders.isNotEmpty ? _allBorders[0] : fallbackBorderItems[0]);
    final isAnimatable =
        border.rarity == 'Special' || border.rarity == 'Mythic';

    return Column(
      children: [
        _buildAvatarWithBorder(border, isAnimatable),
        const SizedBox(height: 8),
        Text(accountName,
            style:
                const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildAvatarWithBorder(BorderItem border, bool isAnimatable) {
    return AnimatedBuilder(
      animation: _borderAnimController,
      builder: (context, child) {
        final hasImageBorder = border.imageUrl.isNotEmpty &&
            _profileBorderCache.containsKey(border.id);
        return SizedBox(
          width: 192,
          height: 192,
          child: hasImageBorder
              ? Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox(
                      width: 120,
                      height: 120,
                      child: _avatarCircle(),
                    ),
                    Container(
                      width: 192,
                      height: 192,
                      decoration: BoxDecoration(
                        image: DecorationImage(
                          image: MemoryImage(
                              _profileBorderCache[border.id]!),
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                  ],
                )
              : Container(
                  padding: EdgeInsets.all(isAnimatable
                      ? 8 + (_borderAnimController.value * 4)
                      : 8),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: isAnimatable
                        ? SweepGradient(
                            colors: [
                              border.color1,
                              border.color2,
                              border.color1
                            ],
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
    );
  }

  Widget _buildCoinsBar() {
    return AppCard(
      borderRadius: RadiusTokens.lg,
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: Spacing.lg, vertical: Spacing.md),
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
              style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.white),
            ),
            const SizedBox(width: Spacing.xs),
            const Text('coins',
                style: TextStyle(fontSize: 16, color: Colors.white70)),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(RadiusTokens.sm - 4),
              ),
              child: Row(
                children: [
                  const Icon(Icons.local_fire_department,
                      color: Colors.white, size: 16),
                  const SizedBox(width: Spacing.xs),
                  Text('$_streak',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold)),
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
          _statItem(
              Icons.local_fire_department, _streak.toDouble(), 'Day Streak'),
          _statItem(Icons.stars, _coins.toDouble(), 'Coins'),
        ],
      ),
    );
  }

  Widget _statItem(IconData icon, double value, String label,
      {String prefix = ''}) {
    return Column(
      children: [
        Icon(icon, color: AppTheme.primaryGreen, size: 28),
        const SizedBox(height: Spacing.xs),
        AnimatedCounter(
          value: value,
          prefix: prefix,
          style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 18,
              color: Theme.of(context).colorScheme.onSurface),
        ),
        Text(label, style: AppTextStyle.bodySmall(context)),
      ],
    );
  }

  Widget _kycCard(
      {required String status,
      required String label,
      required VoidCallback onTap}) {
    final isVerified = status == 'verified';
    final isRejected = status == 'rejected';

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: isVerified ? null : onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isVerified
                  ? Colors.green.shade200
                  : isRejected
                      ? Colors.red.shade200
                      : Colors.amber.shade200,
            ),
            color: isVerified
                ? Colors.green.shade50
                : isRejected
                    ? Colors.red.shade50
                    : Colors.amber.shade50,
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: isVerified
                      ? Colors.green.withValues(alpha: 0.15)
                      : isRejected
                          ? Colors.red.withValues(alpha: 0.15)
                          : Colors.amber.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  isVerified ? Icons.verified_rounded : Icons.fingerprint,
                  color: isVerified
                      ? Colors.green
                      : isRejected
                          ? Colors.red
                          : Colors.amber.shade800,
                  size: 22,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isVerified ? 'Identity Verified' : 'KYC Verification',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: isVerified
                              ? Colors.green.shade800
                              : const Color(0xFF1E293B)),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      isVerified ? 'You are fully verified' : label,
                      style: TextStyle(
                          fontSize: 11,
                          color: isVerified
                              ? Colors.green.shade600
                              : isRejected
                                  ? Colors.red.shade600
                                  : Colors.amber.shade800),
                    ),
                  ],
                ),
              ),
              if (isVerified)
                Icon(Icons.check_circle, color: Colors.green.shade400, size: 20)
              else
                Icon(Icons.chevron_right,
                    color: Colors.grey.shade300, size: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQuickActions() {
    final state = context.watch<SavingsBloc>().state;
    final kycStatus = state is SavingsLoaded ? state.account.kycStatus : '';
    final kycLabel = kycStatus == 'pending'
        ? 'Under Review'
        : kycStatus == 'rejected'
            ? 'Rejected'
            : 'Verify Identity';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader('Account', Icons.shield_outlined),
        _kycCard(
            status: kycStatus,
            label: kycLabel,
            onTap: () {
              Navigator.push(context, PageTransition.slideUp(const KycPage()))
                  .then((_) => _load());
            }),
        const SizedBox(height: 10),
        _actionTile(Icons.settings_rounded, 'Settings',
            'Personalize your experience', Colors.grey.shade600, () {
          Navigator.push(context, PageTransition.slideUp(const _SettingsPage()))
              .then((_) => _load());
        }),
        const SizedBox(height: 10),
        _actionTile(Icons.support_agent_rounded, 'Contact Support',
            'Send a message to admin', const Color(0xFF2E7D32), () {
          if (state is SavingsLoaded) {
            Navigator.push(context, PageTransition.slideUp(SupportPage(
              accountId: state.account.accountId,
              childName: state.account.childName,
            )));
          }
        }),
        const SizedBox(height: 10),
        _actionTile(Icons.logout_rounded, 'Logout',
            'Clear local data & sign out', Colors.red.shade400, () async {
          final confirm = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Logout'),
              content: const Text('This will clear all local data. Continue?'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Cancel')),
                TextButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Logout')),
              ],
            ),
          );
          if (confirm != true) return;
          await const FlutterSecureStorage().deleteAll();
          await LocalDbSource().clearAll();
          if (!context.mounted) return;
          Navigator.pushAndRemoveUntil(context,
              PageTransition.slideUp(const LoginPage()), (route) => false);
        }),
        const SizedBox(height: 24),
        _sectionHeader('Rewards', Icons.auto_awesome),
        _actionTile(Icons.store_rounded, 'Shop', 'Avatars & borders',
            AppTheme.accentAmber, () {
          Navigator.push(context, PageTransition.slideUp(const _ShopPage()))
              .then((_) => _load());
        }),
        const SizedBox(height: 24),
        _sectionHeader('Community', Icons.groups_rounded),
        _actionTile(Icons.emoji_events_rounded, 'Leaderboard',
            'Top savers & earners', AppTheme.primaryGreen, () {
          Navigator.push(
              context, PageTransition.slideUp(const _LeaderboardPage()));
        }),
        const SizedBox(height: 10),
        _actionTile(Icons.people_rounded, 'Board of Directors',
            'Cooperative leadership', const Color(0xFF7B1FA2), () {
          Navigator.push(context, PageTransition.slideUp(const BoardPage()));
        }),
        const SizedBox(height: 10),
        _actionTile(Icons.description_outlined, 'Terms & Conditions',
            'App usage policies', const Color(0xFF6366F1), () {
          Navigator.push(context, PageTransition.slideUp(const TermsPage()));
        }),
        const SizedBox(height: 32),
      ],
    );
  }

  Widget _sectionHeader(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.grey.shade400),
          const SizedBox(width: 6),
          Text(title,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: Colors.grey.shade500,
                  letterSpacing: 0.6)),
        ],
      ),
    );
  }

  Widget _actionTile(IconData icon, String title, String subtitle, Color color,
      VoidCallback onTap) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      elevation: 0,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.grey.shade100),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2)),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF1E293B))),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: TextStyle(
                            fontSize: 11, color: Colors.grey.shade500)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.grey.shade300, size: 20),
            ],
          ),
        ),
      ),
    );
  }

  String _nameFromStorage() => 'User';

  Widget _avatarCircle() {
    final hasLocal = _profileImageBytes != null;
    final hasUrl = _profilePicUrl.isNotEmpty;
    if (hasLocal) {
      return Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white,
          border: Border.all(color: Colors.white, width: 3),
          image: DecorationImage(
              image: MemoryImage(_profileImageBytes!), fit: BoxFit.cover),
        ),
      );
    }
    if (hasUrl) {
      final fullUrl = _profilePicUrl.startsWith('http')
          ? _profilePicUrl
          : '${AppConstants.baseUrl}$_profilePicUrl';
      return ClipOval(
        child: Container(
          width: 120,
          height: 120,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.white, width: 3),
          ),
          child: Image.network(
            fullUrl,
            width: 120,
            height: 120,
            fit: BoxFit.cover,
            headers: _authToken.isNotEmpty
                ? {'Authorization': 'Bearer $_authToken'}
                : null,
            errorBuilder: (_, __, ___) => Container(
              color: Colors.white,
              child: Center(
                  child: Text(_avatar,
                      style: const TextStyle(fontSize: 48))),
            ),
          ),
        ),
      );
    }
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: Colors.white, width: 3),
      ),
      child: Center(child: Text(_avatar, style: const TextStyle(fontSize: 48))),
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
  final _api = RemoteApiSource(DioClient.create());
  final _secureStorage = const FlutterSecureStorage();
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
    _glowController =
        AnimationController(vsync: this, duration: const Duration(seconds: 2))
          ..repeat(reverse: true);
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
          final url = b.imageUrl.startsWith('http')
              ? b.imageUrl
              : '${AppConstants.baseUrl}${b.imageUrl}';
          try {
            final resp = await http.get(Uri.parse(url));
            if (resp.statusCode == 200)
              _borderImageCache[b.id] = resp.bodyBytes;
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
    if (!success) {
      _showMsg('Need ${item.cost} 🪙');
      return;
    }
    await _source.addPurchasedItem(item.id);
    await _source.setAvatar(item.emoji);
    setState(() {
      _currentAvatar = item.emoji;
      _coins -= item.cost;
      _purchased.add(item.id);
    });
    _syncSpendToServer(item.cost, 'avatar_purchase');
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
    if (!success) {
      _showMsg('Need ${item.cost} 🪙');
      return;
    }
    await _source.addPurchasedItem(item.id);
    await _source.setAvatarBorder(item.id);
    setState(() {
      _currentBorder = item.id;
      _coins -= item.cost;
      _purchased.add(item.id);
    });
    _syncSpendToServer(item.cost, 'border_purchase');
    _showMsg('${item.name} border purchased!');
  }

  Future<void> _syncSpendToServer(int amount, String reason) async {
    try {
      final accountId = await _secureStorage.read(key: 'account_id');
      if (accountId == null) return;
      await _api.spendCoins(accountId, amount, reason);
    } catch (_) {}
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
                const Icon(Icons.monetization_on,
                    color: AppTheme.coinGold, size: 20),
                const SizedBox(width: 4),
                Text('$_coins',
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 16)),
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
              child: Text(_message!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primaryGreen)),
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
          border: Border(
              bottom: BorderSide(
                  color: active ? AppTheme.primaryGreen : Colors.transparent,
                  width: 3)),
        ),
        child: Center(
          child: Text(label,
              style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: active ? AppTheme.primaryGreen : Colors.grey)),
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
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: AppTheme.primaryGreen.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Center(
              child: Text(item.emoji, style: const TextStyle(fontSize: 24))),
        ),
        title: Text(item.name,
            style: const TextStyle(fontWeight: FontWeight.bold),
            overflow: TextOverflow.ellipsis),
        subtitle: Text(
            owned ? (equipped ? '✅ Equipped' : 'Owned') : '${item.cost} 🪙',
            overflow: TextOverflow.ellipsis),
        trailing: equipped
            ? const Icon(Icons.check_circle, color: AppTheme.primaryGreen)
            : SizedBox(
                height: 36,
                child: ElevatedButton(
                  onPressed: () => _buyAvatar(item),
                  style: ElevatedButton.styleFrom(
                    backgroundColor:
                        owned ? Colors.grey.shade300 : AppTheme.accentAmber,
                    foregroundColor:
                        owned ? Colors.grey.shade700 : Theme.of(context).colorScheme.onSurface,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                  ),
                  child: Text(owned ? 'Use' : 'Buy',
                      style: const TextStyle(fontSize: 12)),
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
          leading:
              item.imageUrl.isNotEmpty && _borderImageCache.containsKey(item.id)
                  ? SizedBox(
                      width: 44,
                      height: 44,
                      child: Stack(
                        children: [
                          ClipOval(
                            child: Image.memory(
                              _borderImageCache[item.id]!,
                              width: 44,
                              height: 44,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) {
                                return const SizedBox.shrink();
                              },
                            ),
                          ),
                          Center(
                            child: Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.white,
                                border: Border.all(
                                    color: Colors.grey.shade200, width: 1),
                              ),
                            ),
                          ),
                        ],
                      ),
                    )
                  : item.imageUrl.isNotEmpty
                      ? ClipOval(
                          child: Image.network(
                            item.imageUrl.startsWith('http')
                                ? item.imageUrl
                                : '${AppConstants.baseUrl}${item.imageUrl}',
                            width: 44,
                            height: 44,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) =>
                                _borderColorPreview(item),
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
                child: Text(item.name,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                    overflow: TextOverflow.ellipsis),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: rColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(item.rarity,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: rColor)),
              ),
            ],
          ),
          subtitle: Text(
              owned ? (equipped ? '✅ Equipped' : 'Owned') : '${item.cost} 🪙'),
          trailing: equipped
              ? const Icon(Icons.check_circle, color: AppTheme.primaryGreen)
              : SizedBox(
                  height: 36,
                  child: ElevatedButton(
                    onPressed: () => _buyBorder(item),
                    style: ElevatedButton.styleFrom(
                      backgroundColor:
                          owned ? Colors.grey.shade300 : AppTheme.accentAmber,
                      foregroundColor:
                          owned ? Colors.grey.shade700 : Theme.of(context).colorScheme.onSurface,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                    child: Text(owned ? 'Use' : 'Buy',
                        style: const TextStyle(fontSize: 12)),
                  ),
                ),
        ),
      ),
    );
  }

  Widget _borderColorPreview(BorderItem item) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
        border: Border.all(color: item.color1, width: 3),
        boxShadow: [
          BoxShadow(color: item.color1.withValues(alpha: 0.3), blurRadius: 6)
        ],
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
  List<Map<String, dynamic>> _entries = [];
  bool _loading = true;
  String? _error;
  String _myName = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = GetIt.instance<RemoteApiSource>();
      final data = await api.getLeaderboard();
      final state = context.read<SavingsBloc>().state;
      final name = state is SavingsLoaded ? state.account.childName : '';
      final parsed = data
          .map((e) => <String, dynamic>{
                'account_id': e['account_id'],
                'child_name': e['child_name'],
                'actual_balance': (e['actual_balance'] is num
                    ? (e['actual_balance'] as num).toDouble()
                    : double.tryParse('${e['actual_balance']}') ?? 0),
                'current_xp': (e['current_xp'] is num
                    ? (e['current_xp'] as num).toInt()
                    : int.tryParse('${e['current_xp']}') ?? 0),
                'profile_pic_url': e['profile_pic_url'],
              })
          .toList();
      if (!mounted) return;
      setState(() {
        _entries = parsed;
        _myName = name;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Leaderboard — Top Savers')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.cloud_off, size: 48, color: Colors.grey),
                  const SizedBox(height: 12),
                  Text('Could not load leaderboard',
                      style: TextStyle(color: Colors.grey[600])),
                  const SizedBox(height: 16),
                  TextButton.icon(
                      onPressed: _load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry')),
                ]))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildHeader(),
                      const SizedBox(height: 20),
                      ..._entries.asMap().entries.map((e) => _leaderboardCard(
                            rank: e.key + 1,
                            name: e.value['child_name'] as String? ?? '',
                            saved: (e.value['actual_balance'] as num?)
                                    ?.toDouble() ??
                                0,
                            xp: (e.value['current_xp'] as num?)?.toInt() ?? 0,
                            imageUrl: e.value['profile_pic_url'] as String?,
                            isYou: (e.value['child_name'] as String? ?? '') ==
                                _myName,
                          )),
                    ],
                  ),
                ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
            colors: [AppTheme.primaryGreen, Color(0xFF1B5E20)]),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          const Icon(Icons.emoji_events, color: AppTheme.coinGold, size: 48),
          const SizedBox(height: 8),
          const Text('Who saves the most?',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('${_entries.length} members competing',
              style: const TextStyle(color: Colors.white70, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildRankWidget(int rank) {
    if (rank == 1) {
      return Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const LinearGradient(
              colors: [Color(0xFFFFD700), Color(0xFFFFA000)]),
          boxShadow: [
            BoxShadow(color: Colors.amber.withValues(alpha: 0.4), blurRadius: 8)
          ],
        ),
        child: const Center(child: Text('👑', style: TextStyle(fontSize: 22))),
      );
    } else if (rank == 2) {
      return Container(
        width: 36,
        height: 36,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient:
              LinearGradient(colors: [Color(0xFFE0E0E0), Color(0xFF9E9E9E)]),
        ),
        child: const Center(child: Text('🥈', style: TextStyle(fontSize: 20))),
      );
    } else if (rank == 3) {
      return Container(
        width: 36,
        height: 36,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient:
              LinearGradient(colors: [Color(0xFFFFCC80), Color(0xFFFF8A65)]),
        ),
        child: const Center(child: Text('🥉', style: TextStyle(fontSize: 20))),
      );
    }
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.grey.shade100,
      ),
      child: Center(
        child: Text('$rank',
            style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ),
    );
  }

  String _formatMoney(double amount) {
    return '₱${amount.toStringAsFixed(2)}';
  }

  Widget _leaderboardCard({
    required int rank,
    required String name,
    required double saved,
    required int xp,
    String? imageUrl,
    required bool isYou,
  }) {
    final initials = name.trim().split(RegExp(r'\s+'));
    final displayInitials = initials.length >= 2
        ? '${initials[0][0]}${initials.last[0]}'.toUpperCase()
        : name.isNotEmpty
            ? name[0].toUpperCase()
            : '?';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: isYou ? Colors.green.shade50 : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isYou ? Colors.green.shade200 : Colors.grey.shade100),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isYou ? 0.08 : 0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                _buildRankWidget(rank),
                const SizedBox(width: 12),
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.grey.shade100,
                    border: Border.all(color: Colors.grey.shade200, width: 1.5),
                  ),
                  child: imageUrl != null && imageUrl.isNotEmpty
                      ? ClipOval(
                          child: Image.network(imageUrl,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Center(
                                  child: Text(displayInitials,
                                      style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w700,
                                          color: Theme.of(context).colorScheme.onSurfaceVariant)))))
                      : Center(
                          child: Text(displayInitials,
                              style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: Theme.of(context).colorScheme.onSurfaceVariant))),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(name,
                                style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: isYou
                                        ? Colors.green.shade800
                                        : const Color(0xFF1E293B)),
                                overflow: TextOverflow.ellipsis),
                          ),
                          if (isYou)
                            Container(
                              margin: const EdgeInsets.only(left: 6),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                  color: Colors.green.shade100,
                                  borderRadius: BorderRadius.circular(6)),
                              child: Text('YOU',
                                  style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.green.shade700)),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(_formatMoney(saved),
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  color: isYou
                                      ? Colors.green.shade700
                                      : const Color(0xFF0F172A))),
                          const SizedBox(width: 8),
                          Icon(Icons.star,
                              size: 13, color: Colors.amber.shade600),
                          const SizedBox(width: 2),
                          Text('$xp XP',
                              style: TextStyle(
                                  fontSize: 11, color: Colors.grey.shade500)),
                        ],
                      ),
                    ],
                  ),
                ),
                if (rank == 1)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.amber.shade200),
                    ),
                    child: Text('TOP',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: Colors.amber.shade800)),
                  ),
              ],
            ),
          ),
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
  final _deletionReasonCtrl = TextEditingController();
  bool _nameSaved = false;
  bool _deleting = false;
  bool _uploading = false;
  Uint8List? _profileImageBytes;
  final _picker = ImagePicker();
  Map<String, dynamic>? _deletionRequest;

  // Change PIN state
  final _pinOldController = TextEditingController();
  final _pinNewController = TextEditingController();
  final _pinConfirmController = TextEditingController();
  bool _changingPin = false;
  bool _pinObscureOld = true;
  bool _pinObscureNew = true;
  bool _pinObscureConfirm = true;
  String? _pinError;
  String? _pinSuccess;

  // Link parent state
  String? _linkCode;
  String? _linkCodeExpiresAt;
  bool _generatingLink = false;
  String? _linkParentError;
  String? _linkParentSuccess;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final state = context.read<SavingsBloc>().state;
    final name = state is SavingsLoaded
        ? state.account.childName
        : await _source.getChildName();
    _nameController.text = name;
    final img = await _source.getProfileImageBytes();
    if (mounted) setState(() => _profileImageBytes = img);
    _refreshDeletionStatus();
  }

  Future<void> _refreshDeletionStatus() async {
    final status = await BankingApiService.getDeletionStatus();
    if (mounted) setState(() => _deletionRequest = status?['request']);
  }

  Future<void> _saveName() async {
    final newName = _nameController.text.trim();
    if (newName.isEmpty) return;
    await _source.setChildName(newName);
    setState(() => _nameSaved = true);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Name saved!'),
            backgroundColor: AppTheme.primaryGreen),
      );
    }
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _nameSaved = false);
    });
  }

  Future<void> _pickProfileImage() async {
    final xFile = await _picker.pickImage(
        source: ImageSource.gallery, maxWidth: 256, maxHeight: 256);
    if (xFile == null) return;
    final bytes = await xFile.readAsBytes();
    await _source.setProfileImageBytes(bytes);
    if (mounted) setState(() => _profileImageBytes = bytes);
  }

  Future<void> _saveProfilePhoto() async {
    final state = context.read<SavingsBloc>().state;
    if (state is! SavingsLoaded) return;
    if (_profileImageBytes == null) return;
    setState(() => _uploading = true);
    try {
      final url = await BankingApiService.uploadProfilePhoto(
        state.account.accountId, _profileImageBytes!);
      if (!mounted) return;
      setState(() => _uploading = false);
      if (url != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile photo saved to cloud!'),
            backgroundColor: AppTheme.primaryGreen,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _uploading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Upload failed: $e'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    }
  }

  Future<void> _changePin() async {
    final oldPin = _pinOldController.text;
    final newPin = _pinNewController.text;
    final confirmPin = _pinConfirmController.text;

    // Reset messages
    setState(() { _pinError = null; _pinSuccess = null; });

    if (oldPin.isEmpty || newPin.isEmpty || confirmPin.isEmpty) {
      setState(() => _pinError = 'Please fill in all PIN fields');
      return;
    }
    if (oldPin.length != 6 || !RegExp(r'^\d{6}$').hasMatch(oldPin)) {
      setState(() => _pinError = 'Current PIN must be exactly 6 digits');
      return;
    }
    if (newPin.length != 6 || !RegExp(r'^\d{6}$').hasMatch(newPin)) {
      setState(() => _pinError = 'New PIN must be exactly 6 digits');
      return;
    }
    if (newPin != confirmPin) {
      setState(() => _pinError = 'New PINs do not match');
      return;
    }
    if (newPin == oldPin) {
      setState(() => _pinError = 'New PIN must be different from current PIN');
      return;
    }

    setState(() => _changingPin = true);
    try {
      final api = GetIt.instance<RemoteApiSource>();
      await api.changePin(oldPin, newPin);
      if (!mounted) return;
      setState(() {
        _pinSuccess = 'PIN changed successfully!';
        _pinError = null;
        _changingPin = false;
        _pinOldController.clear();
        _pinNewController.clear();
        _pinConfirmController.clear();
      });
    } catch (e) {
      if (!mounted) return;
      String msg = 'Failed to change PIN';
      if (e is DioException) {
        msg = e.response?.data?['message'] ?? msg;
      }
      setState(() { _pinError = msg; _changingPin = false; });
    }
  }

  Future<void> _requestDeletion() async {
    final reason = _deletionReasonCtrl.text.trim();
    if (reason.length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please provide a reason (at least 5 characters)'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Account?'),
        content: const Text(
          'This will permanently close your account and all associated data. '
          'An admin will review your request. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Request Deletion'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _deleting = true);
    final ok = await BankingApiService.requestDeletion(reason: reason);
    if (!mounted) return;
    setState(() => _deleting = false);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? 'Deletion request submitted. An admin will review it.'
              : 'Failed to submit request. Try again later.',
        ),
        backgroundColor: ok ? AppTheme.primaryGreen : Colors.red,
      ),
    );
    if (ok) {
      _deletionReasonCtrl.clear();
      _refreshDeletionStatus();
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _deletionReasonCtrl.dispose();
    _pinOldController.dispose();
    _pinNewController.dispose();
    _pinConfirmController.dispose();
    super.dispose();
  }

  Future<void> _generateLinkCode() async {
    setState(() { _generatingLink = true; _linkParentError = null; _linkParentSuccess = null; });
    try {
      final state = context.read<SavingsBloc>().state;
      if (state is! SavingsLoaded) {
        setState(() { _linkParentError = 'Please wait for data to load'; _generatingLink = false; });
        return;
      }
      final resp = await DioClient.create().post(
        '/api/accounts/${state.account.accountId}/generate-link-code',
      );
      if (!mounted) return;
      final data = resp.data as Map<String, dynamic>;
      setState(() {
        _linkCode = data['linkCode'] as String;
        _linkCodeExpiresAt = data['expiresAt'] as String;
        _linkParentSuccess = 'Share this code with your parent!';
        _generatingLink = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _linkParentError = 'Failed to generate code. Try again.'; _generatingLink = false; });
    }
  }

  Widget _buildLinkParentSection() {
    return Column(
      children: [
        if (_linkCode != null) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppTheme.primaryGreen.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.primaryGreen.withValues(alpha: 0.3)),
            ),
            child: Column(
              children: [
                Text(
                  'Your Linking Code',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12),
                ),
                const SizedBox(height: 8),
                Text(
                  _linkCode!,
                  style: const TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 8,
                    color: AppTheme.primaryGreen,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Expires in 5 minutes',
                  style: TextStyle(color: Colors.grey.shade500, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: TextButton.icon(
              onPressed: _generatingLink ? null : _generateLinkCode,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Generate New Code'),
            ),
          ),
        ] else ...[
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              onPressed: _generatingLink ? null : _generateLinkCode,
              icon: _generatingLink
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.qr_code_2, size: 20),
              label: Text(_generatingLink ? 'Generating...' : 'Generate Linking Code'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryGreen,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
        if (_linkParentError != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_linkParentError!, style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
          ),
        if (_linkParentSuccess != null && _linkCode == null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_linkParentSuccess!, style: TextStyle(color: Colors.green.shade700, fontSize: 13)),
          ),
        const SizedBox(height: 4),
        Text(
          'Your parent enters this code in their Parent Portal → Link Child tab',
          style: TextStyle(color: Colors.grey.shade500, fontSize: 11),
        ),
      ],
    );
  }

  Widget _buildPinField(TextEditingController controller, String hint, bool obscure, VoidCallback toggle) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: TextInputType.number,
      maxLength: 6,
      style: const TextStyle(fontSize: 16),
      decoration: InputDecoration(
        hintText: hint,
        counterText: '',
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
        prefixIcon: const Icon(Icons.pin, color: AppTheme.primaryGreen),
        suffixIcon: IconButton(
          icon: Icon(obscure ? Icons.visibility_off : Icons.visibility, size: 20),
          onPressed: toggle,
        ),
        filled: true,
        fillColor: Colors.white,
      ),
    );
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
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                prefixIcon:
                    const Icon(Icons.edit, color: AppTheme.primaryGreen),
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
                  backgroundColor:
                      _nameSaved ? AppTheme.primaryGreen : AppTheme.accentAmber,
                    foregroundColor:
                        _nameSaved ? Colors.white : Theme.of(context).colorScheme.onSurface,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16)),
                  textStyle: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
              ),
              const SizedBox(height: 32),
              const Divider(),
              const SizedBox(height: 16),

              // ── Link Parent Section ──
              const Row(
                children: [
                  Icon(Icons.family_restroom, color: AppTheme.primaryGreen, size: 24),
                  SizedBox(width: 8),
                  Text('Link Parent',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Generate a temporary code for your parent to link their account. The code expires in 5 minutes.',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 13),
              ),
              const SizedBox(height: 12),
              _buildLinkParentSection(),
              const SizedBox(height: 32),
              const Divider(),
              const SizedBox(height: 16),

              // ── Change PIN Section ──
              const Row(
                children: [
                  Icon(Icons.lock_outline, color: AppTheme.primaryGreen, size: 24),
                  SizedBox(width: 8),
                  Text('Change PIN',
                      style: TextStyle(
                          fontSize: 20, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Your 6-digit PIN is used to log in. Choose a new one you can remember.',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 13),
              ),
              const SizedBox(height: 16),
              _buildPinField(_pinOldController, 'Current PIN', _pinObscureOld, () {
                setState(() => _pinObscureOld = !_pinObscureOld);
              }),
              const SizedBox(height: 12),
              _buildPinField(_pinNewController, 'New PIN (6 digits)', _pinObscureNew, () {
                setState(() => _pinObscureNew = !_pinObscureNew);
              }),
              const SizedBox(height: 12),
              _buildPinField(_pinConfirmController, 'Confirm New PIN', _pinObscureConfirm, () {
                setState(() => _pinObscureConfirm = !_pinObscureConfirm);
              }),
              if (_pinError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(_pinError!, style: TextStyle(color: Colors.red.shade700, fontSize: 13)),
                  ),
                ),
              if (_pinSuccess != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: Text(_pinSuccess!, style: TextStyle(color: Colors.green.shade700, fontSize: 13)),
                  ),
                ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: _changingPin ? null : _changePin,
                  icon: _changingPin
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.lock_reset, size: 20),
                  label: Text(_changingPin ? 'Changing...' : 'Change PIN'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryGreen,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              const SizedBox(height: 32),
              const Divider(),
              const SizedBox(height: 16),
              const Text('\u{1F5BC}\u{FE0F} Profile Photo',
                  style: TextStyle(
                      fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Center(
                child: GestureDetector(
                  onTap: _pickProfileImage,
                  child: Stack(
                    children: [
                      Container(
                        width: 120,
                        height: 120,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white,
                          border: Border.all(color: AppTheme.primaryGreen, width: 3),
                          image: _profileImageBytes != null
                              ? DecorationImage(
                                  image: MemoryImage(_profileImageBytes!),
                                  fit: BoxFit.cover,
                                )
                              : null,
                        ),
                        child: _profileImageBytes == null
                            ? const Center(
                                child: Icon(Icons.person, size: 48, color: AppTheme.primaryGreen))
                            : null,
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryGreen,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                          child: const Icon(Icons.camera_alt, size: 18, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  _profileImageBytes != null ? 'Tap to change photo' : 'Tap to set profile photo',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                ),
              ),
              if (_profileImageBytes != null) ...[
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: _uploading ? null : _saveProfilePhoto,
                    icon: _uploading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.cloud_upload),
                    label: Text(_uploading
                        ? 'Uploading...'
                        : 'Save to Cloud'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryGreen,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 32),
              const Divider(),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Icon(Icons.warning, color: Colors.red, size: 24),
                  const SizedBox(width: 8),
                  const Text('Account Deletion',
                      style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.red)),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Request to permanently close your account and delete all '
                'associated data. An admin will review your request.',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 13),
              ),
              const SizedBox(height: 12),
              if (_deletionRequest != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.orange.shade200),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline, color: Colors.orange),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Deletion request is ${_deletionRequest!['status'] ?? 'pending'}. '
                          'Submitted ${_deletionRequest!['created_at']?.toString().substring(0, 10) ?? ''}',
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: _deletionReasonCtrl,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'Reason for deletion...',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16)),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: _deleting ? null : _requestDeletion,
                  icon: _deleting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.delete_forever),
                  label: Text(_deleting
                      ? 'Submitting...'
                      : 'Request Account Deletion'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red.shade600,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                    textStyle: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ),
    );
  }

}
