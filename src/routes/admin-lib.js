function layout(title, active, content, opts = {}) {
  const { toast, counts, subtitle, headerActions } = opts;

  const menuGroups = [
    { icon: '&#x1F4CA;', label: 'Dashboard', key: 'dashboard', href: '/admin' },
    { icon: '&#x1F3E6;', label: 'Banking', key: 'banking', children: [
      { icon: '&#x1F3E6;', label: 'Teller Counter', href: '/admin/teller', key: 'teller' },
      { icon: '&#x1F465;', label: 'Accounts', href: '/admin/accounts', key: 'accounts' },
      { icon: '&#x1F4B0;', label: 'Loans', href: '/admin/loans', key: 'loans' },
      { icon: '&#x1F4B8;', label: 'Withdrawals', href: '/admin/withdrawal-requests', key: 'withdrawal-requests' },
      { icon: '&#x1F4B3;', label: 'Transactions', href: '/admin/transactions', key: 'transactions' },
    ]},
    { icon: '&#x1F4E6;', label: 'Products', key: 'products', children: [
      { icon: '&#x1F3ED;', label: 'Loan Products', href: '/admin/loan-products', key: 'loan-products' },
      { icon: '&#x1F4E6;', label: 'Savings Products', href: '/admin/savings-products', key: 'savings-products' },
    ]},
    { icon: '&#x1F4CA;', label: 'Reports & Audit', key: 'reports', children: [
      { icon: '&#x1F4DC;', label: 'Audit Reports', href: '/admin/audit', key: 'audit' },
      { icon: '&#x2696;', label: 'Trial Balance', href: '/admin/gl/trial-balance', key: 'gl' },
      { icon: '&#x1F4C8;', label: 'Balance Sheet', href: '/admin/gl/balance-sheet', key: 'gl' },
      { icon: '&#x1F4C9;', label: 'P&L', href: '/admin/gl/profit-and-loss', key: 'gl' },
      { icon: '&#x1F4CB;', label: 'Ledger', href: '/admin/gl/ledger', key: 'gl' },
      { icon: '&#x1F4DD;', label: 'Audit Log', href: '/admin/audit-log', key: 'audit-log' },
      { icon: '&#x1F465;', label: 'Admin Users', href: '/admin/users', key: 'users' },
    ]},
    { icon: '&#x1F3C6;', label: 'Gamification', key: 'gamification', children: [
      { icon: '&#x1F6D2;', label: 'Shop', href: '/admin/shop', key: 'shop' },
      { icon: '&#x1F4DD;', label: 'Quiz', href: '/admin/quiz', key: 'quiz' },
      { icon: '&#x1F3AF;', label: 'Goals', href: '/admin/goals', key: 'goals' },
      { icon: '&#x1F3C6;', label: 'Badges', href: '/admin/badges', key: 'badges' },
      { icon: '&#x1F4B1;', label: 'Savings Apps', href: '/admin/savings-applications', key: 'savings-applications' },
    ]},
    { icon: '&#x2699;', label: 'Settings', key: 'settings', href: '/admin/settings' },
  ];

  function isActive(key) {
    if (key === active) return true;
    return false;
  }

  function renderGroup(g) {
    if (g.href) {
      const c = isActive(g.key) ? ' class="active"' : '';
      const badge = counts && counts[g.key] !== undefined ? `<span class="badge-count">${counts[g.key]}</span>` : '';
      return `<a href="${g.href}"${c}><span class="icon">${g.icon}</span> <span>${g.label}</span>${badge}</a>`;
    }
    const hasActiveChild = g.children.some(c => isActive(c.key));
    const open = hasActiveChild ? ' open' : '';
    const childHtml = g.children.map(c => {
      const cc = isActive(c.key) ? ' class="active"' : '';
      const badge = counts && counts[c.key] !== undefined ? `<span class="badge-count">${counts[c.key]}</span>` : '';
      return `<a href="${c.href}"${cc}><span class="icon">${c.icon}</span> <span>${c.label}</span>${badge}</a>`;
    }).join('');
    return `<div class="menu-group${open}" data-key="${g.key}">
      <div class="menu-parent" onclick="toggleGroup('${g.key}')">
        <span class="icon">${g.icon}</span>
        <span>${g.label}</span>
        <span class="chevron">&#x25BC;</span>
      </div>
      <div class="sub-menu">${childHtml}</div>
    </div>`;
  }

  const sidebarNav = menuGroups.map(renderGroup).join('');

  const toastHtml = toast ? `<div class="toast ${toast.startsWith('error:') ? 'error' : 'success'}">${toast.startsWith('error:') ? '&#x274C; ' + toast.slice(6) : '&#x2705; ' + toast.slice(8)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — ${title}</title>
<style>
:root {
  --sidebar: #0d2818; --sidebar-hover: #143020; --sidebar-active: #1a5c2a;
  --sidebar-text: #8899aa; --sidebar-text-active: #e8f5e9;
  --bg: #f0f4f8; --card: #fff; --border: #e2e8f0;
  --text: #1e293b; --text-muted: #64748b;
  --accent: #2E7D32; --accent-hover: #1B5E20;
  --green: #22c55e; --blue: #3b82f6; --amber: #f59e0b; --purple: #8b5cf6; --red: #ef4444;
  --radius: 12px; --radius-sm: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-lg: 0 4px 24px rgba(0,0,0,0.08);
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  --transition: 0.2s ease;
}
[data-theme="dark"] {
  --sidebar: #0a0f0d; --sidebar-hover: #112015; --sidebar-active: #1a4a22;
  --sidebar-text: #6b7280; --sidebar-text-active: #d1d5db;
  --bg: #0f1411; --card: #1a231c; --border: #2a3a2e;
  --text: #e2e8f0; --text-muted: #94a3b8;
  --accent: #22c55e; --accent-hover: #16a34a;
  --shadow: 0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.15);
  --shadow-lg: 0 4px 24px rgba(0,0,0,0.3);
}
* { margin:0; padding:0; box-sizing:border-box; }
html { font-size:14px; scroll-behavior:smooth; }
body { font-family:var(--font); background:var(--bg); color:var(--text); display:flex; min-height:100vh; }

.hamburger { display:none; position:fixed; top:12px; left:12px; z-index:60; width:36px; height:36px; border:none; border-radius:8px; background:var(--accent); color:#fff; font-size:18px; cursor:pointer; align-items:center; justify-content:center; box-shadow:var(--shadow); transition:background var(--transition); }
.hamburger:hover { background:var(--accent-hover); }
.hamburger.active { left:252px; }

.sidebar { width:240px; background:var(--sidebar); display:flex; flex-direction:column; position:fixed; top:0; left:0; bottom:0; z-index:50; transition:transform var(--transition), width var(--transition); overflow:hidden; }
.sidebar-brand { padding:16px 14px; border-bottom:1px solid rgba(255,255,255,0.05); flex-shrink:0; }
.sidebar-brand .brand-row { display:flex; align-items:center; gap:10px; }
.sidebar-brand .brand-icon { width:32px; height:32px; background:linear-gradient(135deg,#2E7D32,#1B5E20); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0; line-height:1; }
.sidebar-brand .brand-name { font-size:15px; color:#fff; font-weight:700; letter-spacing:-0.3px; display:block; line-height:1.2; }
.sidebar-brand .brand-sub { font-size:9.5px; color:var(--sidebar-text); text-transform:uppercase; letter-spacing:0.6px; display:block; }
.sidebar-nav { flex:1; padding:8px 8px; overflow-y:auto; overflow-x:hidden; }
.sidebar-nav::-webkit-scrollbar { width:3px; }
.sidebar-nav::-webkit-scrollbar-track { background:transparent; }
.sidebar-nav::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }

.sidebar-nav a { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:var(--radius-sm); color:var(--sidebar-text); text-decoration:none; font-size:13px; font-weight:500; transition:all var(--transition); white-space:nowrap; }
.sidebar-nav a:hover { background:var(--sidebar-hover); color:var(--sidebar-text-active); }
.sidebar-nav a.active { background:var(--sidebar-active); color:#fff; font-weight:600; box-shadow:inset 2px 0 0 var(--accent); }
.sidebar-nav a .icon { font-size:15px; width:20px; text-align:center; flex-shrink:0; }
.sidebar-nav a .badge-count { margin-left:auto; background:rgba(255,255,255,0.1); padding:0 7px; border-radius:10px; font-size:10px; font-weight:600; line-height:18px; }

.menu-group { margin-bottom:1px; }
.menu-parent { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:var(--radius-sm); color:var(--sidebar-text); font-size:13px; font-weight:500; cursor:pointer; transition:all var(--transition); white-space:nowrap; user-select:none; }
.menu-parent:hover { background:var(--sidebar-hover); color:var(--sidebar-text-active); }
.menu-parent .icon { font-size:15px; width:20px; text-align:center; flex-shrink:0; }
.menu-parent .chevron { margin-left:auto; font-size:8px; transition:transform var(--transition); opacity:0.5; }
.menu-group.open .menu-parent .chevron { transform:rotate(180deg); opacity:0.8; }
.menu-group.open .menu-parent { color:var(--sidebar-text-active); }

.sub-menu { max-height:0; overflow:hidden; transition:max-height 0.3s cubic-bezier(0.4,0,0.2,1); padding-left:8px; }
.menu-group.open .sub-menu { max-height:500px; }
.sub-menu a { padding:7px 12px 7px 20px; font-size:12.5px; color:var(--sidebar-text); border-left:1px solid rgba(255,255,255,0.06); margin-left:10px; border-radius:0 var(--radius-sm) var(--radius-sm) 0; position:relative; }
.sub-menu a:hover { color:var(--sidebar-text-active); border-left-color:var(--accent); }
.sub-menu a.active { color:#fff; font-weight:600; border-left-color:var(--accent); background:linear-gradient(90deg,rgba(46,125,50,0.15) 0%,transparent 100%); }
.sub-menu a .icon { font-size:12px; width:16px; }

.sidebar-footer { padding:8px; border-top:1px solid rgba(255,255,255,0.05); flex-shrink:0; }
.sidebar-footer a { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:var(--radius-sm); color:var(--sidebar-text); text-decoration:none; font-size:12px; transition:all var(--transition); white-space:nowrap; }
.sidebar-footer a:hover { background:var(--sidebar-hover); color:var(--sidebar-text-active); }
.sidebar-footer a .icon { font-size:13px; width:20px; text-align:center; flex-shrink:0; }

.main { margin-left:240px; flex:1; padding:24px 28px; max-width:100%; transition:margin-left var(--transition); }
.page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
.page-header h2 { font-size:22px; font-weight:700; letter-spacing:-0.3px; }
.page-header .meta { font-size:12px; color:var(--text-muted); margin-top:2px; }
.header-actions { display:flex; gap:8px; flex-wrap:wrap; }

.toast { position:fixed; top:20px; right:20px; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:500; z-index:999; box-shadow:var(--shadow-lg); animation:slideIn 0.3s ease; max-width:420px; }
.toast.success { background:#e8f5e9; color:#1B5E20; border:1px solid #a5d6a7; }
.toast.error { background:#fce4ec; color:#b71c1c; border:1px solid #ef9a9a; }
@keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }

.btn { display:inline-flex; align-items:center; gap:6px; padding:8px 18px; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; transition:all var(--transition); white-space:nowrap; position:relative; overflow:hidden; }
.btn::after { content:''; position:absolute; inset:0; background:rgba(255,255,255,0.2); transform:scale(0); border-radius:50%; opacity:0; transition:transform 0.5s, opacity 0.3s; }
.btn:active::after { transform:scale(3); opacity:1; transition:0s; }
.btn-primary { background:var(--accent); color:#fff; }
.btn-primary:hover { background:var(--accent-hover); }
.btn-secondary { background:#e8f5e9; color:var(--accent); }
.btn-secondary:hover { background:#c8e6c9; }
.btn-outline { background:transparent; color:var(--text); border:1px solid var(--border); }
.btn-outline:hover { background:var(--bg); }
.btn-danger { background:var(--red); color:#fff; }
.btn-danger:hover { background:#dc2626; }
.btn-amber { background:var(--amber); color:#fff; }
.btn-amber:hover { background:#d97706; }
.btn-xs { padding:4px 10px; font-size:11px; }
.btn-sm { padding:6px 14px; font-size:12px; }

.card { background:var(--card); border-radius:var(--radius); box-shadow:var(--shadow); border:1px solid var(--border); margin-bottom:20px; overflow:hidden; transition:transform var(--transition), box-shadow var(--transition), background var(--transition), border var(--transition); }
.card:hover { transform:translateY(-1px); box-shadow:var(--shadow-lg); }
.card-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px; }
.card-header h3 { font-size:15px; font-weight:600; display:flex; align-items:center; gap:8px; }
.card-header .count { font-size:12px; font-weight:400; color:var(--text-muted); }
.card-body { overflow-x:auto; }
.card-body-padded { padding:18px; }

table { width:100%; border-collapse:collapse; }
th { background:#f8fafc; color:var(--text-muted); padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; white-space:nowrap; border-bottom:1px solid var(--border); }
td { padding:9px 14px; border-bottom:1px solid #f1f5f9; font-size:13px; }
tr:last-child td { border-bottom:none; }
tr { transition:background var(--transition); }
tr:hover td { background:#f0fdf4; }
tr:hover { transform:scale(1.002); }
td.mono { font-family:var(--mono); font-size:12px; }
td.num { text-align:right; font-variant-numeric:tabular-nums; }

.badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600; }
.badge-green { background:#e8f5e9; color:var(--accent); }
.badge-red { background:#fce4ec; color:var(--red); }
.badge-purple { background:#f3e5f5; color:var(--purple); }
.badge-amber { background:#fff8e1; color:#F57F17; }
.badge-blue { background:#e3f2fd; color:var(--blue); }
.badge-gray { background:#f1f5f9; color:var(--text-muted); }

.bar { display:inline-flex; align-items:center; gap:8px; }
.bar-track { background:#e2e8f0; border-radius:4px; width:90px; height:10px; overflow:hidden; display:inline-block; }
.bar-fill { height:100%; border-radius:4px; transition:width 0.4s ease; }
.bar-fill.green { background:var(--accent); }
.bar-fill.blue { background:var(--blue); }
.bar-fill.amber { background:var(--amber); }

.modal-overlay { display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:100; align-items:center; justify-content:center; }
.modal-overlay:target { display:flex; }
.modal { background:var(--card); border-radius:16px; padding:28px; width:100%; max-width:480px; max-height:90vh; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.2); }
.modal h2 { font-size:17px; font-weight:700; margin-bottom:16px; }
.modal label { display:block; font-size:12px; font-weight:600; color:var(--text-muted); margin-top:12px; margin-bottom:3px; }
.modal input, .modal select, .modal textarea { width:100%; padding:9px 12px; border:2px solid var(--border); border-radius:8px; font-size:14px; outline:none; font-family:var(--font); transition:border var(--transition); }
.modal input:focus, .modal select:focus, .modal textarea:focus { border-color:var(--accent); }
.modal .btn { margin-top:14px; }
.modal .close { float:right; color:#999; text-decoration:none; font-size:24px; line-height:1; }
.modal .close:hover { color:var(--text); }
.form-row { display:flex; gap:12px; }
.form-row > div { flex:1; }
form.inline { display:inline; }

.field { display:flex; flex-direction:column; gap:4px; }
.field label { font-size:12px; font-weight:600; color:var(--text-muted); }
.field input, .field select, .field textarea { width:100%; padding:9px 12px; border:2px solid var(--border); border-radius:8px; font-size:14px; outline:none; font-family:var(--font); transition:border var(--transition); }
.field input:focus, .field select:focus, .field textarea:focus { border-color:var(--accent); }

.stats-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:14px; margin-bottom:24px; }
.stat-card { background:var(--card); border-radius:var(--radius); padding:16px 18px; box-shadow:var(--shadow); border:1px solid var(--border); transition:transform var(--transition), box-shadow var(--transition); cursor:default; }
.stat-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-lg); }
.stat-card .stat-icon { font-size:20px; margin-bottom:6px; }
.stat-card .stat-value { font-size:24px; font-weight:700; letter-spacing:-0.5px; }
.stat-card .stat-label { font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-top:2px; }
.stat-card .stat-sub { font-size:11px; color:var(--text-muted); margin-top:4px; }
.stat-card .stat-bar { margin-top:8px; height:3px; background:#e2e8f0; border-radius:2px; overflow:hidden; }
.stat-card .stat-bar-fill { height:100%; border-radius:2px; transition:width 0.6s ease; }

@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
.stat-card { animation:fadeUp 0.4s ease both; }
.stat-card:nth-child(1){animation-delay:0.02s}.stat-card:nth-child(2){animation-delay:0.06s}
.stat-card:nth-child(3){animation-delay:0.10s}.stat-card:nth-child(4){animation-delay:0.14s}
.stat-card:nth-child(5){animation-delay:0.18s}.stat-card:nth-child(6){animation-delay:0.22s}

@media(max-width:768px) {
  .hamburger { display:flex; }
  .sidebar { transform:translateX(-100%); width:260px; }
  .sidebar.open { transform:translateX(0); }
  .sidebar.open ~ .main { margin-left:0; }
  .sidebar-brand .brand-sub { display:block; }
  .sidebar-brand .brand-name { display:block; }
  .sidebar-nav a span, .sidebar-footer a span { display:inline; }
  .menu-parent span:not(.icon) { display:inline; }
  .menu-parent .chevron { display:inline; }
  .sub-menu { max-height:0 !important; display:none; }
  .menu-group.open .sub-menu { display:block; }
  .sidebar-nav a, .menu-parent { justify-content:flex-start; padding:9px 12px; }
  .sidebar-nav a .badge-count, .menu-parent .badge-count { display:inline; }
  .sidebar-footer a { justify-content:flex-start; padding:8px 12px; }
  .main { margin-left:0; padding:16px; padding-top:60px; }
  .stats-grid { grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }
  .page-header { flex-direction:column; align-items:flex-start; }
  .header-actions { width:100%; }
}
</style>
<link rel="stylesheet" href="https://cdn.datatables.net/2.2.2/css/dataTables.dataTables.css">
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.datatables.net/2.2.2/js/dataTables.js"></script>
</head>
<body>

<button class="hamburger" id="hamburger" onclick="toggleSidebar()">&#x2630;</button>

<div class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <div class="brand-row">
      <span class="brand-icon">&#x1F3E6;</span>
      <div>
        <span class="brand-name">LabCoop</span>
        <span class="brand-sub">Admin Dashboard</span>
      </div>
    </div>
  </div>
  <div class="sidebar-nav">
    ${sidebarNav}
  </div>
  <div class="sidebar-footer">
    <a href="#" onclick="toggleTheme(event)"><span class="icon">&#x1F319;</span> <span>Dark Mode</span></a>
    <a href="/admin/logout"><span class="icon">&#x1F6AA;</span> <span>Sign Out</span></a>
  </div>
</div>

<div class="main">
  <div class="page-header">
    <div>
      <h2>${opts.headerTitle || title}</h2>
      ${subtitle ? `<div class="meta">${subtitle}</div>` : ''}
    </div>
    <div class="header-actions">${headerActions || ''}</div>
  </div>

  ${toastHtml}

  ${content}
</div>

<script>
(function(){
  var t = document.querySelector('.toast');
  if(t) setTimeout(function(){t.style.opacity='0';t.style.transition='opacity 0.5s';setTimeout(function(){t.remove()},500)},4000);

  document.querySelectorAll('.sidebar-nav a').forEach(function(a){
    if(a.href===location.href||a.href===location.href.split('?')[0])a.classList.add('active');
  });

  var saved = localStorage.getItem('labcoop-theme');
  if(saved === 'dark') document.documentElement.setAttribute('data-theme','dark');

  document.querySelectorAll('.menu-group').forEach(function(g){
    var key = g.getAttribute('data-key');
    var stored = localStorage.getItem('sidebar-group-' + key);
    if(stored === 'open') g.classList.add('open');
  });

  var sidebar = document.getElementById('sidebar');
  var hamburger = document.getElementById('hamburger');
  function handleResize(){
    if(window.innerWidth > 768){ sidebar.classList.remove('open'); hamburger.classList.remove('active'); }
  }
  window.addEventListener('resize', handleResize);
  document.addEventListener('click', function(e){
    if(window.innerWidth <= 768 && !sidebar.contains(e.target) && e.target !== hamburger){
      sidebar.classList.remove('open'); hamburger.classList.remove('active');
    }
  });
})();
function toggleGroup(key){
  var g = document.querySelector('.menu-group[data-key="'+key+'"]');
  if(!g) return;
  g.classList.toggle('open');
  localStorage.setItem('sidebar-group-'+key, g.classList.contains('open') ? 'open' : '');
}
function toggleSidebar(){
  var s = document.getElementById('sidebar'); var h = document.getElementById('hamburger');
  s.classList.toggle('open'); h.classList.toggle('active');
}
function toggleTheme(e){
  e.preventDefault();
  var html = document.documentElement;
  var isDark = html.getAttribute('data-theme') === 'dark';
  if(isDark){ html.removeAttribute('data-theme'); localStorage.setItem('labcoop-theme','light'); }
  else{ html.setAttribute('data-theme','dark'); localStorage.setItem('labcoop-theme','dark'); }
}
</script>
<script>
$(document).ready(function(){
  $('.card-body table').each(function(){
    var $th = $(this).find('thead th').length;
    var $td = $(this).find('tbody tr:first td').length;
    if($th > 0 && $th === $td){
      if(!this.id) this.id = 'dt-' + Math.random().toString(36).slice(2, 9);
      try{ $('#'+this.id).DataTable({pageLength:25,order:[]}); }catch(e){}
    }
  });
});
</script>
</body>
</html>`;
}

module.exports = { layout };
