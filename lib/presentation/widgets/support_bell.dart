import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/network/socket_service.dart';
import '../pages/support_page.dart';

class SupportBell extends StatefulWidget {
  const SupportBell({super.key});

  @override
  State<SupportBell> createState() => _SupportBellState();
}

class _SupportBellState extends State<SupportBell> {
  int _unreadCount = 0;
  Timer? _pollTimer;
  String _accountId = '';

  @override
  void initState() {
    super.initState();
    _init();
    _pollTimer = Timer.periodic(const Duration(seconds: 15), (_) => _fetch());
    SocketService.onNewMessage(_onMsg);
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    SocketService.offNewMessage();
    super.dispose();
  }

  Future<void> _init() async {
    final storage = const FlutterSecureStorage();
    _accountId = (await storage.read(key: 'account_id')) ?? '';
    if (_accountId.isNotEmpty) _fetch();
  }

  void _onMsg(dynamic msg) {
    final m = msg as Map<String, dynamic>;
    if (m['sender_type'] != 'admin') return;
    if (mounted) setState(() => _unreadCount++);
  }

  Future<void> _fetch() async {
    if (_accountId.isEmpty) return;
    final count = await BankingApiService.getMessageUnreadCount(_accountId);
    if (mounted) setState(() => _unreadCount = count);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: const Icon(Icons.support_agent_outlined, size: 22),
          tooltip: 'Support',
          onPressed: () async {
            final storage = const FlutterSecureStorage();
            final accountId = (await storage.read(key: 'account_id')) ?? '';
            final childName = (await storage.read(key: 'child_name')) ?? '';
            if (!context.mounted) return;
            await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => SupportPage(
                  accountId: accountId,
                  childName: childName,
                ),
              ),
            );
            _fetch();
          },
        ),
        if (_unreadCount > 0)
          Positioned(
            right: 6,
            top: 6,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              child: Text(
                _unreadCount > 99 ? '99+' : '$_unreadCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
      ],
    );
  }
}
