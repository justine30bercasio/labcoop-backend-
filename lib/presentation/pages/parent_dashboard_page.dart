import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/theme/app_theme.dart';
import '../../core/network/banking_api_service.dart';
import 'parent_login_page.dart';

class ParentDashboardPage extends StatefulWidget {
  const ParentDashboardPage({super.key});

  @override
  State<ParentDashboardPage> createState() => _ParentDashboardPageState();
}

class _ParentDashboardPageState extends State<ParentDashboardPage> {
  int _currentIndex = 0;
  List<dynamic> _children = [];
  List<dynamic> _pendingWithdrawals = [];
  List<dynamic> _pendingLoans = [];
  List<dynamic> _pendingDeletions = [];
  List<dynamic> _limits = [];
  List<dynamic> _childTransactions = [];
  List<dynamic> _notifications = [];
  Map<String, dynamic>? _parentInfo;
  bool _loading = true;
  String? _loadError;
  int _notifUnreadCount = 0;
  bool _showNotifPanel = false;

  final _linkCodeController = TextEditingController();
  bool _linking = false;
  String? _linkError;
  String? _linkSuccess;

  final _limitControllers = <String, TextEditingController>{};
  final _limitApprovalTypes = <String, String>{};

  final Set<String> _expandedTxChildren = {};

