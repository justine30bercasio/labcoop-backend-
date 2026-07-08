import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get_it/get_it.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';
import 'home_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _fadeScale;
  final _cidController = TextEditingController();
  final _cidFocus = FocusNode();
  bool _loading = false;
  String? _error;

  // PIN pad state
  final List<String> _pinDigits = ['', '', '', '', '', ''];
  int _pinIndex = 0;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    _fadeScale = CurvedAnimation(parent: _animController, curve: Curves.easeOutBack);
    _animController.forward();
    _cidFocus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _animController.dispose();
    _cidController.dispose();
    _cidFocus.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final cid = _cidController.text.trim();
    final pin = _pinDigits.join('');
    if (cid.isEmpty) {
      setState(() => _error = 'Please enter your Member ID');
      return;
    }
    if (pin.length < 6) {
      setState(() => _error = 'Please enter your 6-digit PIN');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await GetIt.instance<LocalDbSource>().clearAll();
      final api = GetIt.instance<RemoteApiSource>();
      final result = await api.login(pin, memberId: cid);
      if (!mounted) return;

      final pinChanged = result['pinChanged'] as bool? ?? false;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => const HomePage(),
        ),
      );
    } on DioException catch (e) {
      final type = e.type;
      if (type == DioExceptionType.connectionTimeout ||
          type == DioExceptionType.receiveTimeout ||
          type == DioExceptionType.sendTimeout ||
          type == DioExceptionType.connectionError) {
        setState(() {
          _error = 'Cannot reach server. Check your internet connection.';
          _loading = false;
        });
        return;
      }
      final statusCode = e.response?.statusCode;
      setState(() {
        if (statusCode == 429) {
          _error = e.response?.data?['message'] ?? 'Too many attempts. Try again later.';
        } else if (statusCode == 401 || statusCode == 404) {
          _error = 'Invalid Member ID or PIN. Please try again.';
        } else if (statusCode != null) {
          _error = 'Server error (HTTP $statusCode). Please try again.';
        } else {
          _error = 'Connection failed. Is the server running?';
        }
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Something went wrong. Please try again.';
        _loading = false;
      });
    }
  }

  void _onPinDigit(String digit) {
    if (_pinIndex >= 6 || _loading) return;
    HapticFeedback.lightImpact();
    setState(() {
      _pinDigits[_pinIndex] = digit;
      _pinIndex++;
      _error = null;
    });
    if (_pinIndex == 6) {
      // Auto-login when 6 digits entered
      Future.delayed(const Duration(milliseconds: 200), _login);
    }
  }

  void _onPinDelete() {
    if (_pinIndex <= 0 || _loading) return;
    HapticFeedback.lightImpact();
    setState(() {
      _pinIndex--;
      _pinDigits[_pinIndex] = '';
    });
  }

  void _clearPin() {
    setState(() {
      for (int i = 0; i < 6; i++) _pinDigits[i] = '';
      _pinIndex = 0;
      _error = null;
    });
  }

  InputDecoration _inputDecoration({
    required String hint,
    required IconData icon,
    required FocusNode focus,
  }) {
    final isFocused = focus.hasFocus;
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(
        color: Colors.white.withValues(alpha: isFocused ? 0.7 : 0.4),
        fontSize: 14,
      ),
      prefixIcon: Icon(icon, color: isFocused ? Colors.white : Colors.white.withValues(alpha: 0.5), size: 20),
      filled: true,
      fillColor: isFocused
          ? Colors.white.withValues(alpha: 0.2)
          : Colors.white.withValues(alpha: 0.1),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 1.8),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.textDark, Color(0xFF0D2818), AppTheme.primaryGreen],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: FadeTransition(
                opacity: _fadeScale,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 10),
                    _buildLogo(),
                    const SizedBox(height: 12),
                    Text(
                      'LabCoop',
                      style: TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: 1.5,
                        shadows: [
                          Shadow(
                            color: Colors.black.withValues(alpha: 0.3),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Save smarter. Play harder.',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.white.withValues(alpha: 0.6),
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.2),
                            blurRadius: 24,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          Text(
                            'Welcome Back!',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                              color: Colors.white.withValues(alpha: 0.9),
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Enter your Member ID & PIN',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.white.withValues(alpha: 0.5),
                            ),
                          ),
                          const SizedBox(height: 16),
                          // Member ID field
                          TextField(
                            autofocus: true,
                            focusNode: _cidFocus,
                            controller: _cidController,
                            style: const TextStyle(color: Colors.white, fontSize: 15),
                            cursorColor: AppTheme.accentAmber,
                            keyboardType: TextInputType.number,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) {
                              // Dismiss keyboard so PIN keypad is the only input
                              FocusScope.of(context).unfocus();
                              setState(() {});
                            },
                            onChanged: (_) => setState(() {}),
                            decoration: _inputDecoration(
                              hint: 'Member ID (e.g. 000001)',
                              icon: Icons.badge_outlined,
                              focus: _cidFocus,
                            ),
                          ),
                          const SizedBox(height: 16),

                          // PIN dots display (tap to dismiss keyboard)
                          GestureDetector(
                            onTap: () => FocusScope.of(context).unfocus(),
                            child: _buildPinDots(),
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
                                child: Row(
                                  children: [
                                    Icon(Icons.error_outline, color: Colors.orange.shade200, size: 16),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(
                                        _error!,
                                        style: TextStyle(color: Colors.orange.shade200, fontSize: 12),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),

                          const SizedBox(height: 8),

                          // PIN Keypad
                          _buildPinKeypad(),

                          const SizedBox(height: 8),

                          // Login button (manual fallback)
                          SizedBox(
                            width: double.infinity,
                            height: 44,
                            child: ElevatedButton(
                              onPressed: _loading ? null : _login,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.accentAmber,
                                foregroundColor: AppTheme.textDark,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                elevation: 4,
                                shadowColor: AppTheme.accentAmber.withValues(alpha: 0.4),
                              ),
                              child: _loading
                                  ? const SizedBox(
                                      width: 20, height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: AppTheme.textDark,
                                      ),
                                    )
                                  : const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          'Login',
                                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                                        ),
                                        SizedBox(width: 4),
                                        Icon(Icons.arrow_forward_rounded, size: 16),
                                      ],
                                    ),
                            ),
                          ),

                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.store, size: 14, color: AppTheme.accentAmber),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(
                                    'No account? Visit your cooperative branch to register',
                                    style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11),
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
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

  Widget _buildPinDots() {
    return Column(
      children: [
        Text(
          'Enter your PIN',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.6),
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(6, (i) {
            final filled = i < _pinIndex;
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 5),
              width: 36,
              height: 42,
              decoration: BoxDecoration(
                color: filled
                    ? AppTheme.accentAmber.withValues(alpha: 0.3)
                    : Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: filled
                      ? AppTheme.accentAmber.withValues(alpha: 0.6)
                      : Colors.white.withValues(alpha: 0.15),
                  width: 1.5,
                ),
              ),
              child: Center(
                child: filled
                    ? Container(
                        width: 12,
                        height: 12,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppTheme.accentAmber,
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            );
          }),
        ),
      ],
    );
  }

  Widget _buildPinKeypad() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _pinKey('1'), _pinKey('2'), _pinKey('3'),
          ],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _pinKey('4'), _pinKey('5'), _pinKey('6'),
          ],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _pinKey('7'), _pinKey('8'), _pinKey('9'),
          ],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _pinActionKey(Icons.backspace_outlined, _onPinDelete),
            _pinKey('0'),
            _pinActionKey(Icons.clear_all_rounded, _clearPin),
          ],
        ),
      ],
    );
  }

  Widget _pinKey(String digit) {
    return Padding(
      padding: const EdgeInsets.all(3),
      child: SizedBox(
        width: 56,
        height: 48,
        child: Material(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => _onPinDigit(digit),
            child: Center(
              child: Text(
                digit,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _pinActionKey(IconData icon, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.all(3),
      child: SizedBox(
        width: 56,
        height: 48,
        child: Material(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Center(
              child: Icon(icon, color: Colors.white.withValues(alpha: 0.7), size: 20),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLogo() {
    return Container(
      width: 90,
      height: 90,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: AppTheme.accentAmber.withValues(alpha: 0.25),
            blurRadius: 20,
            spreadRadius: 2,
          ),
        ],
      ),
      child: ClipOval(
        child: Image.asset(
          'assets/images/applicationLogo.png',
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            color: Colors.white.withValues(alpha: 0.1),
            child: Icon(Icons.account_balance, color: Colors.white.withValues(alpha: 0.5), size: 40),
          ),
        ),
      ),
    );
  }
}
