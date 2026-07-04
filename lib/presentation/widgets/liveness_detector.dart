import 'dart:async';
import 'dart:io';
import 'dart:math' show sqrt;
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

enum LivenessStep { initial, blink, turnLeft, turnRight, done }

class LivenessDetector extends StatefulWidget {
  final void Function(Uint8List selfieBytes, List<double> faceSignature) onComplete;
  final VoidCallback? onCancel;

  const LivenessDetector({super.key, required this.onComplete, this.onCancel});

  @override
  State<LivenessDetector> createState() => _LivenessDetectorState();
}

class _LivenessDetectorState extends State<LivenessDetector> with SingleTickerProviderStateMixin {
  CameraController? _controller;
  bool _initialized = false;
  LivenessStep _step = LivenessStep.initial;
  bool _processing = false;
  String? _error;
  Uint8List? _finalImage;
  List<double> _faceSignature = [];
  Timer? _autoCaptureTimer;
  int _countdown = 0;
  late AnimationController _pulseController;
  bool _submitted = false;

  String get _instruction {
    switch (_step) {
      case LivenessStep.initial:
        return 'Look at the camera';
      case LivenessStep.blink:
        return 'Blink your eyes';
      case LivenessStep.turnLeft:
        return 'Turn head left';
      case LivenessStep.turnRight:
        return 'Turn head right';
      case LivenessStep.done:
        return 'Face verified!';
    }
  }

