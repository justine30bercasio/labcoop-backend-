import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/remote_api_source.dart';
import '../../data/services/face_auth_service.dart';
import '../widgets/liveness_detector.dart';

class FaceLoginScreen extends StatefulWidget {
  const FaceLoginScreen({super.key});

  @override
  State<FaceLoginScreen> createState() => _FaceLoginScreenState();
}

class _FaceLoginScreenState extends State<FaceLoginScreen> {
  final _faceAuth = GetIt.instance<FaceAuthService>();
  final _api = GetIt.instance<RemoteApiSource>();
  bool _verifying = false;
  String? _error;
  String? _memberIdController;
  bool _checkingStatus = true;
  bool _faceEnrolled = false;

  @override
  void initState() {
    super.initState();
    _checkFaceStatus();
  }

  Future<void> _checkFaceStatus() async {
    final session = await _api.getStoredSession();
    if (session == null) {
      if (mounted) setState(() => _checkingStatus = false);
      return;
    }
    try {
      final status = await _faceAuth.getStatus(session['accountId']!);
      if (mounted) {
        setState(() {
          _faceEnrolled = status['enrolled'] == true;
          _checkingStatus = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _checkingStatus = false);
    }
  }

  Future<void> _onLivenessComplete(Uint8List bytes, List<double> signature) async {
    setState(() {
      _verifying = true;
      _error = null;
    });

    try {
      final session = await _api.getStoredSession();
      if (session == null) {
        if (mounted) setState(() => _error = 'Session expired. Please login with password first.');
        return;
      }

      final result = await _faceAuth.verify(
        accountId: session['accountId']!,
        selfieBytes: bytes,
        faceSignature: signature,
      );

      if (mounted) {
        if (result['success'] == true) {
          Navigator.pushReplacementNamed(context, '/home');
        } else {
          setState(() {
            _verifying = false;
            _error = result['message'] ?? 'Face verification failed.';
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _verifying = false;
          _error = 'Verification failed. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checkingStatus) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!_faceEnrolled) {
      return Scaffold(
        appBar: AppBar(title: const Text('Face Login')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.face, size: 80, color: Colors.grey.shade400),
                const SizedBox(height: 24),
                const Text(
                  'Face login not set up yet',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                Text(
                  'Please set up face recognition first in your profile settings.',
                  style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryGreen,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Go Back'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (_verifying) {
      return Scaffold(
        appBar: AppBar(title: const Text('Face Login')),
        body: const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 24),
              Text('Verifying your face...', style: TextStyle(fontSize: 16)),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Face Login')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, color: Colors.red, size: 64),
                const SizedBox(height: 16),
                Text(_error!, style: const TextStyle(fontSize: 16), textAlign: TextAlign.center),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => setState(() => _error = null),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryGreen,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Try Again'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Use Password Instead'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return LivenessDetector(
      onComplete: _onLivenessComplete,
      onCancel: () => Navigator.pop(context),
    );
  }
}
