import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';
import '../models/savings_account_model.dart';
import '../models/goal_jar_model.dart';
import '../models/badge_model.dart';
import '../models/transaction_model.dart';
import '../models/loan_model.dart';
import '../models/loan_product_model.dart';
import '../models/loan_payment_model.dart';
import '../models/savings_product_model.dart';

class LocalDbSource {
  static const _accountBoxName = 'accounts';
  static const _goalBoxName = 'goals';
  static const _badgeBoxName = 'badges';
  static final _secureStorage = FlutterSecureStorage();
  static Uint8List? _cachedKey;

  Future<Uint8List> _getKey() async {
    if (_cachedKey != null) return _cachedKey!;
    final stored = await _secureStorage.read(key: 'encryption_key');
    if (stored != null && stored.isNotEmpty) {
      _cachedKey = base64Decode(stored);
      return _cachedKey!;
    }
    final newKey = Hive.generateSecureKey();
    await _secureStorage.write(key: 'encryption_key', value: base64Encode(newKey));
    _cachedKey = Uint8List.fromList(newKey);
    return _cachedKey!;
  }

  Future<Box> _openBox(String name) async {
    return await Hive.openBox(name, encryptionCipher: HiveAesCipher(await _getKey()));
  }

  Future<void> saveAccount(SavingsAccountModel account) async {
    final box = await _openBox(_accountBoxName);
    await box.put(account.accountId, jsonEncode(account.toJson()));
  }

  Future<SavingsAccountModel?> getAccount(String accountId) async {
    final box = await _openBox(_accountBoxName);
    final raw = box.get(accountId) as String?;
    if (raw == null) return null;
    return SavingsAccountModel.fromJson(
      jsonDecode(raw) as Map<String, dynamic>,
    );
  }

  Future<void> saveGoals(List<GoalJarModel> goals) async {
    final box = await _openBox(_goalBoxName);
    for (final goal in goals) {
      await box.put(goal.goalId, jsonEncode(goal.toJson()));
    }
  }

  Future<void> saveGoal(GoalJarModel goal) async {
    final box = await _openBox(_goalBoxName);
    await box.put(goal.goalId, jsonEncode(goal.toJson()));
  }

  Future<List<GoalJarModel>> getGoals(String accountId) async {
    final box = await _openBox(_goalBoxName);
    final goals = <GoalJarModel>[];
    for (final raw in box.values) {
      final goal = GoalJarModel.fromJson(
        jsonDecode(raw as String) as Map<String, dynamic>,
      );
      if (goal.accountId == accountId) {
        goals.add(goal);
      }
    }
    return goals;
  }

  Future<void> saveBadges(List<BadgeModel> badges) async {
    final box = await _openBox(_badgeBoxName);
    for (final badge in badges) {
      await box.put(badge.badgeId, jsonEncode(badge.toJson()));
    }
  }

  Future<List<BadgeModel>> getBadges(String accountId) async {
    final box = await _openBox(_badgeBoxName);
    final badges = <BadgeModel>[];
    for (final raw in box.values) {
      badges.add(
        BadgeModel.fromJson(jsonDecode(raw as String) as Map<String, dynamic>),
      );
    }
    return badges;
  }

  Future<void> saveAuthToken(String token) async {
    await _secureStorage.write(key: 'auth_token', value: token);
  }

  Future<String?> getAuthToken() async {
    return await _secureStorage.read(key: 'auth_token');
  }

  Future<void> saveEncryptionKey(String key) async {
    await _secureStorage.write(key: 'encryption_key', value: key);
  }

  Future<String?> getEncryptionKey() async {
    return await _secureStorage.read(key: 'encryption_key');
  }

  Future<void> saveStreakData({required int streak, required DateTime lastDate}) async {
    final box = await _openBox('_meta');
    await box.put('streak', streak);
    await box.put('last_streak_date', lastDate.toIso8601String());
  }

  Future<({int streak, DateTime? lastDate})> getStreakData() async {
    final box = await _openBox('_meta');
    final streak = box.get('streak', defaultValue: 0) as int;
    final lastDateStr = box.get('last_streak_date') as String?;
    return (
      streak: streak,
      lastDate: lastDateStr != null ? DateTime.tryParse(lastDateStr) : null,
    );
  }

  Future<void> saveDailyBonusDate(DateTime date) async {
    final box = await _openBox('_meta');
    await box.put('daily_bonus_date', date.toIso8601String());
  }

  Future<DateTime?> getDailyBonusDate() async {
    final box = await _openBox('_meta');
    final str = box.get('daily_bonus_date') as String?;
    return str != null ? DateTime.tryParse(str) : null;
  }

