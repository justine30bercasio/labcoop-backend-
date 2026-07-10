import 'dart:async';
import 'dart:io';
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
  List<dynamic> _pendingConsents = [];
  List<dynamic> _pendingDeletions = [];
  List<dynamic> _limits = [];
  List<dynamic> _childTransactions = [];
  Map<String, dynamic>? _parentInfo;
  bool _loading = true;
  String? _loadError;
  int _notifUnreadCount = 0;

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

  Future<void> _fetchNotifs() async {
    // Try lightweight unread-count endpoint first
    try {
      final count = await BankingApiService.parentGetUnreadCount();
      if (mounted) {
        if (count >= 0) {
          stderr.writeln('[ParentNotif] unread-count: $count');
          setState(() => _notifUnreadCount = count);
          return;
        }
        stderr.writeln('[ParentNotif] unread-count returned $count, falling back');
      }
    } catch (_) {}
    // Fallback: get full notification list
    try {
      final data = await BankingApiService.parentGetNotifications();
      if (mounted && data != null) {
        final count = data['unreadCount'] as int? ?? 0;
        stderr.writeln('[ParentNotif] fallback unread-count: $count');
        setState(() => _notifUnreadCount = count);
      }
    } catch (e) {
      stderr.writeln('[ParentNotif] fallback failed: $e');
    }
  }

  void _openNotifPage() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const _ParentNotificationListPage()),
    );
    if (changed == true && mounted) _fetchNotifs();
  }

  String _fmtDate(String iso) {
    if (iso.isEmpty) return '';
    try {
      final dt = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.month}/${dt.day}';
    } catch (_) {
      return '';
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
        _pendingConsents = pending?['pendingConsents'] as List<dynamic>? ?? [];
        _limits = results[3] as List<dynamic>? ?? [];
        _childTransactions = results[4] as List<dynamic>? ?? [];
        _pendingDeletions = results[5] as List<dynamic>? ?? [];
        _notifUnreadCount = (results[6] as Map<String, dynamic>?)?['unreadCount'] as int? ?? 0;
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

  Future<void> _approveConsent(String accountId) async {
    final ok = await BankingApiService.parentApproveConsent(accountId);
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Consent approved!'), backgroundColor: AppTheme.primaryGreen));
      _loadData();
    }
  }

  Future<void> _rejectConsent(String accountId) async {
    final ok = await BankingApiService.parentRejectConsent(accountId);
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Consent rejected'), backgroundColor: Colors.red));
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
            clipBehavior: Clip.none,
            children: [
              IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: _openNotifPage),
              if (_notifUnreadCount > 0)
                Positioned(right: 6, top: 6, child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                  constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                  child: Text(_notifUnreadCount > 99 ? '99+' : '$_notifUnreadCount', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
                )),
            ],
          ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loading ? null : _loadData),
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: _loadError != null
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
                    _buildApprovalsTab(),
                    _buildProfileTab(),
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
              icon: Icon(Icons.hourglass_bottom_outlined),
              selectedIcon: Icon(Icons.hourglass_bottom),
              label: 'Approvals',
            ),
            NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDashboardTab() {
    final totalPending = _pendingWithdrawals.length + _pendingLoans.length;
    final totalConsents = _pendingConsents.length;
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
          if (totalConsents > 0) ...[
            const SizedBox(height: 24),
            Row(
              children: [
                const Icon(Icons.family_restroom, color: Color(0xFFD97706), size: 20),
                const SizedBox(width: 8),
                Text('Consent Requests', style: TextStyle(color: Color(0xFFD97706), fontSize: 17, fontWeight: FontWeight.bold)),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Color(0xFFD97706), borderRadius: BorderRadius.circular(20)),
                  child: Text('$totalConsents', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final c in _pendingConsents) ...[
              _buildPendingCard(
                childName: c['child_name'] ?? 'Child',
                type: 'Consent Request',
                amount: 0,
                reason: 'Needs parental approval to submit KYC documents',
                date: c['created_at'] as String? ?? '',
                onApprove: () { final id = c['account_id'] as String?; if (id != null) _approveConsent(id); },
                onReject: () { final id = c['account_id'] as String?; if (id != null) _rejectConsent(id); },
                icon: Icons.family_restroom,
                color: const Color(0xFFD97706),
              ),
              const SizedBox(height: 8),
            ],
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
                    Text('Requested: ${_fmtDate(d['created_at'] as String? ?? '')}', style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
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

  Widget _buildApprovalsTab() {
    final totalConsents = _pendingConsents.length;
    final totalWithdrawals = _pendingWithdrawals.length;
    final totalLoans = _pendingLoans.length;
    final totalDeletions = _pendingDeletions.length;
    final hasAny = totalConsents + totalWithdrawals + totalLoans + totalDeletions > 0;
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
                child: const Icon(Icons.hourglass_bottom, color: _indigo, size: 22),
              ),
              const SizedBox(width: 12),
              Text('Approvals', style: TextStyle(color: _indigo, fontSize: 20, fontWeight: FontWeight.bold)),
              if (hasAny) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Colors.orange.shade600, borderRadius: BorderRadius.circular(20)),
                  child: Text('${totalConsents + totalWithdrawals + totalLoans}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Text('Review and respond to requests from your children',
            style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
          const SizedBox(height: 16),
          if (!hasAny)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
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
          if (totalConsents > 0) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.family_restroom, color: Color(0xFFD97706), size: 18),
                  const SizedBox(width: 6),
                  Text('Consent Requests ($totalConsents)', style: const TextStyle(color: Color(0xFFD97706), fontSize: 15, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            for (final c in _pendingConsents) ...[
              _buildPendingCard(
                childName: c['child_name'] ?? 'Child',
                type: 'Consent Request',
                amount: 0,
                reason: 'Needs parental approval to submit KYC documents',
                date: c['created_at'] as String? ?? '',
                onApprove: () { final id = c['account_id'] as String?; if (id != null) _approveConsent(id); },
                onReject: () { final id = c['account_id'] as String?; if (id != null) _rejectConsent(id); },
                icon: Icons.family_restroom,
                color: const Color(0xFFD97706),
              ),
              const SizedBox(height: 8),
            ],
            if (totalWithdrawals + totalLoans > 0) const SizedBox(height: 16),
          ],
          if (totalWithdrawals > 0) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.money_off, color: Colors.orange, size: 18),
                  const SizedBox(width: 6),
                  Text('Withdrawal Requests ($totalWithdrawals)', style: TextStyle(color: Colors.orange.shade700, fontSize: 15, fontWeight: FontWeight.bold)),
                ],
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
            if (totalLoans > 0) const SizedBox(height: 16),
          ],
          if (totalLoans > 0) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.account_balance, color: Colors.blue, size: 18),
                  const SizedBox(width: 6),
                  Text('Loan Applications ($totalLoans)', style: TextStyle(color: Colors.blue.shade700, fontSize: 15, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
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
          ],
          if (totalDeletions > 0) ...[
            if (totalConsents + totalWithdrawals + totalLoans > 0) const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.delete_forever, color: Colors.redAccent, size: 18),
                  const SizedBox(width: 6),
                  Text('Account Deletion Requests ($totalDeletions)', style: TextStyle(color: Colors.red.shade700, fontSize: 15, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
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
                    Text('Requested: ${_fmtDate(d['created_at'] as String? ?? '')}', style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],
          ],
          if (!hasAny) const SizedBox(height: 40),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _buildProfileTab() {
    final nameCtrl = TextEditingController(text: _parentInfo?['display_name'] as String? ?? '');
    final phoneCtrl = TextEditingController(text: _parentInfo?['phone'] as String? ?? '');
    final addressCtrl = TextEditingController(text: _parentInfo?['address'] as String? ?? '');
    final cityCtrl = TextEditingController(text: _parentInfo?['city'] as String? ?? '');
    final provinceCtrl = TextEditingController(text: _parentInfo?['province'] as String? ?? '');
    final postalCtrl = TextEditingController(text: _parentInfo?['postal_code'] as String? ?? '');
    bool _saving = false;
    String? _saveMsg;
    String? _saveError;

    // ── Old PIN ──
    final oldPinCtrl = TextEditingController();
    final newPinCtrl = TextEditingController();
    bool _changingPin = false;
    String? _pinMsg;
    String? _pinError;

    return StatefulBuilder(
      builder: (context, setLocalState) => SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: _indigo.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.person, color: _indigo, size: 22),
                ),
                const SizedBox(width: 12),
                Text('My Profile', style: TextStyle(color: _indigo, fontSize: 20, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 4),
            Text('${_parentInfo?['email'] ?? ''}', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
            const SizedBox(height: 20),

            // ── Display Name ──
            TextField(
              controller: nameCtrl,
              style: TextStyle(color: _indigo, fontSize: 14),
              decoration: InputDecoration(
                labelText: 'Display Name',
                labelStyle: TextStyle(color: Colors.grey.shade500),
                filled: true, fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 12),
            // ── Phone ──
            TextField(
              controller: phoneCtrl,
              style: TextStyle(color: _indigo, fontSize: 14),
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: 'Mobile Number',
                labelStyle: TextStyle(color: Colors.grey.shade500),
                filled: true, fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 12),
            // ── Address ──
            TextField(
              controller: addressCtrl,
              style: TextStyle(color: _indigo, fontSize: 14),
              decoration: InputDecoration(
                labelText: 'Address',
                labelStyle: TextStyle(color: Colors.grey.shade500),
                filled: true, fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: TextField(
                  controller: cityCtrl,
                  style: TextStyle(color: _indigo, fontSize: 14),
                  decoration: InputDecoration(
                    labelText: 'City',
                    labelStyle: TextStyle(color: Colors.grey.shade500),
                    filled: true, fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                  ),
                )),
                const SizedBox(width: 12),
                Expanded(child: TextField(
                  controller: provinceCtrl,
                  style: TextStyle(color: _indigo, fontSize: 14),
                  decoration: InputDecoration(
                    labelText: 'Province',
                    labelStyle: TextStyle(color: Colors.grey.shade500),
                    filled: true, fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                  ),
                )),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: postalCtrl,
              style: TextStyle(color: _indigo, fontSize: 14),
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Postal Code',
                labelStyle: TextStyle(color: Colors.grey.shade500),
                filled: true, fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 16),
            if (_saveMsg != null)
              Container(
                width: double.infinity, padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_saveMsg!, style: TextStyle(color: Colors.green.shade800, fontSize: 13)),
              ),
            if (_saveError != null)
              Container(
                width: double.infinity, padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_saveError!, style: TextStyle(color: Colors.red.shade800, fontSize: 13)),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity, height: 44,
              child: ElevatedButton(
                onPressed: _saving ? null : () async {
                  setLocalState(() { _saving = true; _saveMsg = null; _saveError = null; });
                  final ok = await BankingApiService.parentUpdateProfile(
                    displayName: nameCtrl.text,
                    phone: phoneCtrl.text,
                    address: addressCtrl.text,
                    city: cityCtrl.text,
                    province: provinceCtrl.text,
                    postalCode: postalCtrl.text,
                  );
                  if (!mounted) return;
                  setLocalState(() {
                    _saving = false;
                    if (ok) { _saveMsg = 'Profile updated!'; } else { _saveError = 'Failed to save.'; }
                  });
                  if (ok) _loadData();
                },
                style: ElevatedButton.styleFrom(backgroundColor: _indigo, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: _saving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Save Profile', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),

            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 16),

            // ── Change PIN ──
            Row(
              children: [
                const Icon(Icons.lock_outline, color: _indigo, size: 20),
                const SizedBox(width: 8),
                Text('Change PIN', style: TextStyle(color: _indigo, fontSize: 17, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: oldPinCtrl,
              obscureText: true,
              maxLength: 6,
              keyboardType: TextInputType.number,
              style: TextStyle(color: _indigo, fontSize: 14),
              decoration: InputDecoration(
                labelText: 'Current PIN',
                labelStyle: TextStyle(color: Colors.grey.shade500),
                filled: true, fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: newPinCtrl,
              obscureText: true,
              maxLength: 6,
              keyboardType: TextInputType.number,
              style: TextStyle(color: _indigo, fontSize: 14),
              decoration: InputDecoration(
                labelText: 'New PIN (6 digits)',
                labelStyle: TextStyle(color: Colors.grey.shade500),
                filled: true, fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            if (_pinMsg != null)
              Container(
                width: double.infinity, padding: const EdgeInsets.all(10), margin: const EdgeInsets.only(top: 8),
                decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_pinMsg!, style: TextStyle(color: Colors.green.shade800, fontSize: 13)),
              ),
            if (_pinError != null)
              Container(
                width: double.infinity, padding: const EdgeInsets.all(10), margin: const EdgeInsets.only(top: 8),
                decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_pinError!, style: TextStyle(color: Colors.red.shade800, fontSize: 13)),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity, height: 44,
              child: ElevatedButton(
                onPressed: _changingPin ? null : () async {
                  if (oldPinCtrl.text.length != 6 || newPinCtrl.text.length != 6) {
                    setLocalState(() { _pinError = 'PIN must be exactly 6 digits'; _pinMsg = null; });
                    return;
                  }
                  setLocalState(() { _changingPin = true; _pinMsg = null; _pinError = null; });
                  final ok = await BankingApiService.parentChangePin(oldPinCtrl.text, newPinCtrl.text);
                  if (!mounted) return;
                  setLocalState(() {
                    _changingPin = false;
                    if (ok) { _pinMsg = 'PIN changed!'; oldPinCtrl.clear(); newPinCtrl.clear(); }
                    else { _pinError = 'Current PIN is incorrect.'; }
                  });
                },
                style: ElevatedButton.styleFrom(backgroundColor: _indigo, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: _changingPin ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Change PIN', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),

            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 16),

            // ── Link Child ──
            Row(
              children: [
                const Icon(Icons.link, color: _indigo, size: 20),
                const SizedBox(width: 8),
                Text('Link a Child', style: TextStyle(color: _indigo, fontSize: 17, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 12),
            Text('Enter the 6-digit code shown in your child\'s app under Settings → Link Parent.',
              style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
            const SizedBox(height: 8),
            TextField(
              controller: _linkCodeController,
              maxLength: 6,
              keyboardType: TextInputType.number,
              style: TextStyle(color: _indigo, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Enter 6-digit code',
                hintStyle: TextStyle(color: Colors.grey.shade400),
                filled: true, fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            if (_linkError != null)
              Container(
                width: double.infinity, padding: const EdgeInsets.all(10), margin: const EdgeInsets.only(top: 8),
                decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_linkError!, style: TextStyle(color: Colors.red.shade800, fontSize: 13)),
              ),
            if (_linkSuccess != null)
              Container(
                width: double.infinity, padding: const EdgeInsets.all(10), margin: const EdgeInsets.only(top: 8),
                decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_linkSuccess!, style: TextStyle(color: Colors.green.shade800, fontSize: 13)),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity, height: 44,
              child: ElevatedButton(
                onPressed: _linking ? null : _linkChild,
                style: ElevatedButton.styleFrom(backgroundColor: _indigo, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: _linking ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Link Child', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),

            const SizedBox(height: 24),
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

class _ParentNotificationListPage extends StatefulWidget {
  const _ParentNotificationListPage();

  @override
  State<_ParentNotificationListPage> createState() => _ParentNotificationListPageState();
}

class _ParentNotificationListPageState extends State<_ParentNotificationListPage> {
  List<dynamic> _notifications = [];
  bool _loading = true;
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    try {
      final data = await BankingApiService.parentGetNotifications();
      if (mounted) {
        setState(() {
          _notifications = (data?['notifications'] as List<dynamic>?) ?? [];
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _notifId(dynamic n) {
    final id = n['notif_id'];
    return id is String ? id : id.toString();
  }

  void _markRead(dynamic n) {
    final notifId = _notifId(n);
    setState(() {
      final idx = _notifications.indexWhere((x) => _notifId(x) == notifId);
      if (idx >= 0) _notifications[idx] = {...(_notifications[idx] as Map), 'is_read': 1};
    });
    _changed = true;
    BankingApiService.parentMarkNotifRead(notifId).catchError((e) {
      stderr.writeln('Failed to mark $notifId as read: $e');
    });
  }

  void _showDetail(dynamic n) {
    final isRead = n['is_read'] == 1;
    final title = n['title'] as String? ?? '';
    final body = n['body'] as String? ?? '';
    final createdAt = n['created_at'] as String? ?? '';
    if (!isRead) _markRead(n);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (body.isNotEmpty) ...[
                Text(body, style: const TextStyle(fontSize: 15, height: 1.4)),
                const SizedBox(height: 12),
              ],
              Text(_formatDate(createdAt), style: const TextStyle(color: Colors.grey, fontSize: 12)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Close')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).pop(_changed),
          ),
          title: const Text('Notifications', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFF1a237e),
          foregroundColor: Colors.white,
          iconTheme: const IconThemeData(color: Colors.white),
          elevation: 0,
          actions: [
            if (_notifications.any((n) => n['is_read'] == 0))
              TextButton(
                onPressed: () async {
                  try {
                    await BankingApiService.parentMarkAllNotifRead();
                    _changed = true;
                    _fetch();
                  } catch (_) {}
                },
                child: const Text('Mark all read', style: TextStyle(color: Colors.white70)),
              ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator(color: Color(0xFF1a237e)))
            : _notifications.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.notifications_none, size: 64, color: Colors.grey),
                        SizedBox(height: 8),
                        Text('No notifications yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    color: const Color(0xFF1a237e),
                    onRefresh: _fetch,
                    child: ListView.separated(
                      itemCount: _notifications.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, i) {
                        final n = _notifications[i];
                        final isRead = n['is_read'] == 1;
                        final title = n['title'] as String? ?? '';
                        final body = n['body'] as String? ?? '';
                        final createdAt = n['created_at'] as String? ?? '';
                        return ListTile(
                          leading: Icon(
                            isRead ? Icons.notifications_none : Icons.notifications_active,
                            color: isRead ? Colors.grey : Colors.orange,
                          ),
                          title: Text(
                            title,
                            style: TextStyle(fontWeight: isRead ? FontWeight.normal : FontWeight.bold),
                          ),
                          subtitle: body.isNotEmpty ? Text(body, maxLines: 2, overflow: TextOverflow.ellipsis) : null,
                          trailing: Text(_formatDate(createdAt), style: const TextStyle(color: Colors.grey, fontSize: 12)),
                          onTap: () => _showDetail(n),
                        );
                      },
                    ),
                  ),
      ),
    );
  }

  String _formatDate(String iso) {
    if (iso.isEmpty) return '';
    try {
      final dt = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.month}/${dt.day}';
    } catch (_) {
      return '';
    }
  }
}
