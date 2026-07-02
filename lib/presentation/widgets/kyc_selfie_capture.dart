import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:image_picker/image_picker.dart';

class KycSelfieCapture extends StatefulWidget {
  const KycSelfieCapture({super.key});

  @override
  KycSelfieCaptureState createState() => KycSelfieCaptureState();
}

class KycSelfieCaptureState extends State<KycSelfieCapture> {
  final _picker = ImagePicker();
  File? _imageFile;
  bool _detecting = false;
  String? _validationError;
  bool _isValid = false;
  String? _debugInfo;

  Future<void> _takePhoto() async {
    final x = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      preferredCameraDevice: CameraDevice.front,
    );
    if (x == null) return;
    setState(() {
      _imageFile = File(x.path);
      _detecting = true;
      _validationError = null;
      _isValid = false;
      _debugInfo = null;
    });
    await _detectFace();
  }

  Future<void> _detectFace() async {
    if (_imageFile == null) return;

    final inputImage = InputImage.fromFile(_imageFile!);
    final faceDetector = FaceDetector(
      options: FaceDetectorOptions(
        enableClassification: true,
        enableLandmarks: true,
        enableContours: true,
        performanceMode: FaceDetectorMode.accurate,
      ),
    );

    try {
      final faces = await faceDetector.processImage(inputImage);
      await faceDetector.close();

      if (!mounted) return;

      if (faces.isEmpty) {
        setState(() {
          _detecting = false;
          _validationError = 'No face detected. Please position your face clearly in frame and ensure good lighting.';
          _isValid = false;
        });
        return;
      }

      final face = faces.first;
      final imageSize = _imageFile != null ? _getJpegSize(_imageFile!) : const Size(0, 0);
      final errors = <String>[];

      // Check face bounding box is large enough (face fills at least 15% of image area)
      final faceArea = face.boundingBox.width * face.boundingBox.height;
      final imageArea = imageSize.width * imageSize.height;
      final faceRatio = imageArea > 0 ? faceArea / imageArea : 0;
      if (faceRatio < 0.10) {
        errors.add('Move closer so your face fills more of the frame');
      }
      if (faceRatio > 0.60) {
        errors.add('Move back slightly');
      }

      // Check face is centered (within 40% of center)
      final faceCenterX = face.boundingBox.center.dx;
      final faceCenterY = face.boundingBox.center.dy;
      final centerX = imageSize.width / 2;
      final centerY = imageSize.height / 2;
      final offsetX = (faceCenterX - centerX).abs() / centerX;
      final offsetY = (faceCenterY - centerY).abs() / centerY;
      if (offsetX > 0.35) {
        errors.add('Center your face horizontally');
      }
      if (offsetY > 0.35) {
        errors.add('Center your face vertically');
      }

      // Head euler angles - check not tilted too much
      final headY = face.headEulerAngleY ?? 0;
      final headZ = face.headEulerAngleZ ?? 0;
      if (headY.abs() > 30) {
        errors.add('Look directly at the camera');
      }
      if (headZ.abs() > 25) {
        errors.add('Keep your head straight');
      }

      // Eye open probability
      final leftEye = face.leftEyeOpenProbability ?? 1.0;
      final rightEye = face.rightEyeOpenProbability ?? 1.0;

      setState(() {
        _debugInfo = 'Face: ${(faceRatio * 100).toStringAsFixed(0)}% frame | '
            'Eyes: L${(leftEye * 100).toStringAsFixed(0)}% R${(rightEye * 100).toStringAsFixed(0)}% | '
            'Head Y:${headY.toStringAsFixed(0)} Z:${headZ.toStringAsFixed(0)} | '
            'Offset: H${(offsetX * 100).toStringAsFixed(0)}% V${(offsetY * 100).toStringAsFixed(0)}%';
      });

      if (leftEye < 0.4 || rightEye < 0.4) {
        errors.add('Please open both eyes');
      }

      // Check for smiling (optional - just informational)
      final smileProb = face.smilingProbability ?? 0;
      if (smileProb > 0.8) {
        // Not an error, but note it
      }

      if (errors.isEmpty) {
        setState(() {
          _detecting = false;
          _validationError = null;
          _isValid = true;
        });
      } else {
        setState(() {
          _detecting = false;
          _validationError = errors.join('\n');
          _isValid = false;
        });
      }
    } catch (e) {
      await faceDetector.close();
      if (!mounted) return;
      setState(() {
        _detecting = false;
        _validationError = 'Face detection failed. Please try again with better lighting.';
        _isValid = false;
      });
    }
  }

  Size _getJpegSize(File file) {
    try {
      final bytes = file.readAsBytesSync();
      if (bytes.length > 2 && bytes[0] == 0xFF && bytes[1] == 0xD8) {
        int offset = 2;
        while (offset < bytes.length - 9) {
          if (bytes[offset] == 0xFF && bytes[offset + 1] == 0xC0) {
            final height = (bytes[offset + 5] << 8) | bytes[offset + 6];
            final width = (bytes[offset + 7] << 8) | bytes[offset + 8];
            return Size(width.toDouble(), height.toDouble());
          }
          offset++;
        }
      }
    } catch (_) {}
    return const Size(1080, 1920);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_imageFile != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.file(_imageFile!, height: 200, width: double.infinity, fit: BoxFit.cover),
          ),
          const SizedBox(height: 8),
          if (_detecting)
            const Padding(
              padding: EdgeInsets.all(8),
              child: Row(
                children: [
                  SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  SizedBox(width: 8),
                  Text('Analyzing face...', style: TextStyle(fontSize: 13, color: Color(0xFF6D4C41))),
                ],
              ),
            ),
          if (_validationError != null)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: _validationError!.split('\n').map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('• ', style: TextStyle(color: Colors.red)),
                      Expanded(child: Text(e, style: TextStyle(color: Colors.red.shade800, fontSize: 12))),
                    ],
                  ),
                )).toList(),
              ),
            ),
          if (_debugInfo != null && !_isValid)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(_debugInfo!, style: TextStyle(fontSize: 10, color: Colors.grey.shade400)),
            ),
          if (_isValid)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green.shade300),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green.shade600, size: 18),
                  const SizedBox(width: 8),
                  Text('Face verified successfully', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.green.shade800, fontSize: 13)),
                ],
              ),
            ),
          const SizedBox(height: 8),
        ],
        OutlinedButton.icon(
          onPressed: _detecting ? null : _takePhoto,
          icon: Icon(_imageFile != null ? Icons.refresh : Icons.camera_alt, size: 18),
          label: Text(_imageFile != null ? 'Retake Photo' : 'Take Selfie'),
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFF2E7D32),
            side: const BorderSide(color: Color(0xFF2E7D32)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
      ],
    );
  }

  Uint8List? get validatedImageBytes {
    if (_imageFile != null && _isValid) {
      return _imageFile!.readAsBytesSync();
    }
    return null;
  }

  String? get imageFilename => _imageFile?.path.split('/').last ?? _imageFile?.path.split('\\').last;

  bool get isValid => _isValid;
}