  Future<int> getCoins() async {
    final box = await _openBox('_meta');
    return box.get('coins', defaultValue: 0) as int;
  }

  Future<void> addCoins(int amount) async {
    final box = await _openBox('_meta');
    final current = box.get('coins', defaultValue: 0) as int;
    await box.put('coins', current + amount);
  }

  Future<bool> spendCoins(int amount) async {
    final box = await _openBox('_meta');
    final current = box.get('coins', defaultValue: 0) as int;
    if (current < amount) return false;
    await box.put('coins', current - amount);
    return true;
  }

  Future<String> getAvatar() async {
    final box = await _openBox('_meta');
    return box.get('avatar', defaultValue: '🐱') as String;
  }

  Future<void> setAvatar(String avatar) async {
    final box = await _openBox('_meta');
    await box.put('avatar', avatar);
  }

  Future<String> getBackground() async {
    final box = await _openBox('_meta');
    return box.get('background', defaultValue: 'bg_green') as String;
  }

  Future<void> setBackground(String bg) async {
    final box = await _openBox('_meta');
    await box.put('background', bg);
  }

  Future<String> getAvatarBorder() async {
    final box = await _openBox('_meta');
    return box.get('avatar_border', defaultValue: 'b_default') as String;
  }

  Future<void> setAvatarBorder(String borderId) async {
    final box = await _openBox('_meta');
    await box.put('avatar_border', borderId);
  }

  Future<Uint8List?> getProfileImageBytes() async {
    final box = await _openBox('_meta');
    final data = box.get('profile_image') as String?;
    if (data == null || data.isEmpty) return null;
    return base64Decode(data);
  }

  Future<void> setProfileImageBytes(Uint8List bytes) async {
    final box = await _openBox('_meta');
    await box.put('profile_image', base64Encode(bytes));
  }

  Future<List<String>> getPurchasedItems() async {
    final box = await _openBox('_meta');
    return (box.get('purchased_items', defaultValue: <String>[]) as List).cast<String>();
  }

  Future<void> addPurchasedItem(String itemId) async {
    final box = await _openBox('_meta');
    final items = (box.get('purchased_items', defaultValue: <String>[]) as List).cast<String>();
    if (!items.contains(itemId)) {
      items.add(itemId);
      await box.put('purchased_items', items);
    }
  }

  Future<String> getChildName() async {
    final box = await _openBox('_meta');
    return box.get('child_name', defaultValue: '') as String;
  }

  Future<void> setChildName(String name) async {
    final box = await _openBox('_meta');
    await box.put('child_name', name);
  }

  Future<List<Map<String, dynamic>>> getChallenges() async {
    final box = await _openBox('_meta');
    final raw = box.get('challenges') as String?;
    if (raw == null) return [];
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
  }

  Future<void> saveChallenges(List<Map<String, dynamic>> challenges) async {
    final box = await _openBox('_meta');
    await box.put('challenges', jsonEncode(challenges));
  }


