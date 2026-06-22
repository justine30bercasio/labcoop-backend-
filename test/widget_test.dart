import 'package:flutter_test/flutter_test.dart';

import 'package:labcoop/main.dart';

void main() {
  testWidgets('App starts with splash page', (WidgetTester tester) async {
    await tester.pumpWidget(const LabCoopApp());
    expect(find.text('LabCoop'), findsOneWidget);
    expect(find.text('Save smarter. Play harder.'), findsOneWidget);
    // advance past the splash timer to avoid pending timer error
    await tester.pump(const Duration(seconds: 4));
    await tester.pump();
    expect(find.text('Get Started'), findsOneWidget);
  });
}
