import 'dart:typed_data';
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

  static Future<String?> uploadProfilePhoto(String accountId, Uint8List bytes) async {
    try {
      final formData = FormData.fromMap({
        'file': MultipartFile.fromBytes(bytes, filename: 'profile.jpg'),
      });
      final resp = await _dio.post('/api/accounts/$accountId/profile-photo',
          data: formData,
          queryParameters: {'account_id': accountId},
      );
      return (resp.data as Map<String, dynamic>)['profile_pic_url'] as String?;
    } on DioException catch (e) {
      final code = e.response?.statusCode?.toString() ?? 'network';
      final msg = e.response?.data is Map
          ? (e.response!.data as Map)['message'] ?? e.message
          : e.message;
      throw Exception('Upload failed ($code): $msg');
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

  // ---- Notifications ----

  static Future<Map<String, dynamic>> getUnreadCount() async {
    final resp = await _dio.get('/api/fcm/notifications/unread-count');
    return resp.data as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> getNotifications({int limit = 50}) async {
    final resp = await _dio.get('/api/fcm/notifications', queryParameters: {'limit': limit});
    return resp.data as Map<String, dynamic>;
  }

  static Future<void> markNotificationRead(String notifId) async {
    await _dio.post('/api/fcm/notifications/$notifId/read');
  }

  static Future<void> markAllNotificationsRead() async {
    await _dio.post('/api/fcm/notifications/read-all');
  }

  // ── Parent Portal ──

  static Future<Map<String, dynamic>?> parentSendOtp(String email) async {
    try {
      final resp = await _dio.post('/api/parent/send-otp', data: {'email': email});
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<Map<String, dynamic>?> parentVerifyOtp(String email, String otp) async {
    try {
      final resp = await _dio.post('/api/parent/verify-otp', data: {'email': email, 'otp': otp});
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<Map<String, dynamic>?> parentRegister(
    String email, String pin, {
    String? displayName, String? phone,
    String? idType, String? idNumber,
    String? emailVerifyToken,
  }) async {
    try {
      final data = {
        'email': email, 'pin': pin,
        'displayName': displayName ?? '', 'phone': phone ?? '',
        'idType': idType ?? '', 'idNumber': idNumber ?? '',
        'emailVerifyToken': emailVerifyToken ?? '',
      };
      final resp = await _dio.post('/api/parent/register', data: data);
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<Map<String, dynamic>?> parentRegisterWithPhotos(
    String email, String pin,
    String idType, String idNumber,
    String emailVerifyToken, {
    String? displayName, String? phone,
    Uint8List? photoBytes, String? photoFilename,
    Uint8List? idPhotoBytes, String? idPhotoFilename,
  }) async {
    try {
      final formData = FormData.fromMap({
        'email': email,
        'pin': pin,
        'idType': idType,
        'idNumber': idNumber,
        'displayName': displayName ?? '',
        'phone': phone ?? '',
        'emailVerifyToken': emailVerifyToken,
      });
      if (photoBytes != null) {
        formData.files.add(MapEntry('photo', MultipartFile.fromBytes(photoBytes, filename: photoFilename ?? 'selfie.jpg')));
      }
      if (idPhotoBytes != null) {
        formData.files.add(MapEntry('idPhoto', MultipartFile.fromBytes(idPhotoBytes, filename: idPhotoFilename ?? 'id_photo.jpg')));
      }
      final resp = await _dio.post('/api/parent/register', data: formData);
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<Map<String, dynamic>?> parentLogin(String email, String pin) async {
    try {
      final resp = await _dio.post('/api/parent/login', data: {'email': email, 'pin': pin});
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<bool> parentChangePin(String oldPin, String newPin) async {
    try {
      await _dio.post('/api/parent/change-pin', data: {'oldPin': oldPin, 'newPin': newPin});
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentLinkChild(String linkingCode) async {
    try {
      await _dio.post('/api/parent/link-child', data: {'linkingCode': linkingCode});
      return true;
    } on DioException { return false; }
  }

  static Future<List<dynamic>> parentGetChildren() async {
    try {
      final resp = await _dio.get('/api/parent/children');
      return resp.data as List<dynamic>;
    } on DioException { return []; }
  }

  static Future<Map<String, dynamic>?> parentGetPending() async {
    try {
      final resp = await _dio.get('/api/parent/pending');
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<bool> parentApproveWithdrawal(String requestId) async {
    try {
      await _dio.post('/api/parent/approve-withdrawal/$requestId');
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentRejectWithdrawal(String requestId) async {
    try {
      await _dio.post('/api/parent/reject-withdrawal/$requestId');
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentApproveLoan(String loanId) async {
    try {
      await _dio.post('/api/parent/approve-loan/$loanId');
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentRejectLoan(String loanId) async {
    try {
      await _dio.post('/api/parent/reject-loan/$loanId');
      return true;
    } on DioException { return false; }
  }

  static Future<List<dynamic>> parentGetLimits() async {
    try {
      final resp = await _dio.get('/api/parent/limits');
      return resp.data as List<dynamic>;
    } on DioException { return []; }
  }

  static Future<bool> parentSaveLimits(String childAccountId, {double maxDailyWithdrawal = 0, double maxLoanAmount = 0, String requireApprovalFor = 'all'}) async {
    try {
      await _dio.post('/api/parent/limits', data: {
        'childAccountId': childAccountId,
        'maxDailyWithdrawal': maxDailyWithdrawal,
        'maxLoanAmount': maxLoanAmount,
        'requireApprovalFor': requireApprovalFor,
      });
      return true;
    } on DioException { return false; }
  }

  static Future<Map<String, dynamic>?> parentGetMe() async {
    try {
      final resp = await _dio.get('/api/parent/me');
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }
}
