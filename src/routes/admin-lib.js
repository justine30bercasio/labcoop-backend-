const fs = require('fs');
const path = require('path');

const ROLE_LEVELS = { super_admin: 4, manager: 3, teller: 2, auditor: 1 };
let currentRoleLevel = 4; // default: show all
const ORG_TEMPLATE_URL = '/orgthempalte.png';
const ORG_LOGO_URL = '/orglogo.jpg';

function setRoleLevel(level) { currentRoleLevel = level; }

function layout(title, active, content, opts = {}) {
  const { toast, counts, subtitle, headerActions } = opts;

   const menuGroups = [
    { minRole: 1, icon: '<i class="fas fa-chart-pie"></i>', label: 'Dashboard', key: 'dashboard', href: '/admin' },
    { minRole: 1, icon: '<i class="fas fa-users"></i>', label: 'Members', key: 'members', children: [
      { minRole: 1, icon: '<i class="fas fa-user"></i>', label: 'Accounts', href: '/admin/accounts', key: 'accounts' },
      { minRole: 1, icon: '<i class="fas fa-passport"></i>', label: 'KYC', href: '/admin/kyc', key: 'kyc' },
      { minRole: 1, icon: '<i class="fas fa-restroom"></i>', label: 'Demographics', href: '/admin/member-demographics', key: 'member-demographics' },
      { minRole: 3, icon: '<i class="fas fa-building"></i>', label: 'Branches', href: '/admin/branches', key: 'branches' },
    ]},
    { minRole: 1, icon: '<i class="fas fa-piggy-bank"></i>', label: 'Savings & Deposits', key: 'deposits', children: [
      { minRole: 3, icon: '<i class="fas fa-piggy-bank"></i>', label: 'Savings Products', href: '/admin/savings-products', key: 'savings-products' },
      { minRole: 2, icon: '<i class="fas fa-clock"></i>', label: 'Term Deposits', href: '/admin/term-deposits', key: 'term-deposits' },
      { minRole: 2, icon: '<i class="fas fa-coins"></i>', label: 'Share Capital', href: '/admin/share-capital', key: 'share-capital' },
      { minRole: 3, icon: '<i class="fas fa-chart-line"></i>', label: 'Dividends', href: '/admin/dividends', key: 'dividends' },
      { minRole: 2, icon: '<i class="fas fa-money-bill-trend-up"></i>', label: 'Overdrafts', href: '/admin/overdrafts', key: 'overdrafts' },
      { minRole: 3, icon: '<i class="fas fa-gear"></i>', label: 'Savings Settings', href: '/admin/savings-settings', key: 'savings-settings' },
    ]},
    { minRole: 1, icon: '<i class="fas fa-sack-dollar"></i>', label: 'Loans', key: 'loans-group', children: [
      { minRole: 1, icon: '<i class="fas fa-sack-dollar"></i>', label: 'Loans', href: '/admin/loans', key: 'loans' },
      { minRole: 3, icon: '<i class="fas fa-hand-holding-hand"></i>', label: 'Loan Products', href: '/admin/loan-products', key: 'loan-products' },
      { minRole: 2, icon: '<i class="fas fa-hand-holding-hand"></i>', label: 'Collateral', href: '/admin/collateral', key: 'collateral' },
      { minRole: 2, icon: '<i class="fas fa-user-check"></i>', label: 'Guarantors', href: '/admin/guarantors', key: 'guarantors' },
      { minRole: 2, icon: '<i class="fas fa-chart-simple"></i>', label: 'Asset Classification', href: '/admin/asset-classification', key: 'asset-classification' },
      { minRole: 2, icon: '<i class="fas fa-clock"></i>', label: 'Late Fees', href: '/admin/late-fees', key: 'late-fees' },
      { minRole: 2, icon: '<i class="fas fa-star"></i>', label: 'Credit Scoring', href: '/admin/credit-scores', key: 'credit-scores' },
      { minRole: 3, icon: '<i class="fas fa-arrows-rotate"></i>', label: 'Loan Restructure', href: '/admin/loan-restructure', key: 'loan-restructure' },
      { minRole: 2, icon: '<i class="fas fa-people-group"></i>', label: 'Lending Groups', href: '/admin/groups', key: 'groups' },
    ]},
    { minRole: 2, icon: '<i class="fas fa-hand-holding-dollar"></i>', label: 'Teller & Payments', key: 'teller-group', children: [
      { minRole: 2, icon: '<i class="fas fa-hand-holding-dollar"></i>', label: 'Teller Counter', href: '/admin/teller', key: 'teller' },
      { minRole: 2, icon: '<i class="fas fa-cash-register"></i>', label: 'Teller Cash', href: '/admin/teller-cash', key: 'teller-cash' },
      { minRole: 2, icon: '<i class="fas fa-money-check"></i>', label: 'Checks', href: '/admin/checks', key: 'checks' },
      { minRole: 2, icon: '<i class="fas fa-book"></i>', label: 'Checkbooks', href: '/admin/checkbooks', key: 'checkbooks' },
      { minRole: 2, icon: '<i class="fas fa-file-invoice"></i>', label: 'Demand Drafts', href: '/admin/demand-drafts', key: 'demand-drafts' },
      { minRole: 2, icon: '<i class="fas fa-money-bill-transfer"></i>', label: 'Withdrawals', href: '/admin/withdrawal-requests', key: 'withdrawal-requests' },
    ]},
    { minRole: 1, icon: '<i class="fas fa-chart-bar"></i>', label: 'Reports', key: 'reports', children: [
      { minRole: 2, icon: '<i class="fas fa-coins"></i>', label: 'Deposit Summary', href: '/admin/reports/deposit-summary', key: 'deposit-summary' },
      { minRole: 2, icon: '<i class="fas fa-calendar-day"></i>', label: 'Daily Collection', href: '/admin/reports/daily-collection', key: 'daily-collection' },
      { minRole: 2, icon: '<i class="fas fa-user"></i>', label: 'Member Ledger', href: '/admin/reports/member-ledger', key: 'member-ledger' },
      { minRole: 2, icon: '<i class="fas fa-clock"></i>', label: 'Loan Aging', href: '/admin/reports/loan-aging', key: 'loan-aging' },
      { minRole: 2, icon: '<i class="fas fa-chart-pie"></i>', label: 'Loan Portfolio', href: '/admin/reports/loan-portfolio', key: 'loan-portfolio' },
      { minRole: 3, icon: '<i class="fas fa-file-lines"></i>', label: 'Audit Reports', href: '/admin/audit', key: 'audit' },
    ]},
    { minRole: 1, icon: '<i class="fas fa-landmark"></i>', label: 'Bank Reports', key: 'bank-reports', style: 'border-top:1px solid rgba(255,255,255,0.06);padding-top:2px;margin-top:2px', children: [
      { minRole: 2, icon: '<i class="fas fa-building-columns"></i>', label: 'Bank Statement', href: '/admin/reports/bank/statement', key: 'bank-statement' },

      { minRole: 3, icon: '<i class="fas fa-cash-register"></i>', label: 'Daily Cash Position', href: '/admin/reports/bank/cash-position', key: 'bank-cash-position' },
    ]},
    { minRole: 1, icon: '<i class="fas fa-scale-balanced"></i>', label: 'Accounting', key: 'accounting', children: [
      { minRole: 1, icon: '<i class="fas fa-list"></i>', label: 'Chart of Accounts', href: '/admin/gl/accounts', key: 'gl-accounts' },
      { minRole: 1, icon: '<i class="fas fa-scale-balanced"></i>', label: 'Trial Balance', href: '/admin/gl/trial-balance', key: 'gl-trial' },
      { minRole: 1, icon: '<i class="fas fa-file-invoice"></i>', label: 'Balance Sheet', href: '/admin/gl/balance-sheet', key: 'gl-bsheet' },
      { minRole: 1, icon: '<i class="fas fa-chart-line"></i>', label: 'Profit & Loss', href: '/admin/gl/profit-and-loss', key: 'gl-pnl' },
      { minRole: 1, icon: '<i class="fas fa-book"></i>', label: 'General Ledger', href: '/admin/gl/ledger', key: 'gl-ledger' },
      { minRole: 1, icon: '<i class="fas fa-book-open"></i>', label: 'General Journal', href: '/admin/gl/journal', key: 'gl-journal' },
      { minRole: 1, icon: '<i class="fas fa-money-bill-wave"></i>', label: 'Cash Flow', href: '/admin/cash-flow', key: 'cash-flow' },
      { minRole: 3, icon: '<i class="fas fa-calculator"></i>', label: 'Withholding Tax', href: '/admin/withholding-tax', key: 'withholding-tax' },
      { minRole: 3, icon: '<i class="fas fa-chart-bar"></i>', label: 'Budget vs Actual', href: '/admin/budget', key: 'budget' },
      { minRole: 1, icon: '<i class="fas fa-clipboard-check"></i>', label: 'Regulatory', href: '/admin/regulatory-reports', key: 'regulatory-reports' },
    ]},
    { minRole: 1, icon: '<i class="fas fa-arrows-spin"></i>', label: 'Operations', key: 'operations', children: [
      { minRole: 1, icon: '<i class="fas fa-arrows-spin"></i>', label: 'Transactions', href: '/admin/transactions', key: 'transactions' },
      { minRole: 1, icon: '<i class="fas fa-calendar-check"></i>', label: 'End of Day', href: '/admin/eod', key: 'eod' },
      { minRole: 1, icon: '<i class="fas fa-calendar-alt"></i>', label: 'End of Month', href: '/admin/eom', key: 'eom' },
      { minRole: 1, icon: '<i class="fas fa-calendar-alt"></i>', label: 'Year-End', href: '/admin/eoy', key: 'eoy' },
      { minRole: 1, icon: '<i class="fas fa-file-invoice"></i>', label: 'Statements', href: '/admin/statements', key: 'statements' },
      { minRole: 3, icon: '<i class="fas fa-door-closed"></i>', label: 'Account Closure', href: '/admin/account-closure', key: 'account-closure' },
      { minRole: 3, icon: '<i class="fas fa-tags"></i>', label: 'Fees', href: '/admin/fees', key: 'fees' },
      { minRole: 3, icon: '<i class="fas fa-calendar-lock"></i>', label: 'Accounting Periods', href: '/admin/accounting-periods', key: 'accounting-periods' },
    ]},
    { minRole: 1, icon: '<i class="fas fa-gamepad"></i>', label: 'Gamification', key: 'gamification', children: [
      { minRole: 1, icon: '<i class="fas fa-store"></i>', label: 'Shop', href: '/admin/shop', key: 'shop' },
      { minRole: 1, icon: '<i class="fas fa-circle-question"></i>', label: 'Quiz', href: '/admin/quiz', key: 'quiz' },
      { minRole: 1, icon: '<i class="fas fa-bullseye"></i>', label: 'Goals', href: '/admin/goals', key: 'goals' },
      { minRole: 1, icon: '<i class="fas fa-medal"></i>', label: 'Badges', href: '/admin/badges', key: 'badges' },
      { minRole: 1, icon: '<i class="fas fa-users"></i>', label: 'Board of Directors', href: '/admin/board', key: 'board' },
    ]},
    { minRole: 1, icon: '<i class="fas fa-clipboard-list"></i>', label: 'Administration', key: 'admin-group', children: [
      { minRole: 4, icon: '<i class="fas fa-user-shield"></i>', label: 'Admin Users', href: '/admin/users', key: 'users' },
      { minRole: 3, icon: '<i class="fas fa-clipboard-list"></i>', label: 'Audit Log', href: '/admin/audit-log', key: 'audit-log' },
      { minRole: 3, icon: '<i class="fas fa-list"></i>', label: 'Enhanced Audit', href: '/admin/enhanced-audit', key: 'enhanced-audit' },
      { minRole: 1, icon: '<i class="fas fa-file-pen"></i>', label: 'Printable Forms', href: '/admin/forms', key: 'forms' },
      { minRole: 3, icon: '<i class="fas fa-calendar-day"></i>', label: 'Holidays', href: '/admin/holidays', key: 'holidays' },
      { minRole: 3, icon: '<i class="fas fa-percent"></i>', label: 'Taxes', href: '/admin/taxes', key: 'taxes' },
      { minRole: 1, icon: '<i class="fas fa-bell"></i>', label: 'Notifications', href: '/admin/notifications-log', key: 'notifications-log' },
      { minRole: 3, icon: '<i class="fas fa-globe"></i>', label: 'Multi-Currency', href: '/admin/currencies', key: 'currencies' },
      { minRole: 2, icon: '<i class="fas fa-check-double"></i>', label: 'Pending Approvals', href: '/admin/pending-approvals', key: 'pending-approvals' },
      { minRole: 3, icon: '<i class="fas fa-family"></i>', label: 'Parent Management', href: '/admin/parents', key: 'parents' },
      { minRole: 3, icon: '<i class="fas fa-database"></i>', label: 'Backup & Restore', href: '/admin/backup', key: 'backup' },
      { minRole: 3, icon: '<i class="fas fa-gear"></i>', label: 'Settings', href: '/admin/settings', key: 'settings' },
    ]},
  ];

  function isActive(key) {
    if (key === active) return true;
    return false;
  }

  function hasAccess(item) {
    return (item.minRole || 1) <= currentRoleLevel;
  }
  function filterMenu(g) {
    if (g.href) return hasAccess(g) ? g : null;
    const filteredChildren = (g.children || []).filter(hasAccess);
    if (filteredChildren.length === 0) return null;
    return { ...g, children: filteredChildren };
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
    const styleAttr = g.style ? ` style="${g.style}"` : '';
    return `<div class="menu-group${open}" data-key="${g.key}"${styleAttr}>
      <div class="menu-parent" data-toggle-group="${g.key}">
        <span class="icon">${g.icon}</span>
        <span>${g.label}</span>
        <span class="chevron">&#x25BC;</span>
      </div>
      <div class="sub-menu">${childHtml}</div>
    </div>`;
  }

  const sidebarNav = menuGroups.map(filterMenu).filter(Boolean).map(renderGroup).join('');

  const toastHtml = toast ? `<div class="toast ${toast.startsWith('error:') ? 'error' : 'success'}">${toast.startsWith('error:') ? '&#x274C; ' + toast.slice(6) : '&#x2705; ' + toast.slice(8)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LabCoop — ${title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
:root {
  --sidebar: #0d2818; --sidebar-hover: #143020; --sidebar-active: #1a5c2a;
  --sidebar-text: #8899aa; --sidebar-text-active: #e8f5e9;
  --bg: #f0f4f8; --card: #fff; --border: #e2e8f0;
  --text: #1e293b; --text-muted: #64748b;
  --accent: #2E7D32; --accent-hover: #1B5E20;
  --green: #22c55e; --blue: #3b82f6; --amber: #f59e0b; --purple: #8b5cf6; --red: #ef4444; --teal: #14b8a6; --pink: #ec4899;
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
.sidebar-nav a .icon { font-size:15px; width:22px; text-align:center; flex-shrink:0; }
.sidebar-nav a .icon i { font-size:15px; vertical-align:middle; }
.sidebar-nav a .badge-count { margin-left:auto; background:rgba(255,255,255,0.1); padding:0 7px; border-radius:10px; font-size:10px; font-weight:600; line-height:18px; }

.menu-group { margin-bottom:1px; }
.menu-parent { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:var(--radius-sm); color:var(--sidebar-text); font-size:13px; font-weight:500; cursor:pointer; transition:all var(--transition); white-space:nowrap; user-select:none; }
.menu-parent:hover { background:var(--sidebar-hover); color:var(--sidebar-text-active); }
.menu-parent .icon { font-size:15px; width:22px; text-align:center; flex-shrink:0; }
.menu-parent .icon i { font-size:15px; vertical-align:middle; }
.menu-parent .chevron { margin-left:auto; font-size:8px; transition:transform var(--transition); opacity:0.5; }
.menu-group.open .menu-parent .chevron { transform:rotate(180deg); opacity:0.8; }
.menu-group.open .menu-parent { color:var(--sidebar-text-active); }

.sub-menu { max-height:0; overflow:hidden; transition:max-height 0.3s cubic-bezier(0.4,0,0.2,1); padding-left:8px; }
.menu-group.open .sub-menu { max-height:500px; }
.sub-menu a { padding:7px 12px 7px 20px; font-size:12.5px; color:var(--sidebar-text); border-left:1px solid rgba(255,255,255,0.06); margin-left:10px; border-radius:0 var(--radius-sm) var(--radius-sm) 0; position:relative; }
.sub-menu a:hover { color:var(--sidebar-text-active); border-left-color:var(--accent); }
.sub-menu a.active { color:#fff; font-weight:600; border-left-color:var(--accent); background:linear-gradient(90deg,rgba(46,125,50,0.15) 0%,transparent 100%); }
.sub-menu a .icon { font-size:12px; width:18px; text-align:center; }
.sub-menu a .icon i { font-size:12px; vertical-align:middle; }

.sidebar-footer { padding:8px; border-top:1px solid rgba(255,255,255,0.05); flex-shrink:0; }
.sidebar-footer a { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:var(--radius-sm); color:var(--sidebar-text); text-decoration:none; font-size:12px; transition:all var(--transition); white-space:nowrap; }
.sidebar-footer a:hover { background:var(--sidebar-hover); color:var(--sidebar-text-active); }
.sidebar-footer a .icon { font-size:13px; width:22px; text-align:center; flex-shrink:0; }
.sidebar-footer a .icon i { font-size:13px; vertical-align:middle; }
.notif-wrap { position:relative; display:inline-flex; align-items:center; }
.notif-wrap .notif-bell { width:38px; height:38px; border:none; border-radius:10px; background:var(--card); color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; transition:all 0.15s; box-shadow:0 2px 8px rgba(0,0,0,0.08); border:1px solid var(--border); position:relative; }
.notif-wrap .notif-bell:hover { background:#f0fdf4; color:var(--accent); box-shadow:0 3px 12px rgba(46,125,50,0.15); transform:translateY(-1px); }
.notif-wrap .notif-bell:active { transform:translateY(0); }
.notif-badge { position:relative; display:inline-flex; align-items:center; line-height:1; }
.notif-badge .notif-count { position:absolute; top:-8px; right:-8px; background:#ef4444; color:#fff; font-size:9px; font-weight:700; min-width:18px; height:18px; line-height:18px; text-align:center; border-radius:9px; padding:0 5px; box-shadow:0 2px 4px rgba(239,68,68,0.5); display:none; border:2px solid var(--card); }
.notif-badge .notif-count.show { display:inline-block; }
.notif-dropdown { position:absolute; top:44px; right:0; width:360px; max-height:440px; background:var(--card); border-radius:14px; box-shadow:0 8px 40px rgba(0,0,0,0.15); display:none; flex-direction:column; z-index:999; overflow:hidden; border:1px solid var(--border); }
.notif-dropdown.show { display:flex; }
.notif-dropdown-header { padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
.notif-dropdown-header h4 { font-size:13px; font-weight:700; color:var(--text); }
.notif-dropdown-header .nd-count { font-size:11px; color:var(--text-muted); }
.notif-dropdown-body { overflow-y:auto; flex:1; padding:4px 0; }
.notif-item { display:flex; align-items:flex-start; gap:10px; padding:10px 16px; cursor:pointer; transition:background 0.12s; border-bottom:1px solid var(--border); text-decoration:none; color:inherit; }
.notif-item:last-child { border-bottom:none; }
.notif-item:hover { background:#f0fdf4; }
.notif-item .ni-icon { width:28px; height:28px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:12px; flex-shrink:0; margin-top:2px; }
.notif-item .ni-icon.kyc { background:#e8f5e9; color:#2E7D32; }
.notif-item .ni-icon.withdrawal { background:#fce4ec; color:#dc2626; }
.notif-item .ni-icon.loan { background:#fff8e1; color:#F57F17; }
.notif-item .ni-icon.online_deposit { background:#e3f2fd; color:#2563eb; }
.notif-item .ni-icon.consent { background:#f3e5f5; color:#7c3aed; }
.notif-item .ni-icon.deletion { background:#fef2f2; color:#b91c1c; }
.notif-item .ni-info { flex:1; min-width:0; }
.notif-item .ni-label { font-size:12px; font-weight:600; color:var(--text); }
.notif-item .ni-desc { font-size:11px; color:var(--text-muted); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.notif-item .ni-time { font-size:10px; color:var(--text-muted); margin-top:2px; opacity:0.7; }
.notif-dropdown-empty { padding:32px 16px; text-align:center; color:var(--text-muted); font-size:13px; }
.notif-dropdown-empty .nde-icon { font-size:32px; margin-bottom:8px; opacity:0.3; }
.notif-dropdown-footer { padding:8px 16px; border-top:1px solid var(--border); text-align:center; }
.notif-dropdown-footer a { font-size:12px; color:var(--accent); text-decoration:none; font-weight:600; display:block; padding:6px; border-radius:6px; }
.notif-dropdown-footer a:hover { background:#f0fdf4; color:var(--accent-hover); }
.notif-overlay { position:fixed; top:0; left:0; right:0; bottom:0; z-index:998; display:none; }
.notif-overlay.show { display:block; }

.main { margin-left:240px; flex:1; padding:24px 28px; max-width:100%; transition:margin-left var(--transition); }
.page-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
.page-header h2 { font-size:22px; font-weight:700; letter-spacing:-0.3px; }
.page-header .meta { font-size:12px; color:var(--text-muted); margin-top:2px; }
.header-actions { display:flex; gap:8px; flex-wrap:wrap; }

.toast { position:fixed; top:20px; right:20px; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:500; z-index:999; box-shadow:var(--shadow-lg); animation:slideIn 0.3s ease; max-width:420px; }
.toast.success { background:#e8f5e9; color:#1B5E20; border:1px solid #a5d6a7; }
.toast.error { background:#fce4ec; color:#b71c1c; border:1px solid #ef9a9a; }
@keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
@keyframes notifPulse { 0%{transform:scale(1)} 50%{transform:scale(1.15)} 100%{transform:scale(1)} }
.notif-bell.has-new .notif-count { animation:notifPulse 0.4s ease 2; }

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
.card-body { overflow-x:auto; overflow-y:visible; padding:16px; }
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

.stats-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; margin-bottom:24px; }
.stat-card { background:var(--card); border-radius:var(--radius); padding:16px 18px; box-shadow:var(--shadow); border:1px solid var(--border); transition:transform var(--transition), box-shadow var(--transition); cursor:default; min-width:0; }
.stat-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-lg); }
.stat-card .stat-icon { font-size:20px; margin-bottom:6px; }
.stat-card .stat-value { font-size:clamp(14px,2.2vw,24px); font-weight:700; letter-spacing:-0.5px; overflow-wrap:break-word; word-break:break-word; line-height:1.3; }
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

.action-menu { position:relative; display:inline-block; direction:ltr; }
.action-menu td, .action-menu tr, .action-menu tbody, .action-menu thead, .action-menu table { overflow:visible !important; }
.action-menu, .action-menu details, .action-menu[open] { overflow:visible !important; }
table.dataTable td, table.dataTable th, table.dataTable tbody, table.dataTable thead, table.dataTable tr { overflow:visible !important; }
.action-menu summary { list-style:none; cursor:pointer; padding:4px 8px; border-radius:6px; font-size:18px; line-height:1; letter-spacing:2px; color:var(--text-muted); user-select:none; transition:all var(--transition); display:flex; align-items:center; justify-content:center; width:32px; height:28px; }
.action-menu summary::-webkit-details-marker { display:none; }
.action-menu.open .action-dropdown { display:none !important; }
.action-menu summary:hover { background:var(--bg); color:var(--text); }
.action-menu[open] summary { background:var(--accent); color:#fff; border-radius:6px 6px 0 0; }
.action-dropdown { position:absolute; right:0; top:100%; z-index:9999; min-width:160px; background:var(--card); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.12); padding:4px; display:flex; flex-direction:column; gap:2px; animation:dropIn 0.15s ease; }
@keyframes dropIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
.action-dropdown a, .action-dropdown button { display:flex; align-items:center; gap:8px; padding:8px 12px; border:none; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer; text-decoration:none; color:var(--text); background:transparent; white-space:nowrap; width:100%; text-align:left; font-family:var(--font); transition:background var(--transition); }
.action-dropdown a:hover, .action-dropdown button:hover { background:var(--bg); }
.action-dropdown .text-red { color:var(--red); }
.action-dropdown .text-red:hover { background:#fce4ec; }
.action-dropdown .text-green { color:var(--accent); }
.action-dropdown .text-green:hover { background:#e8f5e9; }
.action-dropdown .text-amber { color:#d97706; }
.action-dropdown .text-amber:hover { background:#fff8e1; }
.action-dropdown hr { margin:4px 0; border:none; border-top:1px solid var(--border); }
[data-theme="dark"] .action-dropdown { border-color:#2a3a2e; box-shadow:0 4px 16px rgba(0,0,0,0.4); }
[data-theme="dark"] .action-dropdown a:hover, [data-theme="dark"] .action-dropdown button:hover { background:rgba(255,255,255,0.05); }
[data-theme="dark"] .action-dropdown .text-red:hover { background:rgba(239,68,68,0.15); }
[data-theme="dark"] .action-dropdown .text-green:hover { background:rgba(34,197,94,0.15); }
[data-theme="dark"] .action-dropdown .text-amber:hover { background:rgba(245,158,11,0.15); }

/* ── Confirmation Modal ── */
.confirm-overlay { display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.55); z-index:999999; align-items:center; justify-content:center; backdrop-filter:blur(3px); animation:cfade 0.2s ease; }
.confirm-modal { background:var(--card); border-radius:20px; padding:32px 36px; width:100%; max-width:400px; box-shadow:0 12px 48px rgba(0,0,0,0.25); text-align:center; animation:cscale 0.25s cubic-bezier(0.34,1.56,0.64,1); }
.confirm-icon { font-size:42px; margin-bottom:8px; line-height:1; }
.confirm-msg { font-size:15px; font-weight:500; color:var(--text); margin-bottom:24px; line-height:1.6; }
.confirm-actions { display:flex; gap:12px; justify-content:center; }
.confirm-actions .btn { min-width:120px; justify-content:center; padding:10px 20px; font-size:14px; border-radius:10px; }
.confirm-actions .btn-cancel { background:var(--bg); color:var(--text); border:1px solid var(--border); }
.confirm-actions .btn-cancel:hover { background:var(--border); }
@keyframes cfade { from{opacity:0} to{opacity:1} }
@keyframes cscale { from{opacity:0;transform:scale(0.92) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
</style>
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.datatables.net/2.2.2/js/dataTables.js"></script>
<style>
.dt-container { padding:0; width:100%; }

/* Toolbar: length left, search right, full width */
.dt-layout-row:first-child { display:flex; align-items:center; justify-content:space-between; padding:0 0 10px 0; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.dt-layout-row:first-child .dt-layout-cell { display:flex; align-items:center; }
.dt-layout-row:first-child .dt-layout-cell.dt-start { flex:0 0 auto; }
.dt-layout-row:first-child .dt-layout-cell.dt-end { flex:1; justify-content:flex-end; }

/* Bottom row: info left, paging right (flexbox for Edge compat) */
.dt-layout-row:last-child { display:flex; align-items:center; justify-content:space-between; padding:10px 0 0; flex-wrap:wrap; gap:8px; }
.dt-layout-row:last-child .dt-layout-cell { display:flex; align-items:center; }
.dt-layout-row:last-child .dt-layout-cell.dt-layout-start { flex:0 0 auto; }
.dt-layout-row:last-child .dt-layout-cell.dt-layout-end { flex:1; justify-content:flex-end; margin-right:6px; }

.dt-search { display:flex; align-items:center; gap:6px; }
.dt-search label { font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.4px; white-space:nowrap; }
.dt-search input { padding:7px 12px; border:2px solid var(--border); border-radius:8px; font-size:13px; outline:none; background:var(--bg); color:var(--text); width:200px; transition:border var(--transition), box-shadow var(--transition); font-family:var(--font); }
.dt-search input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(46,125,50,0.12); }
[data-theme="dark"] .dt-search input { background:#1a231c; border-color:#2a3a2e; }
[data-theme="dark"] .dt-search input:focus { border-color:var(--accent); }

.dt-length { display:flex; align-items:center; gap:6px; }
.dt-length label { font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.4px; white-space:nowrap; }
.dt-length select { padding:5px 8px; border:2px solid var(--border); border-radius:8px; font-size:12px; outline:none; background:var(--bg); color:var(--text); cursor:pointer; transition:border var(--transition); font-family:var(--font); }
.dt-length select:focus { border-color:var(--accent); }
[data-theme="dark"] .dt-length select { background:#1a231c; border-color:#2a3a2e; }

.dt-info { padding:0; font-size:12px; color:var(--text-muted); white-space:nowrap; }
.dt-paging { display:flex; align-items:center; gap:4px; flex-wrap:wrap; max-width:100%; }
.dt-paging nav { overflow-x:auto; white-space:nowrap; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
.dt-paging nav::-webkit-scrollbar { display:none; }
.dt-paging nav { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.dt-paging button { padding:6px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); color:var(--text); font-size:12px; font-weight:500; cursor:pointer; transition:all var(--transition); font-family:var(--font); min-width:32px; text-align:center; }
.dt-paging button:hover { background:var(--accent); color:#fff; border-color:var(--accent); transform:translateY(-1px); box-shadow:0 2px 8px rgba(46,125,50,0.2); }
.dt-paging button:active { transform:translateY(0); }
.dt-paging button.current { background:var(--accent); color:#fff; border-color:var(--accent); font-weight:600; box-shadow:0 2px 8px rgba(46,125,50,0.25); }
.dt-paging button.disabled { opacity:0.4; cursor:not-allowed; pointer-events:none; }
.dt-paging button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
[data-theme="dark"] .dt-paging button { background:var(--card); border-color:#2a3a2e; }
[data-theme="dark"] .dt-paging button:hover { background:var(--accent); border-color:var(--accent); }
[data-theme="dark"] .dt-paging button.current { background:var(--accent); border-color:var(--accent); }

/* Full-width table with fixed layout for even distribution */
table.dataTable { margin:0 !important; width:100% !important; table-layout:fixed; }
table.dataTable thead th, table.dataTable td { padding:12px 14px !important; vertical-align:middle; }
table.dataTable thead th { position:relative; cursor:pointer; user-select:none; padding-right:26px !important; }
table.dataTable thead th:after { position:absolute; right:10px; top:50%; transform:translateY(-50%); font-size:9px; color:var(--text-muted); }
table.dataTable thead th.dt-orderable-asc:after { content:'\\25B2\\25BC'; letter-spacing:-3px; opacity:0.25; }
table.dataTable thead th.dt-orderable-desc:after { content:'\\25B2\\25BC'; letter-spacing:-3px; opacity:0.25; }
table.dataTable thead th.dt-ordering-asc:after { content:'\\25B2'; opacity:1; color:var(--accent); }
table.dataTable thead th.dt-ordering-desc:after { content:'\\25BC'; opacity:1; color:var(--accent); }
table.dataTable thead th:hover { background:#f0fdf4; }
[data-theme="dark"] table.dataTable thead th:hover { background:rgba(46,125,50,0.1); }
table.dataTable tbody tr { transition:background var(--transition); }
table.dataTable tbody tr:hover td { background:#f0fdf4; }
[data-theme="dark"] table.dataTable tbody tr:hover td { background:rgba(46,125,50,0.08); }
table.dataTable tbody tr:nth-child(even) td { background:rgba(0,0,0,0.015); }
[data-theme="dark"] table.dataTable tbody tr:nth-child(even) td { background:rgba(255,255,255,0.015); }
table.dataTable tbody tr:nth-child(even):hover td { background:#f0fdf4; }
[data-theme="dark"] table.dataTable tbody tr:nth-child(even):hover td { background:rgba(46,125,50,0.08); }
table.dataTable td.num { text-align:right; }
table.dataTable td.mono { font-family:var(--mono); font-size:12px; }

.dt-empty { text-align:center; padding:40px !important; color:var(--text-muted); font-size:13px; }

/* Column width distribution for Accounts table */
.dt-accounts-table thead th:nth-child(1) { width:25%; }
.dt-accounts-table thead th:nth-child(2) { width:15%; }
.dt-accounts-table thead th:nth-child(3) { width:15%; }
.dt-accounts-table thead th:nth-child(4) { width:10%; }
.dt-accounts-table thead th:nth-child(5) { width:10%; }
.dt-accounts-table thead th:nth-child(6) { width:15%; }
</style>
</head>
<body>

<button class="hamburger" id="hamburger"><i class="fas fa-bars"></i></button>

<div class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <div class="brand-row">
      <span class="brand-icon"><i class="fas fa-building-columns"></i></span>
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
    <a href="#" data-action="toggle-theme"><span class="icon"><i class="fas fa-moon"></i></span> <span>Dark Mode</span></a>
    <a href="/admin/logout"><span class="icon"><i class="fas fa-right-from-bracket"></i></span> <span>Sign Out</span></a>
  </div>
</div>

<div class="main">
  <div class="page-header">
    <div>
      <h2>${opts.headerTitle || title}</h2>
      ${subtitle ? `<div class="meta">${subtitle}</div>` : ''}
    </div>
    <div class="header-actions">
      <div class="notif-wrap">
        <button class="notif-bell" id="notifBell" title="Notifications">
          <span class="notif-badge"><i class="fas fa-bell"></i> <span class="notif-count" id="notifCount">0</span></span>
        </button>
        <div class="notif-dropdown" id="notifDropdown">
          <div class="notif-dropdown-header">
            <h4>Notifications</h4>
            <span class="nd-count" id="notifDropdownCount">0 pending</span>
          </div>
          <div class="notif-dropdown-body" id="notifDropdownBody">
            <div class="notif-dropdown-empty">
              <div class="nde-icon">&#x2705;</div>
              <div>All caught up!</div>
            </div>
          </div>
          <div class="notif-dropdown-footer">
            <a href="/admin/pending-approvals">View all pending approvals &rarr;</a>
          </div>
        </div>
        <div class="notif-overlay" id="notifOverlay"></div>
      </div>
      ${headerActions || ''}
    </div>
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

// ── Notification bell dropdown ──
(function(){
  var bell = document.getElementById('notifBell');
  var dd = document.getElementById('notifDropdown');
  var overlay = document.getElementById('notifOverlay');
  var badge = document.getElementById('notifCount');
  var body = document.getElementById('notifDropdownBody');
  var countLabel = document.getElementById('notifDropdownCount');
  if (!bell || !dd || !overlay) return;

  bell.addEventListener('click', function(e){
    e.stopPropagation();
    dd.classList.toggle('show');
    overlay.classList.toggle('show');
  });

  function notifIcon(type){
    var icons = { kyc:'fa-id-card', withdrawal:'fa-money-bill-wave', loan:'fa-sack-dollar', online_deposit:'fa-credit-card', consent:'fa-file-signature', deletion:'fa-user-slash' };
    return icons[type] || 'fa-bell';
  }

  function timeAgo(ts){
    if (!ts) return '';
    var diff = Date.now() - new Date(ts).getTime();
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    var d = Math.floor(hr / 24);
    if (d < 7) return d + 'd ago';
    return (ts || '').slice(0,10);
  }

  var lastTotal = -1;
  function fetchNotifications(){
    fetch('/admin/pending-items')
      .then(function(r){ return r.json(); })
      .then(function(data){
        // Pulse bell if new items appeared
        if (lastTotal >= 0 && data.total > lastTotal) {
          bell.classList.add('has-new');
          setTimeout(function(){ bell.classList.remove('has-new'); }, 800);
        }
        lastTotal = data.total;
        // Update badge
        if (data.total > 0) {
          badge.textContent = data.total > 99 ? '99+' : data.total;
          badge.classList.add('show');
        } else {
          badge.classList.remove('show');
        }
        countLabel.textContent = data.total + ' pending';

        // Render items
        if (data.items && data.items.length > 0) {
          body.innerHTML = '';
          data.items.forEach(function(item){
            var icon = notifIcon(item.type);
            var el = document.createElement('a');
            el.className = 'notif-item';
            el.href = item.url || '/admin/pending-approvals';
            el.innerHTML = '<div class="ni-icon ' + item.type + '"><i class="fas ' + icon + '"></i></div><div class="ni-info"><div class="ni-label">' + item.label + '</div><div class="ni-desc">' + item.desc + '</div><div class="ni-time">' + timeAgo(item.time) + '</div></div>';
            body.appendChild(el);
          });
        } else {
          body.innerHTML = '<div class="notif-dropdown-empty"><div class="nde-icon">&#x2705;</div><div>All caught up!</div></div>';
        }
      })
      .catch(function(){});
  }

  fetchNotifications();
  setInterval(fetchNotifications, 10000);

  // Close dropdown when clicking overlay
  overlay.addEventListener('click', function(){
    dd.classList.remove('show');
    overlay.classList.remove('show');
  });
})();
</script>
<div id="confirm-modal" class="confirm-overlay" role="dialog" aria-modal="true" style="display:none">
  <div class="confirm-modal">
    <div class="confirm-icon"><i class="fas fa-triangle-exclamation" style="font-size:42px;color:var(--red)"></i></div>
    <div class="confirm-msg" id="confirm-msg">Are you sure?</div>
    <div class="confirm-actions">
      <button class="btn btn-cancel" id="confirm-cancel">Cancel</button>
      <button class="btn btn-danger" id="confirm-yes">Yes, proceed</button>
    </div>
  </div>
</div>

<script>
// ── Confirmation Modal ──
(function(){
  var overlay = document.getElementById('confirm-modal');
  var msgEl = document.getElementById('confirm-msg');
  var yesBtn = document.getElementById('confirm-yes');
  var cancelBtn = document.getElementById('confirm-cancel');
  var callback = null;

  window.confirmAction = function(message, cb) {
    if (overlay.style.display === 'flex') return;
    msgEl.textContent = message;
    callback = cb;
    overlay.style.display = 'flex';
  };

  function closeModal() {
    overlay.style.display = 'none';
    callback = null;
  }

  yesBtn.addEventListener('click', function() {
    var cb = callback;
    closeModal();
    if (cb) setTimeout(cb, 50);
  });

  cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
})();

// ── Delegate data-confirm forms, buttons, links ──
(function(){
  // Forms with data-confirm
  $(document).on('submit', 'form[data-confirm]', function(e) {
    e.preventDefault();
    var form = this;
    var msg = form.getAttribute('data-confirm');
    confirmAction(msg, function() {
      form.removeAttribute('data-confirm');
      form.submit();
    });
  });
  // Buttons/links with data-confirm and data-action-url (fetch pattern)
  $(document).on('click', '[data-confirm][data-action-url]', function(e) {
    e.preventDefault();
    var el = this;
    var msg = el.getAttribute('data-confirm');
    var url = el.getAttribute('data-action-url');
    var method = el.getAttribute('data-method') || 'POST';
    confirmAction(msg, function() {
      fetch(url, { method: method })
        .then(function(r) { return r.json(); })
        .then(function(d) { alert(d.message || 'Done'); location.reload(); })
        .catch(function() { alert('Error'); location.reload(); });
    });
  });
  // Anchor links with data-confirm (direct navigation)
  $(document).on('click', 'a[data-confirm]:not([data-action-url])', function(e) {
    e.preventDefault();
    var el = this;
    var msg = el.getAttribute('data-confirm');
    confirmAction(msg, function() { window.location.href = el.href; });
  });
})();

// ── Floating action dropdown (fixed position to escape table clipping) ──
(function(){
  var activeDD = null;
  $(document).on('click', '.action-menu summary', function(e) {
    e.preventDefault();
    var menu = this.parentNode;
    if (menu.classList.contains('open')) {
      menu.classList.remove('open');
      if (activeDD) { activeDD.remove(); activeDD = null; }
      return;
    }
    document.querySelectorAll('.action-menu.open').forEach(function(m) { m.classList.remove('open'); });
    if (activeDD) { activeDD.remove(); activeDD = null; }
    var dd = menu.querySelector('.action-dropdown');
    var clone = dd.cloneNode(true);
    clone.style.cssText = 'position:fixed;z-index:99999;display:flex;flex-direction:column;gap:2px;';
    var rect = this.getBoundingClientRect();
    clone.style.top = (rect.bottom + 4) + 'px';
    clone.style.right = (document.documentElement.clientWidth - rect.right) + 'px';
    clone.style.minWidth = '160px';
    var bg = getComputedStyle(dd).background || '#fff';
    clone.style.background = bg;
    clone.style.border = '1px solid var(--border)';
    clone.style.borderRadius = '8px';
    clone.style.padding = '4px';
    clone.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
clone.querySelectorAll('a,button').forEach(function(el) {
  el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;text-decoration:none;white-space:nowrap;width:100%;text-align:left;background:transparent;color:inherit;font-family:inherit;transition:background 0.15s;';
  el.onmouseover = function(){ this.style.background = 'var(--bg)'; };
  el.onmouseout = function(){ this.style.background = 'transparent'; };
  if (el.classList.contains('text-red')) el.onmouseover = function(){ this.style.background = '#fce4ec'; };
  if (el.classList.contains('text-green')) el.onmouseover = function(){ this.style.background = '#e8f5e9'; };
  if (el.classList.contains('text-amber')) el.onmouseover = function(){ this.style.background = '#fff8e1'; };
});
    clone.querySelectorAll('hr').forEach(function(el) { el.style.cssText = 'margin:4px 0;border:none;border-top:1px solid var(--border)'; });
    document.body.appendChild(clone);
    activeDD = clone;
    menu.classList.add('open');
  });
  $(document).on('click', function(e) {
    if (activeDD && !activeDD.contains(e.target) && !$(e.target).closest('.action-menu summary').length) {
      activeDD.remove(); activeDD = null;
      document.querySelectorAll('.action-menu.open').forEach(function(m) { m.classList.remove('open'); });
    }
  });
})();

$(document).ready(function(){
  $('.card-body table').each(function(){
    if($(this).is('[data-skip-datatable]')) return;
    var $th = $(this).find('thead th, > tr:first th').length;
    var $td = $(this).find('tbody tr:first td, > tr:eq(1) td').length;
    if($td === 0) $td = $th;
    if($th > 0 && $th === $td){
      if(!this.id) this.id = 'dt-' + Math.random().toString(36).slice(2, 9);
      try{
        $('#'+this.id).DataTable({
          pageLength: 25,
          lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, 'All']],
          order: [],
          language: {
            search: 'Search:',
            lengthMenu: 'Show _MENU_',
            info: 'Showing _START_ to _END_ of _TOTAL_',
            infoEmpty: 'No entries',
            infoFiltered: '(filtered from _MAX_ total)',
            zeroRecords: 'No matching records found',
            emptyTable: 'No data available'
          },
          pagingType: 'full_numbers',
          processing: true,
          layout: {
            topStart: 'pageLength',
            topEnd: 'search',
            bottomStart: null,
            bottomEnd: ['info', 'paging']
          }
        });
      }catch(e){}
    }
  });
});
</script>

<script>
// ── CSP-safe event delegation (replaces all inline onclick/onchange) ──
(function(){
  document.addEventListener('click', function(e) {
    var target = e.target;
    // Sidebar group toggle
    var groupBtn = target.closest('[data-toggle-group]');
    if (groupBtn) { e.preventDefault(); toggleGroup(groupBtn.getAttribute('data-toggle-group')); return; }
    // Hamburger sidebar toggle
    if (target.id === 'hamburger') { toggleSidebar(); return; }
    // Dark mode toggle
    var themeBtn = target.closest('[data-action="toggle-theme"]');
    if (themeBtn) { toggleTheme(e); return; }
    // Teller tab switch
    var tabBtn = target.closest('.tx-tab[data-tab]');
    if (tabBtn) {
      var tab = tabBtn.getAttribute('data-tab');
      document.querySelectorAll('.tx-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.tx-panel').forEach(function(p) { p.classList.remove('active'); });
      var tabEl = document.getElementById('tab-' + tab);
      var panelEl = document.getElementById('panel-' + tab);
      if (tabEl) tabEl.classList.add('active');
      if (panelEl) panelEl.classList.add('active');
      return;
    }
    // Print receipt
    if (target.closest('[data-action="print-receipt"]')) { window.print(); return; }
    // Close receipt
    var closeBtn = target.closest('[data-action="close-receipt"]');
    if (closeBtn) { var r = document.getElementById('rinline'); if (r) r.remove(); return; }
  });
  // Auto-submit selects on change
  document.addEventListener('change', function(e) {
    if (e.target.hasAttribute('data-auto-submit')) { e.target.form.submit(); }
  });
})();
</script>
</body>
</html>`;
}

