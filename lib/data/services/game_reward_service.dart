import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/di/injection.dart';
import '../../domain/repositories/banking_repository.dart';

/// Awards in-game coins & XP earned from games and quizzes.
///
/// These rewards live in their own columns (`accounts.coins` /
/// `accounts.current_xp` + `coin_transactions`) — they are fully separate
/// from the banking balance and accounting system. When offline, rewards are
/// saved locally and queued as pending ops for later sync.
class GameRewardService {
  final BankingRepository _repository;
  final FlutterSecureStorage _secureStorage;

  GameRewardService(this._repository, this._secureStorage);

  factory GameRewardService.instance() =>
      GameRewardService(sl<BankingRepository>(), const FlutterSecureStorage());

  Future<String?> _accountId() => _secureStorage.read(key: 'account_id');

  /// Awards coins + XP in one go. Returns once both are persisted/queued.
  Future<void> award({int coins = 0, int xp = 0, String reason = 'game_reward'}) async {
    final accountId = await _accountId();
    if (accountId == null) return;
    if (coins > 0) await _repository.addCoins(accountId, coins, reason);
    if (xp > 0) await _repository.addXp(accountId, xp, reason);
  }
}
