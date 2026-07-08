import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/theme/app_theme.dart';
import '../../core/network/banking_api_service.dart';
import 'parent_dashboard_page.dart';

class ParentLoginPage extends StatefulWidget {
  const ParentLoginPage({super.key});

  @override
  State<ParentLoginPage> createState() => _ParentLoginPageState();
}

class _ParentLoginPageState extends State<ParentLoginPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _fadeSlide;
  int _mode = 0; // 0=login, 1=register
  final _emailController = TextEditingController();
  final _nameController = TextEditingController();
  final _pinController = TextEditingController();
  final _pin1Controller = TextEditingController();
  final _pin2Controller = TextEditingController();
  final _idNumberController = TextEditingController();
  final _pinFocus = FocusNode();
  final _pin1Focus = FocusNode();
  final _pin2Focus = FocusNode();

  // Photo state
  String? _photoPath;
  String? _idPhotoPath;
  final _picker = ImagePicker();

  // ID type
  final List<String> _idTypes = [
    'Passport', "Driver's License", 'National ID', 'UMID', 'SSS ID',
    'GSIS ID', 'PRC ID', 'Postal ID', "Voter's ID", 'Barangay ID',
    'School ID', 'Company ID', 'Other',
  ];
  String _selectedIdType = '';

  bool _loading = false;
  bool _registered = false; // show pending message after registration
  String? _error;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 800),
    );
    _fadeSlide = CurvedAnimation(parent: _animController, curve: Curves.easeOutCubic);
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    _emailController.dispose();
    _nameController.dispose();
    _pinController.dispose();
    _pin1Controller.dispose();
    _pin2Controller.dispose();
    _idNumberController.dispose();
    _pinFocus.dispose();
    _pin1Focus.dispose();
    _pin2Focus.dispose();
    super.dispose();
  }

  void _switchMode(int mode) {
    setState(() {
      _mode = mode;
      _error = null;
      _pinController.clear();
      _pin1Controller.clear();
      _pin2Controller.clear();
      _idNumberController.clear();
      _selectedIdType = '';
      _photoPath = null;
      _idPhotoPath = null;
      _registered = false;
    });
  }

  Future<void> _pickPhoto(String type) async {
    final x = await _picker.pickImage(source: ImageSource.gallery, maxWidth: 1024, imageQuality: 80);
    if (x != null) {
      setState(() {
        if (type == 'photo') _photoPath = x.path;
        if (type == 'idPhoto') _idPhotoPath = x.path;
      });
    }
  }

  Future<void> _doLogin() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) { setState(() => _error = 'Enter your email'); return; }
    final pin = _pinController.text.trim();
    if (pin.length < 6) { setState(() => _error = 'Enter your 6-digit PIN'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      final result = await BankingApiService.parentLogin(email, pin);
      if (!mounted) return;
      if (result == null) { setState(() { _error = 'Connection error'; _loading = false; }); return; }
      if (result['token'] == null) {
        final msg = result['message'] as String? ?? 'Invalid email or PIN';
        final status = result['status'] as String?;
        if (status == 'pending') {
          setState(() { _error = 'Registration pending admin approval.'; _loading = false; _registered = true; });
        } else {
          setState(() { _error = msg; _loading = false; });
        }
        return;
      }
      const storage = FlutterSecureStorage();
      await storage.write(key: 'parent_token', value: result['token'] as String);
      await storage.write(key: 'parent_email', value: email);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const ParentDashboardPage()));
    } catch (e) {
      setState(() { _error = 'Connection error'; _loading = false; });
    }
  }

  Future<void> _doRegister() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) { setState(() => _error = 'Enter your email'); return; }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      setState(() => _error = 'Enter a valid email'); return;
    }
    final pin1 = _pin1Controller.text.trim();
    final pin2 = _pin2Controller.text.trim();
    if (pin1.length < 6) { setState(() => _error = 'Enter your 6-digit PIN'); return; }
    if (pin1 != pin2) { setState(() => _error = 'PINs do not match'); return; }
    if (_selectedIdType.isEmpty) { setState(() => _error = 'Select your ID type'); return; }
    final idNumber = _idNumberController.text.trim();
    if (idNumber.length < 4) { setState(() => _error = 'Enter a valid ID number'); return; }

    setState(() { _loading = true; _error = null; });
    try {
      final displayName = _nameController.text.trim();
      Map<String, dynamic>? result;

      if (_photoPath != null || _idPhotoPath != null) {
        result = await BankingApiService.parentRegisterWithPhotos(
          email, pin1, _selectedIdType, idNumber,
          displayName: displayName, photoPath: _photoPath, idPhotoPath: _idPhotoPath,
        );
      } else {
        result = await BankingApiService.parentRegister(
          email, pin1, displayName: displayName, idType: _selectedIdType, idNumber: idNumber,
        );
      }

      if (!mounted) return;
      if (result == null) {
        setState(() { _error = 'Connection error'; _loading = false; });
        return;
      }
      if (result['status'] == 'pending') {
        setState(() { _registered = true; _loading = false; });
      } else if (result['token'] != null) {
        // Old behavior fallback (if no status check)
        const storage = FlutterSecureStorage();
        await storage.write(key: 'parent_token', value: result['token'] as String);
        await storage.write(key: 'parent_email', value: email);
        if (!mounted) return;
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const ParentDashboardPage()));
      } else {
        setState(() { _error = 'Registration failed. Email may already be registered.'; _loading = false; });
      }
    } catch (e) {
      setState(() { _error = 'Connection error'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF1a237e), Color(0xFF283593), Color(0xFF3949ab)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: FadeTransition(
                opacity: _fadeSlide,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 10),
                    Container(
                      width: 80, height: 80,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.15),
                      ),
                      child: const Icon(Icons.family_restroom, size: 44, color: Colors.white),
                    ),
                    const SizedBox(height: 16),
                    const Text('Parent Portal',
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 1)),
                    const SizedBox(height: 4),
                    Text(
                      _registered
                          ? 'Registration submitted!'
                          : _mode == 0
                              ? 'Monitor & approve your child\'s transactions'
                              : 'Register to link your child\'s account',
                      style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.6))),
                    const SizedBox(height: 24),

                    // ── Registration Success State ──
                    if (_registered)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: Colors.green.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
                        ),
                        child: Column(
                          children: [
                            const Icon(Icons.check_circle_outline, color: Colors.green, size: 56),
                            const SizedBox(height: 12),
                            const Text('Registration Submitted!',
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
                            const SizedBox(height: 8),
                            Text(
                              'An admin will review your photo ID and information. You will receive access once approved.\n\nPlease check back later.',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.7))),
                            const SizedBox(height: 20),
                            ElevatedButton(
                              onPressed: () => _switchMode(0),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.accentAmber,
                                foregroundColor: AppTheme.textDark,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              child: const Text('Back to Login', style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                      )
                    else
                    // ── Login / Register Form ──
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                      ),
                      child: Column(
                        children: [
                          // Mode toggle
                          Row(
                            children: [
                              Expanded(child: _modeButton('Login', 0)),
                              const SizedBox(width: 8),
                              Expanded(child: _modeButton('Register', 1)),
                            ],
                          ),
                          const SizedBox(height: 20),
                          TextField(
                            controller: _emailController,
                            style: const TextStyle(color: Colors.white, fontSize: 14),
                            cursorColor: Colors.white70,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              hintText: 'Email address',
                              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 14),
                              prefixIcon: Icon(Icons.email_outlined, color: Colors.white.withValues(alpha: 0.5), size: 20),
                              filled: true,
                              fillColor: Colors.white.withValues(alpha: 0.1),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 1.8),
                              ),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                            ),
                          ),

                          if (_mode == 1) ...[
                            const SizedBox(height: 12),
                            TextField(
                              controller: _nameController,
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              cursorColor: Colors.white70,
                              decoration: InputDecoration(
                                hintText: 'Your full name',
                                hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 14),
                                prefixIcon: Icon(Icons.person_outline, color: Colors.white.withValues(alpha: 0.5), size: 20),
                                filled: true, fillColor: Colors.white.withValues(alpha: 0.1),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 1.8),
                                ),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                              ),
                            ),
                            // Photo picker
                            const SizedBox(height: 12),
                            _buildPhotoPicker('Your Photo', _photoPath, () => _pickPhoto('photo')),
                            const SizedBox(height: 8),
                            // ID Type dropdown
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                              ),
                              child: DropdownButtonHideUnderline(
                                child: DropdownButton<String>(
                                  value: _selectedIdType.isEmpty ? null : _selectedIdType,
                                  hint: Row(
                                    children: [
                                      Icon(Icons.badge_outlined, color: Colors.white.withValues(alpha: 0.5), size: 20),
                                      const SizedBox(width: 10),
                                      Text('Select ID type',
                                        style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 14)),
                                    ],
                                  ),
                                  dropdownColor: const Color(0xFF1a237e),
                                  isExpanded: true,
                                  items: _idTypes.map((t) => DropdownMenuItem(
                                    value: t,
                                    child: Text(t, style: const TextStyle(color: Colors.white, fontSize: 14)),
                                  )).toList(),
                                  onChanged: (v) => setState(() => _selectedIdType = v ?? ''),
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: _idNumberController,
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              cursorColor: Colors.white70,
                              decoration: InputDecoration(
                                hintText: 'ID number',
                                hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 14),
                                prefixIcon: Icon(Icons.numbers, color: Colors.white.withValues(alpha: 0.5), size: 20),
                                filled: true, fillColor: Colors.white.withValues(alpha: 0.1),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 1.8),
                                ),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                              ),
                            ),
                            // ID photo picker
                            const SizedBox(height: 8),
                            _buildPhotoPicker('ID Photo', _idPhotoPath, () => _pickPhoto('idPhoto')),
                          ],

                          const SizedBox(height: 16),
                          // PIN field (login)
                          if (_mode == 0)
                            TextField(
                              focusNode: _pinFocus,
                              controller: _pinController,
                              obscureText: true,
                              obscuringCharacter: '\u25CF',
                              style: const TextStyle(color: Colors.white, fontSize: 18, letterSpacing: 6),
                              cursorColor: AppTheme.accentAmber,
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.done,
                              maxLength: 6,
                              buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
                              onChanged: (v) {
                                setState(() { _error = null; });
                                if (v.length == 6 && !_loading) {
                                  FocusScope.of(context).unfocus();
                                  _doLogin();
                                }
                              },
                              onSubmitted: (_) {
                                if (_pinController.text.length == 6 && !_loading) _doLogin();
                              },
                              decoration: _pinDecoration('6-digit PIN'),
                            ),

                          // PIN fields (register — two for confirmation)
                          if (_mode == 1) ...[
                            TextField(
                              focusNode: _pin1Focus,
                              controller: _pin1Controller,
                              obscureText: true,
                              obscuringCharacter: '\u25CF',
                              style: const TextStyle(color: Colors.white, fontSize: 18, letterSpacing: 6),
                              cursorColor: AppTheme.accentAmber,
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.next,
                              maxLength: 6,
                              buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
                              decoration: _pinDecoration('Create 6-digit PIN'),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              focusNode: _pin2Focus,
                              controller: _pin2Controller,
                              obscureText: true,
                              obscuringCharacter: '\u25CF',
                              style: const TextStyle(color: Colors.white, fontSize: 18, letterSpacing: 6),
                              cursorColor: AppTheme.accentAmber,
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.done,
                              maxLength: 6,
                              buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
                              decoration: _pinDecoration('Confirm 6-digit PIN'),
                            ),
                          ],

                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(
                                  color: Colors.red.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                                ),
                                child: Text(_error!, style: TextStyle(color: Colors.orange.shade200, fontSize: 12)),
                              ),
                            ),

                          const SizedBox(height: 16),

                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity, height: 44,
                            child: ElevatedButton(
                              onPressed: _loading ? null : (_mode == 0 ? _doLogin : _doRegister),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.accentAmber,
                                foregroundColor: AppTheme.textDark,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                elevation: 4,
                              ),
                              child: _loading
                                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.textDark))
                                  : Text(_mode == 0 ? 'Login as Parent' : 'Submit for Approval',
                                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: Text('\u2190 Back to Child Login', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13)),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPhotoPicker(String label, String? path, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: path != null ? AppTheme.accentAmber.withValues(alpha: 0.6) : Colors.white.withValues(alpha: 0.15),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: Colors.white.withValues(alpha: 0.1),
                image: path != null
                    ? DecorationImage(image: FileImage(File(path)), fit: BoxFit.cover)
                    : null,
              ),
              child: path == null
                  ? Icon(Icons.camera_alt, color: Colors.white.withValues(alpha: 0.5), size: 22)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                path != null ? label : 'Tap to add $label',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: path != null ? 0.9 : 0.5),
                  fontSize: 13,
                ),
              ),
            ),
            if (path != null)
              GestureDetector(
                onTap: () {
                  setState(() {
                    if (label.contains('Photo') && !label.contains('ID')) {
                      _photoPath = null;
                    } else {
                      _idPhotoPath = null;
                    }
                  });
                },
                child: Icon(Icons.close, color: Colors.white.withValues(alpha: 0.5), size: 18),
              ),
          ],
        ),
      ),
    );
  }

  Widget _modeButton(String label, int mode) {
    final active = _mode == mode;
    return GestureDetector(
      onTap: () => _switchMode(mode),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: active ? Colors.white.withValues(alpha: 0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: active ? Colors.white.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.1)),
        ),
        child: Center(
          child: Text(label,
            style: TextStyle(color: active ? Colors.white : Colors.white.withValues(alpha: 0.5), fontWeight: active ? FontWeight.w600 : FontWeight.normal, fontSize: 14)),
        ),
      ),
    );
  }

  InputDecoration _pinDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 14),
      prefixIcon: Icon(Icons.lock_outline, color: Colors.white.withValues(alpha: 0.5), size: 20),
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.1),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 1.8),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
    );
  }
}
