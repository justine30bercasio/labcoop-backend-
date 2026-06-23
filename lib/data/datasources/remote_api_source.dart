import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/savings_account_model.dart';
import '../models/goal_jar_model.dart';
import '../models/badge_model.dart';
import '../models/quiz_question_model.dart';
import '../models/transaction_model.dart';
import '../models/loan_model.dart';
import '../models/loan_product_model.dart';
import '../models/loan_payment_model.dart';
import '../models/savings_product_model.dart';

class RemoteApiSource {
  final Dio _dio;
  static const _secureStorage = FlutterSecureStorage();

  RemoteApiSource(this._dio);

  Future<Map<String, dynamic>?> getStoredSession() async {
    final accountId = await _secureStorage.read(key: 'account_id');
    final token = await _secureStorage.read(key: 'auth_token');
    final childName = await _secureStorage.read(key: 'child_name');
    if (accountId == null || token == null) return null;
    return {
      'accountId': accountId,
      'token': token,
      'childName': childName,
    };
  }

  Future<void> saveSession({
    required String token,
    required String accountId,
    required String childName,
  }) async {
    await _secureStorage.write(key: 'auth_token', value: token);
    await _secureStorage.write(key: 'account_id', value: accountId);
    await _secureStorage.write(key: 'child_name', value: childName);
  }

  Future<void> clearSession() async {
    await _secureStorage.deleteAll();
  }

  Future<Map<String, dynamic>> login(String password, {String? childName, String? accountId, String? memberId}) async {
    final response = await _dio.post('/api/auth/login', data: {
      if (childName != null) 'childName': childName,
      if (accountId != null) 'accountId': accountId,
      if (memberId != null) 'memberId': memberId,
      'password': password,
    });
    final data = response.data as Map<String, dynamic>;
    await saveSession(
      token: data['token'] as String,
      accountId: data['account']['account_id'] as String,
      childName: data['account']['child_name'] as String,
    );
    return data;
  }

  Future<Map<String, dynamic>> register({
    required String lastName,
    required String firstName,
    String middleName = '',
    required String password,
    String parentPhone = '',
    int age = 0,
    String gender = '',
    String savingsSchedule = '',
    List<int>? photo2x2Bytes,
    String? photo2x2Filename,
    List<int>? birthCertBytes,
    String? birthCertFilename,
    List<int>? idPhotoBytes,
    String? idPhotoFilename,
  }) async {
    final formData = FormData.fromMap({
      'lastName': lastName,
      'firstName': firstName,
      'middleName': middleName,
      'password': password,
      'parentPhone': parentPhone,
      'age': age,
      'gender': gender,
      'savingsSchedule': savingsSchedule,
    });

    if (photo2x2Bytes != null && photo2x2Filename != null) {
      formData.files.add(MapEntry(
        'photo_2x2',
        MultipartFile.fromBytes(photo2x2Bytes, filename: photo2x2Filename),
      ));
    }
    if (birthCertBytes != null && birthCertFilename != null) {
      formData.files.add(MapEntry(
        'birth_cert',
        MultipartFile.fromBytes(birthCertBytes, filename: birthCertFilename),
      ));
    }
    if (idPhotoBytes != null && idPhotoFilename != null) {
      formData.files.add(MapEntry(
        'id_photo',
        MultipartFile.fromBytes(idPhotoBytes, filename: idPhotoFilename),
      ));
    }

    final response = await _dio.post('/api/auth/register', data: formData);
    final data = response.data as Map<String, dynamic>;
    await saveSession(
      token: data['token'] as String,
      accountId: data['account']['account_id'] as String,
      childName: data['account']['child_name'] as String,
    );
    return data;
  }