  IconData get _stepIcon {
    switch (_step) {
      case LivenessStep.initial:
        return Icons.face;
      case LivenessStep.blink:
        return Icons.visibility;
      case LivenessStep.turnLeft:
        return Icons.rotate_left;
      case LivenessStep.turnRight:
        return Icons.rotate_right;
      case LivenessStep.done:
        return Icons.check_circle;
    }
  }

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
    _initCamera();
  }

  Future<void> _initCamera() async {
    final cameras = await availableCameras();
    final front = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );
    _controller = CameraController(front, ResolutionPreset.medium);
    await _controller!.initialize();
    if (mounted) {
      setState(() => _initialized = true);
      _startAutoCapture();
    }
  }

  void _startAutoCapture() {
    _autoCaptureTimer?.cancel();
    if (_step == LivenessStep.done) return;
    setState(() => _countdown = 3);
    _autoCaptureTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      final remaining = 3 - t.tick;
      setState(() => _countdown = remaining);
      if (remaining <= 0) {
        t.cancel();
        _capture();
      }
    });
  }

  Future<void> _capture() async {
    if (_processing) return;
    setState(() {
      _processing = true;
      _error = null;
    });

    try {
      final xfile = await _controller!.takePicture();
      await _analyzeImage(File(xfile.path));
    } catch (e) {
      if (mounted) {
        setState(() {
          _processing = false;
          _error = null;
        });
        _startAutoCapture();
      }
    }
  }

  Future<void> _analyzeImage(File file) async {
    final detector = FaceDetector(
      options: FaceDetectorOptions(
        enableClassification: true,
        enableLandmarks: true,
        enableContours: true,
        performanceMode: FaceDetectorMode.accurate,
      ),
    );

    try {
      final inputImage = InputImage.fromFile(file);
      final faces = await detector.processImage(inputImage);
      await detector.close();

      if (!mounted) return;
      if (faces.isEmpty) {
        setState(() {
          _processing = false;
          _error = 'No face';
        });
        _startAutoCapture();
        return;
      }

      final face = faces.first;
      final leftEye = face.leftEyeOpenProbability ?? 1.0;
      final rightEye = face.rightEyeOpenProbability ?? 1.0;
      final yaw = face.headEulerAngleY ?? 0;

      switch (_step) {
        case LivenessStep.initial:
          if (leftEye < 0.4 || rightEye < 0.4) {
            setState(() { _processing = false; _error = 'Open your eyes'; });
            _startAutoCapture();
            return;
          }
          if (yaw.abs() > 25) {
            setState(() { _processing = false; _error = 'Face the camera'; });
            _startAutoCapture();
            return;
          }
          setState(() { _step = LivenessStep.blink; _processing = false; _error = null; });
          _startAutoCapture();
          return;

        case LivenessStep.blink:
          if (leftEye > 0.4 && rightEye > 0.4) {
            setState(() { _processing = false; _error = 'Close your eyes'; });
            _startAutoCapture();
            return;
          }
          setState(() { _step = LivenessStep.turnLeft; _processing = false; _error = null; });
          _startAutoCapture();
          return;

        case LivenessStep.turnLeft:
          if (yaw < 20) {
            setState(() { _processing = false; _error = 'Turn left'; });
            _startAutoCapture();
            return;
          }
          setState(() { _step = LivenessStep.turnRight; _processing = false; _error = null; });
          _startAutoCapture();
          return;

        case LivenessStep.turnRight:
          if (yaw > -20) {
            setState(() { _processing = false; _error = 'Turn right'; });
            _startAutoCapture();
            return;
          }
          _faceSignature = _computeSignature(face);
          _finalImage = await file.readAsBytes();
          _autoCaptureTimer?.cancel();
          setState(() { _step = LivenessStep.done; _processing = false; _error = null; });
          return;

        case LivenessStep.done:
          break;
      }

      setState(() => _processing = false);
    } catch (e) {
      await detector.close();
      if (mounted) {
        setState(() { _processing = false; _error = null; });
        _startAutoCapture();
      }
    }
  }

  double _dist(double x1, double y1, double x2, double y2) {
    return sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
  }

  List<double> _computeSignature(Face face) {
    final landmarks = face.landmarks;
    final leye = landmarks[FaceLandmarkType.leftEye]?.position;
    final reye = landmarks[FaceLandmarkType.rightEye]?.position;
    final nose = landmarks[FaceLandmarkType.noseBase]?.position;
    final mouthL = landmarks[FaceLandmarkType.leftMouth]?.position;
    final mouthR = landmarks[FaceLandmarkType.rightMouth]?.position;

    if (leye != null && reye != null) {
      final lx = leye.x.toDouble();  final ly = leye.y.toDouble();
      final rx = reye.x.toDouble();  final ry = reye.y.toDouble();
      final eyeDist = _dist(lx, ly, rx, ry);
      if (eyeDist > 0 && nose != null) {
        final nx = nose.x.toDouble(); final ny = nose.y.toDouble();
        if (mouthL != null && mouthR != null) {
          final mlx = mouthL.x.toDouble(); final mly = mouthL.y.toDouble();
          final mrx = mouthR.x.toDouble(); final mry = mouthR.y.toDouble();
          final mouthCx = (mlx + mrx) / 2;
          final mouthCy = (mly + mry) / 2;
          final noseToMouth = _dist(nx, ny, mouthCx, mouthCy);
          final eyeCx = (lx + rx) / 2;
          final eyeCy = (ly + ry) / 2;
          final eyeToMouth = _dist(eyeCx, eyeCy, mouthCx, mouthCy);
          final noseToLeftEye = _dist(nx, ny, lx, ly);
          final noseToRightEye = _dist(nx, ny, rx, ry);
          return [
            eyeDist / eyeToMouth,
            noseToMouth / eyeDist,
            noseToLeftEye / eyeDist,
            noseToRightEye / eyeDist,
            (mrx - mlx) / eyeDist,
            (mry - mly) / eyeDist,
          ];
        }
        return [
          eyeDist / 100,
          _dist(nx, ny, lx, ly) / eyeDist,
          _dist(nx, ny, rx, ry) / eyeDist,
          face.boundingBox.width / face.boundingBox.height,
          face.headEulerAngleY ?? 0,
          face.headEulerAngleZ ?? 0,
        ];
      }
    }
    // Fallback: use bounding box + angles
    final bb = face.boundingBox;
    return [
      bb.width / bb.height,
      face.headEulerAngleY ?? 0,
      face.headEulerAngleZ ?? 0,
      face.leftEyeOpenProbability ?? 0,
      face.rightEyeOpenProbability ?? 0,
      face.smilingProbability ?? 0,
    ];
  }

  void _finish() {
    if (_submitted) return;
    _submitted = true;
    _autoCaptureTimer?.cancel();
    if (_finalImage == null) return;
    widget.onComplete(_finalImage!, _faceSignature);
  }

  @override
  void dispose() {
    _autoCaptureTimer?.cancel();
    _pulseController.dispose();
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: Colors.white)),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Mirrored camera preview
          Transform.flip(
            flipX: true,
            child: SizedBox(
              width: double.infinity,
              height: double.infinity,
              child: CameraPreview(_controller!),
            ),
          ),
          // Dark vignette overlay
          Container(color: Colors.black26),

          // Face oval guide
          Center(
            child: AnimatedBuilder(
              animation: _pulseController,
              builder: (_, __) {
                final pulse = 1 + (_pulseController.value * 0.03);
                return CustomPaint(
                  size: const Size(260, 340),
                  painter: _OvalPainter(
                    color: _step == LivenessStep.done
                        ? Colors.green
                        : _error != null
                            ? Colors.red
                            : Colors.white,
                    strokeWidth: 2.0 * pulse,
                  ),
                );
              },
            ),
          ),

          // Step indicator dots at top
          Positioned(
            top: MediaQuery.of(context).padding.top + 16,
            left: 0,
            right: 0,
            child: _buildStepDots(),
          ),

          // Instruction area at bottom
          Positioned(
            bottom: 80,
            left: 24,
            right: 24,
            child: Column(
              children: [
                // Instruction card
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.65),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(_stepIcon, color: Colors.white, size: 20),
                      const SizedBox(width: 10),
                      Text(
                        _instruction,
                        style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                // Countdown ring
                if (_step != LivenessStep.done)
                  _processing
                      ? const SizedBox(
                          width: 28, height: 28,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : SizedBox(
                          width: 28, height: 28,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              CircularProgressIndicator(
                                value: _countdown / 3,
                                strokeWidth: 2.5,
                                color: Colors.amber,
                                backgroundColor: Colors.white24,
                              ),
                              Text(
                                '$_countdown',
                                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                // Error
                if (_error != null) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.red.shade800.withValues(alpha: 0.85),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Done state overlay
          if (_step == LivenessStep.done)
            Positioned.fill(
              child: Container(
                color: Colors.black45,
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.check_circle, color: Colors.green, size: 72),
                      const SizedBox(height: 16),
                      const Text(
                        'Verification Complete',
                        style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: _finish,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          elevation: 0,
                        ),
                        child: const Text('Continue', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // Close button
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            left: 12,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 26),
              onPressed: () {
                _autoCaptureTimer?.cancel();
                widget.onCancel ?? Navigator.pop(context);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepDots() {
    const steps = [
      LivenessStep.initial,
      LivenessStep.blink,
      LivenessStep.turnLeft,
      LivenessStep.turnRight,
    ];
    final currentIndex = steps.indexOf(_step);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(steps.length, (i) {
        final isDone = i < currentIndex;
        final isCurrent = i == currentIndex;
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          width: isCurrent ? 28 : 8,
          height: 8,
          decoration: BoxDecoration(
            color: isDone ? Colors.green : isCurrent ? Colors.amber : Colors.white38,
            borderRadius: BorderRadius.circular(4),
          ),
        );
      }),
    );
  }
}

class _OvalPainter extends CustomPainter {
  final Color color;
  final double strokeWidth;

  _OvalPainter({required this.color, required this.strokeWidth});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;
    canvas.drawOval(Rect.fromLTWH(10, 10, size.width - 20, size.height - 20), paint);
  }

  @override
  bool shouldRepaint(covariant _OvalPainter old) =>
      old.color != color || old.strokeWidth != strokeWidth;
}
