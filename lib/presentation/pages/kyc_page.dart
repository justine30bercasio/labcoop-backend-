import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:image_picker/image_picker.dart';
import 'package:get_it/get_it.dart';
import '../../data/datasources/remote_api_source.dart';
import '../widgets/face_verification_screen.dart';

class KycPage extends StatefulWidget {
  const KycPage({super.key});

  @override
  State<KycPage> createState() => _KycPageState();
}

class _KycPageState extends State<KycPage> {
  final _picker = ImagePicker();
  FaceVerificationResult? _selfieResult;
  XFile? _birthCert;
  bool _loading = false;
  String? _error;
  bool _success = false;
  bool _analyzing = false;
  bool _faceValid = false;
  String? _faceError;

  Future<void> _takeSelfie() async {
    final result = await Navigator.push<FaceVerificationResult>(
      context,
      MaterialPageRoute(builder: (_) => const FaceVerificationScreen()),
    );
    if (result != null) {
      setState(() {
        _selfieResult = result;
        _faceValid = false;
        _faceError = null;
      });
      _analyzeSelfie(result);
    }
  }

  Future<void> _analyzeSelfie(FaceVerificationResult result) async {
    setState(() => _analyzing = true);
    final detector = FaceDetector(
      options: FaceDetectorOptions(
        enableClassification: true,
        enableContours: true,
        performanceMode: FaceDetectorMode.accurate,
      ),
    );

    try {
      final file = await _writeTempFile(result.imageBytes);
      final inputImage = InputImage.fromFile(file);
      final faces = await detector.processImage(inputImage);
      await detector.close();
      file.delete();

      if (!mounted) return;

      if (faces.isEmpty) {
        setState(() {
          _analyzing = false;
          _faceValid = false;
          _faceError = 'No face detected. Please try again with good lighting.';
          _selfieResult = null;
        });
        return;
      }

      final face = faces.first;
      final errors = <String>[];

      // Face size
      final imageSize = Size(inputImage.metadata?.size.width ?? 1080,
          inputImage.metadata?.size.height ?? 1920);
      final faceArea = face.boundingBox.width * face.boundingBox.height;
      final imageArea = imageSize.width * imageSize.height;
      final faceRatio = imageArea > 0 ? faceArea / imageArea : 0;

      if (faceRatio < 0.10) {
        errors.add('Move closer to the camera');
      }
      if (faceRatio > 0.60) {
        errors.add('Move back slightly');
      }

      // Centering
      final faceCx = face.boundingBox.center.dx;
      final faceCy = face.boundingBox.center.dy;
      final centerX = imageSize.width / 2;
      final centerY = imageSize.height / 2;
      final offsetX = (faceCx - centerX).abs() / centerX;
      final offsetY = (faceCy - centerY).abs() / centerY;

      if (offsetX > 0.35) {
        errors.add('Center your face horizontally');
      }
      if (offsetY > 0.35) {
        errors.add('Center your face vertically');
      }

      // Head angles
      final headY = face.headEulerAngleY ?? 0;
      final headZ = face.headEulerAngleZ ?? 0;
      if (headY.abs() > 30) {
        errors.add('Look directly at the camera');
      }
      if (headZ.abs() > 25) {
        errors.add('Keep your head straight');
      }

      // Eyes open
      final leftEye = face.leftEyeOpenProbability ?? 1.0;
      final rightEye = face.rightEyeOpenProbability ?? 1.0;
      if (leftEye < 0.4 || rightEye < 0.4) {
        errors.add('Please open both eyes');
      }

      // Glasses / obstruction detection
      if (leftEye < 0.1 && rightEye < 0.1) {
        errors.add('Remove glasses or accessories covering your eyes');
      }

      setState(() {
        _analyzing = false;
        if (errors.isEmpty) {
          _faceValid = true;
          _faceError = null;
        } else {
          _faceValid = false;
          _faceError = errors.join('\n');
          _selfieResult = null;
        }
      });
    } catch (e) {
      await detector.close();
      if (!mounted) return;
      setState(() {
        _analyzing = false;
        _faceValid = false;
        _faceError = 'Face analysis failed. Please try again.';
        _selfieResult = null;
      });
    }
  }

  Future<File> _writeTempFile(Uint8List bytes) async {
    final dir = Directory.systemTemp;
    final file = File('${dir.path}/selfie_${DateTime.now().millisecondsSinceEpoch}.jpg');
    await file.writeAsBytes(bytes);
    return file;
  }

