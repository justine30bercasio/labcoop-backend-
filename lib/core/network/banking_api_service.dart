import 'package:dio/dio.dart';
import 'dio_client.dart';

class BankingApiService {
  static final Dio _dio = DioClient.create();

  static Future<Map<String, dynamic>?> getLoanSchedule(String loanId) async {
    try {
      final resp = await _dio.get('/api/loans/$loanId/schedule');
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getSavingsInfo(String accountId) async {
    try {
      final resp = await _dio.get('/api/accounts/$accountId/savings');
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<List<dynamic>> getStandingOrders(String accountId) async {
    try {
      final resp = await _dio.get('/api/standing-orders/$accountId');
      return resp.data as List<dynamic>;
    } on DioException {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> createStandingOrder({
    required String accountId,
    required double amount,
    required String frequency,
    String? targetGoalId,
    String? description,
  }) async {
    try {
      final body = <String, dynamic>{
        'account_id': accountId,
        'amount': amount,
        'frequency': frequency,
      };
      if (targetGoalId != null) body['target_goal_id'] = targetGoalId;
      if (description != null) body['description'] = description;
      final resp = await _dio.post('/api/standing-orders', data: body);
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<bool> deleteStandingOrder(String orderId) async {
    try {
      await _dio.delete('/api/standing-orders/$orderId');
      return true;
    } on DioException {
      return false;
    }
  }

  static Future<Map<String, dynamic>?> requestWithdrawal(String accountId, double amount, String reason) async {
    try {
      final resp = await _dio.post('/api/withdrawals/request', data: {
        'account_id': accountId,
        'amount': amount,
        'reason': reason,
      });
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<List<dynamic>> getWithdrawalRequests(String accountId) async {
    try {
      final resp = await _dio.get('/api/withdrawals/$accountId');
      return resp.data as List<dynamic>;
    } on DioException {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> getStatement(String accountId) async {
    try {
      final resp = await _dio.get('/api/accounts/$accountId/statement');
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getInterest(String accountId) async {
    try {
      final resp = await _dio.get('/api/accounts/$accountId/interest');
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getReceipt(String txId) async {
    try {
      final resp = await _dio.get('/api/transactions/$txId/receipt');
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<List<dynamic>> getSavingsProducts() async {
    try {
      final resp = await _dio.get('/api/savings-products');
      return resp.data as List<dynamic>;
    } on DioException {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> submitOnlineDeposit({
    required String accountId,
    required double amount,
    required String referenceNumber,
    String? senderName,
    String paymentMethod = 'gcash',
  }) async {
    try {
      final resp = await _dio.post('/api/online-deposits', data: {
        'account_id': accountId,
        'amount': amount,
        'reference_number': referenceNumber,
        'sender_name': senderName ?? '',
        'payment_method': paymentMethod,
      });
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<List<dynamic>> getOnlineDeposits(String accountId) async {
    try {
      final resp = await _dio.get('/api/online-deposits/$accountId');
      return resp.data as List<dynamic>;
    } on DioException {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> createPaymongoPayment({
    required String accountId,
    required double amount,
  }) async {
    try {
      final resp = await _dio.post('/api/paymongo/create-payment', data: {
        'account_id': accountId,
        'amount': amount,
      });
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map) {
        return e.response!.data as Map<String, dynamic>;
      }
      final errMsg = e.error?.toString() ?? e.message ?? 'Unknown error';
      return {'message': errMsg};
    }
  }

  static Future<Map<String, dynamic>?> getPaymongoPaymentStatus(String depositId) async {
    try {
      final resp = await _dio.get('/api/paymongo/payment-status/$depositId');
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<bool> cancelPaymongoDeposit(String depositId) async {
    try {
      await _dio.delete('/api/paymongo/cancel-pending/$depositId');
      return true;
    } on DioException {
      return false;
    }
  }

  static Future<Map<String, dynamic>> getGcashSettings() async {
    try {
      final res = await _dio.get('/api/settings/gcash');
      return res.data is Map<String, dynamic> ? res.data as Map<String, dynamic> : {};
    } catch (_) {
      return {'gcash_number': '09171234567', 'gcash_name': 'LabCoop Savings'};
    }
  }

  static Future<bool> updateGcashSettings(String number, String name) async {
    try {
      await _dio.put('/api/settings/gcash', data: {
        'gcash_number': number,
        'gcash_name': name,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> requestDeletion({required String reason}) async {
    try {
      await _dio.post('/api/account-deletion/request', data: {
        'reason': reason,
        'requested_by': 'parent',
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  static Future<Map<String, dynamic>?> getDeletionStatus() async {
    try {
      final resp = await _dio.get('/api/account-deletion/status');
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }
}
