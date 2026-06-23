import 'dart:async';
import 'dart:collection';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import '../../core/theme/app_theme.dart';

class GameWebViewPage extends StatefulWidget {
  final String url;
  final String gameTitle;
  final String gameEmoji;
  final int coinReward;
  final int xpReward;

  const GameWebViewPage({
    super.key,
    required this.url,
    required this.gameTitle,
    required this.gameEmoji,
    this.coinReward = 5,
    this.xpReward = 3,
  });

  @override
  State<GameWebViewPage> createState() => _GameWebViewPageState();
}

class _GameWebViewPageState extends State<GameWebViewPage> {
  bool _rewarded = false;
  bool _loading = true;
  bool _hasError = false;
  Timer? _loadingTimer;
  InAppWebViewController? _webController;

  @override
  void initState() {
    super.initState();
    _loadingTimer = Timer(const Duration(seconds: 10), () {
      if (mounted && _loading) {
        setState(() => _loading = false);
      }
    });
  }

  @override
  void dispose() {
    _loadingTimer?.cancel();
    super.dispose();
  }

  Future<bool> _claimReward() async {
    if (_rewarded) return true;
    if (widget.coinReward <= 0 && widget.xpReward <= 0) return true;
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('${widget.gameEmoji} ${widget.gameTitle}'),
        content: const Text('Enjoyed playing? You can close this page.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep Playing'),
          ),
          FilledButton(
            onPressed: () {
              _rewarded = true;
              Navigator.pop(ctx, true);
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.coinGold,
              foregroundColor: Colors.white,
            ),
            child: const Text('Close'),
          ),
        ],
      ),
    );
    return result ?? true;
  }

  void _reload() {
    _webController?.reload();
    setState(() {
      _hasError = false;
      _loading = true;
    });
  }

  void _closeImmediately() {
    _rewarded = true;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _rewarded,
      onPopInvokedWithResult: (didPop, _) async {
        if (!didPop) {
          final shouldPop = await _claimReward();
          if (shouldPop && mounted) Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.close),
            tooltip: 'Close game',
            onPressed: _closeImmediately,
          ),
          title: Row(
            children: [
              Text(widget.gameEmoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 8),
              Expanded(child: Text(widget.gameTitle, overflow: TextOverflow.ellipsis)),
            ],
          ),
          backgroundColor: AppTheme.primaryGreen,
          foregroundColor: Colors.white,
          actions: [
            if (_hasError)
              IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: 'Reload',
                onPressed: _reload,
              ),
          ],
        ),
        body: _hasError ? _buildError() : _buildWebView(),
      ),
    );
  }

  Widget _buildWebView() {
    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: Stack(
              children: [
                InAppWebView(
                  initialUrlRequest: URLRequest(url: WebUri(widget.url)),
                  initialSettings: InAppWebViewSettings(
                    javaScriptEnabled: true,
                    javaScriptCanOpenWindowsAutomatically: false,
                    mediaPlaybackRequiresUserGesture: true,
                    allowsInlineMediaPlayback: true,
                    useWideViewPort: true,
                    supportZoom: false,
                    allowFileAccess: false,
                  ),
                  initialUserScripts: UnmodifiableListView([
                    UserScript(
                      source: '''
                        (function() {
                          Object.defineProperty(window, 'adsbygoogle', {
                            get: function() { return []; },
                            set: function() {},
                            configurable: true
                          });
                          var blocked = ['doubleclick','googlesyndication','adsbygoogle','monetag','trycloudflare','adservice'];
                          var origFetch = window.fetch;
                          window.fetch = function(u) {
                            var url = typeof u === 'string' ? u : (u && u.url) || '';
                            for (var i = 0; i < blocked.length; i++) {
                              if (url.indexOf(blocked[i]) !== -1) return Promise.resolve(new Response('', {status: 204}));
                            }
                            return origFetch.call(this, u);
                          };
                          var origOpen = XMLHttpRequest.prototype.open;
                          var origSend = XMLHttpRequest.prototype.send;
                          XMLHttpRequest.prototype.open = function(m, u) { this._bl = blocked.some(function(b) { return u.indexOf(b) !== -1; }); return origOpen.apply(this, arguments); };
                          XMLHttpRequest.prototype.send = function(b) { if (this._bl) return; return origSend.apply(this, arguments); };
                          new MutationObserver(function(m) {
                            m.forEach(function(mut) {
                              for (var i = 0; i < mut.addedNodes.length; i++) {
                                var n = mut.addedNodes[i];
                                if (n.tagName === 'SCRIPT') {
                                  var s = n.src || '';
                                  for (var j = 0; j < blocked.length; j++) {
                                    if (s.indexOf(blocked[j]) !== -1) { n.remove(); break; }
                                  }
                                }
                              }
                            });
                          }).observe(document, {childList: true, subtree: true});
                        })();
                      ''',
                      injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
                    ),
                  ]),
                  onWebViewCreated: (ctrl) {
                    _webController = ctrl;
                  },
                  onLoadStart: (ctrl, url) {
                    if (mounted) setState(() => _loading = true);
                  },
                  onLoadStop: (ctrl, url) {
                    _loadingTimer?.cancel();
                    if (mounted) setState(() => _loading = false);
                  },
                  onReceivedError: (ctrl, req, err) {
                    _loadingTimer?.cancel();
                    if (mounted) {
                      setState(() {
                        _loading = false;
                        _hasError = true;
                      });
                    }
                  },
                  onReceivedHttpError: (ctrl, req, res) {
                    final code = res.statusCode ?? 0;
                    if (code == 404 || code >= 400) {
                      _loadingTimer?.cancel();
                      if (mounted) {
                        setState(() {
                          _loading = false;
                          _hasError = true;
                        });
                      }
                    }
                  },
                  onCreateWindow: (ctrl, createWindowRequest) async {
                    return false;
                  },
                  shouldOverrideUrlLoading: (ctrl, navAction) async {
                    final url = navAction.request.url.toString();
                    if (url.startsWith('https://gamezipper.com/')) {
                      return NavigationActionPolicy.ALLOW;
                    }
                    return NavigationActionPolicy.CANCEL;
                  },
                ),
                if (_loading)
                  Container(
                    color: Colors.white,
                    child: const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(color: AppTheme.primaryGreen),
                          SizedBox(height: 16),
                          Text('Loading...', style: TextStyle(color: Colors.grey)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildError() {
    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.warning_amber_rounded, size: 64, color: Colors.orange),
                    const SizedBox(height: 16),
                    const Text(
                      'Could not load game',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textDark),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'The game URL could not be loaded.\nIt may require an internet connection\nor the URL might be incorrect.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        FilledButton.icon(
                          onPressed: _reload,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Try Again'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppTheme.primaryGreen,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        OutlinedButton.icon(
                          onPressed: _closeImmediately,
                          icon: const Icon(Icons.close),
                          label: const Text('Go Back'),
                          style: OutlinedButton.styleFrom(
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
