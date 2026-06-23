import '../../domain/entities/transaction.dart';

class TransactionModel {
  final String id;
  final String accountId;
  final String type;
  final double amount;
  final double balanceBefore;
  final double balanceAfter;
  final String description;
  final String? referenceType;
  final String? referenceId;
  final String createdAt;

  const TransactionModel({
    required this.id,
    required this.accountId,
    required this.type,
    required this.amount,
    required this.balanceBefore,
    required this.balanceAfter,
    required this.description,
    this.referenceType,
    this.referenceId,
    required this.createdAt,
  });

  factory TransactionModel.fromJson(Map<String, dynamic> json) {
    double n(v) => v is String ? double.parse(v) : (v as num).toDouble();
    return TransactionModel(
      id: json['id'] as String,
      accountId: json['account_id'] as String,
      type: json['type'] as String,
      amount: n(json['amount']),
      balanceBefore: json['balance_before'] != null ? n(json['balance_before']) : 0,
      balanceAfter: json['balance_after'] != null ? n(json['balance_after']) : 0,
      description: json['description'] as String? ?? '',
      referenceType: json['reference_type'] as String?,
      referenceId: json['reference_id'] as String?,
      createdAt: json['created_at'] as String? ?? DateTime.now().toIso8601String(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'account_id': accountId,
      'type': type,
      'amount': amount,
      'balance_before': balanceBefore,
      'balance_after': balanceAfter,
      'description': description,
      'reference_type': referenceType,
      'reference_id': referenceId,
      'created_at': createdAt,
    };
  }

  Transaction toEntity() {
    return Transaction(
      id: id,
      accountId: accountId,
      type: _parseType(type),
      amount: amount,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      description: description,
      referenceType: referenceType,
      referenceId: referenceId,
      createdAt: DateTime.parse(createdAt),
    );
  }

  factory TransactionModel.fromEntity(Transaction entity) {
    return TransactionModel(
      id: entity.id,
      accountId: entity.accountId,
      type: _typeToString(entity.type),
      amount: entity.amount,
      balanceBefore: entity.balanceBefore,
      balanceAfter: entity.balanceAfter,
      description: entity.description,
      referenceType: entity.referenceType,
      referenceId: entity.referenceId,
      createdAt: entity.createdAt.toIso8601String(),
    );
  }

  static TransactionType _parseType(String t) {
    switch (t) {
      case 'deposit': return TransactionType.deposit;
      case 'withdrawal': return TransactionType.withdrawal;
      case 'transfer': return TransactionType.transfer;
      case 'loan_disbursement': return TransactionType.loanDisbursement;
      case 'loan_payment': return TransactionType.loanPayment;
      case 'interest_credit': return TransactionType.interestCredit;
      case 'fee': return TransactionType.fee;
      case 'allocation': return TransactionType.allocation;
      default: return TransactionType.deposit;
    }
  }

  static String _typeToString(TransactionType t) {
    switch (t) {
      case TransactionType.deposit: return 'deposit';
      case TransactionType.withdrawal: return 'withdrawal';
      case TransactionType.transfer: return 'transfer';
      case TransactionType.loanDisbursement: return 'loan_disbursement';
      case TransactionType.loanPayment: return 'loan_payment';
      case TransactionType.interestCredit: return 'interest_credit';
      case TransactionType.fee: return 'fee';
      case TransactionType.allocation: return 'allocation';
    }
  }
}
