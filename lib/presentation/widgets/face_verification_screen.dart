import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

class FaceVerificationResult {
  final Uint8List imageBytes;
  final String filename;
  FaceVerificationResult({required this.imageBytes, required this.filename});
}

class FaceVerificationScreen extends StatefulWidget {
  const FaceVerificationScreen({super.key});

  @override
  State<FaceVerificationScreen> createState() => _FaceVerificationScreenState();
}

class _FaceVerificationScreenState extends State<FaceVerificationScreen> with WidgetsBindingObserver {
  CameraController? _camera;
  FaceDetector? _detector;
  bool _isInitialized = false;
  bool _isCapturing = false;

  // Detection state
  bool _faceDetected = false;
  bool _faceCentered = false;
  bool _faceSized = false;
  bool _headStraight = false;
  bool _eyesOpen = false;
  bool _noGlasses = false;
  bool _blinkDetected = false;

  String _guideText = 'Position your face in the oval';
  String _debugInfo = '';

  // Blink tracking
  bool _eyesWereOpen = false;
  bool _blinkInProgress = false;
  DateTime? _blinkStartTime;

  // Stability tracking (hold good conditions before capture)
  DateTime? _stableSince;
  static const _stabilityDuration = Duration(seconds: 1);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
    _detector = FaceDetector(
      options: FaceDetectorOptions(
        enableClassification: true,
        enableLandmarks: true,
        enableContours: true,
        performanceMode: FaceDetectorMode.accurate,
      ),
    );
  }

  Future<void> _initCamera() async {
    final cameras = await availableCameras();
    final front = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );
    final controller = CameraController(front, ResolutionPreset.medium, enableAudio: false);
    await controller.initialize();
    await controller.startImageStream(_processImage);
    if (!mounted) return;
    setState(() {
      _camera = controller;
      _isInitialized = true;
    });
  }

  InputImage? _inputImageFromCamera(CameraImage image, CameraDescription camera) {
    final rotation = InputImageRotationValue.fromRawValue(camera.sensorOrientation);
    if (rotation == null) return null;

    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;

    if (format == InputImageFormat.nv21 || format == InputImageFormat.yuv_420_888) {
      final concatenated = Uint8List(image.planes.fold(0, (sum, p) => sum + p.bytes.length));
      int offset = 0;
      for (final plane in image.planes) {
        concatenated.setRange(offset, offset + plane.bytes.length, plane.bytes);
        offset += plane.bytes.length;
      }
      return InputImage.fromBytes(
        bytes: concatenated,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: format,
          bytesPerRow: image.planes[0].bytesPerRow,
        ),
      );
    } else if (format == InputImageFormat.bgra8888) {
      return InputImage.fromBytes(
        bytes: image.planes[0].bytes,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: format,
          bytesPerRow: image.planes[0].bytesPerRow,
        ),
      );
    }
    return null;
  }

  bool _hasGlasses(Face face) {
    final leftEye = face.leftEyeOpenProbability;
    final rightEye = face.rightEyeOpenProbability;
    if (leftEye == null || rightEye == null) return true;
    if (leftEye < 0.1 && rightEye < 0.1) return true;
    return false;
  }

  Future<void> _processImage(CameraImage image) async {
    if (_isCapturing) return;
    final camera = _camera?.description;
    if (camera == null || _detector == null) return;

    final inputImage = _inputImageFromCamera(image, camera);
    if (inputImage == null) return;

    try {
      final faces = await _detector!.processImage(inputImage);
      if (!mounted) return;

      final imgW = image.width.toDouble();
      final imgH = image.height.toDouble();

      if (faces.isEmpty) {
        setState(() {
          _faceDetected = false;
          _faceCentered = false;
          _faceSized = false;
          _headStraight = false;
          _eyesOpen = false;
          _noGlasses = false;
          _guideText = 'No face detected. Position your face in the oval.';
          _stableSince = null;
        });
        return;
      }

      final face = faces.first;
      final bx = face.boundingBox;

      // Face area ratio
      final faceArea = bx.width * bx.height;
      final imageArea = imgW * imgH;
      final faceRatio = imageArea > 0 ? faceArea / imageArea : 0;

      // Centering (in camera coords with front camera mirror)
      final faceCx = bx.center.dx;
      final faceCy = bx.center.dy;
      final offsetX = (faceCx - imgW / 2).abs() / (imgW / 2);
      final offsetY = (faceCy - imgH / 2).abs() / (imgH / 2);

      // Head angles
      final headY = face.headEulerAngleY ?? 0;
      final headZ = face.headEulerAngleZ ?? 0;

      // Eyes
      final leftEye = face.leftEyeOpenProbability ?? 0;
      final rightEye = face.rightEyeOpenProbability ?? 0;

      // Validate
      final sized = faceRatio >= 0.15 && faceRatio <= 0.55;
      final centered = offsetX <= 0.30 && offsetY <= 0.30;
      final straight = headY.abs() <= 25 && headZ.abs() <= 20;
      final eyesOpen = leftEye >= 0.4 && rightEye >= 0.4;
      final noGlasses = !_hasGlasses(face);

      // Blink detection
      final currentEyesOpen = eyesOpen;
      if (!_blinkDetected) {
        if (_eyesWereOpen && !currentEyesOpen && !_blinkInProgress) {
          _blinkInProgress = true;
          _blinkStartTime = DateTime.now();
        } else if (_blinkInProgress && currentEyesOpen) {
          final elapsed = DateTime.now().difference(_blinkStartTime!);
          if (elapsed >= const Duration(milliseconds: 100) && elapsed <= const Duration(seconds: 2)) {
            _blinkDetected = true;
          }
          _blinkInProgress = false;
        }
        _eyesWereOpen = currentEyesOpen;
      }

      // Build guide text
      String guide;
      if (!centered) {
        guide = 'Center your face in the oval';
      } else if (!sized) {
        guide = faceRatio < 0.15 ? 'Move closer to the camera' : 'Move back slightly';
      } else if (!straight) {
        guide = 'Look directly at the camera\nKeep your head straight';
      } else if (!noGlasses) {
        guide = 'Please remove glasses or accessories\ncovering your face';
      } else if (!eyesOpen) {
        guide = 'Please open both eyes';
      } else if (!_blinkDetected) {
        guide = 'Now blink to confirm liveness';
      } else {
        guide = 'Face verified! Hold steady...';
      }

      setState(() {
        _faceDetected = true;
        _faceCentered = centered;
        _faceSized = sized;
        _headStraight = straight;
        _eyesOpen = eyesOpen;
        _noGlasses = noGlasses;
        _guideText = guide;
        _debugInfo = 'Face:${(faceRatio * 100).toStringAsFixed(0)}% '
            'Off:${(offsetX * 100).toStringAsFixed(0)},${(offsetY * 100).toStringAsFixed(0)} '
            'Y:$headY Z:$headZ '
            'E:${(leftEye * 100).toStringAsFixed(0)}/${(rightEye * 100).toStringAsFixed(0)} '
            'Blink:${_blinkDetected ? "Y" : _blinkInProgress ? "..." : "N"}';
      });

      // Check if ALL conditions met
      final allGood = centered && sized && straight && eyesOpen && noGlasses && _blinkDetected;
      if (allGood) {
        final now = DateTime.now();
        if (_stableSince == null) {
          _stableSince = now;
        } else if (now.difference(_stableSince!) >= _stabilityDuration) {
          // Stable for 1 second → capture
          await _capturePhoto();
        }
      } else {
        _stableSince = null;
      }
    } catch (_) {}
  }

  Future<void> _capturePhoto() async {
    if (_isCapturing || _camera == null) return;
    setState(() => _isCapturing = true);

    try {
      final xFile = await _camera!.takePicture();
      final file = File(xFile.path);
      final bytes = await file.readAsBytes();

      await _camera?.stopImageStream();
      await _detector?.close();
      _detector = null;
      await _camera?.dispose();
      _camera = null;

      if (!mounted) return;
      Navigator.pop(
        context,
        FaceVerificationResult(
          imageBytes: bytes,
          filename: 'selfie_verified.jpg',
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isCapturing = false;
        _guideText = 'Capture failed. Tap retry.';
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _detector?.close();
    _camera?.stopImageStream();
    _camera?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: !_isInitialized
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : Stack(
              children: [
                // Camera preview
                if (_camera != null)
                  SizedBox(
                    width: double.infinity,
                    height: double.infinity,
                    child: CameraPreview(_camera!),
                  ),

                // Overlay with oval guide
                _FaceOverlay(
                  faceDetected: _faceDetected,
                  faceCentered: _faceCentered,
                  faceSized: _faceSized,
                  headStraight: _headStraight,
                  eyesOpen: _eyesOpen,
                  noGlasses: _noGlasses,
                  blinkDetected: _blinkDetected,
                  guideText: _guideText,
                  isCapturing: _isCapturing,
                ),

                // Debug info
                Positioned(
                  bottom: 8,
                  left: 8,
                  child: Text(_debugInfo, style: const TextStyle(color: Colors.white24, fontSize: 9)),
                ),

                // Close + retry buttons
                Positioned(
                  top: MediaQuery.of(context).padding.top + 8,
                  left: 16,
                  child: SafeArea(
                    child: IconButton(
                      icon: const Icon(Icons.close, color: Colors.white, size: 28),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ),
                ),
                if (_isCapturing)
                  Container(color: Colors.black54, child: const Center(child: CircularProgressIndicator(color: Colors.white))),
              ],
            ),
    );
  }
}

class _FaceOverlay extends StatelessWidget {
  final bool faceDetected, faceCentered, faceSized, headStraight, eyesOpen, noGlasses, blinkDetected;
  final String guideText;
  final bool isCapturing;

  const _FaceOverlay({
    required this.faceDetected,
    required this.faceCentered,
    required this.faceSized,
    required this.headStraight,
    required this.eyesOpen,
    required this.noGlasses,
    required this.blinkDetected,
    required this.guideText,
    required this.isCapturing,
  });

  @override
  Widget build(BuildContext context) {
    final allPass = faceCentered && faceSized && headStraight && eyesOpen && noGlasses && blinkDetected;
    final ovalColor = allPass ? Colors.green : (faceDetected ? Colors.amber : Colors.white38);

    return Column(
      children: [
        Expanded(
          child: Stack(
            children: [
              // Dark overlay with oval cutout
              CustomPaint(
                size: Size.infinite,
                painter: _OvalCutoutPainter(ovalColor: ovalColor),
              ),

              // Status checks
              Positioned(
                top: MediaQuery.of(context).padding.top + 60,
                left: 16,
                child: _StatusColumn(
                  faceDetected: faceDetected,
                  faceCentered: faceCentered,
                  faceSized: faceSized,
                  headStraight: headStraight,
                  eyesOpen: eyesOpen,
                  noGlasses: noGlasses,
                  blinkDetected: blinkDetected,
                ),
              ),

              // Guide text below oval
              Positioned(
                bottom: 30,
                left: 24,
                right: 24,
                child: Text(
                  guideText,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: allPass ? Colors.green.shade300 : Colors.white,
                    fontSize: allPass ? 18 : 15,
                    fontWeight: FontWeight.w600,
                    shadows: const [Shadow(color: Colors.black54, blurRadius: 8)],
                  ),
                ),
              ),

              // Progress indicator
              if (allPass)
                Positioned(
                  bottom: 80,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: SizedBox(
                      width: 32,
                      height: 32,
                      child: CircularProgressIndicator(
                        color: Colors.green.shade300,
                        strokeWidth: 3,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StatusColumn extends StatelessWidget {
  final bool faceDetected, faceCentered, faceSized, headStraight, eyesOpen, noGlasses, blinkDetected;

  const _StatusColumn({
    required this.faceDetected,
    required this.faceCentered,
    required this.faceSized,
    required this.headStraight,
    required this.eyesOpen,
    required this.noGlasses,
    required this.blinkDetected,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        _statusRow('Face detected', faceDetected),
        _statusRow('Face centered', faceCentered),
        _statusRow('Correct distance', faceSized),
        _statusRow('Head straight', headStraight),
        _statusRow('Eyes visible', eyesOpen),
        _statusRow('No obstructions', noGlasses),
        _statusRow('Liveness confirmed', blinkDetected),
      ],
    );
  }

  Widget _statusRow(String label, bool ok) {
    IconData icon;
    Color color;
    if (ok) {
      icon = Icons.check_circle;
      color = Colors.green.shade400;
    } else {
      icon = Icons.radio_button_unchecked;
      color = Colors.white38;
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _OvalCutoutPainter extends CustomPainter {
  final Color ovalColor;

  _OvalCutoutPainter({required this.ovalColor});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.black54;
    final ovalRect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2),
      width: size.width * 0.65,
      height: size.height * 0.45,
    );

    // Draw semi-transparent overlay with oval cutout
    canvas.save();
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        Path()..addOval(ovalRect),
      ),
      paint,
    );
    canvas.restore();

    // Draw oval outline
    final borderPaint = Paint()
      ..color = ovalColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;
    canvas.drawOval(ovalRect, borderPaint);

    // Draw crosshair
    final crossPaint = Paint()
      ..color = ovalColor.withValues(alpha: 0.3)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5;
    canvas.drawLine(
      Offset(ovalRect.center.dx - 40, ovalRect.center.dy),
      Offset(ovalRect.center.dx + 40, ovalRect.center.dy),
      crossPaint,
    );
    canvas.drawLine(
      Offset(ovalRect.center.dx, ovalRect.center.dy - 30),
      Offset(ovalRect.center.dx, ovalRect.center.dy + 30),
      crossPaint,
    );
  }

  @override
  bool shouldRepaint(_OvalCutoutPainter old) => old.ovalColor != ovalColor;
}
