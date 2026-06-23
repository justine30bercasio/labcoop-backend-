import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';
import '../../data/datasources/remote_api_source.dart';
import 'home_page.dart';

class RegistrationPage extends StatefulWidget {
  const RegistrationPage({super.key});

  @override
  State<RegistrationPage> createState() => _RegistrationPageState();
}

class _RegistrationPageState extends State<RegistrationPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _fadeScale;

  final _lastNameController = TextEditingController();
  final _firstNameController = TextEditingController();
  final _middleNameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _parentPhoneController = TextEditingController();

  DateTime? _birthday;
  String _selectedGender = '';
  String _selectedSchedule = '';

  XFile? _photo2x2;
  XFile? _birthCert;
  XFile? _idPhoto;

  bool _loading = false;
  bool _obscurePassword = true;
  bool _obscureConfirm = true;
  String? _error;
  int _currentStep = 0;

  int get _computedAge {
    if (_birthday == null) return 0;
    final now = DateTime.now();
    int age = now.year - _birthday!.year;
    final m = now.month - _birthday!.month;
    if (m < 0 || (m == 0 && now.day < _birthday!.day)) age--;
    return age;
  }

  String get _birthdayString => _birthday == null ? '' : '${_birthday!.year.toString().padLeft(4, '0')}-${_birthday!.month.toString().padLeft(2, '0')}-${_birthday!.day.toString().padLeft(2, '0')}';

  final _formKey = GlobalKey<FormState>();

  final List<String> _genders = ['Male', 'Female'];
  final List<String> _schedules = [
    'Daily',
    'Weekly',
    'Bi-Weekly',
    'Monthly',
    'Every Quarter',
  ];

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeScale = CurvedAnimation(parent: _animController, curve: Curves.easeOutBack);
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    _lastNameController.dispose();
    _firstNameController.dispose();
    _middleNameController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _parentPhoneController.dispose();
    super.dispose();
  }

  Future<void> _pickImage(ImageSource source, void Function(XFile) onPicked) async {
    final picker = ImagePicker();
    final xFile = await picker.pickImage(source: source, maxWidth: 1024, maxHeight: 1024);
    if (xFile != null) {
      onPicked(xFile);
      setState(() {});
    }
  }

  void _showImagePicker(void Function(XFile) onPicked) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.textDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined, color: Colors.white),
                title: const Text('Take Photo', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickImage(ImageSource.camera, onPicked);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: Colors.white),
                title: const Text('Choose from Gallery', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickImage(ImageSource.gallery, onPicked);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    if (_passwordController.text != _confirmPasswordController.text) {
      setState(() => _error = 'Passwords do not match');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await GetIt.instance<LocalDbSource>().clearAll();
      final api = GetIt.instance<RemoteApiSource>();

      final photoBytes = _photo2x2 != null ? await _photo2x2!.readAsBytes() : null;
      final birthBytes = _birthCert != null ? await _birthCert!.readAsBytes() : null;
      final idBytes = _idPhoto != null ? await _idPhoto!.readAsBytes() : null;

      await api.register(
        lastName: _lastNameController.text.trim(),
        firstName: _firstNameController.text.trim(),
        middleName: _middleNameController.text.trim(),
        password: _passwordController.text,
        parentPhone: _parentPhoneController.text.trim(),
        birthday: _birthdayString,
        gender: _selectedGender,
        savingsSchedule: _selectedSchedule,
        photo2x2Bytes: photoBytes,
        photo2x2Filename: _photo2x2?.name,
        birthCertBytes: birthBytes,
        birthCertFilename: _birthCert?.name,
        idPhotoBytes: idBytes,
        idPhotoFilename: _idPhoto?.name,
      );

      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomePage()),
      );
    } on DioException catch (e) {
      final type = e.type;
      if (type == DioExceptionType.connectionTimeout ||
          type == DioExceptionType.receiveTimeout ||
          type == DioExceptionType.sendTimeout ||
          type == DioExceptionType.connectionError) {
        setState(() {
          _error = 'Cannot reach server. Check your internet connection.';
          _loading = false;
        });
        return;
      }
      final statusCode = e.response?.statusCode;
      final msg = e.response?.data?['message'];
      setState(() {
        if (statusCode == 409) {
          _error = msg ?? 'Account already exists';
        } else if (msg != null && msg is String && msg.isNotEmpty) {
          _error = msg;
        } else if (statusCode != null) {
          _error = 'Server error (HTTP $statusCode)';
        } else {
          _error = 'Connection failed. Is the server running?';
        }
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Unexpected error: ${e.toString()}';
        _loading = false;
      });
    }
  }

  Future<void> _pickBirthday() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthday ?? DateTime(now.year - 10),
      firstDate: DateTime(now.year - 18),
      lastDate: now,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: ColorScheme.dark(
            primary: AppTheme.accentAmber,
            onPrimary: AppTheme.textDark,
            surface: const Color(0xFF1A2E1F),
            onSurface: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() => _birthday = picked);
    }
  }

  InputDecoration _inputDecoration({
    required String hint,
    required IconData icon,
  }) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 14),
      prefixIcon: Icon(icon, color: Colors.white.withValues(alpha: 0.5), size: 20),
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.1),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: AppTheme.accentAmber.withValues(alpha: 0.8), width: 1.8),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.textDark, Color(0xFF0D2818), AppTheme.primaryGreen],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: FadeTransition(
                opacity: _fadeScale,
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(height: 20),
                      _buildHeader(),
                      const SizedBox(height: 20),
                      _buildStepIndicator(),
                      const SizedBox(height: 16),
                      _buildCurrentStep(),
                      const SizedBox(height: 16),
                      if (_error != null) _buildErrorBox(),
                      const SizedBox(height: 24),
                      _buildNavigationButtons(),
                      const SizedBox(height: 20),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Container(
          width: 90, height: 90,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: AppTheme.accentAmber.withValues(alpha: 0.25),
                blurRadius: 20, spreadRadius: 2,
              ),
            ],
          ),
          child: ClipOval(
            child: Image.asset(
              'assets/images/applicationLogo.png',
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                color: Colors.white.withValues(alpha: 0.1),
                child: Icon(Icons.person_add, color: Colors.white.withValues(alpha: 0.5), size: 40),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Create Account',
          style: TextStyle(
            fontSize: 28, fontWeight: FontWeight.w800,
            color: Colors.white, letterSpacing: 1.5,
            shadows: [
              Shadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 2)),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Join LabCoop and start saving!',
          style: TextStyle(fontSize: 14, color: Colors.white.withValues(alpha: 0.6)),
        ),
      ],
    );
  }

  Widget _buildStepIndicator() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(3, (i) {
        final isActive = i <= _currentStep;
        final isCurrent = i == _currentStep;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: isCurrent ? 36 : 32,
              height: isCurrent ? 36 : 32,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isActive ? AppTheme.accentAmber : Colors.white.withValues(alpha: 0.15),
              ),
              child: Center(
                child: isActive && i < _currentStep
                    ? const Icon(Icons.check, color: AppTheme.textDark, size: 18)
                    : Text(
                        '${i + 1}',
                        style: TextStyle(
                          color: isActive ? AppTheme.textDark : Colors.white54,
                          fontWeight: FontWeight.bold, fontSize: 14,
                        ),
                      ),
              ),
            ),
            if (i < 2)
              Container(
                width: 40, height: 2,
                color: i < _currentStep ? AppTheme.accentAmber : Colors.white.withValues(alpha: 0.15),
              ),
          ],
        );
      }),
    );
  }

  Widget _buildCurrentStep() {
    switch (_currentStep) {
      case 0:
        return _buildPersonalInfoStep();
      case 1:
        return _buildDocumentStep();
      case 2:
        return _buildAccountStep();
      default:
        return const SizedBox();
    }
  }

  Widget _buildPersonalInfoStep() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Member Information',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.9)),
          ),
          const SizedBox(height: 4),
          Text('Full name will be displayed as: LASTNAME, FIRSTNAME MIDDLENAME (all caps)',
            style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.4)),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _lastNameController,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            cursorColor: AppTheme.accentAmber,
            textCapitalization: TextCapitalization.characters,
            decoration: _inputDecoration(hint: 'Last Name *', icon: Icons.badge_outlined),
            validator: (v) => (v == null || v.trim().isEmpty) ? 'Last name is required' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _firstNameController,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            cursorColor: AppTheme.accentAmber,
            textCapitalization: TextCapitalization.characters,
            decoration: _inputDecoration(hint: 'First Name *', icon: Icons.person_outline),
            validator: (v) => (v == null || v.trim().isEmpty) ? 'First name is required' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _middleNameController,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            cursorColor: AppTheme.accentAmber,
            textCapitalization: TextCapitalization.characters,
            decoration: _inputDecoration(hint: 'Middle Name (optional)', icon: Icons.person_outline),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: _pickBirthday,
                  child: InputDecorator(
                    decoration: _inputDecoration(hint: '', icon: Icons.cake_outlined).copyWith(
                      hintText: _birthday != null
                          ? '${_birthday!.month}/${_birthday!.day}/${_birthday!.year}'
                          : 'Birthday *',
                    ),
                    child: Text(
                      _birthday != null ? '${_birthday!.month}/${_birthday!.day}/${_birthday!.year}' : '',
                      style: TextStyle(color: Colors.white, fontSize: 15),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Center(
                    child: Text(
                      _computedAge > 0 ? 'Age: $_computedAge' : 'Age: --',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 14),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _selectedGender.isEmpty ? null : _selectedGender,
            dropdownColor: const Color(0xFF1A2E1F),
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: _inputDecoration(hint: 'Gender *', icon: Icons.wc_outlined),
            items: _genders.map((g) => DropdownMenuItem(value: g, child: Text(g))).toList(),
            onChanged: (v) => setState(() => _selectedGender = v ?? ''),
            validator: (v) => (v == null || v.isEmpty) ? 'Select gender' : null,
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentStep() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Required Documents',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.9)),
          ),
          const SizedBox(height: 4),
          Text('Upload the following documents (JPG, PNG, or PDF)',
            style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.4)),
          ),
          const SizedBox(height: 16),
          _buildUploadTile(
            icon: Icons.photo_camera_outlined,
            label: '2x2 ID Picture',
            hint: 'Passport-style photo',
            file: _photo2x2,
            onPick: (f) => _showImagePicker((x) => setState(() => _photo2x2 = x)),
            onClear: () => setState(() => _photo2x2 = null),
          ),
          const SizedBox(height: 12),
          _buildUploadTile(
            icon: Icons.description_outlined,
            label: 'Birth Certificate',
            hint: 'Scanned copy or photo',
            file: _birthCert,
            onPick: (f) => _showImagePicker((x) => setState(() => _birthCert = x)),
            onClear: () => setState(() => _birthCert = null),
          ),
          const SizedBox(height: 12),
          _buildUploadTile(
            icon: Icons.badge_outlined,
            label: 'ID (School/Government)',
            hint: 'Valid ID with photo',
            file: _idPhoto,
            onPick: (f) => _showImagePicker((x) => setState(() => _idPhoto = x)),
            onClear: () => setState(() => _idPhoto = null),
          ),
        ],
      ),
    );
  }

  Widget _buildUploadTile({
    required IconData icon,
    required String label,
    required String hint,
    required XFile? file,
    required void Function(XFile) onPick,
    required VoidCallback onClear,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: file != null ? AppTheme.primaryGreen.withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: file != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.file(File(file.path), fit: BoxFit.cover),
                  )
                : Icon(icon, color: Colors.white.withValues(alpha: 0.4), size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.85)),
                ),
                const SizedBox(height: 2),
                Text(
                  file != null ? file.name : hint,
                  style: TextStyle(fontSize: 11, color: file != null ? AppTheme.accentAmber : Colors.white.withValues(alpha: 0.4)),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          if (file != null)
            IconButton(
              icon: Icon(Icons.close, color: Colors.white.withValues(alpha: 0.5), size: 18),
              onPressed: onClear,
            ),
          if (file == null)
            TextButton(
              onPressed: () => _showImagePicker((x) => setState(() {
                if (label.contains('2x2')) _photo2x2 = x;
                else if (label.contains('Birth')) _birthCert = x;
                else if (label.contains('ID')) _idPhoto = x;
              })),
              child: Text('Upload', style: TextStyle(color: AppTheme.accentAmber, fontSize: 13)),
            ),
        ],
      ),
    );
  }

  Widget _buildAccountStep() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Account & Savings Plan',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.9)),
          ),
          const SizedBox(height: 4),
          Text('Set your login and savings schedule',
            style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.4)),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            value: _selectedSchedule.isEmpty ? null : _selectedSchedule,
            dropdownColor: const Color(0xFF1A2E1F),
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: _inputDecoration(hint: 'Savings Schedule *', icon: Icons.calendar_month_outlined),
            items: _schedules.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
            onChanged: (v) => setState(() => _selectedSchedule = v ?? ''),
            validator: (v) => (v == null || v.isEmpty) ? 'Select a savings schedule' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _parentPhoneController,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            cursorColor: AppTheme.accentAmber,
            keyboardType: TextInputType.phone,
            decoration: _inputDecoration(hint: 'Parent/Guardian Phone (optional)', icon: Icons.phone_outlined),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            cursorColor: AppTheme.accentAmber,
            decoration: _inputDecoration(hint: 'Password (min 4 chars) *', icon: Icons.lock_outline).copyWith(
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  color: Colors.white.withValues(alpha: 0.4), size: 20,
                ),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            validator: (v) {
              if (v == null || v.length < 4) return 'Password must be at least 4 characters';
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _confirmPasswordController,
            obscureText: _obscureConfirm,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            cursorColor: AppTheme.accentAmber,
            decoration: _inputDecoration(hint: 'Confirm Password *', icon: Icons.lock_outline).copyWith(
              suffixIcon: IconButton(
                icon: Icon(
                  _obscureConfirm ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  color: Colors.white.withValues(alpha: 0.4), size: 20,
                ),
                onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm),
              ),
            ),
            validator: (v) {
              if (v != _passwordController.text) return 'Passwords do not match';
              return null;
            },
          ),
        ],
      ),
    );
  }

  Widget _buildErrorBox() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.red.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: Colors.orange.shade200, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(_error!, style: TextStyle(color: Colors.orange.shade200, fontSize: 13)),
          ),
        ],
      ),
    );
  }

  Widget _buildNavigationButtons() {
    return Row(
      children: [
        if (_currentStep > 0)
          Expanded(
            child: OutlinedButton(
              onPressed: _loading ? null : () => setState(() => _currentStep--),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: BorderSide(color: Colors.white.withValues(alpha: 0.3)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('Back', style: TextStyle(fontSize: 15)),
            ),
          ),
        if (_currentStep > 0) const SizedBox(width: 12),
        Expanded(
          flex: _currentStep == 0 ? 1 : 2,
          child: ElevatedButton(
            onPressed: _loading
                ? null
                : () {
                    if (_currentStep < 2) {
                      setState(() => _currentStep++);
                    } else {
                      _register();
                    }
                  },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.accentAmber,
              foregroundColor: AppTheme.textDark,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 4,
              shadowColor: AppTheme.accentAmber.withValues(alpha: 0.4),
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: _loading
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.2, color: AppTheme.textDark))
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _currentStep < 2 ? 'Next' : 'Create Account',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                      ),
                      const SizedBox(width: 6),
                      Icon(_currentStep < 2 ? Icons.arrow_forward_rounded : Icons.check_circle_outline, size: 18),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}