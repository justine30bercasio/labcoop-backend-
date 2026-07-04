import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';

class FaceAuthService {
  final Dio _dio;

  FaceAuthService(this._dio);

  Future<Map<String, dynamic>> enroll({
    required String accountId,
    required Uint8List selfieBytes,
    required List<double> faceSignature,
  }) async {
    final formData = FormData.fromMap({
      'selfie': MultipartFile.fromBytes(selfieBytes, filename: 'selfie.jpg'),
      'face_signature': jsonEncode(faceSignature),
    });
    final response = await _dio.post('/api/face/enroll', data: formData);
    return response.data;
  }

  Future<Map<String, dynamic>> verify({
    required String accountId,
    required Uint8List selfieBytes,
    required List<double> faceSignature,
  }) async {
    final formData = FormData.fromMap({
      'selfie': MultipartFile.fromBytes(selfieBytes, filename: 'selfie.jpg'),
      'face_signature': jsonEncode(faceSignature),
    });
    final response = await _dio.post('/api/face/verify', data: formData);
    return response.data;
  }

  Future<Map<String, dynamic>> getStatus(String accountId) async {
    final response = await _dio.get('/api/face/status/$accountId');
    return response.data;
  }
}
