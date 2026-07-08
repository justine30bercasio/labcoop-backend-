import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/services.dart';
import '../../core/theme/app_theme.dart';
import '../../core/network/banking_api_service.dart';
import 'parent_login_page.dart';

class ParentDashboardPage extends StatefulWidget {
  const ParentDashboardPage({super.key});

  @override
  State<ParentDashboardPage> createState() => _ParentDashboardPageState();
}

class _ParentDashboardPageState extends State<ParentDashboardPage> {
  List<dynamic> _children = [];
  List<dynamic> _pendingWithdrawals = [];
  List<dynamic> _pendingLoans = [];
  List<dynamic> _limits = [];
  Map<String, dynamic>? _parentInfo;
  bool _loading = true;
  int _tabIndex = 0;

  // Link child state
  final _linkCodeController = TextEditingController();
  bool _linking = false;
  String? _linkError;
  String? _linkSuccess;

  // Limit form state
  final _limitControllers = <String, TextEditingController>{};
  final _limitApprovalTypes = <String, String>{};

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _linkCodeController.dispose();
    for (final c in _limitControllers.values) c.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        BankingApiService.parentGetMe(),
        BankingApiService.parentGetChildren(),
        BankingApiService.parentGetPending(),
        BankingApiService.parentGetLimits(),
      ]);
      if (!mounted) return;
      setState(() {
        _parentInfo = results[0] as Map<String, dynamic>?;
        _children = results[1] as List<dynamic>? ?? [];
        final pending = results[2] as Map<String, dynamic>?;
        _pendingWithdrawals = pending?['withdrawals'] as List<dynamic>? ?? [];
        _pendingLoans = pending?['loans'] as List<dynamic>? ?? [];
        _limits = results[3] as List<dynamic>? ?? [];
        _loading = false;
      });
      _initLimitForms();
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  void _initLimitForms() {
    for (final child in _children) {
      final aid = child['account_id'] as String;
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
      appBar: AppBar(
        title: Text(_parentInfo?['display_name'] ?? 'Parent Portal'),
        backgroundColor: const Color(0xFF1a237e),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _loadData,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _logout,
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF1a237e), Color(0xFF283593)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: Colors.white))
            : Column(
                children: [
                  // Tab bar
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Row(
                      children: [
                        _tabItem('Pending', Icons.hourglass_empty, 0),
                        const SizedBox(width: 8),
                        _tabItem('Children', Icons.family_restroom, 1),
                        const SizedBox(width: 8),
                        _tabItem('Limits', Icons.tune, 2),
                        const SizedBox(width: 8),
                        _tabItem('Link Child', Icons.link, 3),
                      ],
                    ),
                  ),
                  Expanded(child: _buildTabContent()),
                ],
              ),
      ),
    );
  }

  Widget _tabItem(String label, IconData icon, int index) {
    final active = _tabIndex == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tabIndex = index),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: active ? Colors.white.withValues(alpha: 0.15) : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: active ? Colors.white.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.08)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: active ? Colors.white : Colors.white.withValues(alpha: 0.5), size: 20),
              const SizedBox(height: 2),
              Text(label, style: TextStyle(color: active ? Colors.white : Colors.white.withValues(alpha: 0.5), fontSize: 10, fontWeight: active ? FontWeight.w600 : FontWeight.normal)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTabContent() {
    switch (_tabIndex) {
      case 0: return _buildPendingTab();
      case 1: return _buildChildrenTab();
      case 2: return _buildLimitsTab();
      case 3: return _buildLinkTab();
      default: return const SizedBox();
    }
  }

  Widget _buildPendingTab() {
    final totalPending = _pendingWithdrawals.length + _pendingLoans.length;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.hourglass_empty, color: Colors.white, size: 22),
              const SizedBox(width: 8),
              Text('Pending Approvals', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              if (totalPending > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(20)),
                  child: Text('$totalPending', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Text('Review and approve or reject your child\'s requests',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
          const SizedBox(height: 16),
          if (totalPending == 0)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Column(
                  children: [
                    Icon(Icons.check_circle_outline, color: Colors.white.withValues(alpha: 0.3), size: 64),
                    const SizedBox(height: 12),
                    Text('No pending approvals', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 16)),
                    Text('All requests have been handled', style: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 13)),
                  ],
                ),
              ),
            ),
          // Withdrawal requests
          for (final w in _pendingWithdrawals) ...[
            _buildPendingCard(
              childName: w['child_name'] ?? 'Child',
              type: 'Withdrawal',
              amount: (w['amount'] as num?)?.toDouble() ?? 0,
              reason: w['reason'] as String? ?? '',
              date: w['created_at'] as String? ?? '',
              onApprove: () => _approveWithdrawal(w['request_id'] as String),
              onReject: () => _rejectWithdrawal(w['request_id'] as String),
              icon: Icons.money_off,
              color: Colors.orange,
            ),
            const SizedBox(height: 8),
          ],
          // Loan applications
          for (final l in _pendingLoans) ...[
            _buildPendingCard(
              childName: l['child_name'] ?? 'Child',
              type: 'Loan Application',
              amount: (l['principal'] as num?)?.toDouble() ?? 0,
              reason: 'Term: ${l['term_months']} months, ${l['interest_type'] ?? ''}',
              date: l['created_at'] as String? ?? '',
              onApprove: () => _approveLoan(l['loan_id'] as String),
              onReject: () => _rejectLoan(l['loan_id'] as String),
              icon: Icons.account_balance,
              color: Colors.blue,
            ),
            const SizedBox(height: 8),
          ],
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
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$type — $childName', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14)),
                    Text('PHP ${amount.toStringAsFixed(2)}', style: TextStyle(color: AppTheme.accentAmber, fontWeight: FontWeight.bold, fontSize: 16)),
                  ],
                ),
              ),
            ],
          ),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(reason, style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 12)),
          ],
          Text(date.length >= 10 ? date.substring(0, 10) : date,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 11)),
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

  Widget _buildChildrenTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.family_restroom, color: Colors.white, size: 22),
              const SizedBox(width: 8),
              Text('Your Children', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 12),
          if (_children.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Column(
                  children: [
                    Icon(Icons.child_care, color: Colors.white.withValues(alpha: 0.3), size: 64),
                    const SizedBox(height: 12),
                    Text('No children linked yet', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 16)),
                    Text('Go to Link Child tab to add', style: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 13)),
                  ],
                ),
              ),
            ),
          for (final child in _children) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: AppTheme.primaryGreen.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.person, color: AppTheme.primaryGreen, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(child['child_name'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
                            Text('ID: ${child['member_id'] ?? ''}', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
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
                      _statItem('XP', '${(child['current_xp'] as num?)?.toInt() ?? 0}', Colors.blue),
                      const SizedBox(width: 16),
                      _statItem('KYC', (child['kyc_status'] as String?) ?? 'none', Colors.white70),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  Widget _statItem(String label, String value, Color color) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11)),
          const SizedBox(height: 2),
          Text(value, style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildLimitsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.tune, color: Colors.white, size: 22),
              const SizedBox(width: 8),
              Text('Spending Limits', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 4),
          Text('Set maximum amounts your child can transact without approval',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
          const SizedBox(height: 16),
          if (_children.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Text('Link a child first to set limits',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 16)),
              ),
            ),
          for (final child in _children) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(child['child_name'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _limitControllers[child['account_id'] as String],
                    keyboardType: TextInputType.number,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(
                      labelText: 'Max daily withdrawal (PHP)',
                      labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.5)),
                      prefixText: 'PHP ',
                      prefixStyle: const TextStyle(color: Colors.white),
                      filled: true,
                      fillColor: Colors.white.withValues(alpha: 0.1),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity, height: 44,
                    child: ElevatedButton(
                      onPressed: () => _saveLimit(child['account_id'] as String),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryGreen,
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
        ],
      ),
    );
  }

  Widget _buildLinkTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.link, color: Colors.white, size: 22),
              const SizedBox(width: 8),
              Text('Link Your Child', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Enter your child\'s Member ID to link their account to yours.\n'
            'You can find this in your child\'s profile or on their passbook.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _linkCodeController,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: Colors.white, fontSize: 18, letterSpacing: 4),
            textAlign: TextAlign.center,
            maxLength: 6,
            decoration: InputDecoration(
              hintText: '000001',
              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 18, letterSpacing: 4),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.1),
              counterText: '',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 2),
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
              child: Text(_linkSuccess!, style: const TextStyle(color: Colors.greenAccent, fontSize: 13)),
            ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity, height: 52,
            child: ElevatedButton.icon(
              onPressed: _linking ? null : _linkChild,
              icon: _linking
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.link),
              label: Text(_linking ? 'Linking...' : 'Link Child Account'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accentAmber,
                foregroundColor: AppTheme.textDark,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ),
          if (_children.isNotEmpty) ...[
            const SizedBox(height: 32),
            const Divider(color: Colors.white24),
            const SizedBox(height: 12),
            Text('Already linked:', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 8),
            for (final child in _children)
              Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, color: AppTheme.primaryGreen, size: 16),
                    const SizedBox(width: 8),
                    Text('${child['child_name']} (${child['member_id']})',
                      style: const TextStyle(color: Colors.white, fontSize: 13)),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}
