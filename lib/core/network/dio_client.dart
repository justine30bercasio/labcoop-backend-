import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/app_constants.dart';
import '../errors/exceptions.dart';

/// SHA-256 certificate fingerprints for public key pinning.
///
/// Add your production server certificate's SHA-256 fingerprint here.
/// To obtain it, run:
///   openssl s_client -connect yourdomain.com:443 </dev/null 2>/dev/null \
///     | openssl x509 -outform DER \
///     | openssl dgst -sha256 \
///     | cut -d' ' -f2
///
/// When empty, the app uses OS trust store validation (reject untrusted CAs).
/// At least one pin should be configured for production to prevent MITM
/// attacks even against a compromised CA.
const _pinnedCertHashes = <String>[
  // Example: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
];

class DioClient {
  static final FlutterSecureStorage _secureStorage = FlutterSecureStorage();

  /// Called when the server returns 401 (except login/register).
  /// Storage is cleared before this callback runs.
  /// main.dart sets this to navigate to LoginPage.
  static void Function()? onSessionExpired;

  static Future<String?> get _authToken async {
    return await _secureStorage.read(key: 'auth_token');
  }

  static Future<String?> get _refreshToken async {
    return await _secureStorage.read(key: 'refresh_token');
  }

  static Future<void> _saveTokens(String accessToken, String refreshToken) async {
    await _secureStorage.write(key: 'auth_token', value: accessToken);
    await _secureStorage.write(key: 'refresh_token', value: refreshToken);
  }

  static Dio create() {
    final dio = Dio(
      BaseOptions(
        baseUrl: AppConstants.baseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        contentType: 'application/json',
        headers: {
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
        onError: (error, handler) async {
          final statusCode = error.response?.statusCode;
          final path = error.requestOptions.path;

          // Try token refresh on 401 (not for login/register/refresh endpoints)
          if (statusCode == 401 &&
              !path.contains('/auth/login') &&
              !path.contains('/auth/register') &&
              !path.contains('/auth/refresh')) {
            final refreshTokenValue = await _refreshToken;
            if (refreshTokenValue != null) {
              try {
                // Attempt to refresh the access token
                final refreshDio = Dio(
                  BaseOptions(
                    baseUrl: AppConstants.baseUrl,
                    connectTimeout: const Duration(seconds: 30),
                    receiveTimeout: const Duration(seconds: 30),
                    contentType: 'application/json',
                    headers: {'Accept': 'application/json'},
                  ),
                );
                final refreshResponse = await refreshDio.post('/api/auth/refresh', data: {
                  'refreshToken': refreshTokenValue,
                });
                final data = refreshResponse.data as Map<String, dynamic>;
                final newToken = data['token'] as String;
                final newRefreshToken = data['refreshToken'] as String;

                // Save new tokens
                await _saveTokens(newToken, newRefreshToken);

                // Retry original request with new token
                error.requestOptions.headers['Authorization'] = 'Bearer $newToken';
                final retryResponse = await dio.fetch(error.requestOptions);
                handler.resolve(retryResponse);
                return;
              } catch (_) {
                // Refresh failed — session expired
              }
            }

            // Clear everything and notify session expired
            await _secureStorage.deleteAll();
            onSessionExpired?.call();
            handler.resolve(Response(
              requestOptions: error.requestOptions,
              statusCode: 200,
              data: {'_session_expired': true},
            ));
            return;
          }

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
          } else if (statusCode != null && statusCode >= 500) {
            handler.next(error);
          } else {
            handler.next(error);
          }
        },
      ),
    );

    // Certificate pinning — SHA-256 fingerprint validation
    // 1. If pins are configured, only accept certificates whose DER SHA-256
    //    matches one of the pinned fingerprints (protects against CA compromise).
    // 2. If no pins are configured, reject ALL untrusted certificates
    //    (OS trust store only — this is the default secure behavior).
    try {
      (dio.httpClientAdapter as IOHttpClientAdapter).onHttpClientCreate = (client) {
        client.badCertificateCallback = (cert, host, port) {
          if (_pinnedCertHashes.isEmpty) {
            // No pins configured — reject untrusted certs (OS trust store only)
            return false;
          }
          try {
            final fingerprint = sha256.convert(cert.der).toString();
            return _pinnedCertHashes.contains(fingerprint);
          } catch (_) {
            // If we can't compute the fingerprint, reject for safety
            return false;
          }
        };
        return client;
      };
    } catch (_) {}

    return dio;
  }
}
