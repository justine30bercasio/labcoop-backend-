import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/services.dart';
import '../../core/theme/app_theme.dart';
import '../../core/network/banking_api_service.dart';
import 'parent_dashboard_page.dart';

class ParentLoginPage extends StatefulWidget {
  const ParentLoginPage({super.key});

  @override
  State<ParentLoginPage> createState() => _ParentLoginPageState();
}

class _ParentLoginPageState extends State<ParentLoginPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _fadeSlide;
  int _mode = 0; // 0=login, 1=register
  final _emailController = TextEditingController();
  final _nameController = TextEditingController();

  // PIN state (for login)
  final List<String> _pinDigits = ['', '', '', '', '', ''];
  int _pinIndex = 0;

  // Register PIN (2 sets for confirmation)
  final List<String> _regPin1 = ['', '', '', '', '', ''];
  int _regPin1Index = 0;
  final List<String> _regPin2 = ['', '', '', '', '', ''];
  int _regPin2Index = 0;
  bool _confirmingPin = false;

  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 800),
    );
    _fadeSlide = CurvedAnimation(parent: _animController, curve: Curves.easeOutCubic);
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    _emailController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _clearPin() {
    setState(() {
      if (_mode == 0) {
        for (int i = 0; i < 6; i++) _pinDigits[i] = '';
        _pinIndex = 0;
      } else if (!_confirmingPin) {
        for (int i = 0; i < 6; i++) _regPin1[i] = '';
        _regPin1Index = 0;
      } else {
        for (int i = 0; i < 6; i++) _regPin2[i] = '';
        _regPin2Index = 0;
      }
    });
  }

  void _onPinDigit(String digit) {
    if (_loading) return;
    HapticFeedback.lightImpact();
    setState(() { _error = null; });
    if (_mode == 0) {
      if (_pinIndex >= 6) return;
      _pinDigits[_pinIndex] = digit;
      _pinIndex++;
      if (_pinIndex == 6) Future.delayed(const Duration(milliseconds: 200), _doLogin);
    } else if (!_confirmingPin) {
      if (_regPin1Index >= 6) return;
      _regPin1[_regPin1Index] = digit;
      _regPin1Index++;
      if (_regPin1Index == 6) {
        Future.delayed(const Duration(milliseconds: 300), () {
          setState(() => _confirmingPin = true);
        });
      }
    } else {
      if (_regPin2Index >= 6) return;
      _regPin2[_regPin2Index] = digit;
      _regPin2Index++;
      if (_regPin2Index == 6) Future.delayed(const Duration(milliseconds: 200), _doRegister);
    }
  }

  void _onPinDelete() {
    if (_loading) return;
    HapticFeedback.lightImpact();
    setState(() {
      if (_mode == 0) {
        if (_pinIndex <= 0) return;
        _pinIndex--;
        _pinDigits[_pinIndex] = '';
      } else if (!_confirmingPin) {
        if (_regPin1Index <= 0) return;
        _regPin1Index--;
        _regPin1[_regPin1Index] = '';
      } else {
        if (_regPin2Index <= 0) return;
        _regPin2Index--;
        _regPin2[_regPin2Index] = '';
      }
    });
  }

  Future<void> _doLogin() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) { setState(() => _error = 'Enter your email'); return; }
    final pin = _pinDigits.join('');
    if (pin.length < 6) { setState(() => _error = 'Enter your 6-digit PIN'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      final result = await BankingApiService.parentLogin(email, pin);
      if (!mounted) return;
      if (result == null || result['token'] == null) {
        setState(() { _error = 'Invalid email or PIN'; _loading = false; });
        return;
      }
      const storage = FlutterSecureStorage();
      await storage.write(key: 'parent_token', value: result['token'] as String);
      await storage.write(key: 'parent_email', value: email);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const ParentDashboardPage()));
    } catch (e) {
      setState(() { _error = 'Connection error'; _loading = false; });
    }
  }

  Future<void> _doRegister() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) { setState(() => _error = 'Enter your email'); return; }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      setState(() => _error = 'Enter a valid email'); return;
    }
    final pin1 = _regPin1.join('');
    final pin2 = _regPin2.join('');
    if (pin1.length < 6) { setState(() => _error = 'Enter your 6-digit PIN'); return; }
    if (pin1 != pin2) { setState(() => _error = 'PINs do not match'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      final displayName = _nameController.text.trim();
      final result = await BankingApiService.parentRegister(email, pin1, displayName: displayName);
      if (!mounted) return;
      if (result == null || result['token'] == null) {
        setState(() { _error = 'Registration failed. Email may already be registered.'; _loading = false; });
        return;
      }
      const storage = FlutterSecureStorage();
      await storage.write(key: 'parent_token', value: result['token'] as String);
      await storage.write(key: 'parent_email', value: email);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const ParentDashboardPage()));
    } catch (e) {
      setState(() { _error = 'Connection error'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF1a237e), Color(0xFF283593), Color(0xFF3949ab)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: FadeTransition(
                opacity: _fadeSlide,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 10),
                    Container(
                      width: 80, height: 80,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.15),
                      ),
                      child: const Icon(Icons.family_restroom, size: 44, color: Colors.white),
                    ),
                    const SizedBox(height: 16),
                    const Text('Parent Portal',
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 1)),
                    const SizedBox(height: 4),
                    Text(_mode == 0 ? 'Monitor & approve your child\'s transactions' : 'Create your parent account',
                      style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.6))),
                    const SizedBox(height: 24),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                      ),
                      child: Column(
                        children: [
                          // Mode toggle
                          Row(
                            children: [
                              Expanded(
                                child: _modeButton('Login', 0),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _modeButton('Register', 1),
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          TextField(
                            controller: _emailController,
                            style: const TextStyle(color: Colors.white, fontSize: 14),
                            cursorColor: Colors.white70,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              hintText: 'Email address',
                              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 14),
                              prefixIcon: Icon(Icons.email_outlined, color: Colors.white.withValues(alpha: 0.5), size: 20),
                              filled: true,
                              fillColor: Colors.white.withValues(alpha: 0.1),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 1.8),
                              ),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                            ),
                          ),

                          if (_mode == 1) ...[
                            const SizedBox(height: 12),
                            TextField(
                              controller: _nameController,
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              cursorColor: Colors.white70,
                              decoration: InputDecoration(
                                hintText: 'Your name (optional)',
                                hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 14),
                                prefixIcon: Icon(Icons.person_outline, color: Colors.white.withValues(alpha: 0.5), size: 20),
                                filled: true, fillColor: Colors.white.withValues(alpha: 0.1),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 1.8),
                                ),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              _confirmingPin ? 'Confirm your PIN' : 'Create your 6-digit PIN',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 12),
                            ),
                          ],

                          const SizedBox(height: 16),
                          // PIN Dots
                          GestureDetector(
                            onTap: () => FocusScope.of(context).unfocus(),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: List.generate(6, (i) {
                                final filled = _mode == 0
                                    ? i < _pinIndex
                                    : !_confirmingPin
                                        ? i < _regPin1Index
                                        : i < _regPin2Index;
                                return Container(
                                  margin: const EdgeInsets.symmetric(horizontal: 4),
                                  width: 34, height: 40,
                                  decoration: BoxDecoration(
                                    color: filled
                                        ? AppTheme.accentAmber.withValues(alpha: 0.3)
                                        : Colors.white.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(
                                      color: filled ? AppTheme.accentAmber.withValues(alpha: 0.6) : Colors.white.withValues(alpha: 0.15),
                                      width: 1.5,
                                    ),
                                  ),
                                  child: Center(
                                    child: filled
                                        ? Container(width: 10, height: 10, decoration: const BoxDecoration(shape: BoxShape.circle, color: AppTheme.accentAmber))
                                        : const SizedBox.shrink(),
                                  ),
                                );
                              }),
                            ),
                          ),

                          // PIN keys for registration flow
                          if (_confirmingPin && _mode == 1)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text('Re-enter PIN to confirm',
                                style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11)),
                            ),

                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(
                                  color: Colors.red.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                                ),
                                child: Text(_error!, style: TextStyle(color: Colors.orange.shade200, fontSize: 12)),
                              ),
                            ),

                          const SizedBox(height: 12),
                          _buildPinKeypad(),

                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity, height: 44,
                            child: ElevatedButton(
                              onPressed: _loading ? null : (_mode == 0 ? _doLogin : _doRegister),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.accentAmber,
                                foregroundColor: AppTheme.textDark,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                elevation: 4,
                              ),
                              child: _loading
                                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.textDark))
                                  : Text(_mode == 0 ? 'Login as Parent' : 'Create Account', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: Text('← Back to Child Login', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13)),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _modeButton(String label, int mode) {
    final active = _mode == mode;
    return GestureDetector(
      onTap: () {
        setState(() {
          _mode = mode;
          _error = null;
          _clearPin();
          _confirmingPin = false;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: active ? Colors.white.withValues(alpha: 0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: active ? Colors.white.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.1)),
        ),
        child: Center(
          child: Text(label,
            style: TextStyle(color: active ? Colors.white : Colors.white.withValues(alpha: 0.5), fontWeight: active ? FontWeight.w600 : FontWeight.normal, fontSize: 14)),
        ),
      ),
    );
  }

  Widget _buildPinKeypad() {
    return Column(
      children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [_pinKey('1'), _pinKey('2'), _pinKey('3')]),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [_pinKey('4'), _pinKey('5'), _pinKey('6')]),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [_pinKey('7'), _pinKey('8'), _pinKey('9')]),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          _pinActionKey(Icons.backspace_outlined, _onPinDelete),
          _pinKey('0'),
          _pinActionKey(Icons.clear_all_rounded, _clearPin),
        ]),
      ],
    );
  }

  Widget _pinKey(String digit) {
    return Padding(
      padding: const EdgeInsets.all(3),
      child: SizedBox(
        width: 56, height: 48,
        child: Material(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => _onPinDigit(digit),
            child: Center(child: Text(digit, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w600))),
          ),
        ),
      ),
    );
  }

  Widget _pinActionKey(IconData icon, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.all(3),
      child: SizedBox(
        width: 56, height: 48,
        child: Material(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Center(child: Icon(icon, color: Colors.white.withValues(alpha: 0.7), size: 20)),
          ),
        ),
      ),
    );
  }
}