  Future<Map<String, dynamic>> getPetData() async {
    final box = await _openBox('_meta');
    final raw = box.get('pet_data') as String?;
    if (raw == null) return {'level': 1, 'evolutionStage': 0, 'name': 'Piggy', 'happiness': 100, 'coinsFed': 0, 'accessory': ''};
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> savePetData(Map<String, dynamic> data) async {
    final box = await _openBox('_meta');
    await box.put('pet_data', jsonEncode(data));
  }

  Future<List<Map<String, dynamic>>> getTownBuildings() async {
    final box = await _openBox('_meta');
    final raw = box.get('town_buildings') as String?;
    if (raw == null) return [];
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
  }

  Future<void> saveTownBuildings(List<Map<String, dynamic>> buildings) async {
    final box = await _openBox('_meta');
    await box.put('town_buildings', jsonEncode(buildings));
  }

  Future<int> getQuizHighScore() async {
    final box = await _openBox('_meta');
    return box.get('quiz_highscore', defaultValue: 0) as int;
  }

  Future<void> setQuizHighScore(int score) async {
    final box = await _openBox('_meta');
    await box.put('quiz_highscore', score);
  }

  Future<int> getPetLevel() async {
    final data = await getPetData();
    return data['level'] as int? ?? 1;
  }

  Future<void> addPendingOp(Map<String, dynamic> op) async {
    final box = await _openBox('_pending_ops');
    final ops = _getPendingOpsSync(box);
    ops.add(op);
    await box.put('ops', ops);
  }

  Future<List<Map<String, dynamic>>> getPendingOps() async {
    final box = await _openBox('_pending_ops');
    return _getPendingOpsSync(box);
  }

  List<Map<String, dynamic>> _getPendingOpsSync(Box box) {
    final raw = box.get('ops');
    if (raw == null) return [];
    return (raw as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> removePendingOp(int index) async {
    final box = await _openBox('_pending_ops');
    final ops = _getPendingOpsSync(box);
    if (index < ops.length) {
      ops.removeAt(index);
      await box.put('ops', ops);
    }
  }

  Future<void> clearPendingOps() async {
    final box = await _openBox('_pending_ops');
    await box.put('ops', <Map<String, dynamic>>[]);
  }

  Future<int> getPendingOpsCount() async {
    final ops = await getPendingOps();
    return ops.length;
  }

  // ── Banking / Transactions ──

  Future<void> saveTransactions(List<TransactionModel> transactions) async {
    final box = await _openBox('_transactions');
    for (final t in transactions) {
      final key = '${t.accountId}_${t.id}';
      await box.put(key, jsonEncode(t.toJson()));
    }
  }

  Future<List<TransactionModel>> getTransactions(String accountId, {int limit = 50, int offset = 0}) async {
    final box = await _openBox('_transactions');
    final all = <TransactionModel>[];
    for (final raw in box.values) {
      final t = TransactionModel.fromJson(jsonDecode(raw as String) as Map<String, dynamic>);
      if (t.accountId == accountId) all.add(t);
    }
    all.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return all.skip(offset).take(limit).toList();
  }

  Future<void> clearTransactions(String accountId) async {
    final box = await _openBox('_transactions');
    final keys = <dynamic>[];
    for (final entry in box.toMap().entries) {
      final t = TransactionModel.fromJson(jsonDecode(entry.value as String) as Map<String, dynamic>);
      if (t.accountId == accountId) keys.add(entry.key);
    }
    for (final k in keys) {
      await box.delete(k);
    }
  }

  // ── Loans ──

  Future<void> saveLoans(List<LoanModel> loans) async {
    final box = await _openBox('_loans');
    for (final l in loans) {
      await box.put(l.id, jsonEncode(l.toJson()));
    }
  }

  Future<void> saveLoan(LoanModel loan) async {
    final box = await _openBox('_loans');
    await box.put(loan.id, jsonEncode(loan.toJson()));
  }

  Future<List<LoanModel>> getLoans(String accountId) async {
    final box = await _openBox('_loans');
    final loans = <LoanModel>[];
    for (final raw in box.values) {
      final l = LoanModel.fromJson(jsonDecode(raw as String) as Map<String, dynamic>);
      if (l.accountId == accountId) loans.add(l);
    }
    return loans;
  }

  Future<LoanModel?> getLoan(String loanId) async {
    final box = await _openBox('_loans');
    final raw = box.get(loanId) as String?;
    if (raw == null) return null;
    return LoanModel.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> saveLoanProducts(List<LoanProductModel> products) async {
    final box = await _openBox('_loan_products');
    for (final p in products) {
      await box.put(p.id, jsonEncode(p.toJson()));
    }
  }

  Future<List<LoanProductModel>> getLoanProducts() async {
    final box = await _openBox('_loan_products');
    return box.values
        .map((raw) => LoanProductModel.fromJson(jsonDecode(raw as String) as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveSavingsProducts(List<SavingsProductModel> products) async {
    final box = await _openBox('_savings_products');
    for (final p in products) {
      await box.put(p.id, jsonEncode(p.toJson()));
    }
  }

  Future<List<SavingsProductModel>> getSavingsProducts() async {
    final box = await _openBox('_savings_products');
    return box.values
        .map((raw) => SavingsProductModel.fromJson(jsonDecode(raw as String) as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveLoanPayments(List<LoanPaymentModel> payments) async {
    final box = await _openBox('_loan_payments');
    for (final p in payments) {
      await box.put(p.id, jsonEncode(p.toJson()));
    }
  }

  Future<List<LoanPaymentModel>> getLoanPayments(String loanId) async {
    final box = await _openBox('_loan_payments');
    return box.values
        .map((raw) => LoanPaymentModel.fromJson(jsonDecode(raw as String) as Map<String, dynamic>))
        .where((p) => p.loanId == loanId)
        .toList();
  }

  Future<void> clearAll() async {
    const allBoxNames = [
      _accountBoxName,
      _goalBoxName,
      _badgeBoxName,
      '_meta',
      '_pending_ops',
      '_transactions',
      '_loans',
      '_loan_products',
      '_savings_products',
      '_loan_payments',
    ];
    for (final name in allBoxNames) {
      final box = await _openBox(name);
      await box.clear();
    }
    await _secureStorage.deleteAll();
  }
}
