import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import '../../core/theme/app_theme.dart';
import '../../core/services/security_service.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';
import 'login_page.dart';
import 'home_page.dart';
import 'change_password_page.dart';

class BiometricLoginPage extends StatefulWidget {
  const BiometricLoginPage({super.key});

  @override
  State<BiometricLoginPage> createState() => _BiometricLoginPageState();
}

class _BiometricLoginPageState extends State<BiometricLoginPage> {
  String? _username;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  Future<void> _init() async {
    _username = await SecurityService.getSavedUsername();
    if (mounted) {
      setState(() => _loading = false);
      _triggerBiometric();
    }
  }

  void _triggerBiometric() {
    setState(() {
      _loading = true;
      _error = null;
    });
    _bioLogin();
  }

  Future<void> _bioLogin() async {

    final authed = await SecurityService.authenticate(
      reason: 'Log in to LabCoop as ${_username ?? "Member"}',
    );
    if (!mounted) return;

    if (!authed) {
      setState(() {
        _loading = false;
        _error = 'Authentication failed';
      });
      return;
    }

    // If we already have a valid token, skip login API call
    const storage = FlutterSecureStorage();
    final existingToken = await storage.read(key: 'auth_token');
    if (existingToken != null) {
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomePage()),
      );
      return;
    }

    // No token — use saved password to re-login
    final password = await SecurityService.readBioPassword();
    if (password == null || password.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'No saved credentials. Please log in with your password.';
      });
      return;
    }

    // Log in with saved credentials
    try {
      await GetIt.instance<LocalDbSource>().clearAll();
      final api = GetIt.instance<RemoteApiSource>();
      final result = await api.login(password, memberId: _username ?? '');
      if (!mounted) return;
      final passwordChanged = result['passwordChanged'] as bool? ?? false;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) =>
              passwordChanged ? const HomePage() : const ChangePasswordPage(),
        ),
      );
    } on DioException catch (e) {
      final type = e.type;
      if (type == DioExceptionType.connectionTimeout ||
          type == DioExceptionType.receiveTimeout ||
          type == DioExceptionType.sendTimeout ||
          type == DioExceptionType.connectionError) {
        setState(() {
          _error = 'Cannot reach server. Check your internet.';
          _loading = false;
        });
        return;
      }
      setState(() {
        _error = 'Login failed. Please use your password.';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Something went wrong. Please use your password.';
        _loading = false;
      });
    }
  }

  void _goToPasswordLogin() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
  }

  Future<void> _changeMemberId() async {
    final cidController = TextEditingController();
    final pwController = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change Member ID'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: cidController,
              decoration: const InputDecoration(
                labelText: 'New Member ID',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: pwController,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Enter password to confirm',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (ok != true || cidController.text.trim().isEmpty || pwController.text.isEmpty) return;

    // Verify password and save new credentials
    try {
      final api = GetIt.instance<RemoteApiSource>();
      await api.login(pwController.text, memberId: cidController.text.trim());
      await SecurityService.setSavedUsername(cidController.text.trim());
      await SecurityService.saveBioPassword(pwController.text);
      if (mounted) {
        setState(() => _username = cidController.text.trim());
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Member ID updated'), behavior: SnackBarBehavior.floating),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Invalid password or Member ID'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
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
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 40),
                  Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.fingerprint,
                      color: Colors.white,
                      size: 56,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Quick Login',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Use your fingerprint to log in',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Colors.white60,
                        ),
                  ),
                  const SizedBox(height: 32),
                  if (_username != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.person, color: AppTheme.accentAmber, size: 20),
                          const SizedBox(width: 10),
                          Text(
                            _username!,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 24),
                  if (_loading)
                    const SizedBox(
                      width: 32, height: 32,
                      child: CircularProgressIndicator(color: AppTheme.accentAmber, strokeWidth: 3),
                    )
                  else ...[
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: _triggerBiometric,
                        icon: const Icon(Icons.fingerprint, color: AppTheme.textDark),
                        label: const Text(
                          'Tap to authenticate',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.accentAmber,
                          foregroundColor: AppTheme.textDark,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 4,
                        ),
                      ),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      style: TextStyle(color: Colors.orange.shade200, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const SizedBox(height: 24),
                  TextButton(
                    onPressed: _goToPasswordLogin,
                    child: const Text(
                      'Use password instead',
                      style: TextStyle(color: Colors.white38, fontSize: 13),
                    ),
                  ),
                  if (_username != null) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _changeMemberId,
                      child: const Text(
                        'Change Member ID',
                        style: TextStyle(color: Colors.white24, fontSize: 12),
                      ),
                    ),
                  ],
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
