import 'package:flutter/material.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../data/datasources/local_db_source.dart';

class TownPage extends StatefulWidget {
  const TownPage({super.key});

  @override
  State<TownPage> createState() => _TownPageState();
}

class _TownPageState extends State<TownPage> {
  final _source = LocalDbSource();
  List<Map<String, dynamic>> _buildings = [];
  int _coins = 0;
  bool _loading = true;

  static const int gridCols = 5;
  static const int gridRows = 5;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final buildings = await _source.getTownBuildings();
    final coins = await _source.getCoins();
    if (!mounted) return;
    setState(() {
      _buildings = buildings;
      _coins = coins;
      _loading = false;
    });
  }

  Map<String, dynamic>? _buildingAt(int x, int y) {
    for (final b in _buildings) {
      if (b['isUnlocked'] == true && b['isPlaced'] == true &&
          b['gridX'] == x && b['gridY'] == y) {
        return b;
      }
    }
    return null;
  }

  List<Map<String, dynamic>> get _unplacedBuildings =>
      _buildings.where((b) => b['isUnlocked'] == true && b['isPlaced'] != true).toList();

  Future<void> _placeBuilding(Map<String, dynamic> building, int x, int y) async {
    final idx = _buildings.indexWhere((b) => b['id'] == building['id']);
    if (idx < 0) return;
    _buildings[idx] = {
      ..._buildings[idx],
      'isPlaced': true,
      'gridX': x,
      'gridY': y,
    };
    await _source.saveTownBuildings(_buildings);
    setState(() {});
  }

  Future<void> _removeBuilding(Map<String, dynamic> building) async {
    final idx = _buildings.indexWhere((b) => b['id'] == building['id']);
    if (idx < 0) return;
    _buildings[idx] = {
      ..._buildings[idx],
      'isPlaced': false,
    };
    await _source.saveTownBuildings(_buildings);
    setState(() {});
  }

  Future<void> _moveBuilding(Map<String, dynamic> building, int toX, int toY) async {
    final idx = _buildings.indexWhere((b) => b['id'] == building['id']);
    if (idx < 0) return;
    _buildings[idx] = {
      ..._buildings[idx],
      'gridX': toX,
      'gridY': toY,
    };
    await _source.saveTownBuildings(_buildings);
    setState(() {});
  }

  void _showPlacePicker(int x, int y) {
    final available = _unplacedBuildings;
    if (available.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No buildings in inventory! Buy one from the shop first.')),
      );
      return;
    }
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Place a Building',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('${available.length} building(s) in inventory',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            const SizedBox(height: 16),
            ...available.map((b) => ListTile(
                  leading: Text(b['emoji'] as String, style: const TextStyle(fontSize: 32)),
                  title: Text(b['name'] as String, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(b['desc'] as String, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  onTap: () {
                    Navigator.pop(ctx);
                    _placeBuilding(b, x, y);
                  },
                )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showBuildingActions(Map<String, dynamic> building) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${building['emoji']} ${building['name']}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(building['desc'] as String,
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  _removeBuilding(building);
                },
                icon: const Icon(Icons.delete_outline, color: Colors.white),
                label: const Text('Remove from Town',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red.shade400,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<void> _buyBuilding(Map<String, dynamic> template) async {
    final id = template['id'] as String;
    final cost = template['cost'] as int;

    final existingIndex = _buildings.indexWhere((b) => b['id'] == id);
    if (existingIndex >= 0 && (_buildings[existingIndex]['isUnlocked'] as bool? ?? false)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('You already own this building!')),
      );
      return;
    }

    if (_coins < cost) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Need $cost coins! You have $_coins')),
      );
      return;
    }

    final success = await _source.spendCoins(cost);
    if (!success) return;

    final building = {
      'id': id,
      'name': template['name'] as String,
      'emoji': template['emoji'] as String,
      'cost': cost,
      'bonus': template['bonus'] as String,
      'value': template['value'] as num,
      'desc': template['desc'] as String,
      'isUnlocked': true,
      'isPlaced': false,
    };

    if (existingIndex >= 0) {
      _buildings[existingIndex] = building;
    } else {
      _buildings.add(building);
    }

    await _source.saveTownBuildings(_buildings);
    setState(() {
      _coins -= cost;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(children: [
            Text('${template['emoji'] as String} '),
            Text('${template['name'] as String} built!'),
          ]),
          backgroundColor: AppTheme.primaryGreen,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final unlockedCount = _buildings.where((b) => b['isUnlocked'] == true).length;
    final ownedIds = _buildings.where((b) => b['isUnlocked'] == true).map((b) => b['id'] as String).toSet();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dream Town'),
        backgroundColor: AppTheme.primaryGreen,
        foregroundColor: Colors.white,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Row(
              children: [
                const Icon(Icons.monetization_on, color: AppTheme.coinGold, size: 20),
                const SizedBox(width: 4),
                Text('$_coins', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              ],
            ),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFE3F2FD), Color(0xFFF1F8E9)],
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildTownMap(),
              const SizedBox(height: 16),
              _buildInventory(),
              const SizedBox(height: 20),
              _buildActiveBonuses(),
              const SizedBox(height: 20),
              Text(
                'Building Shop ($unlockedCount/${AppConstants.townBuildings.length} built)',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textDark),
              ),
              const SizedBox(height: 8),
              ...AppConstants.townBuildings.map((b) => _buildingCard(b, ownedIds.contains(b['id'] as String))),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTownMap() {
    final placedCount = _buildings.where((b) => b['isPlaced'] == true).length;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.green.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.map, color: AppTheme.primaryGreen, size: 20),
              const SizedBox(width: 8),
              const Text('Your Dream Town', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textDark)),
              const Spacer(),
              Text('$placedCount/$gridRows plottaken',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ],
          ),
          const SizedBox(height: 16),
          AspectRatio(
            aspectRatio: 1,
            child: GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: gridCols,
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
              ),
              itemCount: gridCols * gridRows,
              itemBuilder: (context, index) {
                final x = index % gridCols;
                final y = index ~/ gridCols;
                final building = _buildingAt(x, y);
                return _buildPlot(x, y, building);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlot(int x, int y, Map<String, dynamic>? building) {
    if (building != null) {
      return LongPressDraggable<Map<String, dynamic>>(
        data: building,
        feedback: Material(
          elevation: 6,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 8)],
            ),
            child: Center(
              child: Text(building['emoji'] as String, style: const TextStyle(fontSize: 28)),
            ),
          ),
        ),
        childWhenDragging: Container(
          decoration: BoxDecoration(
            color: Colors.green.shade100,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.green.shade300, width: 2),
          ),
          child: Center(
            child: Icon(Icons.add, color: Colors.green.shade400, size: 20),
          ),
        ),
        onDragEnd: (_) {},
        child: DragTarget<Map<String, dynamic>>(
          onWillAcceptWithDetails: (_) => false,
          onAcceptWithDetails: (details) {
            _moveBuilding(details.data, x, y);
          },
          builder: (context, candidateData, rejectedData) {
            return GestureDetector(
              onTap: () => _showBuildingActions(building),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.green.shade200),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 3)],
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(building['emoji'] as String, style: const TextStyle(fontSize: 22)),
                    const SizedBox(height: 2),
                    Text(building['name'] as String,
                        style: const TextStyle(fontSize: 7, fontWeight: FontWeight.bold, color: AppTheme.textDark),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
            );
          },
        ),
      );
    }

    return DragTarget<Map<String, dynamic>>(
      onWillAcceptWithDetails: (_) => true,
      onAcceptWithDetails: (details) {
        _moveBuilding(details.data, x, y);
      },
      builder: (context, candidateData, rejectedData) {
        final isHovering = candidateData.isNotEmpty;
        return GestureDetector(
          onTap: () => _showPlacePicker(x, y),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            decoration: BoxDecoration(
              color: isHovering ? Colors.green.shade100 : Colors.green.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isHovering ? Colors.green.shade400 : Colors.green.shade200,
                width: isHovering ? 2 : 1,
                style: isHovering ? BorderStyle.solid : BorderStyle.solid,
              ),
            ),
            child: Center(
              child: Icon(
                isHovering ? Icons.add_circle : Icons.add_circle_outline,
                color: isHovering ? AppTheme.primaryGreen : Colors.green.shade300,
                size: 24,
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildInventory() {
    final items = _unplacedBuildings;
    if (items.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.amber.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.inventory_2, color: Colors.amber.shade700, size: 18),
              const SizedBox(width: 6),
              Text('Inventory (${items.length} ready to place)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.amber.shade800)),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: items.map((b) => Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.amber.shade200),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(b['emoji'] as String, style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: 4),
                  Text(b['name'] as String, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
            )).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveBonuses() {
    final bonuses = _buildings.where((b) => b['isUnlocked'] == true).toList();
    if (bonuses.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, color: AppTheme.accentAmber, size: 20),
              const SizedBox(width: 8),
              const Text('Active Bonuses', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textDark)),
            ],
          ),
          const SizedBox(height: 12),
          ...bonuses.map((b) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Text(b['emoji'] as String, style: const TextStyle(fontSize: 20)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(b['desc'] as String, style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryGreen.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text('ACTIVE', style: TextStyle(color: AppTheme.primaryGreen, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  Widget _buildingCard(Map<String, dynamic> building, bool owned) {
    final emoji = building['emoji'] as String;
    final name = building['name'] as String;
    final cost = building['cost'] as int;
    final desc = building['desc'] as String;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: owned ? Border.all(color: AppTheme.primaryGreen.withValues(alpha: 0.3), width: 1.5) : null,
          color: owned ? AppTheme.primaryGreen.withValues(alpha: 0.03) : null,
        ),
        child: ListTile(
          leading: Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: owned ? AppTheme.primaryGreen.withValues(alpha: 0.1) : Colors.grey.shade100,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(child: Text(emoji, style: const TextStyle(fontSize: 28))),
          ),
          title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
          subtitle: Text(desc, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          trailing: owned
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryGreen.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.check_circle, color: AppTheme.primaryGreen, size: 16),
                      SizedBox(width: 4),
                      Text('Owned', style: TextStyle(color: AppTheme.primaryGreen, fontWeight: FontWeight.bold, fontSize: 12)),
                    ],
                  ),
                )
              : ElevatedButton(
                  onPressed: () => _buyBuilding(building),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _coins >= cost ? AppTheme.accentAmber : Colors.grey.shade300,
                    foregroundColor: _coins >= cost ? AppTheme.textDark : Colors.grey.shade600,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text('$cost 🪙', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                ),
        ),
      ),
    );
  }
}
