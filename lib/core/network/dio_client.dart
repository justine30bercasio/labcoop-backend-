import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/app_constants.dart';
import '../errors/exceptions.dart';

class DioClient {
  static final _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.unlocked_this_device,
      synchronizable: false,
    ),
  );

  static Future<String?> get _authToken async {
    return await _secureStorage.read(key: 'auth_token');
  }

  static Dio create() {
    final dio = Dio(
      BaseOptions(
        baseUrl: AppConstants.baseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final t = await _authToken;
          if (t != null) {
            options.headers['Authorization'] = 'Bearer $t';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          if (error.type == DioExceptionType.connectionTimeout ||
              error.type == DioExceptionType.receiveTimeout ||
              error.type == DioExceptionType.sendTimeout) {
            handler.next(DioException(
              requestOptions: error.requestOptions,
              error: NetworkException('Connection timed out'),
              type: error.type,
            ));
          } else if (error.type == DioExceptionType.connectionError) {
            handler.next(DioException(
              requestOptions: error.requestOptions,
              error: NetworkException('No internet connection'),
              type: error.type,
            ));
          } else if (error.response != null &&
              error.response!.statusCode != null &&
              error.response!.statusCode! >= 500) {
            handler.next(error);
          } else {
            handler.next(error);
          }
        },
      ),
    );

    // Certificate pinning — reject untrusted certificates
    // To pin a specific certificate, add its SHA-256 fingerprint check here:
    //   client.badCertificateCallback = (cert, host, port) {
    //     final fingerprint = sha256.convert(cert.pem.codeUnits).toString();
    //     return pinnedFingerprints.contains(fingerprint);
    //   };
    try {
      (dio.httpClientAdapter as IOHttpClientAdapter).onHttpClientCreate = (client) {
        client.badCertificateCallback = (cert, host, port) => false;
        return client;
      };
    } catch (_) {}

    return dio;
  }
}
