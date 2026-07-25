import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'dart:io';

import 'package:labcoop/main.dart';

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final dir = await Directory.systemTemp.createTemp('hive_test_');
    Hive.init(dir.path);
    await Hive.openBox('app_settings');
  });

  tearDownAll(() async {
    await Hive.box('app_settings').close();
    Hive.deleteFromDisk();
  });

  testWidgets('App renders splash page without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(const LabCoopApp());
    expect(find.text('LabCoop'), findsOneWidget);
    expect(find.text('Save smarter. Play harder.'), findsOneWidget);
    // advance past animation timers to avoid pending timer errors
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
    // app should still be alive after splash timer fires
    expect(tester.takeException(), isNull);
  });
}
