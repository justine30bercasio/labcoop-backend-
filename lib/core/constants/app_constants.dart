class AppConstants {
  static const String appName = 'LabCoop';
  // Override at build time: flutter run --dart-define=BASE_URL=https://your-api.com
  static const String baseUrl = String.fromEnvironment('BASE_URL', defaultValue: 'https://labcoop-backend.onrender.com');
  static const Duration cacheExpiry = Duration(hours: 1);
  static const int xpPerPesoAllocated = 1;

  static const Map<String, String> iconMap = {
    'school': '📚',
    'bike': '🚲',
    'shoes': '👟',
    'toy': '🧸',
    'book': '📚',
    'game': '🎮',
    'gaming': '🎮',
    'savings': '🐷',
    'charity': '🎁',
    'gadget': '📱',
    'music': '🎵',
    'clothing': '👕',
    'food': '🍕',
    'art': '🎨',
    'sports': '⚽',
    'tech': '💻',
    'gift': '🎁',
    'vehicle': '🚗',
  };

  static String displayIcon(String icon) {
    if (icon.length == 1 || icon.runes.length == 1) {
      return icon;
    }
    return iconMap[icon.toLowerCase()] ?? icon;
  }

  static const List<String> badgeNames = [
    'First Saver',
    'Steady Saver',
    'Goal Getter',
    'Penny Pincher',
    'Super Saver',
    'Savings Champion',
    'Century Club',
    'Millionaire Mindset',
  ];

  static const List<int> badgeXpThresholds = [
    10, 50, 100, 200, 500, 1000, 2500, 5000,
  ];

  static const String appThemeColor = '#2E7D32';
  static const String appAccentColor = '#FFC107';
  static const String appBackgroundColor = '#F1F8E9';

  static const List<int> petEvolutionXpThresholds = [
    0, 50, 150, 300, 600, 1200, 2500,
  ];

  static const List<String> petEvolutionEmojis = [
    '🥚', '🐷', '🐖', '🐗', '🦔', '🦄', '🐉',
  ];

  static const List<String> petEvolutionNames = [
    'Egg',
    'Baby Pig',
    'Teen Pig',
    'Adult Pig',
    'Golden Pig',
    'Diamond Pig',
    'Legendary Pig',
  ];

  static const List<Map<String, dynamic>> townBuildings = [
    {'id': 'b_house', 'name': 'Cozy House', 'emoji': '🏠', 'cost': 10, 'bonus': 'xp', 'value': 0.05, 'desc': '+5% XP from savings'},
    {'id': 'b_bank', 'name': 'Savings Bank', 'emoji': '🏦', 'cost': 25, 'bonus': 'interest', 'value': 0.02, 'desc': '+2% savings interest'},
    {'id': 'b_school', 'name': 'Fin School', 'emoji': '🏫', 'cost': 40, 'bonus': 'xp', 'value': 0.1, 'desc': '+10% XP from quiz'},
    {'id': 'b_park', 'name': 'Dream Park', 'emoji': '🌳', 'cost': 15, 'bonus': 'happiness', 'value': 10, 'desc': '+10 pet happiness'},
    {'id': 'b_shop', 'name': 'Coin Shop', 'emoji': '🏪', 'cost': 30, 'bonus': 'coins', 'value': 1, 'desc': '+1 coin per quiz'},
    {'id': 'b_gym', 'name': 'Training Gym', 'emoji': '🏟️', 'cost': 50, 'bonus': 'xp', 'value': 0.05, 'desc': '+5% XP from quizzes'},
    {'id': 'b_hospital', 'name': 'Pet Clinic', 'emoji': '🏥', 'cost': 35, 'bonus': 'heal', 'value': 5, 'desc': '+5 heal per potion'},
    {'id': 'b_library', 'name': 'Knowledge Hall', 'emoji': '📚', 'cost': 45, 'bonus': 'quiz', 'value': 1, 'desc': '+1 coin per quiz'},
    {'id': 'b_castle', 'name': 'Dream Castle', 'emoji': '🏰', 'cost': 100, 'bonus': 'prestige', 'value': 1, 'desc': 'Unlocks legendary rewards'},
    {'id': 'b_farm', 'name': 'Piggy Farm', 'emoji': '🌾', 'cost': 20, 'bonus': 'feed', 'value': 2, 'desc': 'Double pet feed effect'},
  ];

  static const List<Map<String, dynamic>> quizQuestions = [
    {
      'q': 'What is the best reason to save money?',
      'o': ['To spend it all today', 'To reach future goals', 'To hide it', 'To lose it'],
      'a': 1,
      'e': 'Saving helps you reach your goals, like buying a toy or going to college!',
      'cat': 'Savings',
    },
    {
      'q': 'What does "budget" mean?',
      'o': ['A plan for your money', 'A type of toy', 'A video game', 'A food item'],
      'a': 0,
      'e': 'A budget is a plan that helps you decide how much to save, spend, and share!',
      'cat': 'Budgeting',
    },
    {
      'q': 'If you have ₱100 and save ₱20 each week, how much will you save in 5 weeks?',
      'o': ['₱50', '₱100', '₱150', '₱200'],
      'a': 1,
      'e': '₱20 × 5 weeks = ₱100. Saving a little each week adds up fast!',
      'cat': 'Math',
    },
    {
      'q': 'What is a "goal jar"?',
      'o': ['A jar for cookies', 'A savings target for something you want', 'A toy container', 'A type of candy'],
      'a': 1,
      'e': 'A goal jar is where you save money for a specific thing you want to buy!',
      'cat': 'Savings',
    },
    {
      'q': 'Which is a WANT instead of a NEED?',
      'o': ['Food', 'Water', 'Video game', 'Shelter'],
      'a': 2,
      'e': 'Food, water, and shelter are needs. A video game is a want — something nice but not necessary!',
      'cat': 'Savings',
    },
    {
      'q': 'What does "interest" mean in a bank?',
      'o': ['Something boring', 'Free money the bank gives you for saving', 'A fee you pay', 'A type of game'],
      'a': 1,
      'e': 'Banks pay you interest as a "thank you" for keeping your money there. Your money grows!',
      'cat': 'Banking',
    },
    {
      'q': 'If a toy costs ₱300 and you save ₱30 per week, how many weeks to buy it?',
      'o': ['5 weeks', '8 weeks', '10 weeks', '15 weeks'],
      'a': 2,
      'e': '₱300 ÷ ₱30 = 10 weeks. Patience pays off!',
      'cat': 'Math',
    },
    {
      'q': 'What is the 50/30/20 rule?',
      'o': ['50% needs, 30% wants, 20% savings', '50% toys, 30% food, 20% games', 'Equal thirds', 'None'],
      'a': 0,
      'e': 'The 50/30/20 rule helps you balance needs, wants, and savings!',
      'cat': 'Budgeting',
    },
    {
      'q': 'Why do people use a "passbook" or savings app?',
      'o': ['To draw pictures', 'To track money saved and spent', 'To play games', 'To write stories'],
      'a': 1,
      'e': 'A passbook or savings app helps you see how much money you have and how close you are to your goals!',
      'cat': 'Savings',
    },
    {
      'q': 'What is "emergency savings"?',
      'o': ['Money for toys', 'Money saved for unexpected situations', 'Money for games', 'Money for snacks'],
      'a': 1,
      'e': 'Emergency savings help you when something unexpected happens, like a repair or medical need!',
      'cat': 'Savings',
    },
    {
      'q': 'If you have ₱500 and spend ₱50, how much is left?',
      'o': ['₱400', '₱450', '₱500', '₱550'],
      'a': 1,
      'e': '₱500 - ₱50 = ₱450. Always check what remains after spending!',
      'cat': 'Math',
    },
    {
      'q': 'What is the best way to avoid impulse buying?',
      'o': ['Buy it immediately', 'Wait 24 hours before deciding', 'Ask a friend to buy it', 'Ignore all wants'],
      'a': 1,
      'e': 'Waiting 24 hours helps you decide if you really want it or if it was just a sudden urge!',
      'cat': 'Savings',
    },
    {
      'q': 'What is "compounding"?',
      'o': ['Making things flat', 'Earning interest on your interest', 'A type of candy', 'A math problem'],
      'a': 1,
      'e': 'Compounding means your money earns interest, and then that interest also earns interest. It snowballs!',
      'cat': 'Banking',
    },
    {
      'q': 'Which habit helps you save more?',
      'o': ['Spending all allowance', 'Setting aside a fixed amount first', 'Borrowing money', 'Ignoring savings'],
      'a': 1,
      'e': 'Pay yourself first! Set aside savings before spending on anything else.',
      'cat': 'Savings',
    },
    {
      'q': 'What is a "credit card"?',
      'o': ['Free money forever', 'A card to borrow money you must pay back', 'A savings account', 'A toy'],
      'a': 1,
      'e': 'A credit card lets you borrow money to buy things, but you must pay it back — often with extra!',
      'cat': 'Banking',
    },
  ];
}