function h(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function fmt(v) {
  return '₱' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTrn(v) {
  const n = Number(v || 0);
  return (n >= 0 ? '+' : '') + '₱' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function printLayout(title, content, opts = {}) {
  const {
    subtitle = '',
    dateRange = '',
    companyName = 'AYSIDEK Lab Coop',
    companyAddress = '50 20 de Julio corner Bonifacio Sts, 4336',
    companyTin = '',
    asOf = '',
    orientation = 'portrait',
    signatureLine1 = 'Prepared by:',
    signatureLine2 = 'Reviewed by:',
    signatureLine3 = 'Approved by:',
    disclaimer = 'This report is system-generated and does not require a physical signature unless otherwise specified.',
    showPageNumbers = true,
    showSignatures = true,
    showDisclaimer = true,
    templateOverlay = false,
    templateTop = '1.6in',
    templateBottom = '24mm',
    pageMargin = '22mm 18mm 32mm 18mm',
  } = opts;

  const genDate = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: ${orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'};
    margin: ${templateOverlay ? '0' : pageMargin};
    ${showPageNumbers ? "@bottom-center { content: 'Page ' counter(page) ' of ' counter(pages); font-size: 8pt; color: #888; font-family: Georgia, 'Times New Roman', serif; }" : ''}
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.5;
    color: #1a1a1a;
    background: #fff;
  }
  /* ── WATERMARK: org logo centered at 10% opacity ── */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: url('${ORG_LOGO_URL}') center center / contain no-repeat;
    opacity: 0.10;
    pointer-events: none;
    z-index: 0;
  }
  .report-sheet, .template-content,
  table, .print-info-grid, .print-summary-strip, .print-cert-wrap,
  .signature-area, .disclaimer-text, .footer-note, .print-signature-block {
    position: relative;
    z-index: 1;
  }
  .mono, .num {
    font-family: 'Courier New', 'Lucida Console', monospace !important;
    font-variant-numeric: tabular-nums;
  }
  .template-sheet { position: relative; min-height: 297mm; background: none; overflow: visible; page-break-inside: auto; }
  .template-bg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.25; pointer-events: none; z-index: 0; }
  .template-content { position: relative; padding: ${templateTop} 18mm ${templateBottom} 18mm; overflow: visible; }
  .template-content > * { position: relative; z-index: 1; }
  .report-sheet { position: relative; min-height: 0; background: none; padding: 0; overflow: visible; }
  .report-sheet > * { position: relative; z-index: 1; }

  /* ── COMPANY HEADER ── */
  .print-header-row { display:flex; align-items:center; gap:4mm; margin-bottom:1mm; }
  .print-header-logo { flex-shrink:0; width:16mm; height:16mm; }
  .print-header-logo img { width:100%; height:100%; object-fit:contain; }
  .print-header-info { flex:1; }
  .print-header-info .bank-name { font-size:15pt; font-weight:800; color:#000; letter-spacing:1.5px; }
  .print-header-info .bank-sub { font-size:8pt; color:#666; margin-top:0.3mm; }
  .print-company-header { border-bottom:1px solid #d0dcd0; margin-bottom:3mm; padding-bottom:2mm; }
  .print-company-header .report-title { font-size:11pt; font-weight:700; color:#1a4a1a; letter-spacing:1px; }
  .print-company-header .report-subtitle { font-size:8pt; color:#888; }

  /* ── REPORT META ── */
  .report-meta-bar { display: flex; justify-content: space-between; font-size: 7pt; color: #888; margin-bottom: 2.5mm; padding: 0.8mm 0; border-bottom: 1px solid #e0e8e0; }

  /* ── TITLE ── */
  .report-title { text-align: center; margin: 2mm 0 3mm 0; }
  .report-title h2 { font-size: 12pt; font-weight: 700; color: #1a4a1a; margin-bottom: 0.5mm; letter-spacing: 0.5px; }
  .report-title .subtitle { font-size: 8pt; color: #666; font-style: italic; }
  .report-title .date-range { font-size: 7.5pt; color: #888; margin-top: 0.5mm; }

  /* ── TABLES ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: 8pt; page-break-inside: auto; break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  thead th {
    background: #1a4a1a; color: #fff; font-weight: 700; text-align: left;
    padding: 1.8mm 1.5mm; font-size: 7pt; letter-spacing: 0.4px;
    border: 1px solid #2d5a27;
  }
  thead th.num, thead th.right { text-align: right; }
  tbody td { padding: 1mm 1.5mm; border: 1px solid #ccc; vertical-align: top; font-size: 7.5pt; }
  tr { break-inside: auto; page-break-inside: auto; }
  tbody td.num, tbody td.right { text-align: right; font-family: 'Courier New', monospace; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(even) { background: #f8faf8; }
  tbody tr.total-row { font-weight: 700; background: #eaf3ea; border-top: 2px solid #1a4a1a; }
  tbody tr.total-row td { border-top: 2px solid #1a4a1a; color: #1a4a1a; }
  tbody tr.subtotal-row { font-weight: 600; background: #f2f6f2; border-top: 1px solid #888; }
  .credit { color: #16a34a; font-weight: 700; }
  .debit { color: #dc2626; font-weight: 700; }

  /* ── SUMMARY STRIP ── */
  .print-summary-strip { display: flex; gap: 2mm; margin-bottom: 2.5mm; }
  .print-summary-item { flex: 1; padding: 1.2mm 1.5mm; border: 1px solid #d0dcd0; text-align: center; font-size: 6.5pt; line-height: 1.25; }
  .print-summary-item .val { font-size: 9pt; font-weight: 700; font-family: 'Courier New', monospace; margin-top: 0.3mm; }
  .print-summary-item .val.blue { color: #2563eb; }
  .print-summary-item .val.green { color: #16a34a; }
  .print-summary-item .val.red { color: #dc2626; }
  .print-summary-item .val.gold { color: #1a4a1a; }

  /* ── MEMBER INFO GRID ── */
  .print-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 2mm; margin-bottom: 2.5mm; }
  .print-info-item { border: 1px solid #d0dcd0; padding: 0.8mm 1.5mm; font-size: 7pt; }
  .print-info-item .label { font-size: 6pt; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.3px; }

  /* ── SECTIONS ── */
  .section-title { font-weight: 700; font-size: 8.5pt; color: #1a4a1a; margin: 3mm 0 1.5mm 0; padding: 0.8mm 0; border-bottom: 1.5px solid #6b8e23; }
  .disclaimer-text { font-size: 6.5pt; color: #999; text-align: center; margin-top: 3mm; padding-top: 1.5mm; border-top: 1px solid #e0e8e0; line-height: 1.4; }

  /* ── SIGNATURES ── */
  .signature-area { margin-top: 6mm; display: flex; justify-content: space-between; }
  .signature-block { text-align: center; flex: 1; }
  .signature-block .line { border-top: 1px solid #000; width: 70%; margin: 16mm auto 1.5mm auto; }
  .signature-block .label { font-size: 7.5pt; font-weight: 700; color: #1a1a1a; }
  .signature-block .sub-label { font-size: 6pt; color: #999; }

  /* ── CERTIFICATE STYLES ── */
  .print-cert-wrap { max-width: 600px; margin: 0 auto; }
  .print-cert-header { text-align: center; padding: 3mm; border-bottom: 2px solid #6b8e23; margin-bottom: 3mm; }
  .print-cert-header h1 { font-size: 14pt; font-weight: 800; color: #1a4a1a; letter-spacing: 1.5px; }
  .print-cert-header .cert-sub { font-size: 7.5pt; color: #888; margin-top: 0.5mm; }
  .print-cert-amount { text-align: center; padding: 3mm 2.5mm; border: 2px dashed #6b8e23; margin: 2.5mm 0; background: #f6faf6; }
  .print-cert-amount .label { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #6b8e23; font-weight: 700; }
  .print-cert-amount .figure { font-size: 18pt; font-weight: 800; color: #1a4a1a; font-family: 'Courier New', monospace; margin: 1.5mm 0; }
  .print-cert-amount .words { font-size: 8pt; color: #6b8e23; font-style: italic; }

  /* ── MISC ── */
  .print-signature-block { display: flex; justify-content: space-between; margin-top: 4mm; }
  .print-signature-block > div { text-align: center; flex: 1; }
  .print-signature-block .sig-line { border-top: 1px solid #000; width: 75%; margin: 14mm auto 1mm auto; }
  .print-signature-block .sig-label { font-size: 7.5pt; font-weight: 600; color: #333; }
  .status-badge { display: none; }
  .no-print { display: none; }
  .footer-note { text-align: center; font-size: 6pt; color: #aaa; margin-top: 1.5mm; border-top: 1px solid #e8eee8; padding-top: 1mm; }
  .indent { padding-left: 5mm !important; }
  .double-indent { padding-left: 10mm !important; }
  .print-divider { border: none; border-top: 1px solid #6b8e23; margin: 2.5mm 0; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    form, .btn, button, input, select, canvas,
    .sidebar, .page-header, .dataTables_wrapper .dataTables_filter,
    .dataTables_wrapper .dataTables_length, .dataTables_wrapper .dataTables_paginate,
    a[href*="export"], a[href*="print"], a[href*="reset"],
    a[target="_blank"], .badge-count, .card-tools, .no-print { display: none !important; }
  }
</style>
</head>
<body>
  ${templateOverlay ? '<div class="template-sheet"><img class="template-bg" src="' + ORG_TEMPLATE_URL + '" alt=""><div class="template-content"><div class="report-sheet">' : '<div class="report-sheet">'}
  ${!templateOverlay ? `
  <div class="print-company-header">
    <div class="print-header-row">
      <div class="print-header-logo"><img src="${ORG_LOGO_URL}" alt="Logo"></div>
      <div class="print-header-info">
        <div class="bank-name">${h(companyName)}</div>
        <div class="bank-sub">${companyAddress}</div>
      </div>
    </div>
    <div class="report-title">${h(title)}</div>
    ${subtitle ? `<div class="report-subtitle">${subtitle}</div>` : ''}
  </div>
  <div class="report-meta-bar">
    <span>${asOf ? 'As of ' + asOf : dateRange ? 'Period: ' + dateRange : ''}</span>
    <span>Generated: ${genDate} &mdash; PH Time</span>
  </div>` : `<div class="report-title">
    <h2>${h(title)}</h2>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
    ${asOf ? `<div class="date-range">As of ${asOf}</div>` : ''}
    ${dateRange ? `<div class="date-range">${dateRange}</div>` : ''}
  </div>
  <div class="report-meta">Generated: ${genDate}</div>`}
  ${content}
  ${showDisclaimer ? `<div class="disclaimer-text">${disclaimer}</div>` : ''}
  ${showSignatures ? `
  <div class="signature-area">
    <div class="signature-block"><div class="line"></div><div class="label">${h(signatureLine1)}</div><div class="sub-label">(Printed Name &amp; Signature)</div></div>
    <div class="signature-block"><div class="line"></div><div class="label">${h(signatureLine2)}</div><div class="sub-label">(Printed Name &amp; Signature)</div></div>
    <div class="signature-block"><div class="line"></div><div class="label">${h(signatureLine3)}</div><div class="sub-label">(Printed Name &amp; Signature)</div></div>
  </div>` : ''}
  <div class="footer-note">This report is system-generated from AYSIDEK Lab Coop</div>
  ${templateOverlay ? '</div></div></div>' : '</div>'}
</body>
</html>`;
}

function reportTable(headers, rows, opts = {}) {
  const { totalText = 'TOTAL', totalCells, showRowNumbers = false, classMap = {} } = opts;
  const th = headers.map((h, i) => {
    const cls = (i > 0 && typeof h === 'string' && h.toLowerCase() !== 'code') ? ' class="num"' : '';
    return `<th${cls}>${h}</th>`;
  }).join('');
  const tr = rows.map((r, ri) => {
    const cls = r.cls || '';
    const num = showRowNumbers ? `<td class="num mono" style="color:#999">${ri + 1}</td>` : '';
    const cells = r.cells.map((c, ci) => {
      const isNum = ci > 0 && typeof c === 'string' && (c.includes('₱') || /^[\d,\.]+$/.test(c.replace(/[₱,\(\)]/g, '')));
      return `<td${isNum ? ' class="num mono"' : ''}>${c}</td>`;
    }).join('');
    return `<tr class="${cls}">${num}${cells}</tr>`;
  }).join('');
  const total = totalCells ? `<tr class="total-row">${totalCells.map((c, i) => {
    const isNum = i > 0;
    return `<td${isNum ? ' class="num mono"' : ''} style="font-weight:700">${c}</td>`;
  }).join('')}</tr>` : '';
  return `<table>${th ? `<thead><tr>${th}</tr></thead>` : ''}<tbody>${tr}${total}</tbody></table>`;
}

function reportSection(title, items, total, opts = {}) {
  const { color = '#000', totalLabel = 'TOTAL ' + title.toUpperCase() } = opts;
  const rows = items.map(i => {
    const isContra = i.is_contra == 1 || i.is_contra === '1';
    const label = isContra ? '(Less) ' + i.name : i.name;
    const val = i.amount != null ? i.amount : (i.balance != null ? i.balance : 0);
    const display = val < 0 ? '(\u20B1' + Math.abs(val).toFixed(2) + ')' : '\u20B1' + Math.abs(val).toFixed(2);
    return { cells: [label, `<span style="color:${color};font-weight:600">${display}</span>`] };
  });
  return `<div class="section-title">${title}</div>
  <table>
    <thead><tr><th>Account</th><th class="num">Amount</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr><td>${r.cells[0]}</td><td class="num mono">${r.cells[1]}</td></tr>`).join('')}
      <tr class="total-row"><td style="font-weight:700">${totalLabel}</td><td class="num mono" style="font-weight:700;color:${color}">${total}</td></tr>
    </tbody>
  </table>`;
}

function reportStats(items) {
  return `<div class="stats-grid-print">${items.map(i => `<div><div class="val">${i.value}</div><div>${i.label}</div></div>`).join('')}</div>`;
}

module.exports = { layout, printLayout, h, fmt, fmtTrn, reportTable, reportSection, reportStats, setRoleLevel, ROLE_LEVELS, ORG_TEMPLATE_URL, ORG_LOGO_URL };
