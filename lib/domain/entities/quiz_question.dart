class QuizQuestion {
  final String question;
  final List<String> options;
  final int correctIndex;
  final String explanation;
  final int xpReward;
  final int coinReward;
  final String category;

  const QuizQuestion({
    required this.question,
    required this.options,
    required this.correctIndex,
    required this.explanation,
    this.xpReward = 5,
    this.coinReward = 2,
    this.category = 'Savings',
  });
}
