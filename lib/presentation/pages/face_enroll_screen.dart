import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/face_auth_service.dart';
import '../widgets/liveness_detector.dart';

class FaceEnrollScreen extends StatefulWidget {
  final String accountId;
  final String childName;

  const FaceEnrollScreen({
    super.key,
    required this.accountId,
    required this.childName,
  });

  @override
  State<FaceEnrollScreen> createState() => _FaceEnrollScreenState();
}

class _FaceEnrollScreenState extends State<FaceEnrollScreen> {
  final _faceAuth = GetIt.instance<FaceAuthService>();
  bool _enrolling = false;
  bool _enrolled = false;
  String? _error;

  Future<void> _onLivenessComplete(Uint8List bytes, List<double> signature) async {
    setState(() {
      _enrolling = true;
      _error = null;
    });

    try {
      await _faceAuth.enroll(
        accountId: widget.accountId,
        selfieBytes: bytes,
        faceSignature: signature,
      );
      if (mounted) {
        setState(() {
          _enrolling = false;
          _enrolled = true;
        });
      }
    } catch (e) {
      if (mounted) {
        String msg = 'Failed to enroll face. Please try again.';
        try {
          final dioErr = e as dynamic;
          if (dioErr.response?.data?['message'] != null) {
            msg = dioErr.response!.data['message'];
          }
        } catch (_) {}
        setState(() {
          _enrolling = false;
          _error = msg;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_enrolled) {
      return Scaffold(
        appBar: AppBar(title: const Text('Face Setup')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, color: AppTheme.primaryGreen, size: 80),
                const SizedBox(height: 24),
                const Text(
                  'Face registered successfully!',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                Text(
                  'You can now use your face to log in and verify important transactions.',
                  style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context, true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryGreen,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Done'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (_enrolling) {
      return Scaffold(
        appBar: AppBar(title: const Text('Face Setup')),
        body: const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 24),
              Text('Enrolling your face...', style: TextStyle(fontSize: 16)),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Face Setup')),
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
                ElevatedButton.icon(
                  onPressed: () => setState(() => _error = null),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try Again'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryGreen,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
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
