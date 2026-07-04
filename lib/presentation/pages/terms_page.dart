import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class TermsPage extends StatelessWidget {
  const TermsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F0E8),
      appBar: AppBar(
        title: const Text('Terms & Conditions', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF2E7D32),
        iconTheme: const IconThemeData(color: Colors.white),
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          _SectionCard(
            icon: Icons.emoji_events,
            title: 'Welcome to LabCoop!',
            content: 'LabCoop is a fun savings app for kids. You can save money, set goals, earn rewards, '
                'and learn about money — all in a safe and supervised environment. '
                'Please read these rules carefully with your parent or guardian.',
          ),
          _SectionCard(
            icon: Icons.child_care,
            title: '1. Who Can Use LabCoop',
            children: [
              'LabCoop is for children and teenagers under 18 years old.',
              'A parent or legal guardian must open and manage the account.',
              'You may only have ONE account.',
              'You promise to use your real name and information.',
            ],
          ),
          _SectionCard(
            icon: Icons.family_restroom,
            title: '2. Parent & Guardian Responsibilities',
            children: [
              'Parents/guardians are responsible for all activities on their child\'s account.',
              'Parents/guardians must supervise their child\'s use of the app.',
              'Parents/guardians must approve all withdrawals and financial decisions.',
              'Parents/guardians can request account deletion at any time.',
              'LabCoop will communicate with parents/guardians regarding account changes.',
            ],
          ),
          _SectionCard(
            icon: Icons.savings,
            title: '3. Savings & Money Rules',
            children: [
              'All savings are held in a cooperative passbook account managed by the cooperative.',
              'Deposits are recorded in your account and earn interest at the posted rate.',
              'The cooperative may change interest rates at any time with notice.',
              'Withdrawals require parent/guardian approval.',
              'The cooperative reserves the right to hold or reverse transactions if errors are found.',
              'LabCoop is not a bank. Accounts are not insured by PDIC or any government deposit insurance.',
              'The cooperative maintains the right to set minimum balance requirements.',
            ],
          ),
          _SectionCard(
            icon: Icons.stars,
            title: '4. Goals, Rewards & In-App Items',
            children: [
              'You can set savings goals and earn badges and rewards for reaching them.',
              'Rewards (coins, items, badges) are virtual and have no real-world value.',
              'Virtual items like pets, buildings, and avatar accessories cannot be exchanged for real money.',
              'The cooperative may modify or remove rewards at any time.',
              'Leaderboard rankings are based on savings activity and quizzes.',
            ],
          ),
          _SectionCard(
            icon: Icons.quiz,
            title: '5. Financial Literacy Quiz',
            children: [
              'Quizzes are for educational purposes only.',
              'Quiz scores do not affect your actual savings or account balance.',
              'High scores and streaks may earn in-game rewards.',
              'Quiz questions may be updated periodically.',
            ],
          ),
          _SectionCard(
            icon: Icons.pets,
            title: '6. Virtual Pet & Town',
            children: [
              'Your virtual pet evolves based on your savings activity and engagement.',
              'Town buildings are purely decorative and for fun.',
              'Bonuses from buildings are virtual and apply only within the app.',
              'Your pet and town progress may be reset if the account is inactive for 12 months.',
            ],
          ),
          _SectionCard(
            icon: Icons.security,
            title: '7. Account Safety Rules',
            children: [
              'Keep your password secret — even from friends!',
              'Never share personal information like your address or phone number in the app.',
              'Tell your parent/guardian if you see something strange in the app.',
              'The cooperative will never ask for your password.',
              'You are responsible for all activity on your account.',
              'If you think someone else knows your password, tell your parent right away.',
            ],
          ),
          _SectionCard(
            icon: Icons.privacy_tip,
            title: '8. Privacy & Data Protection',
            children: [
              'We collect only the information needed to operate the app (name, age, savings data).',
              'We do not sell your personal information to anyone.',
              'Your data is stored securely and only shared with the cooperative for account management.',
              'Photos (selfies) uploaded for identity verification are stored securely and used only for KYC purposes.',
              'You and your parent/guardian can request to see, update, or delete your data at any time.',
              'We use industry-standard encryption to protect your information.',
              'For full details, please see our separate Privacy Policy.',
            ],
          ),
          _SectionCard(
            icon: Icons.gavel,
            title: '9. Acceptable Use',
            children: [
              'Use LabCoop only for its intended purpose — learning and saving!',
              'Do not try to hack, exploit bugs, or cheat the system.',
              'Do not use offensive language or bully others through the app.',
              'Do not create fake accounts or impersonate others.',
              'Violation of these rules may result in account suspension.',
            ],
          ),
          _SectionCard(
            icon: Icons.block,
            title: '10. Account Suspension & Termination',
            children: [
              'The cooperative may suspend or terminate your account if you violate these terms.',
              'The cooperative may close inactive accounts after 12 months of no activity.',
              'Upon termination, you may request withdrawal of any remaining real funds.',
              'Virtual items, badges, and progress are forfeited upon termination.',
              'The cooperative reserves the right to refuse service to anyone.',
            ],
          ),
          _SectionCard(
            icon: Icons.change_circle,
            title: '11. Changes to These Terms',
            children: [
              'We may update these terms from time to time.',
              'We will notify you and your parent/guardian of any important changes.',
              'Continued use after changes means you accept the new terms.',
              'If you do not agree with the changes, you may stop using the app and request account closure.',
            ],
          ),
          _SectionCard(
            icon: Icons.public,
            title: '12. Governing Law',
            content: 'These terms are governed by the laws of the Republic of the Philippines. '
                'Any disputes shall be resolved through amicable negotiation first, '
                'and if unresolved, through the appropriate courts of the Philippines.',
          ),
          _SectionCard(
            icon: Icons.contact_support,
            title: '13. Contact Us',
            content: 'If you have questions about these terms, please contact your cooperative '
                'officer or send a message through the app\'s support feature.',
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              'Last updated: July 2026',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? content;
  final List<String>? children;

  const _SectionCard({
    required this.icon,
    required this.title,
    this.content,
    this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.primaryGreen.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 20, color: AppTheme.primaryGreen),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF3E2723)),
                ),
              ),
            ],
          ),
          if (content != null) ...[
            const SizedBox(height: 12),
            Text(
              content!,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700, height: 1.5),
            ),
          ],
          if (children != null) ...[
            const SizedBox(height: 10),
            ...children!.map((c) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Icon(Icons.check, size: 14, color: AppTheme.primaryGreen),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      c,
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade700, height: 1.4),
                    ),
                  ),
                ],
              ),
            )),
          ],
        ],
      ),
    );
  }
}
