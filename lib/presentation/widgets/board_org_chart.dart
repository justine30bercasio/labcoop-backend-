import 'package:flutter/material.dart';
import '../../core/constants/app_constants.dart';

class BoardOrgChart extends StatelessWidget {
  final List<Map<String, dynamic>> members;

  const BoardOrgChart({super.key, required this.members});

  @override
  Widget build(BuildContext context) {
    if (members.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.people_outline, size: 64, color: Colors.grey[300]),
            const SizedBox(height: 16),
            Text('No board members yet.',
                style: TextStyle(color: Colors.grey[500], fontSize: 16)),
          ],
        ),
      );
    }

    final sorted = List<Map<String, dynamic>>.from(members)
      ..sort((a, b) => ((a['sort_order'] as num?)?.toInt() ?? 0)
          .compareTo((b['sort_order'] as num?)?.toInt() ?? 0));

    final featured = sorted.isNotEmpty ? sorted.first : null;
    final rest =
        sorted.length > 1 ? sorted.skip(1).toList() : <Map<String, dynamic>>[];

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.of(context).size.width;
        final heroWidth = width > 820 ? 760.0 : width - 32;
        final tileMaxWidth = width > 900
            ? (width - 80) / 4
            : width > 700
                ? (width - 64) / 3
                : width > 520
                    ? (width - 48) / 2
                    : width - 32;

        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF1E3A8A), Color(0xFF2563EB)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.blue.withValues(alpha: 0.18),
                      blurRadius: 22,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(20),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Governance at a glance',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.4,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Meet the leaders guiding the cooperative with vision, accountability, and service.',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.16),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Text(
                              'Trusted leadership • Transparent governance',
                              style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(Icons.groups_2_rounded,
                          color: Colors.white, size: 28),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'Leadership Team',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1E293B)),
              ),
              const SizedBox(height: 12),
              if (featured != null)
                Center(
                  child: SizedBox(
                    width: width > 700 ? 600 : width - 32,
                    child: _buildFeaturedCard(context, featured, heroWidth),
                  ),
                ),
              if (rest.isNotEmpty) ...[
                const SizedBox(height: 22),
                Center(
                  child: Container(
                    width: 2,
                    height: 18,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Center(
                  child: Container(
                    width: 100,
                    height: 2,
                    color: Colors.grey.shade300,
                  ),
                ),
                const SizedBox(height: 18),
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  alignment: WrapAlignment.center,
                  children: rest
                      .map(
                        (member) => SizedBox(
                          width: tileMaxWidth.clamp(240.0, 280.0),
                          child: _buildMemberCard(context, member),
                        ),
                      )
                      .toList(),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildFeaturedCard(
      BuildContext context, Map<String, dynamic> member, double width) {
    final name = member['name'] as String? ?? '';
    final position = member['position'] as String? ?? '';
    final imageUrl = _resolveImageUrl(member['image_url'] as String?);
    final accent = _accentForRole(position);

    return InkWell(
      borderRadius: BorderRadius.circular(28),
      onTap: () => _showMemberDetails(context, member),
      child: Container(
        width: width,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
                color: Colors.black12, blurRadius: 20, offset: Offset(0, 12))
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                position.isNotEmpty ? position.toUpperCase() : 'CHAIRPERSON',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8),
              ),
            ),
            const SizedBox(height: 18),
            _buildAvatar(96, imageUrl, name, accent),
            const SizedBox(height: 18),
            Text(
              name,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF0F172A)),
            ),
            const SizedBox(height: 8),
            Text(
              position,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: accent),
            ),
            const SizedBox(height: 14),
            const Text(
              'Providing strategic direction, governance oversight, and community leadership.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFF475569),
                  height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMemberCard(BuildContext context, Map<String, dynamic> member) {
    final name = member['name'] as String? ?? '';
    final position = member['position'] as String? ?? '';
    final imageUrl = _resolveImageUrl(member['image_url'] as String?);
    final accent = _accentForRole(position);

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () => _showMemberDetails(context, member),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.grey.shade200),
          boxShadow: const [
            BoxShadow(
                color: Colors.black12, blurRadius: 10, offset: Offset(0, 6))
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _buildAvatar(64, imageUrl, name, accent),
            const SizedBox(height: 12),
            Text(
              name,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1E293B)),
            ),
            const SizedBox(height: 8),
            Text(
              position,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: accent),
            ),
            const SizedBox(height: 14),
            Container(
              height: 4,
              width: 56,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(
      double size, String? imageUrl, String name, Color accent) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: accent.withValues(alpha: 0.12),
        border: Border.all(color: accent.withValues(alpha: 0.25), width: 2),
      ),
      child: imageUrl != null && imageUrl.isNotEmpty
          ? ClipOval(
              child: Image.network(
                imageUrl,
                fit: BoxFit.cover,
                loadingBuilder: (context, child, loadingProgress) {
                  if (loadingProgress == null) return child;
                  return Center(
                    child: CircularProgressIndicator(
                      value: loadingProgress.expectedTotalBytes != null
                          ? loadingProgress.cumulativeBytesLoaded /
                              (loadingProgress.expectedTotalBytes ?? 1)
                          : null,
                      strokeWidth: 2.2,
                    ),
                  );
                },
                errorBuilder: (_, __, ___) =>
                    _initialsAvatar(size, name, accent),
              ),
            )
          : _initialsAvatar(size, name, accent),
    );
  }

  String? _resolveImageUrl(String? imageUrl) {
    if (imageUrl == null || imageUrl.trim().isEmpty) {
      return null;
    }
    final trimmed = imageUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      return '${AppConstants.baseUrl}$trimmed';
    }
    return '${AppConstants.baseUrl}/$trimmed';
  }

  void _showMemberDetails(BuildContext context, Map<String, dynamic> member) {
    final name = member['name'] as String? ?? 'Unknown';
    final position = member['position'] as String? ?? 'Board Member';
    final imageUrl = _resolveImageUrl(member['image_url'] as String?);

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 48,
                  height: 6,
                  decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(999)),
                ),
                const SizedBox(height: 18),
                imageUrl != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(18),
                        child: Image.network(
                          imageUrl,
                          height: 180,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                        ),
                      )
                    : CircleAvatar(
                        radius: 48,
                        backgroundColor: Colors.grey.shade200,
                        child: Text(
                          name.isNotEmpty ? name[0].toUpperCase() : '?',
                          style: const TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w700,
                              color: Colors.black87),
                        ),
                      ),
                const SizedBox(height: 18),
                Text(
                  name,
                  style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF0F172A)),
                ),
                const SizedBox(height: 6),
                Text(
                  position,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF2563EB)),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Tap the card to view more details about this director and their role in the cooperative.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 13, color: Color(0xFF475569), height: 1.5),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _initialsAvatar(double size, String name, Color accent) {
    final parts = name.trim().split(RegExp(r'\s+'));
    final initials = parts.length >= 2
        ? '${parts[0][0]}${parts.last[0]}'.toUpperCase()
        : parts[0][0].toUpperCase();

    return Center(
      child: Text(initials,
          style: TextStyle(
              fontSize: size * 0.36,
              fontWeight: FontWeight.w700,
              color: accent)),
    );
  }

  Color _accentForRole(String position) {
    final lowered = position.toLowerCase();
    if (lowered.contains('chair') ||
        lowered.contains('president') ||
        lowered.contains('chairman')) {
      return const Color(0xFF7C3AED);
    }
    if (lowered.contains('treasurer') || lowered.contains('secretary')) {
      return const Color(0xFF0F766E);
    }
    if (lowered.contains('manager') || lowered.contains('director')) {
      return const Color(0xFF2563EB);
    }
    return const Color(0xFF1D4ED8);
  }
}