  static const Color _indigo = Color(0xFF1a237e);
  static const Color _indigoLight = Color(0xFF5c6bc0);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
      _startNotifPolling();
    });
  }

  @override
  void dispose() {
    _linkCodeController.dispose();
    for (final c in _limitControllers.values) c.dispose();
    _notifTimer?.cancel();
    super.dispose();
  }

  Timer? _notifTimer;

  void _startNotifPolling() {
    _notifTimer?.cancel();
    _fetchNotifs();
    _notifTimer = Timer.periodic(const Duration(seconds: 30), (_) => _fetchNotifs());
  }

  void _fetchNotifs() {
    BankingApiService.parentGetNotifications().then((data) {
      if (!mounted || data == null) return;
      setState(() {
        _notifications = data['notifications'] as List<dynamic>? ?? [];
        _notifUnreadCount = data['unreadCount'] as int? ?? 0;
      });
    });
  }

  void _toggleNotifPanel() {
    setState(() => _showNotifPanel = !_showNotifPanel);
    if (_showNotifPanel && _notifUnreadCount > 0) {
      BankingApiService.parentMarkAllNotifRead();
      setState(() => _notifUnreadCount = 0);
    }
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _loadError = null; });
    try {
      final results = await Future.wait([
        BankingApiService.parentGetMe(),
        BankingApiService.parentGetChildren(),
        BankingApiService.parentGetPending(),
        BankingApiService.parentGetLimits(),
        BankingApiService.parentGetChildrenTransactions(),
        BankingApiService.parentGetPendingDeletions(),
        BankingApiService.parentGetNotifications(),
      ]).timeout(const Duration(seconds: 15));
      if (!mounted) return;
      setState(() {
        _parentInfo = results[0] as Map<String, dynamic>?;
        _children = results[1] as List<dynamic>? ?? [];
        final pending = results[2] as Map<String, dynamic>?;
        _pendingWithdrawals = pending?['withdrawals'] as List<dynamic>? ?? [];
        _pendingLoans = pending?['loans'] as List<dynamic>? ?? [];
        _limits = results[3] as List<dynamic>? ?? [];
        _childTransactions = results[4] as List<dynamic>? ?? [];
        _pendingDeletions = results[5] as List<dynamic>? ?? [];
        final notifData = results[6] as Map<String, dynamic>?;
        _notifications = notifData?['notifications'] as List<dynamic>? ?? [];
        _notifUnreadCount = notifData?['unreadCount'] as int? ?? 0;
        _loading = false;
      });
      _initLimitForms();
    } on TimeoutException {
      if (!mounted) return;
      setState(() { _loading = false; _loadError = 'Request timed out. Check your connection.'; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _loadError = 'Failed to load data: ${e.toString().length > 80 ? e.toString().substring(0, 80) : e.toString()}'; });
    }
  }

  void _initLimitForms() {
    for (final child in _children) {
      final aid = child['account_id'] as String?;
      if (aid == null) continue;
      final existing = _limits.cast<Map<String, dynamic>>().where((l) => l['child_account_id'] == aid).firstOrNull;
      _limitControllers[aid] = TextEditingController(
        text: existing != null ? (existing['max_daily_withdrawal'] as num?)?.toStringAsFixed(0) ?? '' : '',
      );
      _limitApprovalTypes[aid] = existing?['require_approval_for'] as String? ?? 'all';
    }
  }

  Future<void> _linkChild() async {
    final code = _linkCodeController.text.trim();
    if (code.isEmpty) { setState(() => _linkError = 'Enter the child\'s Member ID'); return; }
    setState(() { _linking = true; _linkError = null; _linkSuccess = null; });
    final ok = await BankingApiService.parentLinkChild(code);
    if (!mounted) return;
    if (ok) {
      setState(() {
        _linkSuccess = 'Child linked successfully!';
        _linkError = null;
        _linking = false;
        _linkCodeController.clear();
      });
      _loadData();
    } else {
      setState(() { _linkError = 'Invalid code or already linked.'; _linking = false; });
    }
  }

  Future<void> _approveWithdrawal(String requestId) async {
    final ok = await BankingApiService.parentApproveWithdrawal(requestId);
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Withdrawal approved!'), backgroundColor: AppTheme.primaryGreen));
      _loadData();
    }
  }

  Future<void> _rejectWithdrawal(String requestId) async {
    final ok = await BankingApiService.parentRejectWithdrawal(requestId);
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Withdrawal rejected'), backgroundColor: Colors.red));
      _loadData();
    }
  }

  Future<void> _approveLoan(String loanId) async {
    final ok = await BankingApiService.parentApproveLoan(loanId);
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Loan pre-approved! Admin will process disbursement.'), backgroundColor: AppTheme.primaryGreen));
      _loadData();
    }
  }

  Future<void> _rejectLoan(String loanId) async {
    final ok = await BankingApiService.parentRejectLoan(loanId);
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Loan rejected'), backgroundColor: Colors.red));
      _loadData();
    }
  }

  Future<void> _saveLimit(String childAccountId) async {
    final ctrl = _limitControllers[childAccountId];
    final maxWd = double.tryParse(ctrl?.text ?? '') ?? 0;
    final type = _limitApprovalTypes[childAccountId] ?? 'all';
    final ok = await BankingApiService.parentSaveLimits(childAccountId, maxDailyWithdrawal: maxWd, requireApprovalFor: type);
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Limits saved!'), backgroundColor: AppTheme.primaryGreen));
      _loadData();
    }
  }

  Future<void> _logout() async {
    const storage = FlutterSecureStorage();
    await storage.delete(key: 'parent_token');
    await storage.delete(key: 'parent_email');
    if (!mounted) return;
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const ParentLoginPage()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(_parentInfo?['display_name'] ?? 'Parent Portal'),
        backgroundColor: _indigo,
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          Stack(
            children: [
              IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: _toggleNotifPanel),
              if (_notifUnreadCount > 0)
                Positioned(right: 6, top: 6, child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                  child: Text('$_notifUnreadCount', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                )),
            ],
          ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _loadData),
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: Column(
        children: [
          if (_showNotifPanel) _buildNotifPanel(),
          Expanded(
            child: _loadError != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.cloud_off, color: Colors.grey.shade400, size: 56),
                          const SizedBox(height: 16),
                          Text(_loadError!, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade600, fontSize: 15)),
                          const SizedBox(height: 20),
                          ElevatedButton.icon(
                            onPressed: _loadData,
                            icon: const Icon(Icons.refresh),
                            label: const Text('Retry'),
                            style: ElevatedButton.styleFrom(backgroundColor: _indigo, foregroundColor: Colors.white),
                          ),
                        ],
                      ),
                    ),
                  )
                : _loading
                    ? const Center(child: CircularProgressIndicator())
                    : IndexedStack(
                        index: _currentIndex,
                        children: [
                          _buildDashboardTab(),
                          _buildChildrenTab(),
                          _buildSettingsTab(),
                        ],
                      ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 8, offset: const Offset(0, -2)),
          ],
        ),
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: (i) => setState(() => _currentIndex = i),
          backgroundColor: Colors.white,
          elevation: 0,
          indicatorColor: _indigo.withValues(alpha: 0.12),
          animationDuration: const Duration(milliseconds: 200),
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          height: MediaQuery.of(context).padding.bottom > 0 ? 72 : 64,
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              selectedIcon: Icon(Icons.dashboard),
              label: 'Dashboard',
            ),
            NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people),
              label: 'Children',
            ),
            NavigationDestination(
              icon: Icon(Icons.tune_outlined),
              selectedIcon: Icon(Icons.tune),
              label: 'Settings',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNotifPanel() {
    return Container(
      constraints: const BoxConstraints(maxHeight: 300),
      decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 8)]),
      child: _notifications.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: Text('No notifications', style: TextStyle(color: Colors.grey))),
            )
          : ListView.separated(
              shrinkWrap: true,
              itemCount: _notifications.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (ctx, i) {
                final n = _notifications[i];
                final isUnread = (n['is_read'] as int? ?? 1) == 0;
                return ListTile(
                  dense: true,
                  leading: Icon(_notifIcon(n['type'] as String? ?? ''), size: 20, color: _indigo),
                  title: Text('${n['title'] ?? ''}', style: TextStyle(fontSize: 13, fontWeight: isUnread ? FontWeight.bold : FontWeight.normal)),
                  subtitle: Text('${n['body'] ?? ''}', style: const TextStyle(fontSize: 11)),
                  trailing: Text(_formatNotifDate(n['created_at'] as String? ?? ''), style: TextStyle(color: Colors.grey.shade400, fontSize: 10)),
                  onTap: () => BankingApiService.parentMarkNotifRead(n['notif_id'] as String),
                );
              },
            ),
    );
  }

  IconData _notifIcon(String type) {
    switch (type) {
      case 'withdrawal_request': return Icons.money_off;
      case 'account_deletion': return Icons.delete_forever;
      case 'info': return Icons.info_outline;
      default: return Icons.notifications_outlined;
    }
  }

  String _formatNotifDate(String iso) {
    if (iso.length < 10) return iso;
    try {
      final d = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(d);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      if (diff.inDays < 1) return '${diff.inHours}h ago';
      return '${d.month}/${d.day}';
    } catch (_) {
      return iso.substring(0, 10);
    }
  }

  Widget _buildDashboardTab() {
    final totalPending = _pendingWithdrawals.length + _pendingLoans.length;
    final totalDeletions = _pendingDeletions.length;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: _indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.dashboard, color: _indigo, size: 22),
              ),
              const SizedBox(width: 12),
              Text('Dashboard', style: TextStyle(color: _indigo, fontSize: 20, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          Text('Welcome, ${_parentInfo?['display_name'] ?? 'Parent'}', style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
          const SizedBox(height: 20),

          // Summary cards
          Row(
            children: [
              Expanded(child: _summaryCard('Children', '${_children.length}', Icons.people, _indigoLight)),
              const SizedBox(width: 12),
              Expanded(child: _summaryCard('Pending', '$totalPending', Icons.hourglass_empty, Colors.orange.shade700)),
              const SizedBox(width: 12),
              Expanded(child: _summaryCard('Linked', '${_children.length}', Icons.link, AppTheme.primaryGreen)),
            ],
          ),
          const SizedBox(height: 24),

          // Pending approvals section
          Row(
            children: [
              const Icon(Icons.hourglass_empty, color: _indigo, size: 20),
              const SizedBox(width: 8),
              Text('Pending Approvals', style: TextStyle(color: _indigo, fontSize: 17, fontWeight: FontWeight.bold)),
              if (totalPending > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Colors.orange.shade600, borderRadius: BorderRadius.circular(20)),
                  child: Text('$totalPending', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Text('Review requests from your children', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
          const SizedBox(height: 12),
          if (totalPending == 0)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 40),
                child: Column(
                  children: [
                    Icon(Icons.check_circle_outline, color: Colors.grey.shade300, size: 64),
                    const SizedBox(height: 12),
                    Text('All caught up!', style: TextStyle(color: Colors.grey.shade500, fontSize: 16, fontWeight: FontWeight.w500)),
                    Text('No pending approvals', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
                  ],
                ),
              ),
            ),
          for (final w in _pendingWithdrawals) ...[
            _buildPendingCard(
              childName: w['child_name'] ?? 'Child',
              type: 'Withdrawal',
              amount: (w['amount'] as num?)?.toDouble() ?? 0,
              reason: w['reason'] as String? ?? '',
              date: w['created_at'] as String? ?? '',
              onApprove: () { final id = w['request_id'] as String?; if (id != null) _approveWithdrawal(id); },
              onReject: () { final id = w['request_id'] as String?; if (id != null) _rejectWithdrawal(id); },
              icon: Icons.money_off,
              color: Colors.orange,
            ),
            const SizedBox(height: 8),
          ],
          for (final l in _pendingLoans) ...[
            _buildPendingCard(
              childName: l['child_name'] ?? 'Child',
              type: 'Loan Application',
              amount: (l['principal'] as num?)?.toDouble() ?? 0,
              reason: 'Term: ${l['term_months']} months, ${l['interest_type'] ?? ''}',
              date: l['created_at'] as String? ?? '',
              onApprove: () { final id = l['loan_id'] as String?; if (id != null) _approveLoan(id); },
              onReject: () { final id = l['loan_id'] as String?; if (id != null) _rejectLoan(id); },
              icon: Icons.account_balance,
              color: Colors.blue,
            ),
            const SizedBox(height: 8),
          ],
          if (totalDeletions > 0) ...[
            const SizedBox(height: 24),
            Row(
              children: [
                const Icon(Icons.delete_forever, color: Colors.redAccent, size: 20),
                const SizedBox(width: 8),
                Text('Account Deletion Requests', style: TextStyle(color: Colors.red.shade700, fontSize: 17, fontWeight: FontWeight.bold)),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Colors.red.shade600, borderRadius: BorderRadius.circular(20)),
                  child: Text('$totalDeletions', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final d in _pendingDeletions) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.red.shade200),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.person, color: Colors.redAccent, size: 18),
                        const SizedBox(width: 8),
                        Text('${d['child_name'] ?? ''}', style: TextStyle(color: _indigo, fontWeight: FontWeight.w600, fontSize: 14)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    if ((d['reason'] as String?)?.isNotEmpty == true)
                      Text('Reason: ${d['reason']}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                    Text('Requested: ${_formatNotifDate(d['created_at'] as String? ?? '')}', style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
                  ],
                ),
              ),
              const SizedBox(height: 6),
            ],
          ],
        ],
      ),
    );
  }

  Widget _summaryCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 8),
          Text(value, style: TextStyle(color: color, fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _buildPendingCard({
    required String childName,
    required String type,
    required double amount,
    required String reason,
    required String date,
    required VoidCallback onApprove,
    required VoidCallback onReject,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$type — $childName', style: const TextStyle(color: _indigo, fontWeight: FontWeight.w600, fontSize: 14)),
                    Text('PHP ${amount.toStringAsFixed(2)}', style: const TextStyle(color: AppTheme.accentAmber, fontWeight: FontWeight.bold, fontSize: 16)),
                  ],
                ),
              ),
            ],
          ),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(reason, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          ],
          Text(date.length >= 10 ? date.substring(0, 10) : date, style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 40,
                  child: ElevatedButton.icon(
                    onPressed: onApprove,
                    icon: const Icon(Icons.check, size: 18),
                    label: const Text('Approve', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryGreen,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SizedBox(
                  height: 40,
                  child: ElevatedButton.icon(
                    onPressed: onReject,
                    icon: const Icon(Icons.close, size: 18),
                    label: const Text('Reject', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade600,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildChildTransactions(dynamic child) {
    final childId = child['account_id'] as String? ?? '';
    final childTx = _childTransactions.where((tx) {
      final txAccountId = tx['account_id'] as String? ?? tx['sender_id'] as String? ?? tx['receiver_id'] as String? ?? '';
      return txAccountId == childId;
    }).toList();
    final expanded = _expandedTxChildren.contains(childId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: () => setState(() {
            if (expanded) { _expandedTxChildren.remove(childId); } else { _expandedTxChildren.add(childId); }
          }),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Icon(expanded ? Icons.expand_less : Icons.expand_more, size: 18, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text('${childTx.length} recent transactions', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
              ],
            ),
          ),
        ),
        if (expanded) ...[
          if (childTx.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('No transactions found', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
            )
          else
            for (final tx in childTx.take(20)) ...[
              Container(
                margin: const EdgeInsets.only(top: 6),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(
                      tx['type'] == 'deposit' ? Icons.arrow_downward : Icons.arrow_upward,
                      size: 14,
                      color: tx['type'] == 'deposit' ? AppTheme.primaryGreen : Colors.redAccent,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${tx['description'] ?? tx['type'] ?? 'Transaction'}', style: TextStyle(color: _indigo, fontSize: 12)),
                          Text('${tx['created_at']?.toString()?.substring(0, 10) ?? ''}', style: TextStyle(color: Colors.grey.shade400, fontSize: 10)),
                        ],
                      ),
                    ),
                    Text(
                      'PHP ${(tx['amount'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                      style: TextStyle(
                        color: tx['type'] == 'deposit' ? AppTheme.primaryGreen : Colors.redAccent,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
        ],
      ],
    );
  }

  Widget _buildChildrenTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: _indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.people, color: _indigo, size: 22),
              ),
              const SizedBox(width: 12),
              Text('Your Children', style: TextStyle(color: _indigo, fontSize: 20, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 16),
          if (_children.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Column(
                  children: [
                    Icon(Icons.child_care, color: Colors.grey.shade300, size: 64),
                    const SizedBox(height: 12),
                    Text('No children linked yet', style: TextStyle(color: Colors.grey.shade500, fontSize: 16)),
                    const SizedBox(height: 4),
                    Text('Go to the Link section below to add', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
                  ],
                ),
              ),
            ),
          for (final child in _children) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.grey.shade200),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: _indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.person, color: _indigo, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${child['child_name'] ?? ''}', style: const TextStyle(color: _indigo, fontSize: 16, fontWeight: FontWeight.w600)),
                            Text('ID: ${child['member_id'] ?? ''}', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _statItem('Balance', 'PHP ${(child['actual_balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}', AppTheme.accentAmber),
                      const SizedBox(width: 16),
                      _statItem('XP', '${(child['current_xp'] as num?)?.toInt() ?? 0}', Colors.blue.shade600),
                      const SizedBox(width: 16),
                      _statItem('KYC', (child['kyc_status'] as String?) ?? 'none', Colors.grey.shade600),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Transactions toggle
                  _buildChildTransactions(child),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],

          // Link child section
          const SizedBox(height: 24),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: _indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.link, color: _indigo, size: 22),
              ),
              const SizedBox(width: 12),
              Text('Link a Child', style: TextStyle(color: _indigo, fontSize: 20, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Enter your child\'s Member ID to link their account.',
            style: TextStyle(color: Colors.grey.shade500, fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _linkCodeController,
            keyboardType: TextInputType.number,
            style: TextStyle(color: _indigo, fontSize: 18, letterSpacing: 4),
            textAlign: TextAlign.center,
            maxLength: 6,
            decoration: InputDecoration(
              hintText: '000001',
              hintStyle: TextStyle(color: Colors.grey.shade300, fontSize: 18, letterSpacing: 4),
              filled: true,
              fillColor: Colors.grey.shade50,
              counterText: '',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.grey.shade200)),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: _indigo.withValues(alpha: 0.8), width: 2),
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 20),
            ),
          ),
          if (_linkError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_linkError!, style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
            ),
          if (_linkSuccess != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_linkSuccess!, style: const TextStyle(color: Colors.green, fontSize: 13)),
            ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity, height: 52,
            child: ElevatedButton.icon(
              onPressed: _linking ? null : _linkChild,
              icon: _linking
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.link),
              label: Text(_linking ? 'Linking...' : 'Link Child Account'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _indigo,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ),
          if (_children.isNotEmpty) ...[
            const SizedBox(height: 32),
            const Divider(),
            const SizedBox(height: 12),
            Text('Already linked:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            const SizedBox(height: 8),
            for (final child in _children)
              Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, color: AppTheme.primaryGreen, size: 16),
                    const SizedBox(width: 8),
                    Text('${child['child_name']} (${child['member_id']})', style: TextStyle(color: _indigo, fontSize: 13)),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildSettingsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: _indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.tune, color: _indigo, size: 22),
              ),
              const SizedBox(width: 12),
              Text('Spending Limits', style: TextStyle(color: _indigo, fontSize: 20, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 4),
          Text('Set maximum amounts your child can transact without approval',
            style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
          const SizedBox(height: 16),
          if (_children.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Text('Link a child first to set limits',
                  style: TextStyle(color: Colors.grey.shade500, fontSize: 16)),
              ),
            ),
          for (final child in _children) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.grey.shade200),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(color: _indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                        child: const Icon(Icons.person, color: _indigo, size: 16),
                      ),
                      const SizedBox(width: 10),
                      Text(child['child_name'] ?? '', style: TextStyle(color: _indigo, fontSize: 15, fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: child['account_id'] is String ? _limitControllers[child['account_id'] as String] : null,
                    keyboardType: TextInputType.number,
                    style: TextStyle(color: _indigo, fontSize: 14),
                    decoration: InputDecoration(
                      labelText: 'Max daily withdrawal (PHP)',
                      labelStyle: TextStyle(color: Colors.grey.shade500),
                      prefixText: 'PHP ',
                      prefixStyle: TextStyle(color: _indigo),
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity, height: 44,
                    child: ElevatedButton(
                      onPressed: () { final id = child['account_id'] as String?; if (id != null) _saveLimit(id); },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _indigo,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Save Limits', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],

          const SizedBox(height: 32),
          const Divider(),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity, height: 52,
            child: OutlinedButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout, color: Colors.red),
              label: const Text('Logout', style: TextStyle(color: Colors.red, fontSize: 16, fontWeight: FontWeight.bold)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: Colors.red.shade200),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _statItem(String label, String value, Color color) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade500, fontSize: 11)),
          const SizedBox(height: 2),
          Text(value, style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
