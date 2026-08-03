class Certificate {
  final String id;
  final String certificateNumber;
  final String childName;
  final String title;
  final String description;
  final double thresholdAmount;
  final String? issuedAt;

  const Certificate({
    required this.id,
    required this.certificateNumber,
    required this.childName,
    required this.title,
    required this.description,
    required this.thresholdAmount,
    this.issuedAt,
  });

  factory Certificate.fromJson(Map<String, dynamic> json) {
    final rawThreshold = json['threshold_amount'];
    final double threshold;
    if (rawThreshold is num) {
      threshold = rawThreshold.toDouble();
    } else if (rawThreshold is String) {
      threshold = double.tryParse(rawThreshold) ?? 0;
    } else {
      threshold = 0;
    }
    return Certificate(
      id: json['id'] as String? ?? '',
      certificateNumber: json['certificate_number'] as String? ?? '',
      childName: json['child_name'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      thresholdAmount: threshold,
      issuedAt: json['issued_at'] as String?,
    );
  }
}
