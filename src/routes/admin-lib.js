function layout(title, active, content, opts = {}) {
  const { toast, counts, subtitle, headerActions } = opts;
  const navItems = [
    { href: '/admin', icon: '&#x1F4CA;', label: 'Dashboard', key: 'dashboard' },
    { href: '/admin/accounts', icon: '&#x1F465;', label: 'Accounts', key: 'accounts' },
    { href: '/admin/goals', icon: '&#x1F3AF;', label: 'Goals', key: 'goals' },
    { href: '/admin/badges', icon: '&#x1F3C6;', label: 'Badges', key: 'badges' },
    { href: '/admin/transactions', icon: '&#x1F4B3;', label: 'Transactions', key: 'transactions' },
    { href: '/admin/shop', icon: '&#x1F6D2;', label: 'Shop', key: 'shop' },
    { href: '/admin/settings', icon: '&#x2699;', label: 'Settings', key: 'settings' },
  ];

  const navHtml = navItems.map(n => `
    <a href="${n.href}"${n.key === active ? ' class="active"' : ''}><span class="icon">${n.icon}</span> <span>${n.label}</span>${counts && counts[n.key] !== undefined ? `<span class="badge-count">${counts[n.key]}</span>` : ''}</a>
  `).join('');

  const toastHtml = toast ? `<div class="toast ${toast.startsWith('error:') ? 'error' : 'success'}">${toast.startsWith('error:') ? '&#x274C; ' + toast.slice(6) : '&#x2705; ' + toast.slice(8)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — ${title}</title>
<style>
:root {
  --sidebar: #0d2818; --sidebar-hover: #1a3d2a; --sidebar-active: #2E7D32;
  --sidebar-text: #94a3b8; --sidebar-text-active: #fff;
  --bg: #f0f4f8; --card: #fff; --border: #e2e8f0;
  --text: #1e293b; --text-muted: #64748b;
  --accent: #2E7D32; --accent-hover: #1B5E20;
  --green: #22c55e; --blue: #3b82f6; --amber: #f59e0b; --purple: #8b5cf6; --red: #ef4444;
  --radius: 12px; --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-lg: 0 4px 24px rgba(0,0,0,0.08);
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  --transition: 0.2s ease;
}
[data-theme="dark"] {
  --sidebar: #0a0f0d; --sidebar-hover: #1a2e1e; --sidebar-active: #1B5E20;
  --sidebar-text: #6b7280; --sidebar-text-active: #d1d5db;
  --bg: #0f1411; --card: #1a231c; --border: #2a3a2e;
  --text: #e2e8f0; --text-muted: #94a3b8;
  --accent: #22c55e; --accent-hover: #16a34a;
  --shadow: 0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.15);
  --shadow-lg: 0 4px 24px rgba(0,0,0,0.3);
}
* { margin:0; padding:0; box-sizing:border-box; }
html { font-size:14px; }
body { font-family:var(--font); background:var(--bg); color:var(--text); display:flex; min-height:100vh; }

.sidebar { width:240px; background:var(--sidebar); display:flex; flex-direction:column; position:fixed; top:0; left:0; bottom:0; z-index:50; transition:width var(--transition); }
.sidebar-brand { padding:20px 20px 16px; border-bottom:1px solid rgba(255,255,255,0.06); }
.sidebar-brand h1 { font-size:18px; color:#fff; font-weight:700; letter-spacing:-0.3px; }
.sidebar-brand span { font-size:11px; color:var(--sidebar-text); display:block; margin-top:2px; }
.sidebar-nav { flex:1; padding:12px 10px; display:flex; flex-direction:column; gap:2px; overflow-y:auto; }
.sidebar-nav a { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; color:var(--sidebar-text); text-decoration:none; font-size:13px; font-weight:500; transition:all var(--transition); }
.sidebar-nav a:hover { background:var(--sidebar-hover); color:#fff; }
.sidebar-nav a.active { background:var(--sidebar-active); color:#fff; font-weight:600; }
.sidebar-nav a .icon { font-size:16px; width:20px; text-align:center; }
.sidebar-nav a .badge-count { margin-left:auto; background:rgba(255,255,255,0.1); padding:1px 8px; border-radius:10px; font-size:11px; }
.sidebar-footer { padding:12px 10px; border-top:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; gap:2px; }
.sidebar-footer a { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; color:var(--sidebar-text); text-decoration:none; font-size:13px; transition:all var(--transition); }
.sidebar-footer a:hover { background:var(--sidebar-hover); color:#fff; }

.main { margin-left:240px; flex:1; padding:24px 28px; max-width:100%; transition:margin-left var(--transition); }
.page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
.page-header h2 { font-size:22px; font-weight:700; letter-spacing:-0.3px; }
.page-header .meta { font-size:12px; color:var(--text-muted); margin-top:2px; }
.header-actions { display:flex; gap:8px; flex-wrap:wrap; }

.toast { position:fixed; top:20px; right:20px; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:500; z-index:999; box-shadow:var(--shadow-lg); animation:slideIn 0.3s ease; max-width:420px; }
.toast.success { background:#e8f5e9; color:#1B5E20; border:1px solid #a5d6a7; }
.toast.error { background:#fce4ec; color:#b71c1c; border:1px solid #ef9a9a; }
@keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }

.btn { display:inline-flex; align-items:center; gap:6px; padding:8px 18px; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; transition:all var(--transition); white-space:nowrap; }
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

.card { background:var(--card); border-radius:var(--radius); box-shadow:var(--shadow); border:1px solid var(--border); margin-bottom:20px; overflow:hidden; transition:background var(--transition), border var(--transition); }
.card-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px; }
.card-header h3 { font-size:15px; font-weight:600; display:flex; align-items:center; gap:8px; }
.card-header .count { font-size:12px; font-weight:400; color:var(--text-muted); }
.card-body { overflow-x:auto; }
.card-body-padded { padding:18px; }

table { width:100%; border-collapse:collapse; }
th { background:#f8fafc; color:var(--text-muted); padding:10px 14px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; white-space:nowrap; border-bottom:1px solid var(--border); }
td { padding:9px 14px; border-bottom:1px solid #f1f5f9; font-size:13px; }
tr:last-child td { border-bottom:none; }
tr:hover td { background:#f8fafc; }
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
  .sidebar { width:60px; }
  .sidebar-brand h1, .sidebar-brand span, .sidebar-footer a span, .sidebar-nav a span { display:none; }
  .sidebar-nav a, .sidebar-footer a { justify-content:center; padding:10px; }
  .sidebar-nav a .badge-count { display:none; }
  .main { margin-left:60px; padding:16px; }
  .stats-grid { grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }
}
</style>
</head>
<body>

<div class="sidebar">
  <div class="sidebar-brand">
    <h1>&#x1F3E6; LabCoop</h1>
    <span>Admin Dashboard</span>
  </div>
  <div class="sidebar-nav">
    ${navHtml}
  </div>
  <div class="sidebar-footer">
    <a href="#" onclick="toggleTheme(event)"><span class="icon">&#x1F319;</span> <span>Dark Mode</span></a>
    <a href="/admin/logout"><span class="icon">&#x1F6AA;</span> <span>Logout</span></a>
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
  const t = document.querySelector('.toast');
  if(t) setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity 0.5s';setTimeout(()=>t.remove(),500)},4000);
  document.querySelectorAll('.sidebar-nav a').forEach(a=>{if(a.href===location.href||a.href===location.href.split('?')[0])a.classList.add('active')});
  const saved = localStorage.getItem('labcoop-theme');
  if(saved === 'dark') document.documentElement.setAttribute('data-theme','dark');
})();
function toggleTheme(e){
  e.preventDefault();
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  if(isDark) { html.removeAttribute('data-theme'); localStorage.setItem('labcoop-theme','light'); }
  else { html.setAttribute('data-theme','dark'); localStorage.setItem('labcoop-theme','dark'); }
}
</script>
</body>
</html>`;
}

module.exports = { layout };
