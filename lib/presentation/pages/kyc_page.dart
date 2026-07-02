import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:get_it/get_it.dart';
import '../../data/datasources/remote_api_source.dart';

class KycPage extends StatefulWidget {
  const KycPage({super.key});

  @override
  State<KycPage> createState() => _KycPageState();
}

class _KycPageState extends State<KycPage> {
  final _picker = ImagePicker();
  XFile? _selfie;
  XFile? _birthCert;
  bool _loading = false;
  String? _error;
  bool _success = false;

  Future<void> _pickSelfie() async {
    final src = await showDialog<_Source>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Selfie'),
        content: const Text('Take a photo of your face'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, _Source.camera), child: const Text('Camera')),
          TextButton(onPressed: () => Navigator.pop(ctx, _Source.gallery), child: const Text('Gallery')),
        ],
      ),
    );
    if (src == null) return;
    final x = await _picker.pickImage(source: src == _Source.camera ? ImageSource.camera : ImageSource.gallery, imageQuality: 80);
    if (x != null) setState(() => _selfie = x);
  }

  Future<void> _pickBirthCert() async {
    final x = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (x != null) setState(() => _birthCert = x);
  }

  Future<void> _submit() async {
    if (_selfie == null && _birthCert == null) {
      setState(() => _error = 'Please take a selfie or upload a birth certificate');
      return;
    }
    setState(() { _loading = true; _error = null; });

    try {
      final api = GetIt.instance<RemoteApiSource>();
      await api.submitKyc(
        selfieBytes: await _selfie!.readAsBytes(),
        selfieFilename: _selfie!.name,
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
            const Text('Please submit a selfie and your birth certificate for verification.', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: Color(0xFF6D4C41))),
            const SizedBox(height: 24),

            // Selfie
            _buildSection(
              icon: Icons.camera_alt,
              title: 'Selfie',
              hint: 'Take a selfie showing your face clearly',
              file: _selfie,
              onPick: _pickSelfie,
            ),
            const SizedBox(height: 16),

            // Birth Cert
            _buildSection(
              icon: Icons.description,
              title: 'Birth Certificate',
              hint: 'Upload a photo of your birth certificate',
              file: _birthCert,
              onPick: _pickBirthCert,
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

  Widget _buildSection({
    required IconData icon,
    required String title,
    required String hint,
    required XFile? file,
    required VoidCallback onPick,
  }) {
    return Container(
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
              Icon(icon, size: 20, color: const Color(0xFF2E7D32)),
              const SizedBox(width: 8),
              Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF3E2723))),
            ],
          ),
          const SizedBox(height: 8),
          Text(hint, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          const SizedBox(height: 12),
          if (file != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(File(file.path), height: 120, width: double.infinity, fit: BoxFit.cover),
            ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: onPick,
            icon: Icon(file != null ? Icons.refresh : icon, size: 18),
            label: Text(file != null ? 'Change' : title == 'Selfie' ? 'Take Selfie' : 'Upload Photo'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF2E7D32),
              side: const BorderSide(color: Color(0xFF2E7D32)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ],
      ),
    );
  }
}

enum _Source { camera, gallery }
