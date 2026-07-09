import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/theme/app_theme.dart';
import '../../core/network/banking_api_service.dart';
import '../widgets/kyc_selfie_capture.dart';
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
  final _otpController = TextEditingController();
  final _pinFocus = FocusNode();
  final _pin1Focus = FocusNode();
  final _pin2Focus = FocusNode();

  // Selfie capture
  final _selfieKey = GlobalKey<KycSelfieCaptureState>();

  // ID photo state (file picker for ID photo)
  String? _idPhotoPath;
  final _picker = ImagePicker();

  // ID type
  final List<String> _idTypes = [
    'Passport', "Driver's License", 'National ID', 'UMID', 'SSS ID',
    'GSIS ID', 'PRC ID', 'Postal ID', "Voter's ID", 'Barangay ID',
    'School ID', 'Company ID', 'Other',
  ];
  String _selectedIdType = '';

  // OTP state
  bool _otpSent = false;
  bool _emailVerified = false;
  String? _emailVerifyToken;
  int _otpCountdown = 0;

  bool _loading = false;
  bool _registered = false;
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
    _otpController.dispose();
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
      _otpController.clear();
      _selectedIdType = '';
      _idPhotoPath = null;
      _otpSent = false;
      _emailVerified = false;
      _emailVerifyToken = null;
      _registered = false;
    });
  }

  // ── OTP Flow ──
  Future<void> _sendOtp() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) { setState(() => _error = 'Enter your email first'); return; }
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      setState(() => _error = 'Enter a valid email'); return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await BankingApiService.parentSendOtp(email);
      if (!mounted) return;
      setState(() {
        _otpSent = true;
        _loading = false;
        _otpCountdown = 60;
      });
      _startOtpCountdown();
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = 'Failed to send OTP'; _loading = false; });
    }
  }

  void _startOtpCountdown() {
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return false;
      setState(() {
        if (_otpCountdown > 0) _otpCountdown--;
      });
      return _otpCountdown > 0;
    });
  }

  Future<void> _verifyOtp() async {
    final email = _emailController.text.trim();
    final otp = _otpController.text.trim();
    if (otp.length < 6) { setState(() => _error = 'Enter the 6-digit code from your email'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      final result = await BankingApiService.parentVerifyOtp(email, otp);
      if (!mounted) return;
      if (result == null || result['emailVerifyToken'] == null) {
        setState(() { _error = 'Invalid or expired code'; _loading = false; });
        return;
      }
      setState(() {
        _emailVerified = true;
        _emailVerifyToken = result['emailVerifyToken'] as String;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = 'Verification failed'; _loading = false; });
    }
  }

  Future<void> _pickIdPhoto() async {
    final x = await _picker.pickImage(source: ImageSource.camera, imageQuality: 80, maxWidth: 1024);
    if (x != null) setState(() => _idPhotoPath = x.path);
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
        final status = result['status'] as String?;
        if (status == 'pending') {
          setState(() { _error = 'Registration pending admin approval.'; _loading = false; _registered = true; });
        } else {
          setState(() { _error = result['message'] as String? ?? 'Invalid email or PIN'; _loading = false; });
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
    if (!_emailVerified || _emailVerifyToken == null) {
      setState(() => _error = 'Please verify your email with the OTP code first'); return;
    }
    final pin1 = _pin1Controller.text.trim();
    final pin2 = _pin2Controller.text.trim();
    if (pin1.length < 6) { setState(() => _error = 'Enter your 6-digit PIN'); return; }
    if (pin1 != pin2) { setState(() => _error = 'PINs do not match'); return; }
    if (_selectedIdType.isEmpty) { setState(() => _error = 'Select your ID type'); return; }
    final idNumber = _idNumberController.text.trim();
    if (idNumber.length < 4) { setState(() => _error = 'Enter a valid ID number'); return; }

    final selfieBytes = _selfieKey.currentState?.validatedImageBytes;
    final selfieName = _selfieKey.currentState?.imageFilename ?? 'selfie.jpg';
    if (selfieBytes == null) {
      setState(() => _error = 'Please take a valid selfie (face must be detected and centered)');
      return;
    }

    setState(() { _loading = true; _error = null; });
    try {
      final displayName = _nameController.text.trim();
      Uint8List? idPhotoBytes;
      String? idPhotoFilename;
      if (_idPhotoPath != null) {
        idPhotoBytes = await File(_idPhotoPath!).readAsBytes();
        idPhotoFilename = _idPhotoPath!.split('/').last.split('\\').last;
      }

      final result = await BankingApiService.parentRegisterWithPhotos(
        email, pin1, _selectedIdType, idNumber, _emailVerifyToken!,
        displayName: displayName,
        photoBytes: selfieBytes, photoFilename: selfieName,
        idPhotoBytes: idPhotoBytes, idPhotoFilename: idPhotoFilename,
      );

      if (!mounted) return;
      if (result == null) {
        setState(() { _error = 'Connection error'; _loading = false; });
        return;
      }
      if (result['status'] == 'pending') {
        setState(() { _registered = true; _loading = false; });
      } else {
        setState(() { _error = result['message'] as String? ?? 'Registration failed'; _loading = false; });
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
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: FadeTransition(
                opacity: _fadeSlide,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 28),
                    // ── Header ──
                    Container(
                      width: 88, height: 88,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.15),
                      ),
                      child: const Icon(Icons.family_restroom, size: 48, color: Colors.white),
                    ),
                    const SizedBox(height: 18),
                    const Text('Parent Portal',
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 1)),
                    const SizedBox(height: 6),
                    Text(
                      _registered
                          ? 'Registration submitted!'
                          : _mode == 0
                              ? 'Monitor & approve your child\'s transactions'
                              : 'Verify your email to register',
                      style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.6))),
                    const SizedBox(height: 28),

                    // ── Registration Success ──
                    if (_registered)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                        ),
                        child: Column(
                          children: [
                            const Icon(Icons.check_circle_outline, color: Colors.greenAccent, size: 64),
                            const SizedBox(height: 16),
                            const Text('Registration Submitted!',
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
                            const SizedBox(height: 10),
                            Text(
                              'An admin will review your selfie and ID documents.\nYou will receive access once approved.',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.7))),
                            const SizedBox(height: 24),
                            SizedBox(
                              width: 200,
                              child: ElevatedButton(
                                onPressed: () => _switchMode(0),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppTheme.accentAmber,
                                  foregroundColor: AppTheme.textDark,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                child: const Text('Back to Login', style: TextStyle(fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ],
                        ),
                      )
                    else

                    // ── Login / Register Form ──
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                      ),
                      child: Column(
                        children: [
                          // ── Mode toggle ──
                          Row(
                            children: [
                              Expanded(child: _modeButton('Login', 0)),
                              const SizedBox(width: 10),
                              Expanded(child: _modeButton('Register', 1)),
                            ],
                          ),
                          const SizedBox(height: 24),

                          // ── Email field ──
                          _buildField(
                            controller: _emailController,
                            hint: 'Email address',
                            icon: Icons.email_outlined,
                            keyboardType: TextInputType.emailAddress,
                            suffix: _emailVerified ? const Icon(Icons.verified, color: Colors.greenAccent, size: 20) : null,
                          ),
                          const SizedBox(height: 16),

                          // ── OTP Section (register mode, email not yet verified) ──
                          if (_mode == 1 && !_emailVerified) ...[
                            SizedBox(
                              width: double.infinity, height: 48,
                              child: ElevatedButton.icon(
                                onPressed: _loading || _otpCountdown > 0 ? null : _sendOtp,
                                icon: const Icon(Icons.send, size: 16),
                                label: Text(_otpCountdown > 0
                                    ? 'Resend in ${_otpCountdown}s'
                                    : _otpSent ? 'Resend OTP Code' : 'Send OTP Code'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppTheme.accentAmber,
                                  foregroundColor: AppTheme.textDark,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                              ),
                            ),
                            if (_otpSent) ...[
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: _buildField(
                                      controller: _otpController,
                                      hint: 'Enter 6-digit code',
                                      icon: Icons.pin_outlined,
                                      keyboardType: TextInputType.number,
                                      maxLength: 6,
                                      textStyle: const TextStyle(color: Colors.white, fontSize: 20, letterSpacing: 8),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  SizedBox(
                                    height: 50, width: 90,
                                    child: ElevatedButton(
                                      onPressed: _loading ? null : _verifyOtp,
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.green,
                                        foregroundColor: Colors.white,
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                      ),
                                      child: const Text('Verify', style: TextStyle(fontWeight: FontWeight.bold)),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                            const SizedBox(height: 4),
                          ],

                          // ── Email verified badge ──
                          if (_emailVerified)
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: Colors.green.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
                              ),
                              child: const Row(
                                children: [
                                  Icon(Icons.check_circle, color: Colors.greenAccent, size: 18),
                                  SizedBox(width: 8),
                                  Text('Email verified', style: TextStyle(color: Colors.greenAccent, fontSize: 13, fontWeight: FontWeight.w500)),
                                ],
                              ),
                            ),

                          // ── Register-only fields (after email verified) ──
                          if (_mode == 1 && _emailVerified) ...[
                            const SizedBox(height: 16),
                            _buildField(
                              controller: _nameController,
                              hint: 'Your full name',
                              icon: Icons.person_outline,
                            ),
                            const SizedBox(height: 14),

                            // Selfie capture
                            Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Selfie Verification',
                                    style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12, fontWeight: FontWeight.w600)),
                                  const SizedBox(height: 10),
                                  KycSelfieCapture(key: _selfieKey),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),

                            // ID photo
                            _buildPhotoPicker('ID Photo (take a picture of your ID)', _idPhotoPath, _pickIdPhoto),
                            const SizedBox(height: 12),

                            // ID type dropdown
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14),
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
                            const SizedBox(height: 12),
                            _buildField(
                              controller: _idNumberController,
                              hint: 'ID number',
                              icon: Icons.numbers,
                            ),

                            // PIN fields
                            const SizedBox(height: 16),
                            _buildField(
                              focusNode: _pin1Focus,
                              controller: _pin1Controller,
                              hint: 'Create 6-digit PIN',
                              icon: Icons.lock_outline,
                              isPin: true,
                              textInputAction: TextInputAction.next,
                            ),
                            const SizedBox(height: 12),
                            _buildField(
                              focusNode: _pin2Focus,
                              controller: _pin2Controller,
                              hint: 'Confirm 6-digit PIN',
                              icon: Icons.lock_outline,
                              isPin: true,
                              textInputAction: TextInputAction.done,
                            ),
                          ],

                          // ── PIN field (login mode) ──
                          if (_mode == 0) ...[
                            const SizedBox(height: 4),
                            _buildField(
                              focusNode: _pinFocus,
                              controller: _pinController,
                              hint: '6-digit PIN',
                              icon: Icons.lock_outline,
                              isPin: true,
                              textInputAction: TextInputAction.done,
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
                            ),
                          ],

                          // ── Error ──
                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 14),
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                decoration: BoxDecoration(
                                  color: Colors.red.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                                ),
                                child: Text(_error!, style: TextStyle(color: Colors.orange.shade200, fontSize: 13)),
                              ),
                            ),

                          // ── Submit button ──
                          if (!(_mode == 1 && !_emailVerified)) ...[
                            const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity, height: 50,
                              child: ElevatedButton(
                                onPressed: _loading ? null : (_mode == 0 ? _doLogin : _doRegister),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppTheme.accentAmber,
                                  foregroundColor: AppTheme.textDark,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                  elevation: 4,
                                ),
                                child: _loading
                                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppTheme.textDark))
                                    : Text(_mode == 0 ? 'Login as Parent' : 'Submit for Approval',
                                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: Text('\u2190 Back to Child Login', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13)),
                    ),
                    const SizedBox(height: 28),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildField({
    TextEditingController? controller,
    FocusNode? focusNode,
    required String hint,
    required IconData icon,
    TextInputType? keyboardType,
    TextInputAction? textInputAction,
    bool obscureText = false,
    bool isPin = false,
    int? maxLength,
    Widget? suffix,
    TextStyle? textStyle,
    ValueChanged<String>? onChanged,
    ValueChanged<String>? onSubmitted,
  }) {
    return TextField(
      focusNode: focusNode,
      controller: controller,
      obscureText: obscureText || isPin,
      obscuringCharacter: '\u25CF',
      style: textStyle ?? TextStyle(
        color: Colors.white,
        fontSize: isPin ? 18 : 14,
        letterSpacing: isPin ? 6 : 0,
      ),
      cursorColor: AppTheme.accentAmber,
      keyboardType: keyboardType ?? TextInputType.text,
      textInputAction: textInputAction ?? TextInputAction.next,
      maxLength: maxLength ?? (isPin ? 6 : null),
      buildCounter: (isPin || maxLength != null)
          ? (_, {required currentLength, required isFocused, maxLength}) => null
          : null,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: isPin ? 14 : 14),
        prefixIcon: Icon(icon, color: Colors.white.withValues(alpha: 0.5), size: 20),
        suffixIcon: suffix,
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
                path != null ? label : label,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: path != null ? 0.9 : 0.5),
                  fontSize: 13,
                ),
              ),
            ),
            if (path != null)
              GestureDetector(
                onTap: () => setState(() => _idPhotoPath = null),
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

  }