  Future<Map<String, dynamic>> changePassword(String oldPassword, String newPassword) async {
    final response = await _dio.post('/api/auth/change-password', data: {
      'oldPassword': oldPassword,
      'newPassword': newPassword,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> listAccounts() async {
    final response = await _dio.get('/api/auth/accounts');
    return (response.data as List<dynamic>).cast<Map<String, dynamic>>();
  }

  Future<SavingsAccountModel> fetchAccount(String accountId) async {
    final response = await _dio.get('/api/accounts/$accountId');
    return SavingsAccountModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<List<GoalJarModel>> fetchGoals(String accountId) async {
    final response = await _dio.get('/api/accounts/$accountId/goals');
    final list = response.data as List<dynamic>;
    return list
        .map((e) => GoalJarModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<BadgeModel>> fetchBadges(String accountId) async {
    final response = await _dio.get('/api/accounts/$accountId/badges');
    final list = response.data as List<dynamic>;
    return list
        .map((e) => BadgeModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<SavingsAccountModel> updateAccount(
    SavingsAccountModel account,
  ) async {
    final response = await _dio.put(
      '/api/accounts/${account.accountId}',
      data: account.toJson(),
    );
    return SavingsAccountModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<GoalJarModel> updateGoal(GoalJarModel goal) async {
    final response = await _dio.put(
      '/api/goals/${goal.goalId}',
      data: goal.toJson(),
    );
    return GoalJarModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<GoalJarModel> createGoal(GoalJarModel goal) async {
    final response = await _dio.post('/api/goals', data: goal.toJson());
    return GoalJarModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteGoal(String goalId) async {
    await _dio.delete('/api/goals/$goalId');
  }

  Future<void> recordTransaction({
    required String accountId,
    required String type,
    required double amount,
    String? goalId,
  }) async {
    await _dio.post('/api/transactions', data: {
      'account_id': accountId,
      'type': type,
      'amount': amount,
      'goal_id': goalId,
    });
  }

  Future<List<Map<String, dynamic>>> fetchShopItems({String? type}) async {
    final query = type != null ? '?type=$type' : '';
    final response = await _dio.get('/api/shop/items$query');
    return (response.data as List<dynamic>).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getCoopGoals() async {
    final response = await _dio.get('/api/coop/goals');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> contributeCoop(String goalId, String accountId, double amount) async {
    final response = await _dio.post('/api/coop/goals/$goalId/contribute', data: {
      'accountId': accountId,
      'amount': amount,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<List<QuizQuestionModel>> fetchQuizQuestions({String? difficulty}) async {
    final query = difficulty != null ? '?difficulty=$difficulty' : '';
    final response = await _dio.get('/api/quiz/questions$query');
    return (response.data as List)
        .map((e) => QuizQuestionModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Banking / Transactions ──

  Future<List<TransactionModel>> fetchTransactions(String accountId, {int limit = 50, int offset = 0}) async {
    final response = await _dio.get('/api/transactions/account/$accountId', queryParameters: {'limit': limit, 'offset': offset});
    return (response.data as List)
        .map((e) => TransactionModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<TransactionModel> createTransaction(TransactionModel transaction) async {
    final response = await _dio.post('/api/transactions', data: transaction.toJson());
    return TransactionModel.fromJson(response.data as Map<String, dynamic>);
  }

  // ── Loans ──

  Future<List<LoanModel>> fetchLoans(String accountId) async {
    final response = await _dio.get('/api/loans', queryParameters: {'account_id': accountId});
    return (response.data as List)
        .map((e) => LoanModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<LoanModel> fetchLoan(String loanId) async {
    final response = await _dio.get('/api/loans/$loanId');
    return LoanModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<LoanModel> applyLoan(LoanModel loan) async {
    final response = await _dio.post('/api/loans/apply', data: loan.toJson());
    return LoanModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<LoanModel> approveLoan(String loanId, String approvedBy) async {
    final response = await _dio.put('/api/loans/$loanId/approve', data: {'approved_by': approvedBy});
    return LoanModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<LoanModel> disburseLoan(String loanId) async {
    final response = await _dio.put('/api/loans/$loanId/disburse');
    return LoanModel.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> makeLoanPayment(String loanId, {required double amount, required String accountId}) async {
    final response = await _dio.post('/api/loans/$loanId/pay', data: {
      'amount': amount,
      'account_id': accountId,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<List<LoanPaymentModel>> fetchLoanPayments(String loanId) async {
    final response = await _dio.get('/api/loans/$loanId/payments');
    return (response.data as List)
        .map((e) => LoanPaymentModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<LoanProductModel>> fetchLoanProducts() async {
    final response = await _dio.get('/api/loan-products');
    return (response.data as List)
        .map((e) => LoanProductModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<SavingsProductModel>> fetchSavingsProducts() async {
    final response = await _dio.get('/api/savings-products');
    return (response.data as List)
        .map((e) => SavingsProductModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
