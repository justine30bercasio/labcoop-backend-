import 'package:dio/dio.dart';
import '../../core/network/dio_client.dart';

class GameInfo {
  final String id;
  final String title;
  final String emoji;
  final String category;
  final String description;
  final String embedUrl;
  final int plays;

  const GameInfo({
    required this.id,
    required this.title,
    required this.emoji,
    required this.category,
    required this.description,
    required this.embedUrl,
    this.plays = 0,
  });

  factory GameInfo.fromJson(Map<String, dynamic> json) => GameInfo(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        emoji: json['emoji'] as String? ?? '🎮',
        category: json['category'] as String? ?? 'General',
        description: json['description'] as String? ?? '',
        embedUrl: json['embedUrl'] as String? ?? '',
        plays: json['plays'] as int? ?? 0,
      );
}

class GameApiService {
  final Dio _dio;

  GameApiService() : _dio = DioClient.create();

  GameApiService.test(this._dio);

  static const _localGames = <GameInfo>[
    // ── Arcade ──
    GameInfo(id: 'snake', title: 'Snake', emoji: '🐍', category: 'Arcade', description: 'Guide your snake to eat and grow!', embedUrl: 'https://gamezipper.com/snake/', plays: 98000),
    GameInfo(id: '2048', title: '2048', emoji: '🔢', category: 'Arcade', description: 'Merge tiles to reach 2048!', embedUrl: 'https://gamezipper.com/2048/', plays: 78000),
    GameInfo(id: 'slope', title: 'Slope', emoji: '📐', category: 'Arcade', description: 'Roll a ball down a steep slope!', embedUrl: 'https://gamezipper.com/slope/', plays: 65000),
    GameInfo(id: 'brick-breaker', title: 'Brick Breaker', emoji: '🧱', category: 'Arcade', description: 'Break all the bricks with your ball!', embedUrl: 'https://gamezipper.com/brick-breaker/', plays: 55000),
    GameInfo(id: 'pong', title: 'Pong', emoji: '🏓', category: 'Arcade', description: 'Classic arcade table tennis!', embedUrl: 'https://gamezipper.com/pong/', plays: 72000),
    GameInfo(id: 'flappy-wings', title: 'Flappy Wings', emoji: '🐦', category: 'Arcade', description: 'Flap through gaps — how far can you go?', embedUrl: 'https://gamezipper.com/flappy-wings/', plays: 89000),
    GameInfo(id: 't-rex-runner', title: 'T-Rex Runner', emoji: '🦖', category: 'Arcade', description: 'Jump over cacti like the Chrome dino!', embedUrl: 'https://gamezipper.com/t-rex/', plays: 95000),
    GameInfo(id: 'stacker', title: 'Stacker', emoji: '📦', category: 'Arcade', description: 'Stack blocks to build a tower!', embedUrl: 'https://gamezipper.com/stacker/', plays: 34000),
    GameInfo(id: 'alien-whack', title: 'Alien Whack', emoji: '👾', category: 'Arcade', description: 'Whack aliens as they pop up!', embedUrl: 'https://gamezipper.com/alien-whack/', plays: 41000),
    GameInfo(id: 'ball-catch', title: 'Ball Catch', emoji: '⚾', category: 'Arcade', description: 'Catch falling balls with your paddle!', embedUrl: 'https://gamezipper.com/ball-catch/', plays: 28000),
    GameInfo(id: 'bounce-bot', title: 'Bounce Bot', emoji: '🤖', category: 'Arcade', description: 'Help the robot bounce through obstacles!', embedUrl: 'https://gamezipper.com/bounce-bot/', plays: 32000),
    GameInfo(id: 'neon-run', title: 'Neon Run', emoji: '💜', category: 'Arcade', description: 'Run through a neon-lit endless corridor!', embedUrl: 'https://gamezipper.com/neon-run/', plays: 46000),
    // ── Puzzle ──
    GameInfo(id: 'sudoku', title: 'Sudoku', emoji: '🧮', category: 'Puzzle', description: 'Fill the grid with numbers 1-9!', embedUrl: 'https://gamezipper.com/sudoku/', plays: 58000),
    GameInfo(id: 'minesweeper', title: 'Minesweeper', emoji: '💣', category: 'Puzzle', description: 'Clear the minefield without hitting bombs!', embedUrl: 'https://gamezipper.com/minesweeper/', plays: 47000),
    GameInfo(id: 'memory-match', title: 'Memory Match', emoji: '🃏', category: 'Puzzle', description: 'Flip cards to find matching pairs!', embedUrl: 'https://gamezipper.com/memory-match/', plays: 52000),
    GameInfo(id: 'color-sort', title: 'Color Sort', emoji: '🎨', category: 'Puzzle', description: 'Sort colored liquids into tubes!', embedUrl: 'https://gamezipper.com/color-sort/', plays: 38000),
    GameInfo(id: 'word-puzzle', title: 'Word Puzzle', emoji: '📝', category: 'Puzzle', description: 'Arrange letters to form words!', embedUrl: 'https://gamezipper.com/word-puzzle/', plays: 31000),
    GameInfo(id: 'wood-block', title: 'Wood Block', emoji: '🪵', category: 'Puzzle', description: 'Fit wooden blocks into the grid!', embedUrl: 'https://gamezipper.com/wood-block-puzzle/', plays: 29000),
    GameInfo(id: 'crossword', title: 'Crossword', emoji: '📰', category: 'Puzzle', description: 'Solve crossword clues and fill the grid!', embedUrl: 'https://gamezipper.com/crossword/', plays: 25000),
    GameInfo(id: 'glyph-quest', title: 'Glyph Quest', emoji: '🔮', category: 'Puzzle', description: 'Match runes and clear the board!', embedUrl: 'https://gamezipper.com/glyph-quest/', plays: 18000),
    // ── Strategy ──
    GameInfo(id: 'chess', title: 'Chess', emoji: '♟️', category: 'Strategy', description: 'Play chess against the computer!', embedUrl: 'https://gamezipper.com/chess/', plays: 67000),
    GameInfo(id: 'sushi-stack', title: 'Sushi Stack', emoji: '🍣', category: 'Strategy', description: 'Stack sushi ingredients as high as possible!', embedUrl: 'https://gamezipper.com/sushi-stack/', plays: 22000),
    GameInfo(id: 'tetris', title: 'Tetris', emoji: '🧊', category: 'Strategy', description: 'Fit falling blocks to clear lines!', embedUrl: 'https://gamezipper.com/tetris/', plays: 86000),
    GameInfo(id: 'bolt-jam', title: 'Bolt Jam 3D', emoji: '🔩', category: 'Strategy', description: 'Sort colored bolts into matching nuts!', embedUrl: 'https://gamezipper.com/bolt-jam-3d/', plays: 15000),
    // ── Sports ──
    GameInfo(id: 'basketball-shoot', title: 'Basketball Shoot', emoji: '🏀', category: 'Sports', description: 'Shoot hoops and score big!', embedUrl: 'https://gamezipper.com/basketball-shoot/', plays: 54000),
    GameInfo(id: 'whack-a-mole', title: 'Whack-a-Mole', emoji: '🔨', category: 'Sports', description: 'Whack moles as they pop up!', embedUrl: 'https://gamezipper.com/whack-a-mole/', plays: 43000),
    GameInfo(id: 'reaction-time', title: 'Reaction Time', emoji: '⚡', category: 'Sports', description: 'Test how fast your brain processes!', embedUrl: 'https://gamezipper.com/reaction-time/', plays: 20000),
    GameInfo(id: 'catch-turkey', title: 'Catch Turkey', emoji: '🦃', category: 'Sports', description: 'Catch falling turkeys before they hit ground!', embedUrl: 'https://gamezipper.com/catch-turkey/', plays: 12000),
    // ── Simulation ──
    GameInfo(id: 'kitty-cafe', title: 'Kitty Cafe', emoji: '🐱', category: 'Simulation', description: 'Run a cafe and serve cute cats!', embedUrl: 'https://gamezipper.com/kitty-cafe/', plays: 36000),
    GameInfo(id: 'paint-splash', title: 'Paint Splash', emoji: '🎨', category: 'Simulation', description: 'Splash colors and create art!', embedUrl: 'https://gamezipper.com/paint-splash/', plays: 19000),
    GameInfo(id: 'dessert-blast', title: 'Dessert Blast', emoji: '🍰', category: 'Simulation', description: 'Match desserts to make combos!', embedUrl: 'https://gamezipper.com/dessert-blast/', plays: 33000),
    GameInfo(id: 'ocean-gem-pop', title: 'Ocean Gem Pop', emoji: '💎', category: 'Simulation', description: 'Shoot gems to match 3 or more!', embedUrl: 'https://gamezipper.com/ocean-gem-pop/', plays: 27000),
    GameInfo(id: 'abyss-chef', title: 'Abyss Chef', emoji: '🧑‍🍳', category: 'Simulation', description: 'Cook dishes for sea creatures!', embedUrl: 'https://gamezipper.com/abyss-chef/', plays: 14000),
    GameInfo(id: 'cloud-sheep', title: 'Cloud Sheep', emoji: '🐑', category: 'Simulation', description: 'Guide sheep through clouds to the finish!', embedUrl: 'https://gamezipper.com/cloud-sheep/', plays: 16000),
    GameInfo(id: 'idle-clicker', title: 'Idle Clicker', emoji: '👆', category: 'Simulation', description: 'Click to earn coins and upgrade!', embedUrl: 'https://gamezipper.com/idle-clicker/', plays: 42000),
    // ── Educational ──
    GameInfo(id: 'typing-speed', title: 'Typing Speed', emoji: '⌨️', category: 'Educational', description: 'Improve your typing speed!', embedUrl: 'https://gamezipper.com/typing-speed/', plays: 24000),
  ];

