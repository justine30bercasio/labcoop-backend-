import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/dio_client.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';

class CoinCatcherPage extends StatefulWidget {
  const CoinCatcherPage({super.key});

  @override
  State<CoinCatcherPage> createState() => _CoinCatcherPageState();
}

class _CoinCatcherPageState extends State<CoinCatcherPage>
    with TickerProviderStateMixin {
  final _source = LocalDbSource();
  final _api = RemoteApiSource(DioClient.create());
  final _secureStorage = const FlutterSecureStorage();

  late AnimationController _gameLoop;
  late AnimationController _piggyIdle;
  int _score = 0;
  int _coinsEarned = 0;
  int _lives = 3;
  double _basketX = 0.5;
  double _basketSize = 0.2;
  bool _gameOver = false;
  bool _gameStarted = false;

  final List<_FallingCoin> _coins = [];
  final List<_ScorePopup> _popups = [];
  final List<_Particle> _particles = [];
  final Random _rng = Random();
  int _frameCount = 0;
  double _speed = 0.006;
  double _spawnRate = 0.025;
  int _highScore = 0;
  int _combo = 0;
  int _maxCombo = 0;
  double _piggyBounce = 0;
  double _shakeOffset = 0;
  double _lastCatchX = 0;
  double _lastCatchY = 0;
  bool _showCatchFlash = false;
  double _comboAnim = 0;

  @override
  void initState() {
    super.initState();
    _gameLoop = AnimationController(vsync: this, duration: const Duration(seconds: 60))
      ..addListener(_update);
    _piggyIdle = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _gameLoop.dispose();
    _piggyIdle.dispose();
    super.dispose();
  }

  void startGame() {
    setState(() {
      _gameStarted = true;
      _gameOver = false;
      _score = 0;
      _coinsEarned = 0;
      _lives = 3;
      _coins.clear();
      _popups.clear();
      _particles.clear();
      _speed = 0.006;
      _spawnRate = 0.025;
      _basketX = 0.5;
      _frameCount = 0;
      _combo = 0;
      _maxCombo = 0;
      _piggyBounce = 0;
      _shakeOffset = 0;
      _comboAnim = 0;
    });
    _gameLoop.reset();
    _gameLoop.forward();
  }

  void _update() {
    if (_gameOver) return;

    _frameCount++;

    if (_rng.nextDouble() < _spawnRate) {
      _coins.add(_FallingCoin(
        x: _rng.nextDouble() * 0.85 + 0.05,
        y: -0.08,
        speed: _speed * (0.7 + _rng.nextDouble() * 0.6),
        isBad: _rng.nextDouble() < 0.2,
        size: 0.035 + _rng.nextDouble() * 0.025,
      ));
    }

    for (final coin in _coins) {
      coin.y += coin.speed;
    }

    if (_piggyBounce > 0) _piggyBounce *= 0.85;
    if (_shakeOffset > 0) _shakeOffset *= 0.85;
    if (_comboAnim > 0) _comboAnim *= 0.9;
    if (_showCatchFlash) _showCatchFlash = false;

    for (final popup in _popups) {
      popup.y -= 0.008;
      popup.life -= 0.02;
      popup.scale = 1 + (1 - popup.life) * 0.3;
    }
    _popups.removeWhere((p) => p.life <= 0);

    for (final p in _particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.002;
      p.life -= 0.02;
      p.size *= 0.97;
    }
    _particles.removeWhere((p) => p.life <= 0);

    final toRemove = <int>[];
    for (int i = _coins.length - 1; i >= 0; i--) {
      final coin = _coins[i];
      if (coin.y > 1.1) {
        toRemove.add(i);
        if (!coin.isBad) {
          _lives--;
          _combo = 0;
          _shakeOffset = 8;
          _piggyBounce = -0.05;
          for (int j = 0; j < 8; j++) {
            _particles.add(_Particle(
              x: coin.x, y: 0.95,
              vx: (_rng.nextDouble() - 0.5) * 0.02,
              vy: -_rng.nextDouble() * 0.02,
              life: 1, maxLife: 1,
              size: 4 + _rng.nextDouble() * 4,
              color: Colors.red.shade300,
            ));
          }
        }
        continue;
      }
      if (coin.y > 0.85 && coin.y < 1.02) {
        final basketLeft = _basketX - _basketSize * 0.4;
        final basketRight = _basketX + _basketSize * 0.4;
        if (coin.x >= basketLeft && coin.x <= basketRight) {
          toRemove.add(i);
          if (coin.isBad) {
            _lives--;
            _combo = 0;
            _shakeOffset = 6;
            _piggyBounce = -0.03;
            for (int j = 0; j < 6; j++) {
              _particles.add(_Particle(
                x: coin.x, y: coin.y,
                vx: (_rng.nextDouble() - 0.5) * 0.015,
                vy: (_rng.nextDouble() - 0.5) * 0.015,
                life: 1, maxLife: 1,
                size: 3 + _rng.nextDouble() * 4,
                color: Colors.orange.shade400,
              ));
            }
          } else {
            _score += coin.value;
            _coinsEarned += coin.value ~/ 2 + 1;
            _combo++;
            if (_combo > _maxCombo) _maxCombo = _combo;
            _piggyBounce = 0.08;
            _showCatchFlash = true;
            _lastCatchX = coin.x;
            _lastCatchY = coin.y;
            _comboAnim = 1;
            _popups.add(_ScorePopup(
              x: coin.x + (_rng.nextDouble() - 0.5) * 0.05,
              y: coin.y - 0.05,
              text: _combo > 1 ? '+${coin.value}x$_combo' : '+${coin.value}',
              life: 1,
              scale: 1,
            ));
            for (int j = 0; j < 14; j++) {
              final angle = _rng.nextDouble() * 2 * pi;
              final speed = 0.005 + _rng.nextDouble() * 0.015;
              _particles.add(_Particle(
                x: coin.x, y: coin.y,
                vx: cos(angle) * speed,
                vy: sin(angle) * speed - 0.01,
                life: 1, maxLife: 1,
                size: 2 + _rng.nextDouble() * 3,
                color: _rng.nextBool() ? AppTheme.coinGold : const Color(0xFFFFD54F),
              ));
            }
          }
        }
      }
    }

    for (final i in toRemove.reversed) {
      if (i < _coins.length) _coins.removeAt(i);
    }

    if (_frameCount % 300 == 0) {
      _speed *= 1.06;
      _spawnRate *= 1.03;
    }

    if (_lives <= 0) endGame();

    if (mounted) setState(() {});
  }

  Future<void> endGame() async {
    _gameLoop.stop();
    setState(() => _gameOver = true);
    if (_coinsEarned > 0) {
      await _source.addCoins(_coinsEarned);
      // Sync to server (fire-and-forget)
      _syncCoinsToServer();
    }
    if (_score > _highScore) {
      _highScore = _score;
    }
  }

  Future<void> _syncCoinsToServer() async {
    try {
      final accountId = await _secureStorage.read(key: 'account_id');
      if (accountId == null) return;
      await _api.addCoins(accountId, _coinsEarned, 'game_reward');
    } catch (_) {
      // Will be retried via pending ops or next sync
    }
  }

  void moveBasket(double dx) {
    if (_gameOver || !_gameStarted) return;
    setState(() {
      _basketX = (_basketX + dx).clamp(_basketSize * 0.4, 1 - _basketSize * 0.4);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_gameStarted || _gameOver) return _buildMenu();

    return Scaffold(
      backgroundColor: const Color(0xFF1a1a2e),
      body: GestureDetector(
        onTapDown: (d) {
          final mid = MediaQuery.of(context).size.width / 2;
          moveBasket(d.localPosition.dx < mid ? -0.06 : 0.06);
        },
        onPanUpdate: (d) {
          final dx = d.delta.dx / MediaQuery.of(context).size.width;
          moveBasket(dx * 2);
        },
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final w = constraints.maxWidth;
              final h = constraints.maxHeight;
              return RepaintBoundary(
                child: Stack(
                  children: [
                    CustomPaint(
                      size: Size(w, h),
                      painter: _BackgroundPainter(frame: _frameCount),
                    ),
                    RepaintBoundary(
                      child: CustomPaint(
                        size: Size(w, h),
                        painter: _GamePainter(
                          coins: _coins,
                          particles: _particles,
                          popups: _popups,
                          shakeOffset: _shakeOffset,
                          showCatchFlash: _showCatchFlash,
                          lastCatchX: _lastCatchX,
                          lastCatchY: _lastCatchY,
                          comboAnim: _comboAnim,
                        ),
                      ),
                    ),
                    Positioned(
                      top: 12,
                      left: 16,
                      child: _buildHud(),
                    ),
                    if (_combo > 1)
                      Positioned(
                        top: 50,
                        left: 0,
                        right: 0,
                        child: IgnorePointer(
                          child: Center(
                            child: Opacity(
                              opacity: _comboAnim,
                              child: Transform.scale(
                                scale: 1 + (1 - _comboAnim) * 0.5,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: AppTheme.coinGold.withValues(alpha: 0.3),
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(color: AppTheme.coinGold, width: 1.5),
                                  ),
                                  child: Text(
                                    'x$_combo COMBO!',
                                    style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    _buildPiggy(w, h),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildPiggy(double w, double h) {
    final pw = _basketSize * w * 2.8;
    final ph = pw * 0.65;
    final bx = _basketX * w;
    final by = h * 0.9;
    final bounce = _piggyBounce * pw * 2;
    final idleBob = sin(_piggyIdle.value * pi) * 2.5;

    return Positioned(
      left: bx - pw / 2,
      top: by - ph + bounce.abs() * 3 + idleBob,
      child: Transform.rotate(
        angle: sin(_shakeOffset * 5) * _shakeOffset * 0.02,
        child: _PiggyBankWidget(width: pw, height: ph),
      ),
    );
  }

  Widget _buildHud() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.monetization_on, color: AppTheme.coinGold, size: 22),
            const SizedBox(width: 4),
            Text(
              '$_coinsEarned',
              style: const TextStyle(color: AppTheme.coinGold, fontSize: 18, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: List.generate(3, (i) {
            return Padding(
              padding: const EdgeInsets.only(right: 3),
              child: Icon(
                i < _lives ? Icons.favorite : Icons.favorite_border,
                color: i < _lives ? Colors.red.shade400 : Colors.grey.shade600,
                size: 22,
              ),
            );
          }),
        ),
      ],
    );
  }

  Widget _buildMenu() {
    final isGameOver = _gameOver;
    return Scaffold(
      backgroundColor: const Color(0xFF1a1a2e),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(height: 20),
                _PiggyBankWidget(width: 260, height: 170),
                const SizedBox(height: 24),
                const Text(
                  'Coin Catcher',
                  style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 2),
                ),
                const SizedBox(height: 8),
                Text(
                  isGameOver ? 'Game Over!' : 'Catch coins with your piggy!',
                  style: TextStyle(fontSize: 16, color: Colors.white.withValues(alpha: 0.7)),
                ),
                const SizedBox(height: 24),
                if (isGameOver) ...[
                  _buildStatRow('Score', '$_score', AppTheme.coinGold),
                  const SizedBox(height: 4),
                  _buildStatRow('Coins Earned', '$_coinsEarned 🪙', Colors.amber),
                  const SizedBox(height: 4),
                  _buildStatRow('Best Combo', 'x$_maxCombo', Colors.cyanAccent),
                  const SizedBox(height: 4),
                  _buildStatRow('High Score', '$_highScore', Colors.pinkAccent),
                  if (_coinsEarned > 0) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.coinGold.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppTheme.coinGold.withValues(alpha: 0.5)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.add_circle, color: AppTheme.coinGold, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            '+$_coinsEarned coins added!',
                            style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.coinGold, fontSize: 16),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                ] else ...[
                  const SizedBox(height: 8),
                  _buildTipRow(Icons.touch_app, 'Tap sides to move'),
                  const SizedBox(height: 4),
                  _buildTipRow(Icons.drag_indicator, 'Or drag to steer'),
                  const SizedBox(height: 4),
                  _buildTipRow(Icons.monetization_on, '🪙 Catch coins for points'),
                  const SizedBox(height: 4),
                  _buildTipRow(Icons.warning_amber, '☠️ Avoid rocks — 3 lives'),
                ],
                const SizedBox(height: 32),
                _buildPlayButton(isGameOver),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatRow(String label, String value, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 15)),
          Text(value, style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildTipRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Row(
        children: [
          Icon(icon, color: Colors.white54, size: 18),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(color: Colors.white54, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildPlayButton(bool isGameOver) {
    return GestureDetector(
      onTap: startGame,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF43A047), Color(0xFF2E7D32)]),
          borderRadius: BorderRadius.circular(30),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF43A047).withValues(alpha: 0.4),
              blurRadius: 20,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(isGameOver ? Icons.refresh : Icons.play_arrow, color: Colors.white, size: 28),
            const SizedBox(width: 8),
            Text(
              isGameOver ? 'Play Again' : 'Start Game',
              style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}

class _PiggyBankWidget extends StatelessWidget {
  final double width;
  final double height;

  const _PiggyBankWidget({
    required this.width,
    required this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/coincatcher.png',
      width: width,
      height: height,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Icon(Icons.pets, color: Colors.white.withValues(alpha: 0.6), size: width * 0.4),
    );
  }
}

class _FallingCoin {
  double x, y, speed, size;
  bool isBad;
  int value;
  _FallingCoin({required this.x, required this.y, required this.speed, this.isBad = false, this.size = 0.04, this.value = 1});
}

class _ScorePopup {
  double x, y, life, scale;
  String text;
  _ScorePopup({required this.x, required this.y, required this.text, required this.life, this.scale = 1});
}

class _Particle {
  double x, y, vx, vy, life, maxLife, size;
  Color color;
  _Particle({required this.x, required this.y, required this.vx, required this.vy, required this.life, required this.maxLife, required this.size, required this.color});
}

class _BackgroundPainter extends CustomPainter {
  final int frame;
  _BackgroundPainter({required this.frame});

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    var bgPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF0f0f23), Color(0xFF1a1a2e), Color(0xFF16213e)],
      ).createShader(Rect.fromLTWH(0, 0, w, h));
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), bgPaint);
    var groundPaint = Paint()
      ..shader = RadialGradient(
        center: const Alignment(0, 1),
        radius: 1.2,
        colors: [const Color(0xFF2E7D32).withValues(alpha: 0.15), Colors.transparent],
      ).createShader(Rect.fromLTWH(0, 0, w, h));
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), groundPaint);
    var starPaint = Paint()..color = Colors.white.withValues(alpha: 0.3);
    final rng = Random(42);
    for (int i = 0; i < 30; i++) {
      final sx = rng.nextDouble() * w;
      final sy = rng.nextDouble() * h * 0.6;
      final twinkle = sin((frame + i * 100) * 0.03) * 0.3 + 0.7;
      starPaint.color = Colors.white.withValues(alpha: 0.15 * twinkle);
      canvas.drawCircle(Offset(sx, sy), 1 + rng.nextDouble() * 1.5, starPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _BackgroundPainter old) => old.frame != frame;
}

class _GamePainter extends CustomPainter {
  final List<_FallingCoin> coins;
  final List<_Particle> particles;
  final List<_ScorePopup> popups;
  final double shakeOffset;
  final bool showCatchFlash;
  final double lastCatchX, lastCatchY, comboAnim;

  _GamePainter({
    required this.coins,
    required this.particles,
    required this.popups,
    required this.shakeOffset,
    required this.showCatchFlash,
    required this.lastCatchX,
    required this.lastCatchY,
    required this.comboAnim,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    canvas.save();
    if (shakeOffset > 0.5) {
      canvas.translate(
        sin(shakeOffset * 5) * shakeOffset,
        cos(shakeOffset * 7) * shakeOffset * 0.5,
      );
    }

    for (final coin in coins) {
      final cx = coin.x * w;
      final cy = coin.y * h;
      final r = coin.size * w;
      if (coin.isBad) {
        _drawRock(canvas, cx, cy, r);
      } else {
        _drawCoin(canvas, cx, cy, r);
      }
    }

    for (final p in particles) {
      final alpha = (p.life / p.maxLife).clamp(0.0, 1.0);
      final paint = Paint()
        ..color = p.color.withValues(alpha: alpha)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);
      canvas.drawCircle(Offset(p.x * w, p.y * h), p.size, paint);
    }

    for (final popup in popups) {
      final alpha = popup.life.clamp(0.0, 1.0);
      final isCombo = popup.text.contains('x');
      final tp = TextPainter(
        text: TextSpan(
          text: popup.text,
          style: TextStyle(
            color: isCombo ? Colors.cyanAccent : AppTheme.coinGold,
            fontSize: 18 * popup.scale,
            fontWeight: FontWeight.w900,
            shadows: [Shadow(
              color: Colors.black.withValues(alpha: 0.6),
              blurRadius: 4, offset: const Offset(1, 1),
            )],
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(
        popup.x * w - tp.width / 2,
        popup.y * h - tp.height / 2,
      )..translate(0, -10 * (1 - alpha)));
    }

    if (showCatchFlash) {
      final flashPaint = Paint()
        ..color = AppTheme.coinGold.withValues(alpha: 0.3 * comboAnim)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 15);
      canvas.drawCircle(
        Offset(lastCatchX * w, lastCatchY * h),
        30 * comboAnim,
        flashPaint,
      );
    }

    canvas.restore();
  }

  void _drawCoin(Canvas canvas, double cx, double cy, double r) {
    var glow = Paint()
      ..color = AppTheme.coinGold.withValues(alpha: 0.2)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawCircle(Offset(cx, cy), r * 1.3, glow);

    var grad = Paint()
      ..shader = RadialGradient(
        colors: const [Color(0xFFFFF176), Color(0xFFFFB300), Color(0xFFF57F17)],
        stops: const [0, 0.6, 1],
      ).createShader(Rect.fromCircle(center: Offset(cx, cy), radius: r));
    canvas.drawCircle(Offset(cx, cy), r, grad);

    var ring = Paint()
      ..color = const Color(0xFFFFD54F)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawCircle(Offset(cx, cy), r * 0.72, ring);

    final tp = TextPainter(
      text: const TextSpan(
        text: '\$',
        style: TextStyle(color: Color(0xFFBF360C), fontSize: 12, fontWeight: FontWeight.bold),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(cx - tp.width / 2, cy - tp.height / 2));

    var shine = Paint()
      ..color = Colors.white.withValues(alpha: 0.4)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);
    canvas.drawCircle(Offset(cx - r * 0.25, cy - r * 0.25), r * 0.3, shine);
  }

  void _drawRock(Canvas canvas, double cx, double cy, double r) {
    var shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.2)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    canvas.drawCircle(Offset(cx + 2, cy + 2), r, shadow);

    var rock = Paint()
      ..shader = RadialGradient(
        colors: [Colors.grey.shade400, Colors.grey.shade700, Colors.grey.shade900],
        stops: const [0, 0.5, 1],
      ).createShader(Rect.fromCircle(center: Offset(cx, cy), radius: r));
    canvas.drawCircle(Offset(cx, cy), r, rock);

    var crack = Paint()
      ..color = Colors.black38
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    canvas.drawLine(Offset(cx, cy - r * 0.3), Offset(cx + r * 0.4, cy + r * 0.2), crack);
    canvas.drawLine(Offset(cx - r * 0.2, cy + r * 0.1), Offset(cx + r * 0.1, cy - r * 0.5), crack);

    var eye = Paint()..color = Colors.red.shade800;
    canvas.drawCircle(Offset(cx - r * 0.25, cy - r * 0.15), r * 0.12, eye);
    canvas.drawCircle(Offset(cx + r * 0.25, cy - r * 0.15), r * 0.12, eye);
    var pupil = Paint()..color = Colors.black;
    canvas.drawCircle(Offset(cx - r * 0.25, cy - r * 0.15), r * 0.06, pupil);
    canvas.drawCircle(Offset(cx + r * 0.25, cy - r * 0.15), r * 0.06, pupil);
  }

  @override
  bool shouldRepaint(covariant _GamePainter old) => true;
}