  Future<void> _pickBirthCert() async {
    final x = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (x != null) setState(() => _birthCert = x);
  }

  Future<void> _submit() async {
    if (_selfieResult == null && _birthCert == null) {
      setState(() => _error = 'Please take a selfie and/or upload a birth certificate');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final api = GetIt.instance<RemoteApiSource>();
      await api.submitKyc(
        selfieBytes: _selfieResult?.imageBytes,
        selfieFilename: _selfieResult?.filename,
        birthCertBytes: _birthCert != null ? await _birthCert!.readAsBytes() : null,
        birthCertFilename: _birthCert?.name,
      );
      setState(() {
        _success = true;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to submit KYC: ${e.toString().replaceAll('Exception: ', '')}';
        _loading = false;
      });
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
                const Text('KYC Submitted!',
                    style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF3E2723))),
                const SizedBox(height: 8),
                const Text(
                  'Your documents are under review. We will notify you once verified.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: Color(0xFF6D4C41)),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context),
                  style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF8B4513),
                      foregroundColor: Colors.white),
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
        title: const Text('Verify Identity',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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
            const Text('Identity Verification',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF3E2723))),
            const SizedBox(height: 4),
            const Text(
              'Take a clear selfie and upload your birth certificate.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Color(0xFF6D4C41)),
            ),
            const SizedBox(height: 24),

            // Selfie
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
                      const Text('Selfie',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF3E2723))),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Position your face in the center with good lighting',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 12),
                  if (_selfieResult != null && _faceValid)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.green.shade300),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.check_circle,
                              color: Colors.green.shade600, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text('Selfie accepted',
                                style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: Colors.green.shade800,
                                    fontSize: 13)),
                          ),
                          IconButton(
                            icon: Icon(Icons.refresh,
                                color: Colors.green.shade600, size: 18),
                            onPressed: _takeSelfie,
                            tooltip: 'Retake',
                          ),
                        ],
                      ),
                    )
                  else if (_analyzing)
                    const Padding(
                      padding: EdgeInsets.all(12),
                      child: Row(
                        children: [
                          SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2)),
                          SizedBox(width: 8),
                          Text('Analyzing selfie...',
                              style: TextStyle(fontSize: 13)),
                        ],
                      ),
                    )
                  else if (_faceError != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.red.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: _faceError!
                            .split('\n')
                            .map((e) => Padding(
                                  padding: const EdgeInsets.only(bottom: 2),
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text('• ',
                                          style: TextStyle(color: Colors.red)),
                                      Expanded(
                                        child: Text(e,
                                            style: TextStyle(
                                                color: Colors.red.shade800,
                                                fontSize: 12)),
                                      ),
                                    ],
                                  ),
                                ))
                            .toList(),
                      ),
                    )
                  else
                    SizedBox(
                      height: 100,
                      child: Center(
                        child: OutlinedButton.icon(
                          onPressed: _takeSelfie,
                          icon: const Icon(Icons.camera_alt, size: 20),
                          label: const Text('Take Selfie',
                              style: TextStyle(fontSize: 15)),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF2E7D32),
                            side: const BorderSide(
                                color: Color(0xFF2E7D32), width: 1.5),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 24, vertical: 14),
                          ),
                        ),
                      ),
                    ),
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
                      const Icon(Icons.description,
                          size: 20, color: Color(0xFF2E7D32)),
                      const SizedBox(width: 8),
                      const Text('Birth Certificate',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF3E2723))),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('Upload a clear photo of your birth certificate',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 12),
                  if (_birthCert != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.file(File(_birthCert!.path),
                          height: 120,
                          width: double.infinity,
                          fit: BoxFit.cover),
                    ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _pickBirthCert,
                    icon: Icon(
                        _birthCert != null ? Icons.refresh : Icons.upload_file,
                        size: 18),
                    label: Text(
                        _birthCert != null ? 'Change File' : 'Upload Birth Certificate'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF2E7D32),
                      side: const BorderSide(color: Color(0xFF2E7D32)),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
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
                decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade200)),
                child: Text(_error!,
                    style:
                        TextStyle(color: Colors.red.shade800, fontSize: 13)),
              ),

            SizedBox(
              height: 52,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2E7D32),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: _loading
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Text(
                        'Submit for Verification',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
