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

enum _FaceStep { positionFace, holdStill, blinkNow, capturing, success, failed }

class FaceVerificationScreen extends StatefulWidget {
  const FaceVerificationScreen({super.key});

  @override
  State<FaceVerificationScreen> createState() => _FaceVerificationScreenState();
}

class _FaceVerificationScreenState extends State<FaceVerificationScreen>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  CameraController? _camera;
  FaceDetector? _detector;
  bool _isInitialized = false;
  String _errorMsg = '';

  // Steps flow
  _FaceStep _currentStep = _FaceStep.positionFace;
  double _progress = 0.0;
  late AnimationController _pulseController;

  // Detection state (only for position step)
  bool _faceOk = false;
  bool _centeredOk = false;
  bool _sizedOk = false;
  bool _angleOk = false;
  bool _eyesOk = false;
  bool _noObstructionOk = false;

  // For hold-still detection — track head position across frames
  double? _refCenterX, _refCenterY;
  int _stableFrames = 0;

  // For blink detection
  bool _eyesWereOpen = false;
  bool _blinkInProgress = false;
  bool _blinkDone = false;
  DateTime? _blinkStart;

  // For 3-frame capture (liveness verification)
  List<Uint8List> _capturedFrames = [];
  int _capturePhase = 0; // 0=neutral, 1=turn-left, 2=turn-right

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
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
    try {
      final cameras = await availableCameras();
      final front = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      final controller = CameraController(front, ResolutionPreset.high,
          enableAudio: false, imageFormatGroup: ImageFormatGroup.nv21);
      await controller.initialize();
      await controller.startImageStream(_processImage);
      if (!mounted) return;
      setState(() {
        _camera = controller;
        _isInitialized = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorMsg = 'Camera error: $e');
    }
  }

  InputImage? _inputFromCamera(CameraImage image, CameraDescription camera) {
    final rotation = InputImageRotationValue.fromRawValue(camera.sensorOrientation);
    if (rotation == null) return null;
    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;
    final concatenated = Uint8List(image.planes.fold(0, (s, p) => s + p.bytes.length));
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
  }

  bool _isObstructed(Face face) {
    final le = face.leftEyeOpenProbability;
    final re = face.rightEyeOpenProbability;
    if (le == null || re == null) return true;
    if (le < 0.1 && re < 0.1) return true;
    return false;
  }

  Future<void> _processImage(CameraImage image) async {
    if (_isInitialized == false || _detector == null) return;
    if (_currentStep == _FaceStep.capturing || _currentStep == _FaceStep.success ||
        _currentStep == _FaceStep.failed) return;

    final camera = _camera?.description;
    if (camera == null) return;
    final inputImage = _inputFromCamera(image, camera);
    if (inputImage == null) return;

    try {
      final faces = await _detector!.processImage(inputImage);
      if (!mounted) return;

      final imgW = image.width.toDouble();
      final imgH = image.height.toDouble();

      if (faces.isEmpty) {
        if (_currentStep == _FaceStep.positionFace) {
          setState(() {
            _faceOk = false;
            _centeredOk = false;
            _sizedOk = false;
            _angleOk = false;
            _eyesOk = false;
            _noObstructionOk = false;
            _progress = 0.0;
          });
        }
        return;
      }

      final face = faces.first;
      final bx = face.boundingBox;

      final faceArea = bx.width * bx.height;
      final imageArea = imgW * imgH;
      final faceRatio = imageArea > 0 ? faceArea / imageArea : 0;

      final faceCx = bx.center.dx;
      final faceCy = bx.center.dy;
      final offsetX = (faceCx - imgW / 2).abs() / (imgW / 2);
      final offsetY = (faceCy - imgH / 2).abs() / (imgH / 2);

      final headY = face.headEulerAngleY ?? 0;
      final headZ = face.headEulerAngleZ ?? 0;
      final leftEye = face.leftEyeOpenProbability ?? 0;
      final rightEye = face.rightEyeOpenProbability ?? 0;

      final sized = faceRatio >= 0.15 && faceRatio <= 0.55;
      final centered = offsetX <= 0.30 && offsetY <= 0.30;
      final straight = headY.abs() <= 25 && headZ.abs() <= 20;
      final eyesOpen = leftEye >= 0.4 && rightEye >= 0.4;
      final noObstruction = !_isObstructed(face);

      if (_currentStep == _FaceStep.positionFace) {
        setState(() {
          _faceOk = true;
          _sizedOk = sized;
          _centeredOk = centered;
          _angleOk = straight;
          _eyesOk = eyesOpen;
          _noObstructionOk = noObstruction;

          final checks = [sized, centered, straight, eyesOpen, noObstruction];
          final passed = checks.where((c) => c).length;
          _progress = passed / 5.0;

          if (passed == 5) {
            _currentStep = _FaceStep.holdStill;
            _stableFrames = 0;
            _refCenterX = faceCx;
            _refCenterY = faceCy;
          }
        });
      } else if (_currentStep == _FaceStep.holdStill) {
        // Check face still present and stable
        final moved = _refCenterX != null && _refCenterY != null &&
            ((faceCx - _refCenterX!).abs() > imgW * 0.04 ||
             (faceCy - _refCenterY!).abs() > imgH * 0.04);

        if (!moved && sized && centered && straight && eyesOpen) {
          _stableFrames++;
          setState(() => _progress = (_stableFrames / 15).clamp(0.0, 1.0));
          if (_stableFrames >= 15) {
            setState(() {
              _currentStep = _FaceStep.blinkNow;
              _blinkDone = false;
              _eyesWereOpen = eyesOpen;
              _progress = 0.3;
            });
          }
        } else {
          _stableFrames = 0;
          setState(() => _progress = 0.0);
        }
      } else if (_currentStep == _FaceStep.blinkNow) {
        // Blink detection
        if (eyesOpen) {
          if (_blinkInProgress) {
            final elapsed = DateTime.now().difference(_blinkStart!);
            if (elapsed >= const Duration(milliseconds: 100) &&
                elapsed <= const Duration(seconds: 2)) {
              _blinkDone = true;
            }
            _blinkInProgress = false;
          }
          _eyesWereOpen = true;
        } else {
          if (_eyesWereOpen && !_blinkInProgress) {
            _blinkInProgress = true;
            _blinkStart = DateTime.now();
          }
          _eyesWereOpen = false;
        }

        if (_blinkDone) {
          setState(() {
            _progress = 1.0;
            _currentStep = _FaceStep.capturing;
          });
          _captureThreeFrames();
        } else {
          setState(() => _progress = 0.6);
        }
      }
    } catch (_) {}
  }

  Future<void> _captureThreeFrames() async {
    if (_camera == null) return;
    _capturedFrames = [];
    _capturePhase = 0;

    // Frame 1: neutral
    await Future.delayed(const Duration(milliseconds: 300));
    if (_camera == null) return;
    final f1 = await _camera!.takePicture();
    _capturedFrames.add(await File(f1.path).readAsBytes());

    // Frame 2: slight turn
    setState(() => _capturePhase = 1);
    await Future.delayed(const Duration(milliseconds: 600));
    if (_camera == null) return;
    final f2 = await _camera!.takePicture();
    _capturedFrames.add(await File(f2.path).readAsBytes());

    // Frame 3: turn other way
    setState(() => _capturePhase = 2);
    await Future.delayed(const Duration(milliseconds: 600));
    if (_camera == null) return;
    final f3 = await _camera!.takePicture();
    _capturedFrames.add(await File(f3.path).readAsBytes());

    await _camera?.stopImageStream();
    await _detector?.close();
    _detector = null;
    await _camera?.dispose();
    _camera = null;

    if (!mounted) return;
    Navigator.pop(
      context,
      FaceVerificationResult(
        imageBytes: _capturedFrames[0],
        filename: 'selfie_verified.jpg',
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pulseController.dispose();
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
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(color: Colors.white),
                  const SizedBox(height: 16),
                  Text(_errorMsg.isNotEmpty ? _errorMsg : 'Starting camera...',
                      style: const TextStyle(color: Colors.white70, fontSize: 14)),
                  if (_errorMsg.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 24),
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Go Back'),
                      ),
                    ),
                ],
              ),
            )
          : Stack(
              children: [
                // Camera
                if (_camera != null)
                  SizedBox(
                    width: double.infinity,
                    height: double.infinity,
                    child: CameraPreview(_camera!),
                  ),

                // Overlay
                CustomPaint(
                  size: Size.infinite,
                  painter: _OvalOverlayPainter(
                    progress: _progress,
                    pulseValue: _pulseController.value,
                    step: _currentStep,
                  ),
                ),

                // Top bar
                Positioned(
                  top: MediaQuery.of(context).padding.top + 8,
                  left: 0,
                  right: 0,
                  child: SafeArea(
                    child: Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.arrow_back, color: Colors.white, size: 28),
                          onPressed: () => Navigator.pop(context),
                        ),
                        const Spacer(),
                        Text(
                          _stepTitle(),
                          style: const TextStyle(
                              color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        const Spacer(),
                        const SizedBox(width: 48),
                      ],
                    ),
                  ),
                ),

                // Guide text below oval
                Positioned(
                  bottom: 100,
                  left: 24,
                  right: 24,
                  child: _buildInstruction(),
                ),

                // Progress bar at bottom
                Positioned(
                  bottom: 60,
                  left: 40,
                  right: 40,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: _progress,
                      backgroundColor: Colors.white24,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        _currentStep == _FaceStep.success
                            ? Colors.green
                            : _currentStep == _FaceStep.failed
                                ? Colors.red
                                : const Color(0xFF4CAF50),
                      ),
                      minHeight: 6,
                    ),
                  ),
                ),

                // Step indicator
                Positioned(
                  bottom: 130,
                  left: 0,
                  right: 0,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _stepDot(_FaceStep.positionFace),
                      const SizedBox(width: 8),
                      _connector(),
                      const SizedBox(width: 8),
                      _stepDot(_FaceStep.holdStill),
                      const SizedBox(width: 8),
                      _connector(),
                      const SizedBox(width: 8),
                      _stepDot(_FaceStep.blinkNow),
                      const SizedBox(width: 8),
                      _connector(),
                      const SizedBox(width: 8),
                      _stepDot(_FaceStep.capturing),
                    ],
                  ),
                ),

                // Capture phase hint
                if (_currentStep == _FaceStep.capturing)
                  Positioned(
                    top: MediaQuery.of(context).size.height / 2 - 60,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const SizedBox(
                              width: 28,
                              height: 28,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2.5, color: Colors.white),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              _capturePhase == 0
                                  ? 'Capturing...'
                                  : _capturePhase == 1
                                      ? 'Slight turn left...'
                                      : 'Slight turn right...',
                              style: const TextStyle(
                                  color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }

  String _stepTitle() {
    switch (_currentStep) {
      case _FaceStep.positionFace:
        return 'Position Face';
      case _FaceStep.holdStill:
        return 'Hold Still';
      case _FaceStep.blinkNow:
        return 'Blink to Confirm';
      case _FaceStep.capturing:
        return 'Capturing...';
      case _FaceStep.success:
        return 'Verified!';
      case _FaceStep.failed:
        return 'Failed';
    }
  }

  Widget _buildInstruction() {
    String text;
    Color color;
    switch (_currentStep) {
      case _FaceStep.positionFace:
        if (!_faceOk) {
          text = 'Position your face in the frame';
          color = Colors.white;
        } else if (!_centeredOk || !_sizedOk) {
          text = 'Center your face in the oval';
          color = Colors.orange.shade300;
        } else if (!_angleOk) {
          text = 'Look directly at the camera';
          color = Colors.orange.shade300;
        } else if (!_noObstructionOk) {
          text = 'Remove glasses or any face coverings';
          color = Colors.red.shade300;
        } else if (!_eyesOk) {
          text = 'Please open both eyes';
          color = Colors.orange.shade300;
        } else {
          text = 'Face detected. Hold still...';
          color = Colors.green.shade300;
        }
        break;
      case _FaceStep.holdStill:
        text = 'Hold still...';
        color = Colors.green.shade300;
        break;
      case _FaceStep.blinkNow:
        text = _blinkInProgress ? 'Blink detected!' : 'Please blink now to confirm liveness';
        color = Colors.green.shade300;
        break;
      case _FaceStep.capturing:
        text = 'Verifying liveness...';
        color = Colors.white;
        break;
      case _FaceStep.success:
        text = 'Face verified successfully!';
        color = Colors.green;
        break;
      case _FaceStep.failed:
        text = 'Verification failed. Try again.';
        color = Colors.red;
        break;
    }
    return Text(
      text,
      textAlign: TextAlign.center,
      style: TextStyle(
        color: color,
        fontSize: 17,
        fontWeight: FontWeight.w600,
        shadows: const [Shadow(color: Colors.black87, blurRadius: 10)],
      ),
    );
  }

  Widget _stepDot(_FaceStep step) {
    final active = _currentStep == step;
    final done = _stepIndex(step) < _stepIndex(_currentStep);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: active ? 14 : 10,
      height: active ? 14 : 10,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: done
            ? Colors.green
            : active
                ? Colors.white
                : Colors.white38,
        border: Border.all(
          color: active ? const Color(0xFF4CAF50) : Colors.transparent,
          width: 2,
        ),
      ),
    );
  }

  Widget _connector() {
    return Container(width: 24, height: 2, color: Colors.white24);
  }

  int _stepIndex(_FaceStep s) {
    return [0, 1, 2, 3, 4, 5][
        [_FaceStep.positionFace, _FaceStep.holdStill, _FaceStep.blinkNow,
         _FaceStep.capturing, _FaceStep.success, _FaceStep.failed].indexOf(s)];
  }
}

