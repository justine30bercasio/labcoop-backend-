import 'dart:math';
import 'package:flutter/material.dart';
import '../../core/constants/app_constants.dart';
import '../../core/network/dio_client.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';
import '../../data/models/quiz_question_model.dart';

class QuizPage extends StatefulWidget {
  const QuizPage({super.key});

  @override
  State<QuizPage> createState() => _QuizPageState();
}

class _QuizPageState extends State<QuizPage> with TickerProviderStateMixin {
  final _source = LocalDbSource();
  final _api = RemoteApiSource(DioClient.create());
  late AnimationController _celebrationCtrl;

  String? _selectedDifficulty;
  List<QuizQuestionModel> _allQuestions = [];
  List<int> _questionOrder = [];
  int _currentIndex = 0;
  int _score = 0;
  int _streak = 0;
  int _bestStreak = 0;
  int _highScore = 0;
  int _coinsEarned = 0;
  bool _answered = false;
  bool _gameOver = false;
  bool _loading = true;
  bool _loadingError = false;
  String? _selectedAnswer;
  int _correctCount = 0;
  int _totalQuestions = 0;

  static const _difficulties = [
    {'key': 'easy', 'label': 'Easy', 'icon': '🌱', 'color': Color(0xFF4CAF50), 'desc': 'Basic savings & money concepts'},
    {'key': 'medium', 'label': 'Medium', 'icon': '⚡', 'color': Color(0xFFFFA000), 'desc': 'Budgeting, interest & planning'},
    {'key': 'hard', 'label': 'Hard', 'icon': '🔥', 'color': Color(0xFFE53935), 'desc': 'Investing, inflation & credit'},
    {'key': 'expert', 'label': 'Expert', 'icon': '💡', 'color': Color(0xFF7B1FA2), 'desc': 'Advanced finance & strategies'},
  ];

