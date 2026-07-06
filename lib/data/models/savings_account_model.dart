import '../../domain/entities/savings_account.dart';

class SavingsAccountModel {
  final String accountId;
  final String childName;
  final String lastName;
  final String firstName;
  final String middleName;
  final String birthday;
  final int age;
  final String gender;
  final String savingsSchedule;
  final String photo2x2Url;
  final String birthCertUrl;
  final String idPhotoUrl;
  final String kycStatus;
  final String selfieUrl;
  final String profilePicUrl;
  final double actualBalance;
  final double unallocatedBalance;
  final int currentXp;
  final double maintainingBalance;
  final String? regularSavingsNumber;

  const SavingsAccountModel({
    required this.accountId,
    required this.childName,
    this.lastName = '',
    this.firstName = '',
    this.middleName = '',
    this.birthday = '',
    this.age = 0,
    this.gender = '',
    this.savingsSchedule = '',
    this.photo2x2Url = '',
    this.birthCertUrl = '',
    this.idPhotoUrl = '',
    this.kycStatus = '',
    this.selfieUrl = '',
    this.profilePicUrl = '',
    required this.actualBalance,
    required this.unallocatedBalance,
    required this.currentXp,
    this.maintainingBalance = 0,
    this.regularSavingsNumber,
  });

  factory SavingsAccountModel.fromJson(Map<String, dynamic> json) {
    double n(v) => v is String ? double.parse(v) : (v as num).toDouble();
    int i(v) => v is String ? int.parse(v) : v as int;
    return SavingsAccountModel(
      accountId: json['account_id'] as String,
      childName: (json['child_name'] as String?) ?? '',
      lastName: (json['last_name'] as String?) ?? '',
      firstName: (json['first_name'] as String?) ?? '',
      middleName: (json['middle_name'] as String?) ?? '',
      birthday: (json['birthday'] as String?) ?? '',
      age: json['age'] != null ? i(json['age']) : 0,
      gender: (json['gender'] as String?) ?? '',
      savingsSchedule: (json['savings_schedule'] as String?) ?? '',
      photo2x2Url: (json['photo_2x2_url'] as String?) ?? '',
      birthCertUrl: (json['birth_cert_url'] as String?) ?? '',
      idPhotoUrl: (json['id_photo_url'] as String?) ?? '',
      kycStatus: (json['kyc_status'] as String?) ?? '',
      selfieUrl: (json['selfie_url'] as String?) ?? '',
      profilePicUrl: (json['profile_pic_url'] as String?) ?? '',
      actualBalance: n(json['actual_balance']),
      unallocatedBalance: n(json['unallocated_balance']),
      currentXp: i(json['current_xp']),
      maintainingBalance: json['maintaining_balance'] != null ? n(json['maintaining_balance']) : 0,
      regularSavingsNumber: json['regular_savings_number'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'account_id': accountId,
      'child_name': childName,
      'last_name': lastName,
      'first_name': firstName,
      'middle_name': middleName,
      'birthday': birthday,
      'age': age,
      'gender': gender,
      'savings_schedule': savingsSchedule,
      'photo_2x2_url': photo2x2Url,
      'birth_cert_url': birthCertUrl,
      'id_photo_url': idPhotoUrl,
      'kyc_status': kycStatus,
      'selfie_url': selfieUrl,
      'profile_pic_url': profilePicUrl,
      'actual_balance': actualBalance,
      'unallocated_balance': unallocatedBalance,
      'current_xp': currentXp,
      'maintaining_balance': maintainingBalance,
      'regular_savings_number': regularSavingsNumber,
    };
  }

  SavingsAccount toEntity() {
    return SavingsAccount(
      accountId: accountId,
      childName: childName,
      lastName: lastName,
      firstName: firstName,
      middleName: middleName,
      birthday: birthday,
      age: age,
      gender: gender,
      savingsSchedule: savingsSchedule,
      photo2x2Url: photo2x2Url,
      birthCertUrl: birthCertUrl,
      idPhotoUrl: idPhotoUrl,
      kycStatus: kycStatus,
      selfieUrl: selfieUrl,
      profilePicUrl: profilePicUrl,
      actualBalance: actualBalance,
      unallocatedBalance: unallocatedBalance,
      currentXp: currentXp,
      maintainingBalance: maintainingBalance,
      regularSavingsNumber: regularSavingsNumber,
    );
  }

  factory SavingsAccountModel.fromEntity(SavingsAccount entity) {
    return SavingsAccountModel(
      accountId: entity.accountId,
      childName: entity.childName,
      lastName: entity.lastName,
      firstName: entity.firstName,
      middleName: entity.middleName,
      birthday: entity.birthday,
      age: entity.age,
      gender: entity.gender,
      savingsSchedule: entity.savingsSchedule,
      photo2x2Url: entity.photo2x2Url,
      birthCertUrl: entity.birthCertUrl,
      idPhotoUrl: entity.idPhotoUrl,
      kycStatus: entity.kycStatus,
      selfieUrl: entity.selfieUrl,
      profilePicUrl: entity.profilePicUrl,
      actualBalance: entity.actualBalance,
      unallocatedBalance: entity.unallocatedBalance,
      currentXp: entity.currentXp,
      maintainingBalance: entity.maintainingBalance,
      regularSavingsNumber: entity.regularSavingsNumber,
    );
  }
}
