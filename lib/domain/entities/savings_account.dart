class SavingsAccount {
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
  final double actualBalance;
  final double unallocatedBalance;
  final int currentXp;
  final double maintainingBalance;
  final String? regularSavingsNumber;

  const SavingsAccount({
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
    required this.actualBalance,
    required this.unallocatedBalance,
    required this.currentXp,
    this.maintainingBalance = 0,
    this.regularSavingsNumber,
  });

  String get fullName {
    if (lastName.isNotEmpty && firstName.isNotEmpty) {
      return middleName.isNotEmpty
          ? '$lastName, $firstName $middleName'
          : '$lastName, $firstName';
    }
    return childName;
  }

  double get allocatedBalance => actualBalance - unallocatedBalance;

  double get withdrawableBalance => actualBalance - maintainingBalance;

  SavingsAccount copyWith({
    String? accountId,
    String? childName,
    String? lastName,
    String? firstName,
    String? middleName,
    String? birthday,
    int? age,
    String? gender,
    String? savingsSchedule,
    String? photo2x2Url,
    String? birthCertUrl,
    String? idPhotoUrl,
    String? kycStatus,
    String? selfieUrl,
    double? actualBalance,
    double? unallocatedBalance,
    int? currentXp,
    double? maintainingBalance,
    String? regularSavingsNumber,
  }) {
    return SavingsAccount(
      accountId: accountId ?? this.accountId,
      childName: childName ?? this.childName,
      lastName: lastName ?? this.lastName,
      firstName: firstName ?? this.firstName,
      middleName: middleName ?? this.middleName,
      birthday: birthday ?? this.birthday,
      age: age ?? this.age,
      gender: gender ?? this.gender,
      savingsSchedule: savingsSchedule ?? this.savingsSchedule,
      photo2x2Url: photo2x2Url ?? this.photo2x2Url,
      birthCertUrl: birthCertUrl ?? this.birthCertUrl,
      idPhotoUrl: idPhotoUrl ?? this.idPhotoUrl,
      kycStatus: kycStatus ?? this.kycStatus,
      selfieUrl: selfieUrl ?? this.selfieUrl,
      actualBalance: actualBalance ?? this.actualBalance,
      unallocatedBalance: unallocatedBalance ?? this.unallocatedBalance,
      currentXp: currentXp ?? this.currentXp,
      maintainingBalance: maintainingBalance ?? this.maintainingBalance,
      regularSavingsNumber: regularSavingsNumber ?? this.regularSavingsNumber,
    );
  }
}