  static List<GameInfo> get localGames => _localGames;

  Future<List<GameInfo>> fetchGames({String? category, String? search}) async {
    try {
      final params = <String, dynamic>{};
      if (category != null && category != 'All') params['category'] = category;
      if (search != null && search.isNotEmpty) params['search'] = search;
      final response = await _dio.get(
        '/api/games',
        queryParameters: params.isNotEmpty ? params : null,
      );
      final data = response.data as Map<String, dynamic>;
      final games = (data['games'] as List?)?.cast<Map<String, dynamic>>() ?? [];
      return games.map((g) => GameInfo.fromJson(g)).toList();
    } catch (_) {
      return _localCatalog(category: category, search: search);
    }
  }

  Future<List<String>> fetchCategories() async {
    try {
      final response = await _dio.get('/api/games/categories');
      final data = response.data as Map<String, dynamic>;
      return (data['categories'] as List?)?.cast<String>() ?? [];
    } catch (_) {
      return _localCategories();
    }
  }

  List<GameInfo> _localCatalog({String? category, String? search}) {
    var games = _localGames;
    if (category != null && category != 'All') {
      games = games.where((g) => g.category == category).toList();
    }
    if (search != null && search.isNotEmpty) {
      final q = search.toLowerCase();
      games = games.where((g) =>
          g.title.toLowerCase().contains(q) ||
          g.description.toLowerCase().contains(q)).toList();
    }
    return games;
  }

  List<String> _localCategories() {
    return _localGames.map((g) => g.category).toSet().toList()..sort();
  }
}
