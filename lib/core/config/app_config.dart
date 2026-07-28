import 'package:flutter/foundation.dart';
import '../network/banking_api_service.dart';

class AppConfig {
  static final AppConfig _instance = AppConfig._();
  factory AppConfig() => _instance;
  AppConfig._();

  bool loansEnabled = false;
  bool termDepositsEnabled = false;
  bool shareCapitalEnabled = false;
  bool dividendsEnabled = false;
  bool gcashEnabled = false;
  bool transfersEnabled = false;
  bool overdraftsEnabled = false;
  bool checksEnabled = false;

  Future<void> load() async {
    try {
      final data = await BankingApiService.getConfig();
      if (data != null && data['feature_flags'] is Map) {
        final f = data['feature_flags'] as Map<String, dynamic>;
        loansEnabled = f['loans'] == true;
        termDepositsEnabled = f['term_deposits'] == true;
        shareCapitalEnabled = f['share_capital'] == true;
        dividendsEnabled = f['dividends'] == true;
        gcashEnabled = f['gcash'] == true;
        transfersEnabled = f['transfers'] == true;
        overdraftsEnabled = f['overdrafts'] == true;
        checksEnabled = f['checks'] == true;
      }
      _printFlags();
    } catch (e) {
      debugPrint('[AppConfig] Failed to load config: $e');
    }
  }

  void _printFlags() {
    debugPrint('[AppConfig] Flags: loans=$loansEnabled td=$termDepositsEnabled sc=$shareCapitalEnabled div=$dividendsEnabled gcash=$gcashEnabled xfer=$transfersEnabled od=$overdraftsEnabled chk=$checksEnabled');
  }

  bool get isFullBanking =>
    loansEnabled || termDepositsEnabled || shareCapitalEnabled ||
    dividendsEnabled || transfersEnabled || overdraftsEnabled || checksEnabled;

  bool get isKidsSavings => !isFullBanking;
}