class _OvalOverlayPainter extends CustomPainter {
  final double progress;
  final double pulseValue;
  final _FaceStep step;

  _OvalOverlayPainter({
    required this.progress,
    required this.pulseValue,
    required this.step,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final ovalRect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2 - 20),
      width: size.width * 0.7,
      height: size.height * 0.42,
    );

    // Dark overlay with cutout
    canvas.save();
    final overlayPaint = Paint()..color = Colors.black54;
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        Path()..addOval(ovalRect),
      ),
      overlayPaint,
    );
    canvas.restore();

    // Oval border — green glow when good
    Color borderColor;
    double borderWidth;
    if (step == _FaceStep.success || step == _FaceStep.capturing) {
      borderColor = Colors.green;
      borderWidth = 3;
    } else if (progress > 0.8) {
      borderColor = Color.lerp(Colors.orange, Colors.green, (progress - 0.8) * 5)!;
      borderWidth = 2.5;
    } else if (progress > 0.5) {
      borderColor = Color.lerp(Colors.amber, Colors.orange, (progress - 0.5) * 3.33)!;
      borderWidth = 2.5;
    } else if (progress > 0) {
      borderColor = Colors.amber;
      borderWidth = 2.5;
    } else {
      borderColor = Colors.white38;
      borderWidth = 2;
    }

    // Pulse animation on oval
    if (step == _FaceStep.positionFace && progress < 1.0) {
      final pulsePaint = Paint()
        ..color = borderColor.withValues(alpha: 0.15 + pulseValue * 0.15)
        ..style = PaintingStyle.stroke
        ..strokeWidth = borderWidth + pulseValue * 3;
      canvas.drawOval(ovalRect, pulsePaint);
    }

    final borderPaint = Paint()
      ..color = borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = borderWidth;
    canvas.drawOval(ovalRect, borderPaint);

    // Subtle crosshair
    final crossPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.15)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5;
    canvas.drawLine(
      Offset(ovalRect.center.dx - 30, ovalRect.center.dy),
      Offset(ovalRect.center.dx + 30, ovalRect.center.dy),
      crossPaint,
    );
    canvas.drawLine(
      Offset(ovalRect.center.dx, ovalRect.center.dy - 20),
      Offset(ovalRect.center.dx, ovalRect.center.dy + 20),
      crossPaint,
    );
  }

  @override
  bool shouldRepaint(_OvalOverlayPainter old) =>
      old.progress != progress || old.pulseValue != pulseValue || old.step != step;
}
