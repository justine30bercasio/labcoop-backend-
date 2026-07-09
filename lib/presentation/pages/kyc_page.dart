import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:get_it/get_it.dart';
import '../../core/network/banking_api_service.dart';
import '../../data/datasources/remote_api_source.dart';
import '../widgets/kyc_selfie_capture.dart';

class KycPage extends StatefulWidget {
  const KycPage({super.key});

  @override
  State<KycPage> createState() => _KycPageState();
}

class _KycPageState extends State<KycPage> {
  final _picker = ImagePicker();
  final _selfieCaptureKey = GlobalKey<KycSelfieCaptureState>();
  XFile? _birthCert;
  bool _loading = false;
  String? _error;
  bool _success = false;
  String _kycStatus = '';
  String _consentStatus = 'none';
  bool _checkingStatus = true;
  bool _requestingConsent = false;
  String? _consentMessage;
  Timer? _consentPollTimer;

  @override
  void initState() {
    super.initState();
    _checkExistingStatus();
  }

  @override
  void dispose() {
    _consentPollTimer?.cancel();
    super.dispose();
  }

  void _startConsentPolling() {
    _consentPollTimer?.cancel();
    _consentPollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_consentStatus == 'pending' && mounted) {
        _checkExistingStatus();
      } else {
        _consentPollTimer?.cancel();
      }
    });
  }

  Future<void> _checkExistingStatus() async {
    try {
      final api = GetIt.instance<RemoteApiSource>();
      final status = await api.getKycStatus();
      if (!mounted) return;
      final newConsent = status['consent_status']?.toString() ?? 'none';
      if (newConsent == 'pending') _startConsentPolling();
      setState(() {
        _kycStatus = status['kyc_status']?.toString() ?? '';
        _consentStatus = newConsent;
        _checkingStatus = false;
      });
    } catch (_) {
      if (mounted) setState(() => _checkingStatus = false);
    }
  }

  Future<void> _requestConsent() async {
    setState(() { _requestingConsent = true; _error = null; _consentMessage = null; });
    final result = await BankingApiService.requestParentConsent();
    if (!mounted) return;
    if (result == null) {
      setState(() { _error = 'Failed to send request. Try again.'; _requestingConsent = false; });
      return;
    }
    setState(() {
      _consentStatus = 'pending';
      _consentMessage = result['message'] as String? ?? 'Request sent!';
      _requestingConsent = false;
    });
  }

  Future<void> _pickBirthCert() async {
    final x = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (x != null) setState(() => _birthCert = x);
  }

  Future<void> _submit() async {
    final selfieBytes = _selfieCaptureKey.currentState?.validatedImageBytes;
    final selfieName = _selfieCaptureKey.currentState?.imageFilename ?? 'selfie.jpg';
    if (selfieBytes == null && _birthCert == null) {
      setState(() => _error = 'Please take a valid selfie (face detected and centered) and/or upload a birth certificate');
      return;
    }

    setState(() { _loading = true; _error = null; });

    try {
      final api = GetIt.instance<RemoteApiSource>();
      await api.submitKyc(
        selfieBytes: selfieBytes ?? Uint8List(0),
        selfieFilename: selfieName,
        birthCertBytes: _birthCert != null ? await _birthCert!.readAsBytes() : null,
        birthCertFilename: _birthCert?.name ?? 'birth_cert.jpg',
      );
      setState(() { _success = true; _loading = false; });
    } catch (e) {
      String msg = 'Failed to submit KYC. Please try again.';
      try {
        final dioErr = e as dynamic;
        if (dioErr.response?.data?['message'] != null) {
          msg = dioErr.response!.data['message'];
        }
      } catch (_) {}
      setState(() { _error = msg; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checkingStatus) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    // ── Consent required — show request button ──
    if (_consentStatus == 'none') {
      return Scaffold(
        backgroundColor: const Color(0xFFFFFBEB),
        appBar: AppBar(
          title: const Text('Parent Consent Required', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFFF59E0B),
          iconTheme: const IconThemeData(color: Colors.white),
          elevation: 0,
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Column(
            children: [
              Container(
                width: 100, height: 100,
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: const Color(0xFFFDE68A), width: 2),
                ),
                child: const Icon(Icons.family_restroom, color: Color(0xFFD97706), size: 48),
              ),
              const SizedBox(height: 28),
              const Text('Parental Consent Needed', textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1F2937))),
              const SizedBox(height: 10),
              Text(
                'Before submitting KYC documents, your parent needs to approve via the Parent Portal.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.5),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity, height: 52,
                child: ElevatedButton.icon(
                  onPressed: _requestingConsent ? null : _requestConsent,
                  icon: _requestingConsent
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send),
                  label: Text(_requestingConsent ? 'Sending Request...' : 'Send Request to Parent'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFD97706),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              if (_consentMessage != null) ...[
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFBBF7D0)),
                  ),
                  child: Text(_consentMessage!, style: const TextStyle(color: Color(0xFF166534), fontSize: 13)),
                ),
              ],
            ],
          ),
        ),
      );
    }

    // ── Consent Pending — waiting for parent ──
    if (_consentStatus == 'pending') {
      return Scaffold(
        backgroundColor: const Color(0xFFFFFBEB),
        appBar: AppBar(
          title: const Text('Waiting for Parent', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFFF59E0B),
          iconTheme: const IconThemeData(color: Colors.white),
          elevation: 0,
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Column(
            children: [
              Container(
                width: 100, height: 100,
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: const Icon(Icons.hourglass_empty, color: Color(0xFFD97706), size: 48),
              ),
              const SizedBox(height: 28),
              const Text('Waiting for Approval', textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1F2937))),
              const SizedBox(height: 10),
              Text(
                'Your parent needs to approve your consent request in the Parent Portal.\nAsk them to check their notifications.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.5),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity, height: 52,
                child: ElevatedButton.icon(
                  onPressed: () {
                    setState(() { _checkingStatus = true; _consentStatus = 'none'; _kycStatus = ''; });
                    _checkExistingStatus();
                  },
                  icon: const Icon(Icons.refresh),
                  label: const Text('Check Status'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFD97706),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // ── KYC already verified ──
    if (_kycStatus == 'verified') {
      return Scaffold(
        backgroundColor: const Color(0xFFF0FDF4),
        appBar: AppBar(
          title: const Text('Already Verified', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFF2E7D32),
          iconTheme: const IconThemeData(color: Colors.white),
          elevation: 0,
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Column(
            children: [
              // ── decorative icon ──
              Container(
                width: 100, height: 100,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF2E7D32), Color(0xFF1B5E20)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(color: const Color(0xFF2E7D32).withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8)),
                  ],
                ),
                child: const Icon(Icons.check_circle, color: Colors.white, size: 44),
              ),
              const SizedBox(height: 36),
              // ── main card ──
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 24, offset: const Offset(0, 8)),
                    BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2)),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
                  child: Column(
                    children: [
                      // ── status badge ──
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE8F5E9),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.verified, size: 16, color: Color(0xFF2E7D32)),
                            SizedBox(width: 6),
                            Text('APPROVED', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1, color: Color(0xFF2E7D32))),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Text('Identity Verified!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1F2937))),
                      const SizedBox(height: 10),
                      Text(
                        'Your identity has been verified. You can now use all banking features.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.5),
                      ),
                      const SizedBox(height: 32),
                      // ── progress stepper ──
                      _kycStepper(2),
                      const SizedBox(height: 32),
                      // ── done button ──
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(context),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2E7D32),
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                          ),
                          child: const Text('Done'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_kycStatus == 'pending') {
      return Scaffold(
        backgroundColor: const Color(0xFFFFFBEB),
        appBar: AppBar(
          title: const Text('Under Review', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFFF59E0B),
          iconTheme: const IconThemeData(color: Colors.white),
          elevation: 0,
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Column(
            children: [
              // ── decorative icon ──
              Container(
                width: 100, height: 100,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFF59E0B), Color(0xFFF97316)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(color: const Color(0xFFF59E0B).withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8)),
                  ],
                ),
                child: const Icon(Icons.hourglass_empty, color: Colors.white, size: 44),
              ),
              const SizedBox(height: 36),
              // ── main card ──
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 24, offset: const Offset(0, 8)),
                    BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2)),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
                  child: Column(
                    children: [
                      // ── status badge ──
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.schedule, size: 16, color: Color(0xFFD97706)),
                            SizedBox(width: 6),
                            Text('UNDER REVIEW', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1, color: Color(0xFFD97706))),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Text('KYC Under Review', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1F2937))),
                      const SizedBox(height: 10),
                      Text(
                        'Your documents are being reviewed by our team. This usually takes 1–2 business days.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.5),
                      ),
                      const SizedBox(height: 32),
                      // ── progress stepper ──
                      _kycStepper(1),
                      const SizedBox(height: 32),
                      // ── back button ──
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(context),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFF59E0B),
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                          ),
                          child: const Text('Back'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              // ── info footer ──
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFFDE68A)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: Color(0xFFD97706)),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'You\'ll be notified once your identity is verified.',
                        style: TextStyle(fontSize: 12, color: Color(0xFF92400E), height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_success) {
      return Scaffold(
        backgroundColor: const Color(0xFFF5F0E8),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, size: 80, color: Colors.green),
                const SizedBox(height: 16),
                const Text('KYC Submitted!', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF3E2723))),
                const SizedBox(height: 8),
                const Text('Your documents are under review. We will notify you once verified.', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: Color(0xFF6D4C41))),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF8B4513), foregroundColor: Colors.white),
                  child: const Text('Done'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF5F0E8),
      appBar: AppBar(
        title: const Text('Verify Identity', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF2E7D32),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.verified_user, size: 48, color: Color(0xFF2E7D32)),
            const SizedBox(height: 8),
            const Text('Identity Verification', textAlign: TextAlign.center, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF3E2723))),
            const SizedBox(height: 4),
            const Text('Please take a clear selfie and upload your birth certificate.', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: Color(0xFF6D4C41))),
            const SizedBox(height: 24),

            // Selfie with face detection
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.face, size: 20, color: Color(0xFF2E7D32)),
                      const SizedBox(width: 8),
                      const Text('Face Verification', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF3E2723))),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('Position your face in the center with good lighting. Keep your eyes open.', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 12),
                  KycSelfieCapture(key: _selfieCaptureKey),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Birth Cert
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.description, size: 20, color: Color(0xFF2E7D32)),
                      const SizedBox(width: 8),
                      const Text('Birth Certificate', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF3E2723))),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('Upload a clear photo of your birth certificate (optional)', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 12),
                  if (_birthCert != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.file(File(_birthCert!.path), height: 120, width: double.infinity, fit: BoxFit.cover),
                    ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _pickBirthCert,
                    icon: Icon(_birthCert != null ? Icons.refresh : Icons.upload_file, size: 18),
                    label: Text(_birthCert != null ? 'Change File' : 'Upload Birth Certificate'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF2E7D32),
                      side: const BorderSide(color: Color(0xFF2E7D32)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            if (_error != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.red.shade200)),
                child: Text(_error!, style: TextStyle(color: Colors.red.shade800, fontSize: 13)),
              ),

            SizedBox(
              height: 52,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2E7D32),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _loading
                    ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Submit for Verification', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kycStepper(int activeStep) {
    final steps = ['Submit', 'Review', 'Approved'];
    return Row(
      children: List.generate(steps.length * 2 - 1, (i) {
        if (i.isOdd) {
          final stepIdx = i ~/ 2;
          final done = stepIdx < activeStep;
          return Expanded(
            child: Container(
              height: 3,
              decoration: BoxDecoration(
                color: done ? const Color(0xFF2E7D32) : Colors.grey.shade200,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }
        final stepIdx = i ~/ 2;
        final isActive = stepIdx == activeStep;
        final done = stepIdx < activeStep;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done
                    ? const Color(0xFF2E7D32)
                    : isActive
                        ? const Color(0xFFF59E0B)
                        : Colors.grey.shade200,
                boxShadow: isActive
                    ? [BoxShadow(color: const Color(0xFFF59E0B).withValues(alpha: 0.4), blurRadius: 8)]
                    : [],
              ),
              child: Center(
                child: done
                    ? const Icon(Icons.check, color: Colors.white, size: 18)
                    : isActive
                        ? const SizedBox(
                            width: 16, height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                          )
                        : Text('${stepIdx + 1}', style: TextStyle(color: Colors.grey.shade500, fontWeight: FontWeight.w600, fontSize: 14)),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              steps[stepIdx],
              style: TextStyle(
                fontSize: 11,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                color: isActive ? const Color(0xFFF59E0B) : done ? const Color(0xFF2E7D32) : Colors.grey.shade400,
              ),
            ),
          ],
        );
      }),
    );
  }
}