  @override
  void initState() {
    super.initState();
    _celebrationCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 1));
    _loadHighScore();
  }

  @override
  void dispose() {
    _celebrationCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadHighScore() async {
    final highScore = await _source.getQuizHighScore();
    if (mounted) setState(() => _highScore = highScore);
  }

  Future<void> _selectDifficulty(String difficulty) async {
    setState(() {
      _selectedDifficulty = difficulty;
      _loading = true;
      _loadingError = false;
    });

    try {
      final questions = await _api.fetchQuizQuestions(difficulty: difficulty);
      if (questions.length < 5) {
        final fallback = _getFallbackQuestions(difficulty);
        questions.addAll(fallback);
      }
      if (mounted) _startQuiz(questions);
    } catch (_) {
      final fallback = _getFallbackQuestions(difficulty);
      if (fallback.isNotEmpty && mounted) {
        _startQuiz(fallback);
      } else if (mounted) {
        setState(() {
          _loading = false;
          _loadingError = true;
        });
      }
    }
  }

  List<QuizQuestionModel> _getFallbackQuestions(String difficulty) {
    final all = AppConstants.quizQuestions;
    final shuffled = List<int>.generate(all.length, (i) => i)..shuffle();
    return shuffled.take(min(20, all.length)).map((i) {
      final q = all[i];
      return QuizQuestionModel(
        id: 'fallback_$i',
        question: q['q'] as String,
        options: (q['o'] as List).cast<String>(),
        correctIndex: q['a'] as int? ?? 0,
        explanation: q['e'] as String? ?? '',
        category: q['cat'] as String? ?? 'General',
        difficultyLevel: difficulty,
        xpReward: difficulty == 'easy' ? 10 : difficulty == 'medium' ? 15 : difficulty == 'hard' ? 20 : 30,
        coinReward: difficulty == 'easy' ? 5 : difficulty == 'medium' ? 8 : difficulty == 'hard' ? 10 : 15,
      );
    }).toList();
  }

  void _startQuiz(List<QuizQuestionModel> questions) {
    final indices = List.generate(questions.length, (i) => i)..shuffle();
    setState(() {
      _allQuestions = questions;
      _questionOrder = indices;
      _totalQuestions = questions.length;
      _currentIndex = 0;
      _score = 0;
      _streak = 0;
      _bestStreak = 0;
      _coinsEarned = 0;
      _answered = false;
      _gameOver = false;
      _selectedAnswer = null;
      _correctCount = 0;
      _loading = false;
    });
  }

  void _answer(int index) {
    if (_answered || _gameOver) return;
    final q = _allQuestions[_questionOrder[_currentIndex]];
    setState(() {
      _answered = true;
      _selectedAnswer = q.options[index];
    });

    if (index == q.correctIndex) {
      _streak++;
      _bestStreak = max(_bestStreak, _streak);
      _correctCount++;
      final xpGain = q.xpReward + (_streak >= 3 ? 3 : 0);
      final coinGain = q.coinReward + (_streak >= 5 ? 2 : 0);
      _score += xpGain;
      _coinsEarned += coinGain;
      _source.addCoins(coinGain);
      _celebrationCtrl.forward(from: 0);
    } else {
      _streak = 0;
    }
  }

  void _nextQuestion() {
    if (_currentIndex >= _totalQuestions - 1) {
      _finishQuiz();
      return;
    }
    setState(() {
      _currentIndex++;
      _answered = false;
      _selectedAnswer = null;
    });
  }

  Future<void> _finishQuiz() async {
    setState(() => _gameOver = true);
    if (_score > _highScore) {
      await _source.setQuizHighScore(_score);
      setState(() => _highScore = _score);
    }
  }

  void _restart() {
    setState(() {
      _selectedDifficulty = null;
      _allQuestions = [];
      _questionOrder = [];
      _currentIndex = 0;
      _score = 0;
      _streak = 0;
      _bestStreak = 0;
      _coinsEarned = 0;
      _answered = false;
      _gameOver = false;
      _selectedAnswer = null;
      _correctCount = 0;
      _totalQuestions = 0;
      _loading = false;
      _loadingError = false;
    });
  }

  String get _difficultyLabel {
    for (final d in _difficulties) {
      if (d['key'] == _selectedDifficulty) return d['label'] as String;
    }
    return _selectedDifficulty?.toUpperCase() ?? '';
  }

  @override
  Widget build(BuildContext context) {
    if (_selectedDifficulty == null) return _buildDifficultySelect();
    if (_loading) return _buildLoading();
    if (_loadingError) return _buildError();
    if (_questionOrder.isEmpty) return _buildLoading();
    if (_gameOver) return _buildResults();
    return _buildQuiz();
  }

  Widget _buildLoading() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Financial Quiz'),
        backgroundColor: AppTheme.xpPurple,
        foregroundColor: Colors.white,
      ),
      body: const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppTheme.xpPurple),
            SizedBox(height: 16),
            Text('Loading questions...', style: TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  Widget _buildError() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Financial Quiz'),
        backgroundColor: AppTheme.xpPurple,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 48, color: Colors.grey),
            const SizedBox(height: 16),
            const Text('Could not load questions.'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => _selectDifficulty(_selectedDifficulty!),
              child: const Text('Retry'),
            ),
            TextButton(
              onPressed: _restart,
              child: const Text('Pick another level'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDifficultySelect() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Financial Quiz'),
        backgroundColor: AppTheme.xpPurple,
        foregroundColor: Colors.white,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text('Best: $_highScore',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF3E5F5), Color(0xFFF1F8E9)],
          ),
        ),
        child: Column(
          children: [
            const SizedBox(height: 32),
            const Text('Choose Your Level',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppTheme.textDark)),
            const SizedBox(height: 8),
            Text('Test your financial knowledge!',
                style: TextStyle(fontSize: 14, color: Colors.grey.shade600)),
            const SizedBox(height: 24),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                itemCount: _difficulties.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (_, i) {
                  final d = _difficulties[i];
                  return GestureDetector(
                    onTap: () => _selectDifficulty(d['key'] as String),
                    child: Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.grey.shade200),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 56, height: 56,
                            decoration: BoxDecoration(
                              color: (d['color'] as Color).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Center(child: Text(d['icon'] as String, style: const TextStyle(fontSize: 28))),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(d['label'] as String,
                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textDark)),
                                const SizedBox(height: 4),
                                Text(d['desc'] as String,
                                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                              ],
                            ),
                          ),
                          Icon(Icons.arrow_forward_ios, size: 16, color: Colors.grey.shade400),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuiz() {
    final q = _allQuestions[_questionOrder[_currentIndex]];
    final correctIndex = q.correctIndex;
    final explanation = q.explanation;

    return Scaffold(
      appBar: AppBar(
        title: Text('$_difficultyLabel Quiz'),
        backgroundColor: AppTheme.xpPurple,
        foregroundColor: Colors.white,
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF3E5F5), Color(0xFFF1F8E9)],
          ),
        ),
        child: Column(
          children: [
            _buildQuizHeader(),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildCategoryBadge(q.category),
                    const SizedBox(height: 16),
                    Text(
                      'Question ${_currentIndex + 1}/$_totalQuestions',
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      q.question,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textDark, height: 1.3),
                    ),
                    const SizedBox(height: 24),
                    ...q.options.asMap().entries.map((entry) => _optionCard(entry.key, entry.value, correctIndex, explanation)),
                    if (_answered)
                      Padding(
                        padding: const EdgeInsets.only(top: 20),
                        child: SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _nextQuestion,
                            icon: Icon(_currentIndex >= _totalQuestions - 1 ? Icons.flag : Icons.arrow_forward),
                            label: Text(
                              _currentIndex >= _totalQuestions - 1 ? 'See Results' : 'Next Question',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.xpPurple,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            ),
                          ),
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

  Widget _buildQuizHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.9),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 4)],
      ),
      child: Row(
        children: [
          _headerItem(Icons.stars, '$_score', 'Score'),
          const SizedBox(width: 16),
          _headerItem(Icons.local_fire_department, '$_streak', 'Streak'),
          const SizedBox(width: 16),
          _headerItem(Icons.monetization_on, '$_coinsEarned', 'Earned'),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppTheme.xpPurple.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text('Best: $_highScore',
                style: const TextStyle(color: AppTheme.xpPurple, fontWeight: FontWeight.bold, fontSize: 12)),
          ),
        ],
      ),
    );
  }

  Widget _headerItem(IconData icon, String value, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: AppTheme.xpPurple, size: 18),
        const SizedBox(width: 4),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textDark)),
        Text(' $label', style: TextStyle(color: Colors.grey.shade600, fontSize: 11)),
      ],
    );
  }

  Widget _buildCategoryBadge(String category) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: AppTheme.xpPurple.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(category,
              style: const TextStyle(color: AppTheme.xpPurple, fontSize: 12, fontWeight: FontWeight.bold)),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.grey.shade100,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(_difficultyLabel,
              style: TextStyle(color: Colors.grey.shade700, fontSize: 11, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }

  Widget _optionCard(int index, String text, int correctIndex, String explanation) {
    final isCorrect = index == correctIndex;
    final isSelected = _selectedAnswer == text;
    Color? bgColor;
    Color? borderColor;
    String? prefix;

    if (_answered) {
      if (isCorrect) {
        bgColor = Colors.green.shade50;
        borderColor = AppTheme.primaryGreen;
        prefix = '✅';
      } else if (isSelected && !isCorrect) {
        bgColor = Colors.red.shade50;
        borderColor = Colors.red;
        prefix = '❌';
      } else {
        bgColor = Colors.grey.shade50;
        borderColor = Colors.grey.shade300;
        prefix = '';
      }
    } else {
      bgColor = Colors.white;
      borderColor = Colors.grey.shade300;
      prefix = '';
    }

    return GestureDetector(
      onTap: _answered ? null : () => _answer(index),
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: borderColor,
              width: _answered && (isCorrect || (isSelected && !isCorrect)) ? 2 : 1),
          boxShadow: [
            if (!_answered)
              BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 4, offset: const Offset(0, 2)),
          ],
        ),
        child: Row(
          children: [
            if (_answered)
              Padding(padding: const EdgeInsets.only(right: 12), child: Text(prefix, style: const TextStyle(fontSize: 18))),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: _answered && isCorrect ? FontWeight.bold : FontWeight.normal,
                  color: _answered && isCorrect ? AppTheme.primaryGreen
                      : _answered && isSelected && !isCorrect ? Colors.red : AppTheme.textDark,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults() {
    final pct = _totalQuestions > 0 ? (_correctCount / _totalQuestions * 100).round() : 0;

    return Scaffold(
      appBar: AppBar(
        title: Text('$_difficultyLabel Complete!'),
        backgroundColor: AppTheme.xpPurple,
        foregroundColor: Colors.white,
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF3E5F5), Color(0xFFF1F8E9)],
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  pct >= 80 ? '🏆' : pct >= 50 ? '⭐' : '💪',
                  style: const TextStyle(fontSize: 80),
                ),
                const SizedBox(height: 16),
                Text(
                  pct >= 80 ? 'Financial Genius!' : pct >= 50 ? 'Great Effort!' : 'Keep Learning!',
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: AppTheme.textDark),
                ),
                const SizedBox(height: 8),
                Text(
                  '$_correctCount/$_totalQuestions correct ($_difficultyLabel)',
                  style: TextStyle(fontSize: 18, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 20)],
                  ),
                  child: Column(
                    children: [
                      _resultRow(Icons.stars, 'Score', '$_score XP', AppTheme.xpPurple),
                      const Divider(height: 24),
                      _resultRow(Icons.monetization_on, 'Coins Earned', '$_coinsEarned 🪙', AppTheme.coinGold),
                      const Divider(height: 24),
                      _resultRow(Icons.local_fire_department, 'Best Streak', '$_bestStreak', Colors.orange),
                      const Divider(height: 24),
                      _resultRow(Icons.emoji_events, 'High Score', '$_highScore XP', AppTheme.accentAmber),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _restart,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Change Level', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.xpPurple,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _resultRow(IconData icon, String label, String value, Color color) {
    return Row(
      children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(width: 12),
        Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 15)),
        const Spacer(),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: AppTheme.textDark)),
      ],
    );
  }
}
