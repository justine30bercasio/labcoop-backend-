import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:get_it/get_it.dart';
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
        birthCertBytes: await _birthCert!.readAsBytes(),
        birthCertFilename: _birthCert!.name,
      );
      setState(() { _success = true; _loading = false; });
    } catch (e) {
      setState(() { _error = 'Failed to submit KYC. Please try again.'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
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
                  Text('Upload a clear photo of your birth certificate', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
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
}
