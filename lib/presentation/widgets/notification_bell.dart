import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/services/notification_service.dart';
import '../../core/network/banking_api_service.dart';

class NotificationBell extends StatefulWidget {
  const NotificationBell({super.key});

  @override
  State<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<NotificationBell> {
  int _unreadCount = 0;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _fetchUnread();
    NotificationService.addListener(_fetchUnread);
    _pollTimer = Timer.periodic(const Duration(seconds: 30), (_) => _fetchUnread());
  }

  @override
  void dispose() {
    NotificationService.removeListener(_fetchUnread);
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchUnread() async {
    try {
      // Try lightweight unread-count endpoint first
      final data = await BankingApiService.getUnreadCount();
      if (mounted) {
        final count = (data['unreadCount'] as int?) ?? 0;
        stderr.writeln('[NotifBell] unread-count: $count');
        setState(() => _unreadCount = count);
      }
    } catch (e1) {
      stderr.writeln('[NotifBell] unread-count failed: $e1');
      // Fallback: use the regular notifications endpoint
      try {
        final data = await BankingApiService.getNotifications(limit: 50);
        if (mounted) {
          final count = (data['unreadCount'] as int?) ?? 0;
          stderr.writeln('[NotifBell] fallback unread-count: $count');
          setState(() => _unreadCount = count);
        }
      } catch (e2) {
        stderr.writeln('[NotifBell] fallback also failed: $e2');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: () async {
        try {
          await BankingApiService.markAllNotificationsRead();
          setState(() => _unreadCount = 0);
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('All notifications marked as read'),
                duration: Duration(seconds: 2),
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        } catch (_) {}
      },
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined, size: 22),
            tooltip: 'Notifications',
            onPressed: () async {
              try {
                final storage = FlutterSecureStorage();
                final token = await storage.read(key: 'auth_token');
                if (token != null) {
                  await NotificationService.registerAfterLogin();
                }
              } catch (_) {}

              if (!context.mounted) return;
              final changed = await Navigator.of(context).push<bool>(
                MaterialPageRoute(
                  builder: (_) => const _NotificationListPage(),
                ),
              );
              if (changed == true) _fetchUnread();
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
      ),
    );
  }
}

class _NotificationListPage extends StatefulWidget {
  const _NotificationListPage();

  @override
  State<_NotificationListPage> createState() => _NotificationListPageState();
}

class _NotificationListPageState extends State<_NotificationListPage> {
  List<dynamic> _notifications = [];
  bool _loading = true;
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    try {
      final data = await BankingApiService.getNotifications(limit: 50);
      if (mounted) {
        setState(() {
          _notifications = (data['notifications'] as List<dynamic>?) ?? [];
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _notifId(dynamic n) {
    final id = n['notif_id'];
    return id is String ? id : id.toString();
  }

  void _markRead(dynamic n) {
    final notifId = _notifId(n);
    // Optimistic local update
    setState(() {
      final idx = _notifications.indexWhere((x) => _notifId(x) == notifId);
      if (idx >= 0) _notifications[idx] = {...(_notifications[idx] as Map), 'is_read': 1};
    });
    _changed = true;
    // Fire-and-forget API call
    BankingApiService.markNotificationRead(notifId).catchError((e) {
      stderr.writeln('Failed to mark $notifId as read: $e');
    });
  }

  void _showDetail(dynamic n) {
    final isRead = n['is_read'] == 1;
    final title = n['title'] as String? ?? '';
    final body = n['body'] as String? ?? '';
    final createdAt = n['created_at'] as String? ?? '';

    // Mark as read if unread
    if (!isRead) _markRead(n);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (body.isNotEmpty) ...[
                Text(body, style: const TextStyle(fontSize: 15, height: 1.4)),
                const SizedBox(height: 12),
              ],
              Text(
                _formatDate(createdAt),
                style: const TextStyle(color: Colors.grey, fontSize: 12),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).pop(_changed),
          ),
          title: const Text('Notifications'),
          actions: [
            if (_notifications.any((n) => n['is_read'] == 0))
              TextButton(
                onPressed: () async {
                  try {
                    await BankingApiService.markAllNotificationsRead();
                    _changed = true;
                    _fetch();
                  } catch (_) {}
                },
                child: const Text('Mark all read'),
              ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _notifications.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.notifications_none, size: 64, color: Colors.grey),
                        SizedBox(height: 8),
                        Text('No notifications yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _fetch,
                    child: ListView.separated(
                      itemCount: _notifications.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, i) {
                        final n = _notifications[i];
                        final isRead = n['is_read'] == 1;
                        final title = n['title'] as String? ?? '';
                        final body = n['body'] as String? ?? '';
                        final createdAt = n['created_at'] as String? ?? '';
                        return ListTile(
                          leading: Icon(
                            isRead ? Icons.notifications_none : Icons.notifications_active,
                            color: isRead ? Colors.grey : Colors.orange,
                          ),
                          title: Text(
                            title,
                            style: TextStyle(
                              fontWeight: isRead ? FontWeight.normal : FontWeight.bold,
                            ),
                          ),
                          subtitle: body.isNotEmpty ? Text(body, maxLines: 2, overflow: TextOverflow.ellipsis) : null,
                          trailing: Text(
                            _formatDate(createdAt),
                            style: const TextStyle(color: Colors.grey, fontSize: 12),
                          ),
                          onTap: () => _showDetail(n),
                        );
                      },
                    ),
                  ),
      ),
    );
  }

  String _formatDate(String iso) {
    if (iso.isEmpty) return '';
    try {
      final dt = DateTime.parse(iso);
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.month}/${dt.day}';
    } catch (_) {
      return '';
    }
  }
}
