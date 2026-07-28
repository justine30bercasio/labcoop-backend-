import '../network/banking_api_service.dart';

class AppConfig {
  static final AppConfig _instance = AppConfig._();
  factory AppConfig() => _instance;
  AppConfig._();

  bool loansEnabled = true;
  bool termDepositsEnabled = true;
  bool shareCapitalEnabled = true;
  bool dividendsEnabled = true;
  bool gcashEnabled = true;
  bool transfersEnabled = true;
  bool overdraftsEnabled = true;
  bool checksEnabled = true;

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
    } catch (_) {}
  }

  bool get isFullBanking =>
    loansEnabled || termDepositsEnabled || shareCapitalEnabled ||
    dividendsEnabled || transfersEnabled || overdraftsEnabled || checksEnabled;

  bool get isKidsSavings => !isFullBanking;
}
