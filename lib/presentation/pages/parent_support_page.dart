import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/banking_api_service.dart';
import '../../core/network/socket_service.dart';

class ParentSupportPage extends StatefulWidget {
  const ParentSupportPage({super.key});

  @override
  State<ParentSupportPage> createState() => _ParentSupportPageState();
}

class _ParentSupportPageState extends State<ParentSupportPage> with SingleTickerProviderStateMixin {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  bool _adminTyping = false;
  Timer? _typingHeartbeat;
  bool _userIsTyping = false;
  Timer? _adminTypingTimer;
  String? _parentId;

  @override
  void initState() {
    super.initState();
    _initSocket();
    _load();
  }

  Future<void> _initSocket() async {
    await SocketService.init(force: true);
    SocketService.onNewMessage(_onNewMessage);
    SocketService.onTypingStatus(_onTypingStatus);
    SocketService.onReadReceipt(_onReadReceipt);
  }

  Future<void> _joinRoom() async {
    if (_parentId != null) {
      SocketService.joinRoom('parent_chat_$_parentId');
      SocketService.markRead('parent_chat_$_parentId');
    }
  }

  void _onNewMessage(dynamic data) {
    if (!mounted) return;
    final msg = data as Map<String, dynamic>;
    if (msg['parent_id'] != _parentId) return;
    if (msg['sender_type'] == 'admin') {
      SocketService.markRead('parent_chat_$_parentId');
      for (var i = 0; i < _messages.length; i++) {
        if (_messages[i]['message_id'] == msg['message_id']) {
          _messages[i] = msg;
          if (mounted) setState(() {});
          return;
        }
      }
    }
    for (final m in _messages) {
      if (m['message_id'] == msg['message_id']) return;
    }
    setState(() => _messages.add(msg));
    _scrollDown();
  }

  void _onTypingStatus(dynamic data) {
    if (!mounted) return;
    final d = data as Map<String, dynamic>;
    if (d['sender'] == 'admin') {
      setState(() {
        _adminTyping = d['isTyping'] == true;
        if (_adminTyping) {
          _adminTypingTimer?.cancel();
          _adminTypingTimer = Timer(const Duration(seconds: 5), () {
            if (mounted) setState(() => _adminTyping = false);
          });
        } else {
          _adminTypingTimer?.cancel();
        }
      });
    }
  }

  void _onReadReceipt(dynamic data) {
    if (!mounted) return;
    final d = data as Map<String, dynamic>;
    if (d['readBy'] == 'admin') {
      bool changed = false;
      for (var i = 0; i < _messages.length; i++) {
        if (_messages[i]['sender_type'] == 'parent' && _messages[i]['admin_read'] != 1) {
          _messages[i]['admin_read'] = 1;
          changed = true;
        }
      }
      if (changed && mounted) setState(() {});
    } else if (d['readBy'] == 'parent') {
      bool changed = false;
      for (var i = 0; i < _messages.length; i++) {
        if (_messages[i]['sender_type'] == 'admin' && _messages[i]['parent_read'] != 1) {
          _messages[i]['parent_read'] = 1;
          changed = true;
        }
      }
      if (changed && mounted) setState(() {});
    }
  }

