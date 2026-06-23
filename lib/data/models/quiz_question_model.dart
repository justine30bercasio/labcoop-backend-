class QuizQuestionModel {
  final String id;
  final String question;
  final List<String> options;
  final int correctIndex;
  final String explanation;
  final String category;
  final String difficultyLevel;
  final int xpReward;
  final int coinReward;
  final bool isActive;

  const QuizQuestionModel({
    required this.id,
    required this.question,
    required this.options,
    required this.correctIndex,
    this.explanation = '',
    this.category = 'General',
    this.difficultyLevel = 'easy',
    this.xpReward = 10,
    this.coinReward = 5,
    this.isActive = true,
  });

  factory QuizQuestionModel.fromJson(Map<String, dynamic> json) {
    int i(v) => v is String ? int.parse(v) : v as int;
    return QuizQuestionModel(
      id: json['id'] as String,
      question: json['question'] as String,
      options: (json['options'] as List).map((e) => e as String).toList(),
      correctIndex: json['correct_index'] != null ? i(json['correct_index']) : 0,
      explanation: json['explanation'] as String? ?? '',
      category: json['category'] as String? ?? 'General',
      difficultyLevel: json['difficulty_level'] as String? ?? 'easy',
      xpReward: json['xp_reward'] != null ? i(json['xp_reward']) : 10,
      coinReward: json['coin_reward'] != null ? i(json['coin_reward']) : 5,
      isActive: (json['is_active'] != null ? i(json['is_active']) : 1) == 1,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'question': question,
    'options': options,
    'correct_index': correctIndex,
    'explanation': explanation,
    'category': category,
    'difficulty_level': difficultyLevel,
    'xp_reward': xpReward,
    'coin_reward': coinReward,
    'is_active': isActive ? 1 : 0,
  };
}
