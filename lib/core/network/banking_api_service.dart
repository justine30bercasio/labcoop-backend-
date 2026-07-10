import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dio_client.dart';
import '../constants/app_constants.dart';

class BankingApiService {
  static final Dio _dio = DioClient.create();

  /// Separate Dio for parent API calls — no auth headers, no session expiry interceptor.
  /// Parent requests manage their own token stored as 'parent_token'.
  static final Dio _parentDio = Dio(BaseOptions(
    baseUrl: AppConstants.baseUrl,
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 30),
    contentType: 'application/json',
    headers: {'Accept': 'application/json'},
  ));

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
      final resp = await _parentDio.post('/api/parent/send-otp', data: {'email': email});
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
  }

  static Future<Map<String, dynamic>?> parentVerifyOtp(String email, String otp) async {
    try {
      final resp = await _parentDio.post('/api/parent/verify-otp', data: {'email': email, 'otp': otp});
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
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
      final resp = await _parentDio.post('/api/parent/register', data: data);
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
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
      final resp = await _parentDio.post('/api/parent/register', data: formData);
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
  }

  static Future<Map<String, dynamic>?> parentLogin(String email, String pin) async {
    try {
      final resp = await _parentDio.post('/api/parent/login', data: {'email': email, 'pin': pin});
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) {
        return e.response?.data as Map<String, dynamic>;
      }
      return null;
    }
  }

  static Future<bool> parentChangePin(String oldPin, String newPin) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/change-pin', data: {'oldPin': oldPin, 'newPin': newPin});
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentLinkChild(String linkingCode) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/link-child', data: {'linkingCode': linkingCode});
      return true;
    } on DioException { return false; }
  }

  static Future<List<dynamic>> parentGetChildren() async {
    try {
      await _addParentAuthHeader();
      final resp = await _parentDio.get('/api/parent/children');
      return resp.data as List<dynamic>;
    } on DioException { return []; }
  }

  static Future<Map<String, dynamic>?> parentGetPending() async {
    try {
      await _addParentAuthHeader();
      final resp = await _parentDio.get('/api/parent/pending');
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<void> _addParentAuthHeader() async {
    final storage = FlutterSecureStorage();
    final token = await storage.read(key: 'parent_token');
    if (token != null) {
      _parentDio.options.headers['Authorization'] = 'Bearer $token';
    }
  }

  static Future<bool> parentApproveWithdrawal(String requestId) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/approve-withdrawal/$requestId');
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentRejectWithdrawal(String requestId) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/reject-withdrawal/$requestId');
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentApproveLoan(String loanId) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/approve-loan/$loanId');
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentRejectLoan(String loanId) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/reject-loan/$loanId');
      return true;
    } on DioException { return false; }
  }

  static Future<List<dynamic>> parentGetLimits() async {
    try {
      await _addParentAuthHeader();
      final resp = await _parentDio.get('/api/parent/limits');
      return resp.data as List<dynamic>;
    } on DioException { return []; }
  }

  static Future<bool> parentSaveLimits(String childAccountId, {double maxDailyWithdrawal = 0, double maxLoanAmount = 0, String requireApprovalFor = 'all'}) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/limits', data: {
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
      await _addParentAuthHeader();
      final resp = await _parentDio.get('/api/parent/me');
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<bool> parentUpdateProfile({String? displayName, String? phone, String? address, String? city, String? province, String? postalCode}) async {
    try {
      await _addParentAuthHeader();
      final body = <String, dynamic>{};
      if (displayName != null && displayName.isNotEmpty) body['displayName'] = displayName;
      if (phone != null) body['phone'] = phone;
      if (address != null) body['address'] = address;
      if (city != null) body['city'] = city;
      if (province != null) body['province'] = province;
      if (postalCode != null) body['postalCode'] = postalCode;
      await _parentDio.post('/api/parent/me', data: body);
      return true;
    } on DioException { return false; }
  }

  // ── Parent Notifications ──
  static Future<Map<String, dynamic>?> parentGetNotifications() async {
    try {
      await _addParentAuthHeader();
      final resp = await _parentDio.get('/api/parent/notifications');
      return resp.data as Map<String, dynamic>;
    } on DioException { return null; }
  }

  static Future<int> parentGetUnreadCount() async {
    try {
      await _addParentAuthHeader();
      final resp = await _parentDio.get('/api/parent/notifications/unread-count');
      final data = resp.data as Map<String, dynamic>;
      return (data['unreadCount'] as num?)?.toInt() ?? 0;
    } on DioException catch (e) {
      stderr.writeln('[ParentNotif] unread-count failed: $e');
      return -1;
    }
  }

  static Future<void> parentMarkNotifRead(String notifId) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/notifications/$notifId/read');
    } on DioException {}
  }

  static Future<void> parentMarkAllNotifRead() async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/notifications/read-all');
    } on DioException {}
  }

  static Future<void> parentRegisterFcmToken(String token) async {
    try {
      await _addParentAuthHeader();
      await _parentDio.post('/api/parent/register-fcm-token', data: {
        'fcmToken': token,
        'devicePlatform': 'android',
      });
    } on DioException {}
  }

  // ── Children Transactions ──
  static Future<List<dynamic>> parentGetChildrenTransactions() async {
    try {
      await _addParentAuthHeader();
      final resp = await _parentDio.get('/api/parent/children-transactions');
      return (resp.data as Map<String, dynamic>)['transactions'] as List<dynamic>? ?? [];
    } on DioException { return []; }
  }

  // ── Pending Deletion Requests ──
  static Future<List<dynamic>> parentGetPendingDeletions() async {
    try {
      await _addParentAuthHeader();
      final resp = await _parentDio.get('/api/parent/pending-deletions');
      return (resp.data as Map<String, dynamic>)['deletions'] as List<dynamic>? ?? [];
    } on DioException { return []; }
  }

  // ── Forgot PIN (Parent) ──
  static Future<Map<String, dynamic>?> parentForgotPinSendOtp(String email) async {
    try {
      final resp = await _parentDio.post('/api/parent/forgot-pin', data: {'email': email});
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
  }

  static Future<Map<String, dynamic>?> parentForgotPinVerifyOtp(String email, String otp) async {
    try {
      final resp = await _parentDio.post('/api/parent/verify-forgot-otp', data: {'email': email, 'otp': otp});
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
  }

  static Future<Map<String, dynamic>?> parentForgotPinReset(String resetToken, String newPin) async {
    try {
      final resp = await _parentDio.post('/api/parent/reset-pin', data: {'resetToken': resetToken, 'newPin': newPin});
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
  }

  // ── Forgot PIN (Child) ──
  static Future<Map<String, dynamic>?> childForgotPinSendOtp({String? childName, String? accountId, String? memberId}) async {
    try {
      final data = <String, dynamic>{};
      if (childName != null) data['childName'] = childName;
      if (accountId != null) data['accountId'] = accountId;
      if (memberId != null) data['memberId'] = memberId;
      final resp = await _dio.post('/api/auth/forgot-pin-send-otp', data: data);
      return resp.data as Map<String, dynamic>;
} on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
}

static Future<Map<String, dynamic>?> childForgotPinVerifyOtp(String accountId, String otp) async {
    try {
      final resp = await _dio.post('/api/auth/forgot-pin-verify-otp', data: {'accountId': accountId, 'otp': otp});
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
}

static Future<Map<String, dynamic>?> childForgotPinReset(String resetToken, String newPin) async {
    try {
      final resp = await _dio.post('/api/auth/forgot-pin-reset', data: {'resetToken': resetToken, 'newPin': newPin});
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
return null;
    }
  }

  // ── Consent (Child) ──
  static Future<Map<String, dynamic>?> requestParentConsent() async {
    try {
      final resp = await _dio.post('/api/kyc/request-consent');
      return resp.data as Map<String, dynamic>;
    } on DioException catch (e) {
      if (e.response?.data is Map<String, dynamic>) return e.response?.data as Map<String, dynamic>;
      return null;
    }
  }

  // ── Consent (Parent) ──
  static Future<bool> parentApproveConsent(String accountId) async {
    try {
      await _parentDio.post('/api/parent/approve-consent/$accountId');
      return true;
    } on DioException { return false; }
  }

  static Future<bool> parentRejectConsent(String accountId) async {
    try {
      await _parentDio.post('/api/parent/reject-consent/$accountId');
      return true;
    } on DioException { return false; }
  }
}