  @override
  void dispose() {
    SocketService.offNewMessage();
    SocketService.offTypingStatus();
    SocketService.offReadReceipt();
    if (_parentId != null) {
      SocketService.sendTyping('parent_chat_$_parentId', false);
    }
    _controller.dispose();
    _scrollController.dispose();
    _typingHeartbeat?.cancel();
    _adminTypingTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (_parentId == null) {
      final storage = FlutterSecureStorage();
      _parentId = await storage.read(key: 'parent_id');
    }
    final msgs = await BankingApiService.parentSupportGetMessages();
    if (mounted) {
      setState(() {
        _messages = msgs.cast<Map<String, dynamic>>();
        _loading = false;
        if (_parentId == null && _messages.isNotEmpty && _messages[0]['parent_id'] != null) {
          _parentId = _messages[0]['parent_id'] as String?;
        }
      });
      _scrollDown();
      _joinRoom();
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _onTyping(String val) {
    if (_parentId == null) return;
    var room = 'parent_chat_$_parentId';
    if (val.isNotEmpty) {
      SocketService.sendTyping(room, true);
      if (!_userIsTyping) {
        _userIsTyping = true;
        _typingHeartbeat?.cancel();
        _typingHeartbeat = Timer.periodic(const Duration(seconds: 3), (_) {
          SocketService.sendTyping(room, true);
        });
      }
    } else {
      if (_userIsTyping) {
        SocketService.sendTyping(room, false);
        _userIsTyping = false;
        _typingHeartbeat?.cancel();
      }
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    _controller.clear();
    if (_parentId != null) {
      SocketService.sendTyping('parent_chat_$_parentId', false);
    }
    _userIsTyping = false;
    _typingHeartbeat?.cancel();

    if (SocketService.isConnected && _parentId != null) {
      SocketService.sendParentMessage(_parentId!, text, senderName: 'Parent');
    } else {
      await BankingApiService.parentSupportSend(text);
      final fresh = await BankingApiService.parentSupportGetMessages();
      if (mounted) {
        setState(() => _messages = fresh.cast<Map<String, dynamic>>());
      }
    }

    if (mounted) {
      setState(() => _sending = false);
      _scrollDown();
    }
  }

  Widget _readReceipt(int? parentRead, String senderType) {
    if (senderType == 'admin') return const SizedBox.shrink();
    final read = parentRead == 1;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          read ? Icons.check_circle : Icons.check_circle_outline,
          size: 11,
          color: read ? Colors.indigo.shade300 : Colors.grey.shade400,
        ),
        const SizedBox(width: 2),
        Text(
          read ? 'Read' : 'Sent',
          style: TextStyle(fontSize: 9, color: read ? Colors.indigo.shade300 : Colors.grey.shade400),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Contact Support'),
        backgroundColor: const Color(0xFF1565C0),
        foregroundColor: Colors.white,
        elevation: 1,
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            color: const Color(0xFFE3F2FD),
            child: Row(
              children: [
                const Icon(Icons.support_agent, color: Color(0xFF4338CA), size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Send a message to the admin team. Replies appear in real-time.',
                    style: TextStyle(fontSize: 12, color: Colors.indigo.shade800, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.chat_bubble_outline, size: 48, color: Colors.grey.shade300),
                            const SizedBox(height: 12),
                            Text('No messages yet', style: TextStyle(color: Colors.grey.shade500, fontSize: 15)),
                            const SizedBox(height: 4),
                            Text('Send a message below to get started', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
                          ],
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(12),
                        itemCount: _messages.length,
                        itemBuilder: (ctx, i) {
                          final m = _messages[i];
                          final isAdmin = m['sender_type'] == 'admin';
                          final name = (m['sender_name'] as String?) ?? (isAdmin ? 'Admin' : 'You');
                          final content = (m['content'] as String?) ?? '';
                          final time = (m['created_at'] as String?) ?? '';
                          final ts = time.length >= 16 ? time.substring(0, 16).replaceAll('T', ' ') : time;
                          final adminRead = m['admin_read'] as int?;
                          final parentRead = m['parent_read'] as int?;
                          return Align(
                            alignment: isAdmin ? Alignment.centerLeft : Alignment.centerRight,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                              child: Column(
                                crossAxisAlignment: isAdmin ? CrossAxisAlignment.start : CrossAxisAlignment.end,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                    decoration: BoxDecoration(
                                      color: isAdmin ? const Color(0xFFF1F5F9) : const Color(0xFF1565C0),
                                      borderRadius: BorderRadius.only(
                                        topLeft: const Radius.circular(14),
                                        topRight: const Radius.circular(14),
                                        bottomLeft: Radius.circular(isAdmin ? 4 : 14),
                                        bottomRight: Radius.circular(isAdmin ? 14 : 4),
                                      ),
                                    ),
                                    child: Text(
                                      content,
                                      style: TextStyle(
                                        fontSize: 14,
                                        color: isAdmin ? Colors.black87 : Colors.white,
                                        height: 1.4,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    mainAxisAlignment: isAdmin ? MainAxisAlignment.start : MainAxisAlignment.end,
                                    children: [
                                      if (isAdmin && parentRead == 1)
                                        Padding(
                                          padding: const EdgeInsets.only(right: 4),
                                          child: Icon(Icons.check_circle, size: 10, color: const Color(0xFF1565C0)),
                                        ),
                                      Text(
                                        '$name · $ts',
                                        style: TextStyle(fontSize: 9, color: Colors.grey.shade500),
                                      ),
                                      if (!isAdmin) ...[
                                        const SizedBox(width: 4),
                                        _readReceipt(adminRead, 'parent'),
                                      ],
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
          if (_adminTyping)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              color: Colors.grey.shade50,
              child: Row(
                children: [
                  const _BouncingDots(),
                  const SizedBox(width: 8),
                  Text('Admin is typing...', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                ],
              ),
            ),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 12),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, -2)),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    maxLines: 3,
                    minLines: 1,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: _onTyping,
                    decoration: InputDecoration(
                      hintText: 'Type your message...',
                      hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: BorderSide.none,
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(22),
                        borderSide: const BorderSide(color: Color(0xFF1565C0)),
                      ),
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 6),
                CircleAvatar(
                  radius: 20,
                  backgroundColor: const Color(0xFF1565C0),
                  child: IconButton(
                    icon: _sending
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.send_rounded, size: 18, color: Colors.white),
                    onPressed: _send,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BouncingDots extends StatefulWidget {
  const _BouncingDots();
  @override
  State<_BouncingDots> createState() => _BouncingDotsState();
}

class _BouncingDotsState extends State<_BouncingDots> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));
    _anim = Tween<double>(begin: 0, end: 1).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
    _controller.repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) {
        return SizedBox(
          width: 28,
          height: 12,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(3, (i) {
              final delay = i * 0.15;
              final t = (_anim.value + delay) % 1.0;
              final offset = -4 * (t < 0.5 ? 2 * t : 2 * (1 - t));
              return Padding(
                padding: EdgeInsets.only(right: i < 2 ? 4 : 0),
                child: Transform.translate(
                  offset: Offset(0, offset),
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: const Color(0xFF1565C0),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              );
            }),
          ),
        );
      },
    );
  }
}
