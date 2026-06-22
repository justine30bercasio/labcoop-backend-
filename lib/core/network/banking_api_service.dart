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

  static Future<Map<String, dynamic>?> applySavingsAccount(String accountId, String productId) async {
    try {
      final resp = await _dio.post('/api/savings/apply', data: {
        'account_id': accountId,
        'product_id': productId,
      });
      return resp.data as Map<String, dynamic>;
    } on DioException {
      return null;
    }
  }

  static Future<List<dynamic>> getSavingsApplications(String accountId) async {
    try {
      final resp = await _dio.get('/api/savings/applications/$accountId');
      return resp.data as List<dynamic>;
    } on DioException {
      return [];
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
}
