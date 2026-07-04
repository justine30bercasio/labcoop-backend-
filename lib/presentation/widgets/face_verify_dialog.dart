import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import '../../core/theme/app_theme.dart';
import '../../data/services/face_auth_service.dart';
import 'liveness_detector.dart';

class FaceVerifyDialog extends StatefulWidget {
  final String accountId;
  final String action;
  final double amount;
  final VoidCallback onVerified;
  final VoidCallback? onCancel;

  const FaceVerifyDialog({
    super.key,
    required this.accountId,
    required this.action,
    required this.amount,
    required this.onVerified,
    this.onCancel,
  });

  static Future<void> show({
    required BuildContext context,
    required String accountId,
    required String action,
    required double amount,
    required VoidCallback onVerified,
  }) {
    return showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => FaceVerifyDialog(
        accountId: accountId,
        action: action,
        amount: amount,
        onVerified: () {
          Navigator.pop(ctx);
          onVerified();
        },
        onCancel: () => Navigator.pop(ctx),
      ),
    );
  }

  @override
  State<FaceVerifyDialog> createState() => _FaceVerifyDialogState();
}

class _FaceVerifyDialogState extends State<FaceVerifyDialog> {
  final _faceAuth = GetIt.instance<FaceAuthService>();
  bool _verifying = false;
  String? _error;

  Future<void> _onLivenessComplete(Uint8List bytes, List<double> signature) async {
    setState(() {
      _verifying = true;
      _error = null;
    });

    try {
      final result = await _faceAuth.verify(
        accountId: widget.accountId,
        selfieBytes: bytes,
        faceSignature: signature,
      );

      if (mounted) {
        if (result['success'] == true) {
          widget.onVerified();
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
    if (_verifying) {
      return AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        content: const SizedBox(
          height: 100,
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (_error != null) {
      return AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Verification Failed'),
        content: Text(_error!),
        actions: [
          TextButton(
            onPressed: () {
              setState(() => _error = null);
            },
            child: const Text('Try Again'),
          ),
          TextButton(
            onPressed: widget.onCancel ?? () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      );
    }

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: const Text('Face Verification Required'),
      content: SizedBox(
        width: double.maxFinite,
        height: 400,
        child: Column(
          children: [
            Icon(Icons.face, size: 48, color: AppTheme.primaryGreen),
            const SizedBox(height: 12),
            Text(
              widget.action,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              'Amount: ₱${widget.amount.toStringAsFixed(2)}',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 16),
            const Divider(),
            Expanded(
              child: LivenessDetector(
                onComplete: _onLivenessComplete,
                onCancel: widget.onCancel,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
