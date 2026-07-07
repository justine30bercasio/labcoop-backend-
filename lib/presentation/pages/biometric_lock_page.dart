import 'package:flutter/material.dart';
import 'package:labcoop/core/services/security_service.dart';
import 'splash_page.dart';

/// A lock screen that requires biometric authentication (fingerprint / face ID)
/// before the user can access the app.
///
/// Shown when bio metric lock is enabled and the app starts or resumes.
class BiometricLockPage extends StatefulWidget {
  const BiometricLockPage({super.key});

  @override
  State<BiometricLockPage> createState() => _BiometricLockPageState();
}

class _BiometricLockPageState extends State<BiometricLockPage> {
  bool _authenticating = false;
  String _message = 'Tap to unlock';

  @override
  void initState() {
    super.initState();
    // Attempt biometric auth immediately on show
    WidgetsBinding.instance.addPostFrameCallback((_) => _authenticate());
  }

  Future<void> _authenticate() async {
    if (_authenticating) return;
    setState(() {
      _authenticating = true;
      _message = 'Authenticating…';
    });

    final success = await SecurityService.authenticate(
      reason: 'Unlock LabCoop to access your savings',
    );

    if (!mounted) return;

    if (success) {
      // Navigate to splash (which will route to home/dashboard)
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const SplashPage()),
      );
    } else {
      setState(() {
        _authenticating = false;
        _message = 'Authentication failed. Tap to try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A2E),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.fingerprint,
                  color: Colors.white,
                  size: 48,
                ),
              ),
              const SizedBox(height: 32),
              Text(
                'LabCoop Locked',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 12),
              Text(
                'Use your fingerprint or face ID to unlock the app',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.white60,
                    ),
              ),
              const SizedBox(height: 40),
              SizedBox(
                width: 200,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: _authenticating ? null : _authenticate,
                  icon: Icon(
                    _authenticating ? Icons.hourglass_top : Icons.lock_open,
                    color: Colors.white,
                  ),
                  label: Text(
                    _message,
                    style: const TextStyle(color: Colors.white),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.indigoAccent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              TextButton(
                onPressed: () {
                  // Fallback: go to login (user must re-enter credentials)
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => const SplashPage()),
                  );
                },
                child: const Text(
                  'Use password instead',
                  style: TextStyle(color: Colors.white38, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
