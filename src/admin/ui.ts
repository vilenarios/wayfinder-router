/**
 * Admin UI - Embedded SPA HTML/CSS/JS Generator
 *
 * Single-file admin UI that ships inside the binary.
 * No React, no build step — just template literals.
 */

const COLORS = {
  bg: "#0f0f1a",
  sidebar: "#1a1a2e",
  card: "#16213e",
  cardHover: "#1a2744",
  border: "#2a2a4a",
  primary: "#4fc3f7",
  primaryDark: "#0288d1",
  success: "#66bb6a",
  warning: "#ffa726",
  danger: "#ef5350",
  text: "#e0e0e0",
  textMuted: "#9e9e9e",
  textBright: "#ffffff",
};

function css(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: ${COLORS.bg};
      --sidebar: ${COLORS.sidebar};
      --card: ${COLORS.card};
      --card-hover: ${COLORS.cardHover};
      --border: ${COLORS.border};
      --primary: ${COLORS.primary};
      --primary-dark: ${COLORS.primaryDark};
      --success: ${COLORS.success};
      --warning: ${COLORS.warning};
      --danger: ${COLORS.danger};
      --text: ${COLORS.text};
      --text-muted: ${COLORS.textMuted};
      --text-bright: ${COLORS.textBright};
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Sidebar */
    .sidebar {
      width: 220px;
      min-height: 100vh;
      background: var(--sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 10;
    }
    .sidebar-brand {
      padding: 20px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sidebar-brand svg { flex-shrink: 0; }
    .sidebar-brand h1 {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-bright);
      line-height: 1.2;
    }
    .sidebar-brand span {
      font-size: 11px;
      color: var(--text-muted);
      display: block;
    }
    .sidebar-nav { flex: 1; padding: 8px 0; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .nav-item:hover {
      color: var(--text);
      background: rgba(255,255,255,0.03);
    }
    .nav-item.active {
      color: var(--primary);
      background: rgba(79,195,247,0.08);
      border-left-color: var(--primary);
    }
    .nav-icon { font-size: 18px; width: 22px; text-align: center; }
    .sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-muted);
    }
    .sidebar-footer a { color: var(--primary); text-decoration: none; }
    .sidebar-footer a:hover { text-decoration: underline; }

    /* Main Content */
    .main {
      flex: 1;
      margin-left: 220px;
      padding: 24px;
      max-width: 1200px;
    }
    .page-header {
      margin-bottom: 24px;
    }
    .page-header h2 {
      font-size: 22px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 4px;
    }
    .page-header p {
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Cards */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .card-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .card-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-bright);
    }
    .card-value.small { font-size: 16px; font-weight: 600; }
    .card-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Health Bar */
    .health-bar-container {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .health-bar-label {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .health-bar {
      height: 24px;
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      background: #2a2a2a;
    }
    .health-bar .segment {
      height: 100%;
      transition: width 0.5s ease;
    }
    .health-bar .healthy { background: var(--success); }
    .health-bar .unhealthy { background: var(--danger); }
    .health-bar .circuit-open { background: var(--warning); }
    .health-bar-legend {
      display: flex;
      gap: 16px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 4px;
      vertical-align: middle;
    }

    /* Section */
    .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 12px;
    }

    /* Progress Bar */
    .progress-bar {
      height: 8px;
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
      overflow: hidden;
      margin: 8px 0;
    }
    .progress-bar .fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s;
      background: var(--primary);
    }
    .progress-bar .fill.high { background: var(--warning); }
    .progress-bar .fill.critical { background: var(--danger); }

    /* Table */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table th {
      text-align: left;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    .data-table th:hover { color: var(--text); }
    .data-table td {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      white-space: nowrap;
    }
    .data-table tr:hover td {
      background: rgba(255,255,255,0.02);
    }

    /* Status dots */
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
      vertical-align: middle;
    }
    .dot.green { background: var(--success); }
    .dot.red { background: var(--danger); }
    .dot.orange { background: var(--warning); }
    .dot.blue { background: var(--primary); }

    /* Badge */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-proxy { background: rgba(79,195,247,0.15); color: var(--primary); }
    .badge-route { background: rgba(255,167,38,0.15); color: var(--warning); }
    .badge-on { background: rgba(102,187,106,0.15); color: var(--success); }
    .badge-off { background: rgba(239,83,80,0.15); color: var(--danger); }

    /* Buttons */
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn:hover { background: var(--card-hover); border-color: var(--primary); }
    .btn-primary {
      background: var(--primary-dark);
      border-color: var(--primary-dark);
      color: white;
    }
    .btn-primary:hover { background: var(--primary); }
    .btn-danger {
      background: transparent;
      border-color: var(--danger);
      color: var(--danger);
    }
    .btn-danger:hover { background: rgba(239,83,80,0.1); }
    .btn-sm { padding: 4px 10px; font-size: 12px; }

    /* Forms */
    .form-group { margin-bottom: 16px; }
    .form-label {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .form-input {
      width: 100%;
      padding: 8px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 13px;
      font-family: inherit;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--primary);
    }
    select.form-input {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%239e9e9e' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 30px;
    }
    .toggle {
      position: relative;
      width: 40px;
      height: 22px;
      display: inline-block;
    }
    .toggle input { display: none; }
    .toggle-slider {
      position: absolute;
      inset: 0;
      background: var(--border);
      border-radius: 11px;
      cursor: pointer;
      transition: 0.2s;
    }
    .toggle-slider:before {
      content: "";
      position: absolute;
      width: 16px;
      height: 16px;
      left: 3px;
      top: 3px;
      background: white;
      border-radius: 50%;
      transition: 0.2s;
    }
    .toggle input:checked + .toggle-slider { background: var(--primary); }
    .toggle input:checked + .toggle-slider:before { transform: translateX(18px); }

    /* Radio cards */
    .radio-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
    }
    .radio-card {
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      background: var(--bg);
    }
    .radio-card:hover { border-color: var(--primary); }
    .radio-card.selected {
      border-color: var(--primary);
      background: rgba(79,195,247,0.06);
    }
    .radio-card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 4px;
    }
    .radio-card-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .radio-card .rec-badge {
      font-size: 9px;
      background: rgba(79,195,247,0.2);
      color: var(--primary);
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 6px;
    }

    /* Setup wizard */
    .wizard {
      max-width: 640px;
      margin: 0 auto;
    }
    .wizard-steps {
      display: flex;
      gap: 8px;
      margin-bottom: 32px;
    }
    .wizard-step {
      flex: 1;
      text-align: center;
      padding: 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      background: var(--card);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .wizard-step.active {
      background: rgba(79,195,247,0.1);
      color: var(--primary);
      border-color: var(--primary);
    }
    .wizard-step.done {
      background: rgba(102,187,106,0.1);
      color: var(--success);
      border-color: var(--success);
    }
    .wizard-body { margin-bottom: 24px; }
    .wizard-actions {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .wizard-result {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: "SF Mono", "Fira Code", monospace;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow-y: auto;
    }

    /* Moderation */
    .block-form {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-wrap: wrap;
    }
    .block-form .form-group { margin-bottom: 0; flex: 1; min-width: 120px; }

    /* Info card */
    .info-card {
      background: rgba(79,195,247,0.06);
      border: 1px solid rgba(79,195,247,0.2);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .info-card h3 {
      font-size: 14px;
      color: var(--primary);
      margin-bottom: 6px;
    }
    .info-card p {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Settings accordion */
    .accordion { margin-bottom: 24px; }
    .accordion-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .accordion-header:hover { background: var(--card-hover); }
    .accordion-header.open {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }
    .accordion-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-bright);
    }
    .accordion-chevron {
      color: var(--text-muted);
      transition: transform 0.2s;
    }
    .accordion-header.open .accordion-chevron { transform: rotate(180deg); }
    .accordion-body {
      display: none;
      padding: 16px;
      border: 1px solid var(--border);
      border-top: none;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }
    .accordion-header.open + .accordion-body { display: block; }
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .setting-row:last-child { border-bottom: none; }
    .setting-label {
      font-size: 13px;
      color: var(--text);
    }
    .setting-env {
      font-size: 11px;
      color: var(--text-muted);
      font-family: monospace;
    }
    .setting-value {
      font-size: 13px;
      color: var(--text-bright);
      text-align: right;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .sidebar { width: 60px; }
      .sidebar-brand h1, .sidebar-brand span, .nav-label, .sidebar-footer { display: none; }
      .sidebar-brand { justify-content: center; padding: 12px; }
      .nav-item { justify-content: center; padding: 12px; }
      .main { margin-left: 60px; padding: 16px; }
      .card-grid { grid-template-columns: 1fr 1fr; }
    }

    /* Auth screen */
    .auth-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      width: 100%;
    }
    .auth-box {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      width: 360px;
      text-align: center;
    }
    .auth-box h2 {
      font-size: 18px;
      color: var(--text-bright);
      margin-bottom: 8px;
    }
    .auth-box p {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 20px;
    }
    .auth-error {
      color: var(--danger);
      font-size: 12px;
      margin-top: 8px;
      display: none;
    }

    /* Spinner */
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 20px;
      font-size: 13px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    }
    .toast.success { border-color: var(--success); }
    .toast.error { border-color: var(--danger); }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    /* Page sections that are hidden by default */
    .page { display: none; }
    .page.active { display: block; }

    /* Time range selector */
    .time-range {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
    }
    .time-range button {
      padding: 4px 12px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
    }
    .time-range button.active {
      background: rgba(79,195,247,0.1);
      border-color: var(--primary);
      color: var(--primary);
    }
  `;
}

function clientJs(): string {
  return `
    const BASE = '/api';
    let authToken = localStorage.getItem('wayfinder_admin_token') || '';
    let currentPage = 'status';
    let statusInterval = null;
    let gatewaysInterval = null;
    let setupData = {
      baseDomain: '',
      port: 3000,
      rootHostContent: '',
      defaultMode: 'proxy',
      routingStrategy: 'temperature',
      gatewaySource: 'network',
      verificationEnabled: true,
      verificationSource: 'top-staked',
      verificationCount: 3,
      consensusThreshold: 2,
    };
    let wizardStep = 0;

    // Fetch wrapper with auth
    async function api(path, opts = {}) {
      const headers = { ...(opts.headers || {}) };
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      const res = await fetch(BASE + path, { ...opts, headers });
      if (res.status === 401) {
        showAuth();
        throw new Error('Unauthorized');
      }
      return res.json();
    }

    // Router
    function navigate(page) {
      currentPage = page;
      document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.page === page);
      });
      document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === 'page-' + page);
      });

      clearInterval(statusInterval);
      clearInterval(gatewaysInterval);

      if (page === 'status') loadStatus();
      else if (page === 'gateways') loadGateways();
      else if (page === 'telemetry') loadTelemetry();
      else if (page === 'moderation') loadModeration();
      else if (page === 'settings') loadSettings();
    }

    function showAuth() {
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
    }

    function hideAuth() {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
    }

    async function doLogin() {
      const input = document.getElementById('auth-input');
      authToken = input.value.trim();
      localStorage.setItem('wayfinder_admin_token', authToken);
      try {
        await api('/status');
        hideAuth();
        navigate('status');
      } catch(e) {
        document.getElementById('auth-error').style.display = 'block';
      }
    }

    function toast(msg, type = 'success') {
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatUptime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) return d + 'd ' + (h % 24) + 'h ' + (m % 60) + 'm';
      if (h > 0) return h + 'h ' + (m % 60) + 'm';
      return m + 'm ' + (s % 60) + 's';
    }

    function formatNumber(n) {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return String(n);
    }

    function pct(v) { return (v * 100).toFixed(1) + '%'; }

    // =========== STATUS PAGE ===========
    async function loadStatus() {
      try {
        const data = await api('/status');
        renderStatus(data);
        statusInterval = setInterval(async () => {
          try {
            const d = await api('/status');
            renderStatus(d);
          } catch(e) {}
        }, 10000);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('status-content').innerHTML = '<p style="color:var(--danger)">Failed to load status</p>';
      }
    }

    function renderStatus(d) {
      const el = document.getElementById('status-content');
      const gw = d.gateways || {};
      const cache = d.cache || {};
      const ping = d.ping || {};
      const total = gw.total || 0;
      const healthy = gw.healthy || 0;
      const unhealthy = gw.unhealthy || 0;
      const circuitOpen = gw.circuitOpen || 0;
      const healthyPct = total > 0 ? (healthy / total * 100) : 0;
      const unhealthyPct = total > 0 ? (unhealthy / total * 100) : 0;
      const circuitPct = total > 0 ? (circuitOpen / total * 100) : 0;
      const cacheUtil = cache.utilizationPercent || 0;
      const cacheClass = cacheUtil > 90 ? 'critical' : cacheUtil > 70 ? 'high' : '';

      el.innerHTML = \`
        <div class="card-grid">
          <div class="card">
            <div class="card-label">Uptime</div>
            <div class="card-value">\${formatUptime(d.uptimeMs || 0)}</div>
            <div class="card-sub"><span class="dot green"></span>Running</div>
          </div>
          <div class="card">
            <div class="card-label">Mode</div>
            <div class="card-value small"><span class="badge \${d.mode === 'proxy' ? 'badge-proxy' : 'badge-route'}">\${d.mode || 'proxy'}</span></div>
            <div class="card-sub">\${d.mode === 'proxy' ? 'Fetch, verify, serve' : 'Redirect to gateway'}</div>
          </div>
          <div class="card">
            <div class="card-label">Verification</div>
            <div class="card-value small"><span class="badge \${d.verificationEnabled ? 'badge-on' : 'badge-off'}">\${d.verificationEnabled ? 'Enabled' : 'Disabled'}</span></div>
            <div class="card-sub">\${d.verificationEnabled ? (d.verificationSource + ', ' + d.verificationCount + ' gateways') : 'Content served without verification'}</div>
          </div>
          <div class="card">
            <div class="card-label">Routing</div>
            <div class="card-value small">\${d.routingStrategy || 'temperature'}</div>
            <div class="card-sub">\${total} gateways tracked</div>
          </div>
        </div>

        <div class="health-bar-container">
          <div class="health-bar-label">Gateway Health</div>
          <div class="health-bar">
            <div class="segment healthy" style="width:\${healthyPct}%"></div>
            <div class="segment unhealthy" style="width:\${unhealthyPct}%"></div>
            <div class="segment circuit-open" style="width:\${circuitPct}%"></div>
          </div>
          <div class="health-bar-legend">
            <span><span class="legend-dot" style="background:var(--success)"></span>\${healthy} healthy</span>
            <span><span class="legend-dot" style="background:var(--danger)"></span>\${unhealthy} unhealthy</span>
            <span><span class="legend-dot" style="background:var(--warning)"></span>\${circuitOpen} circuit-open</span>
          </div>
        </div>

        <div class="card-grid">
          <div class="section" style="grid-column: span 2;">
            <div class="section-title">Content Cache</div>
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span>\${formatBytes(cache.sizeBytes || 0)} / \${formatBytes(cache.maxSizeBytes || 0)}</span>
              <span>\${cacheUtil.toFixed(1)}%</span>
            </div>
            <div class="progress-bar"><div class="fill \${cacheClass}" style="width:\${cacheUtil}%"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:8px;">
              <span>\${cache.entries || 0} entries</span>
              <span>Hit rate: \${cache.hitRate !== undefined ? pct(cache.hitRate) : 'N/A'}</span>
              <span>\${cache.diskBacked ? 'Disk-backed' : 'In-memory'}</span>
            </div>
          </div>
          <div class="section">
            <div class="section-title">Ping Service</div>
            \${ping.initialized ? \`
              <div style="font-size:13px;color:var(--text);">
                <p>Rounds: \${ping.roundsCompleted}</p>
                <p>Success: \${ping.successfulPings}/\${ping.totalPings}</p>
                \${ping.nextPingInMs ? '<p>Next in: ' + formatUptime(ping.nextPingInMs) + '</p>' : ''}
              </div>
            \` : '<div style="font-size:13px;color:var(--text-muted);">Not initialized</div>'}
          </div>
        </div>
      \`;
    }

    // =========== GATEWAYS PAGE ===========
    let gatewaySort = { col: 'gateway', asc: true };
    async function loadGateways() {
      try {
        const data = await api('/gateways');
        renderGateways(data);
        gatewaysInterval = setInterval(async () => {
          try {
            const d = await api('/gateways');
            renderGateways(d);
          } catch(e) {}
        }, 30000);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('gateways-content').innerHTML = '<p style="color:var(--danger)">Failed to load</p>';
      }
    }

    function sortGateways(gateways, col, asc) {
      return [...gateways].sort((a, b) => {
        let va = a[col], vb = b[col];
        if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return asc ? (va - vb) : (vb - va);
      });
    }

    function renderGateways(data) {
      const el = document.getElementById('gateways-content');
      const gateways = data.gateways || [];
      const sorted = sortGateways(gateways, gatewaySort.col, gatewaySort.asc);

      const arrow = (col) => gatewaySort.col === col ? (gatewaySort.asc ? ' \\u25B2' : ' \\u25BC') : '';

      el.innerHTML = \`
        <div class="section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div class="section-title" style="margin:0;">\${gateways.length} Gateways</div>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th onclick="sortGatewayCol('gateway')">Gateway\${arrow('gateway')}</th>
                  <th onclick="sortGatewayCol('health')">Health\${arrow('health')}</th>
                  <th onclick="sortGatewayCol('score')">Score\${arrow('score')}</th>
                  <th onclick="sortGatewayCol('latencyMs')">Latency\${arrow('latencyMs')}</th>
                  <th onclick="sortGatewayCol('successRate')">Success\${arrow('successRate')}</th>
                  <th onclick="sortGatewayCol('requests')">Requests\${arrow('requests')}</th>
                  <th onclick="sortGatewayCol('bytesServed')">Bytes\${arrow('bytesServed')}</th>
                </tr>
              </thead>
              <tbody>
                \${sorted.map(g => \`
                  <tr>
                    <td>\${g.gateway}</td>
                    <td><span class="dot \${g.health === 'healthy' ? 'green' : g.health === 'circuit-open' ? 'orange' : 'red'}"></span>\${g.health}</td>
                    <td>\${g.score !== null && g.score !== undefined ? g.score.toFixed(0) : '-'}</td>
                    <td>\${g.latencyMs !== null && g.latencyMs !== undefined ? g.latencyMs.toFixed(0) + 'ms' : '-'}</td>
                    <td>\${g.successRate !== null && g.successRate !== undefined ? pct(g.successRate) : '-'}</td>
                    <td>\${formatNumber(g.requests || 0)}</td>
                    <td>\${formatBytes(g.bytesServed || 0)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    function sortGatewayCol(col) {
      if (gatewaySort.col === col) gatewaySort.asc = !gatewaySort.asc;
      else { gatewaySort.col = col; gatewaySort.asc = true; }
      loadGateways();
    }

    // =========== TELEMETRY PAGE ===========
    let telemetryRange = '24h';
    async function loadTelemetry() {
      try {
        const data = await api('/telemetry?range=' + telemetryRange);
        renderTelemetry(data);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('telemetry-content').innerHTML = '<p style="color:var(--danger)">Failed to load</p>';
      }
    }

    function renderTelemetry(data) {
      const el = document.getElementById('telemetry-content');
      if (!data.enabled) {
        el.innerHTML = '<div class="info-card"><h3>Telemetry Disabled</h3><p>Set TELEMETRY_ENABLED=true to collect performance data.</p></div>';
        return;
      }
      const stats = data.gateways || [];
      const totals = data.totals || {};

      el.innerHTML = \`
        <div class="time-range">
          \${['1h','6h','24h','7d'].map(r => \`<button class="\${telemetryRange === r ? 'active' : ''}" onclick="telemetryRange='\${r}';loadTelemetry()">\${r}</button>\`).join('')}
        </div>
        <div class="card-grid">
          <div class="card">
            <div class="card-label">Total Requests</div>
            <div class="card-value">\${formatNumber(totals.totalRequests || 0)}</div>
          </div>
          <div class="card">
            <div class="card-label">Success Rate</div>
            <div class="card-value">\${totals.totalRequests ? pct((totals.successfulRequests || 0) / totals.totalRequests) : 'N/A'}</div>
          </div>
          <div class="card">
            <div class="card-label">Bytes Served</div>
            <div class="card-value">\${formatBytes(totals.totalBytesServed || 0)}</div>
          </div>
          <div class="card">
            <div class="card-label">Active Gateways</div>
            <div class="card-value">\${totals.activeGateways || 0}</div>
          </div>
        </div>
        <div class="section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div class="section-title" style="margin:0;">Gateway Performance</div>
            <button class="btn btn-sm" onclick="exportTelemetry()">Export CSV</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Gateway</th>
                  <th>Requests</th>
                  <th>Success</th>
                  <th>Avg Latency</th>
                  <th>P95 Latency</th>
                  <th>Bytes</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                \${stats.map(g => \`
                  <tr>
                    <td>\${g.gateway}</td>
                    <td>\${formatNumber(g.totalRequests || 0)}</td>
                    <td>\${g.successRate !== undefined ? pct(g.successRate) : '-'}</td>
                    <td>\${g.avgLatencyMs ? g.avgLatencyMs.toFixed(0) + 'ms' : '-'}</td>
                    <td>\${g.p95LatencyMs ? g.p95LatencyMs.toFixed(0) + 'ms' : '-'}</td>
                    <td>\${formatBytes(g.bytesServed || 0)}</td>
                    <td>\${g.availabilityRate !== undefined ? pct(g.availabilityRate) : '-'}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    async function exportTelemetry() {
      try {
        const res = await fetch('/wayfinder/stats/export?format=csv', {
          headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'telemetry-export.csv'; a.click();
        URL.revokeObjectURL(url);
        toast('Export downloaded');
      } catch(e) { toast('Export failed', 'error'); }
    }

    // =========== MODERATION PAGE ===========
    async function loadModeration() {
      try {
        const data = await api('/moderation');
        renderModeration(data);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('moderation-content').innerHTML = '<p style="color:var(--danger)">Failed to load</p>';
      }
    }

    function renderModeration(data) {
      const el = document.getElementById('moderation-content');
      if (!data.enabled) {
        el.innerHTML = \`
          <div class="info-card">
            <h3>Content Moderation Disabled</h3>
            <p>To enable content moderation, set these environment variables:<br><br>
            <code>MODERATION_ENABLED=true</code><br>
            <code>MODERATION_ADMIN_TOKEN=your-secret-token</code><br><br>
            Then restart the router.</p>
          </div>
        \`;
        return;
      }
      const stats = data.stats || {};
      const entries = data.entries || [];

      el.innerHTML = \`
        <div class="card-grid">
          <div class="card">
            <div class="card-label">Blocked ArNS Names</div>
            <div class="card-value">\${stats.arnsCount || 0}</div>
          </div>
          <div class="card">
            <div class="card-label">Blocked Transaction IDs</div>
            <div class="card-value">\${stats.txIdCount || 0}</div>
          </div>
          <div class="card">
            <div class="card-label">Total Entries</div>
            <div class="card-value">\${stats.totalEntries || 0}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Block Content</div>
          <div class="block-form">
            <div class="form-group">
              <label class="form-label">Type</label>
              <select class="form-input" id="block-type">
                <option value="arns">ArNS Name</option>
                <option value="txid">Transaction ID</option>
              </select>
            </div>
            <div class="form-group" style="flex:2;">
              <label class="form-label">Value</label>
              <input class="form-input" id="block-value" placeholder="e.g. my-arns-name or txId...">
            </div>
            <div class="form-group" style="flex:2;">
              <label class="form-label">Reason</label>
              <input class="form-input" id="block-reason" placeholder="Reason for blocking">
            </div>
            <button class="btn btn-primary" onclick="blockContent()">Block</button>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Blocklist</div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr><th>Type</th><th>Value</th><th>Reason</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                \${entries.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No blocked content</td></tr>' :
                  entries.map(e => \`
                    <tr>
                      <td><span class="badge \${e.type === 'arns' ? 'badge-proxy' : 'badge-route'}">\${e.type}</span></td>
                      <td style="font-family:monospace;font-size:12px;">\${e.value}</td>
                      <td>\${e.reason || '-'}</td>
                      <td>\${e.blockedAt ? new Date(e.blockedAt).toLocaleDateString() : '-'}</td>
                      <td><button class="btn btn-danger btn-sm" onclick="unblockContent('\${e.type}','\${e.value}')">Remove</button></td>
                    </tr>
                  \`).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      \`;
    }

    async function blockContent() {
      const type = document.getElementById('block-type').value;
      const value = document.getElementById('block-value').value.trim();
      const reason = document.getElementById('block-reason').value.trim();
      if (!value) return toast('Value is required', 'error');
      try {
        await api('/moderation/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, value, reason })
        });
        toast('Content blocked');
        loadModeration();
      } catch(e) { toast('Failed to block content', 'error'); }
    }

    async function unblockContent(type, value) {
      try {
        await api('/moderation/unblock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, value })
        });
        toast('Content unblocked');
        loadModeration();
      } catch(e) { toast('Failed to unblock', 'error'); }
    }

    // =========== SETTINGS PAGE ===========
    async function loadSettings() {
      try {
        const data = await api('/config');
        renderSettings(data);
      } catch(e) {
        if (e.message !== 'Unauthorized')
          document.getElementById('settings-content').innerHTML = '<p style="color:var(--danger)">Failed to load</p>';
      }
    }

    function settingRow(label, envVar, value) {
      let display = value;
      if (typeof value === 'boolean') display = value ? 'true' : 'false';
      else if (Array.isArray(value)) display = value.join(', ') || '(none)';
      else if (value === '' || value === null || value === undefined) display = '(not set)';
      return \`
        <div class="setting-row">
          <div>
            <div class="setting-label">\${label}</div>
            <div class="setting-env">\${envVar}</div>
          </div>
          <div class="setting-value">\${display}</div>
        </div>
      \`;
    }

    function accordion(title, content) {
      const id = 'acc-' + title.replace(/\\s+/g, '-').toLowerCase();
      return \`
        <div class="accordion">
          <div class="accordion-header" onclick="this.classList.toggle('open')">
            <span class="accordion-title">\${title}</span>
            <span class="accordion-chevron">\\u25BC</span>
          </div>
          <div class="accordion-body">\${content}</div>
        </div>
      \`;
    }

    function renderSettings(c) {
      const el = document.getElementById('settings-content');
      el.innerHTML = \`
        \${accordion('Server', \`
          \${settingRow('Port', 'PORT', c.server?.port)}
          \${settingRow('Host', 'HOST', c.server?.host)}
          \${settingRow('Base Domain', 'BASE_DOMAIN', c.server?.baseDomain)}
          \${settingRow('Root Host Content', 'ROOT_HOST_CONTENT', c.server?.rootHostContent)}
          \${settingRow('Restrict to Root Host', 'RESTRICT_TO_ROOT_HOST', c.server?.restrictToRootHost)}
          \${settingRow('GraphQL Proxy URL', 'GRAPHQL_PROXY_URL', c.server?.graphqlProxyUrl)}
        \`)}
        \${accordion('Mode', \`
          \${settingRow('Default Mode', 'DEFAULT_MODE', c.mode?.default)}
          \${settingRow('Allow Override', 'ALLOW_MODE_OVERRIDE', c.mode?.allowOverride)}
        \`)}
        \${accordion('Routing', \`
          \${settingRow('Strategy', 'ROUTING_STRATEGY', c.routing?.strategy)}
          \${settingRow('Gateway Source', 'ROUTING_GATEWAY_SOURCE', c.routing?.gatewaySource)}
          \${settingRow('Retry Attempts', 'RETRY_ATTEMPTS', c.routing?.retryAttempts)}
        \`)}
        \${accordion('Verification', \`
          \${settingRow('Enabled', 'VERIFICATION_ENABLED', c.verification?.enabled)}
          \${settingRow('Gateway Source', 'VERIFICATION_GATEWAY_SOURCE', c.verification?.gatewaySource)}
          \${settingRow('Gateway Count', 'VERIFICATION_GATEWAY_COUNT', c.verification?.gatewayCount)}
          \${settingRow('Consensus Threshold', 'ARNS_CONSENSUS_THRESHOLD', c.verification?.consensusThreshold)}
          \${settingRow('Retry Attempts', 'VERIFICATION_RETRY_ATTEMPTS', c.verification?.retryAttempts)}
        \`)}
        \${accordion('Cache', \`
          \${settingRow('Content Cache', 'CONTENT_CACHE_ENABLED', c.cache?.contentEnabled)}
          \${settingRow('Max Size', 'CONTENT_CACHE_MAX_SIZE_BYTES', c.cache?.contentMaxSizeBytes ? formatBytes(c.cache.contentMaxSizeBytes) : '(default)')}
          \${settingRow('Disk Path', 'CONTENT_CACHE_PATH', c.cache?.contentPath)}
          \${settingRow('ArNS TTL', 'ARNS_CACHE_TTL_MS', c.cache?.arnsTtlMs ? (c.cache.arnsTtlMs / 1000) + 's' : '')}
        \`)}
        \${accordion('Telemetry', \`
          \${settingRow('Enabled', 'TELEMETRY_ENABLED', c.telemetry?.enabled)}
          \${settingRow('Router ID', 'TELEMETRY_ROUTER_ID', c.telemetry?.routerId)}
          \${settingRow('Retention Days', 'TELEMETRY_RETENTION_DAYS', c.telemetry?.retentionDays)}
          \${settingRow('Sample (Success)', 'TELEMETRY_SAMPLE_SUCCESS', c.telemetry?.sampling?.successfulRequests)}
          \${settingRow('Sample (Errors)', 'TELEMETRY_SAMPLE_ERRORS', c.telemetry?.sampling?.errors)}
        \`)}
        \${accordion('Rate Limiting', \`
          \${settingRow('Enabled', 'RATE_LIMIT_ENABLED', c.rateLimit?.enabled)}
          \${settingRow('Window', 'RATE_LIMIT_WINDOW_MS', c.rateLimit?.windowMs ? (c.rateLimit.windowMs / 1000) + 's' : '')}
          \${settingRow('Max Requests', 'RATE_LIMIT_MAX_REQUESTS', c.rateLimit?.maxRequests)}
        \`)}
        \${accordion('HTTP', \`
          \${settingRow('Connections/Host', 'HTTP_CONNECTIONS_PER_HOST', c.http?.connectionsPerHost)}
          \${settingRow('Connect Timeout', 'HTTP_CONNECT_TIMEOUT_MS', c.http?.connectTimeoutMs ? (c.http.connectTimeoutMs / 1000) + 's' : '')}
          \${settingRow('Request Timeout', 'HTTP_REQUEST_TIMEOUT_MS', c.http?.requestTimeoutMs ? (c.http.requestTimeoutMs / 1000) + 's' : '')}
        \`)}
        \${accordion('Shutdown', \`
          \${settingRow('Drain Timeout', 'SHUTDOWN_DRAIN_TIMEOUT_MS', c.shutdown?.drainTimeoutMs ? (c.shutdown.drainTimeoutMs / 1000) + 's' : '')}
          \${settingRow('Shutdown Timeout', 'SHUTDOWN_TIMEOUT_MS', c.shutdown?.shutdownTimeoutMs ? (c.shutdown.shutdownTimeoutMs / 1000) + 's' : '')}
        \`)}
      \`;
    }

    // =========== SETUP WIZARD ===========
    function showSetup() {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-setup').classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      wizardStep = 0;
      renderWizard();
    }

    function renderWizard() {
      const steps = ['Domain', 'Routing', 'Verification'];
      const stepsHtml = steps.map((s, i) =>
        '<div class="wizard-step ' + (i === wizardStep ? 'active' : (i < wizardStep ? 'done' : '')) + '">' +
        (i < wizardStep ? '\\u2713 ' : '') + s + '</div>'
      ).join('');

      let body = '';
      if (wizardStep === 0) {
        body = \`
          <h3 style="font-size:16px;color:var(--text-bright);margin-bottom:4px;">Your Domain</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">This is the domain your router will serve content on. Subdomains will be used for ArNS name resolution.</p>
          <div class="form-group">
            <label class="form-label">Base Domain</label>
            <input class="form-input" id="wiz-domain" value="\${setupData.baseDomain}" placeholder="e.g. permaweb.nexus">
          </div>
          <div class="form-group">
            <label class="form-label">Port</label>
            <input class="form-input" id="wiz-port" type="number" value="\${setupData.port}">
          </div>
          <div class="form-group">
            <label class="form-label">Root Host Content (optional)</label>
            <input class="form-input" id="wiz-root" value="\${setupData.rootHostContent}" placeholder="ArNS name or txId to serve at root">
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Content to serve when users visit your base domain directly</div>
          </div>
        \`;
      } else if (wizardStep === 1) {
        body = \`
          <h3 style="font-size:16px;color:var(--text-bright);margin-bottom:4px;">Routing & Gateways</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Choose how your router fetches and delivers content from the ar.io network.</p>

          <div class="form-group">
            <label class="form-label">Operating Mode</label>
            <div class="radio-cards">
              <div class="radio-card \${setupData.defaultMode === 'proxy' ? 'selected' : ''}" onclick="setupData.defaultMode='proxy';renderWizard()">
                <div class="radio-card-title">Proxy<span class="rec-badge">Recommended</span></div>
                <div class="radio-card-desc">Fetch content from ar.io gateways, verify it, cache it, and serve it to your users</div>
              </div>
              <div class="radio-card \${setupData.defaultMode === 'route' ? 'selected' : ''}" onclick="setupData.defaultMode='route';renderWizard()">
                <div class="radio-card-title">Route</div>
                <div class="radio-card-desc">Redirect users directly to an ar.io gateway (lower resource usage, no caching)</div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Routing Strategy</label>
            <div class="radio-cards">
              <div class="radio-card \${setupData.routingStrategy === 'temperature' ? 'selected' : ''}" onclick="setupData.routingStrategy='temperature';renderWizard()">
                <div class="radio-card-title">Temperature<span class="rec-badge">Recommended</span></div>
                <div class="radio-card-desc">Learns which ar.io gateways perform best and routes traffic intelligently</div>
              </div>
              <div class="radio-card \${setupData.routingStrategy === 'fastest' ? 'selected' : ''}" onclick="setupData.routingStrategy='fastest';renderWizard()">
                <div class="radio-card-title">Fastest</div>
                <div class="radio-card-desc">Ping all gateways concurrently, use the first to respond</div>
              </div>
              <div class="radio-card \${setupData.routingStrategy === 'random' ? 'selected' : ''}" onclick="setupData.routingStrategy='random';renderWizard()">
                <div class="radio-card-title">Random</div>
                <div class="radio-card-desc">Random selection from healthy gateways</div>
              </div>
              <div class="radio-card \${setupData.routingStrategy === 'round-robin' ? 'selected' : ''}" onclick="setupData.routingStrategy='round-robin';renderWizard()">
                <div class="radio-card-title">Round Robin</div>
                <div class="radio-card-desc">Rotate through gateways sequentially</div>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Gateway Source</label>
            <div class="radio-cards">
              <div class="radio-card \${setupData.gatewaySource === 'network' ? 'selected' : ''}" onclick="setupData.gatewaySource='network';renderWizard()">
                <div class="radio-card-title">Network<span class="rec-badge">Recommended</span></div>
                <div class="radio-card-desc">Discovers all gateways from the ar.io registry automatically</div>
              </div>
              <div class="radio-card \${setupData.gatewaySource === 'trusted-peers' ? 'selected' : ''}" onclick="setupData.gatewaySource='trusted-peers';renderWizard()">
                <div class="radio-card-title">Trusted Peers</div>
                <div class="radio-card-desc">Use peers from a trusted gateway's peer list</div>
              </div>
              <div class="radio-card \${setupData.gatewaySource === 'static' ? 'selected' : ''}" onclick="setupData.gatewaySource='static';renderWizard()">
                <div class="radio-card-title">Static</div>
                <div class="radio-card-desc">Manually specify which gateways to use</div>
              </div>
            </div>
          </div>
        \`;
      } else if (wizardStep === 2) {
        body = \`
          <h3 style="font-size:16px;color:var(--text-bright);margin-bottom:4px;">Verification & Security</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Content verification ensures the data served is authentic by checking hashes against trusted ar.io gateways.</p>

          <div class="form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <label class="form-label" style="margin:0;">Enable Verification</label>
              <label class="toggle">
                <input type="checkbox" \${setupData.verificationEnabled ? 'checked' : ''} onchange="setupData.verificationEnabled=this.checked;renderWizard()">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Verify content hashes against trusted ar.io gateways before serving</div>
          </div>

          \${setupData.verificationEnabled ? \`
            <div class="form-group">
              <label class="form-label">Verification Source</label>
              <div class="radio-cards">
                <div class="radio-card \${setupData.verificationSource === 'top-staked' ? 'selected' : ''}" onclick="setupData.verificationSource='top-staked';renderWizard()">
                  <div class="radio-card-title">Top Staked<span class="rec-badge">Recommended</span></div>
                  <div class="radio-card-desc">Use the highest-staked ar.io gateways as trust anchors</div>
                </div>
                <div class="radio-card \${setupData.verificationSource === 'static' ? 'selected' : ''}" onclick="setupData.verificationSource='static';renderWizard()">
                  <div class="radio-card-title">Static</div>
                  <div class="radio-card-desc">Manually specify trusted gateways</div>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Verification Gateway Count (\${setupData.verificationCount})</label>
              <input type="range" min="1" max="5" value="\${setupData.verificationCount}" oninput="setupData.verificationCount=+this.value;renderWizard()" style="width:100%;">
            </div>

            <div class="form-group">
              <label class="form-label">ArNS Consensus Threshold (\${setupData.consensusThreshold})</label>
              <input type="range" min="2" max="3" value="\${setupData.consensusThreshold}" oninput="setupData.consensusThreshold=+this.value;renderWizard()" style="width:100%;">
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Minimum gateways that must agree on an ArNS resolution</div>
            </div>
          \` : ''}
        \`;
      } else {
        // Finish
        const env = generateEnv();
        body = \`
          <h3 style="font-size:16px;color:var(--text-bright);margin-bottom:4px;">Configuration Ready</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">Copy the configuration below to your .env file and restart the router.</p>
          <div class="wizard-result">\${env}</div>
          <div style="margin-top:12px;display:flex;gap:8px;">
            <button class="btn btn-primary" onclick="copyEnv()">Copy to Clipboard</button>
            <button class="btn" onclick="saveEnv()">Save to .env file</button>
          </div>
        \`;
      }

      document.getElementById('setup-content').innerHTML = \`
        <div class="wizard">
          <div class="wizard-steps">\${stepsHtml}</div>
          <div class="wizard-body">\${body}</div>
          <div class="wizard-actions">
            \${wizardStep > 0 && wizardStep <= 2 ? '<button class="btn" onclick="wizardBack()">Back</button>' : '<div></div>'}
            \${wizardStep < 3 ? '<button class="btn btn-primary" onclick="wizardNext()">Next</button>' : ''}
          </div>
        </div>
      \`;
    }

    function wizardNext() {
      if (wizardStep === 0) {
        const d = document.getElementById('wiz-domain');
        const p = document.getElementById('wiz-port');
        const r = document.getElementById('wiz-root');
        if (d) setupData.baseDomain = d.value.trim();
        if (p) setupData.port = parseInt(p.value) || 3000;
        if (r) setupData.rootHostContent = r.value.trim();
      }
      wizardStep++;
      renderWizard();
    }

    function wizardBack() {
      wizardStep--;
      renderWizard();
    }

    function generateEnv() {
      const lines = [
        '# Wayfinder Router Configuration',
        '# Generated by Setup Wizard',
        '',
        '# Server',
        'PORT=' + setupData.port,
        'HOST=0.0.0.0',
        'BASE_DOMAIN=' + setupData.baseDomain,
      ];
      if (setupData.rootHostContent) {
        lines.push('ROOT_HOST_CONTENT=' + setupData.rootHostContent);
      }
      lines.push('', '# Mode');
      lines.push('DEFAULT_MODE=' + setupData.defaultMode);
      lines.push('', '# Routing');
      lines.push('ROUTING_STRATEGY=' + setupData.routingStrategy);
      lines.push('ROUTING_GATEWAY_SOURCE=' + setupData.gatewaySource);
      lines.push('', '# Verification');
      lines.push('VERIFICATION_ENABLED=' + setupData.verificationEnabled);
      if (setupData.verificationEnabled) {
        lines.push('VERIFICATION_GATEWAY_SOURCE=' + setupData.verificationSource);
        lines.push('VERIFICATION_GATEWAY_COUNT=' + setupData.verificationCount);
        lines.push('ARNS_CONSENSUS_THRESHOLD=' + setupData.consensusThreshold);
      }
      lines.push('', '# Telemetry');
      lines.push('TELEMETRY_ENABLED=true');
      return lines.join('\\n');
    }

    function copyEnv() {
      navigator.clipboard.writeText(generateEnv()).then(() => toast('Copied to clipboard'));
    }

    async function saveEnv() {
      try {
        await api('/config/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ env: generateEnv() })
        });
        toast('Saved to .env - restart router to apply');
      } catch(e) { toast('Could not save .env file', 'error'); }
    }

    // =========== INIT ===========
    async function init() {
      try {
        const data = await api('/status');
        hideAuth();
        // Check if setup wizard should show
        if (data.needsSetup) {
          showSetup();
        } else {
          navigate('status');
        }
      } catch(e) {
        if (e.message === 'Unauthorized') {
          showAuth();
        } else {
          hideAuth();
          navigate('status');
        }
      }
    }

    document.addEventListener('DOMContentLoaded', init);
  `;
}

function brandSvg(): string {
  return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="13" stroke="${COLORS.primary}" stroke-width="2"/>
    <path d="M8 14 L14 8 L20 14 L14 20Z" fill="${COLORS.primary}" opacity="0.3"/>
    <circle cx="14" cy="14" r="3" fill="${COLORS.primary}"/>
    <line x1="14" y1="4" x2="14" y2="11" stroke="${COLORS.primary}" stroke-width="1.5"/>
    <line x1="14" y1="17" x2="14" y2="24" stroke="${COLORS.primary}" stroke-width="1.5"/>
    <line x1="4" y1="14" x2="11" y2="14" stroke="${COLORS.primary}" stroke-width="1.5"/>
    <line x1="17" y1="14" x2="24" y2="14" stroke="${COLORS.primary}" stroke-width="1.5"/>
  </svg>`;
}

export function renderAdminPage(version: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wayfinder Router Admin</title>
  <style>${css()}</style>
</head>
<body>
  <!-- Auth Screen -->
  <div id="auth-screen" class="auth-screen" style="display:none;">
    <div class="auth-box">
      ${brandSvg()}
      <h2 style="margin-top:16px;">Wayfinder Router</h2>
      <p>Enter your admin token to continue</p>
      <div class="form-group">
        <input class="form-input" id="auth-input" type="password" placeholder="Admin token" onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button class="btn btn-primary" style="width:100%;" onclick="doLogin()">Sign In</button>
      <div id="auth-error" class="auth-error">Invalid token. Please try again.</div>
    </div>
  </div>

  <!-- Main App -->
  <div id="app" style="display:flex;">
    <!-- Sidebar -->
    <nav class="sidebar">
      <div class="sidebar-brand">
        ${brandSvg()}
        <div>
          <h1>Wayfinder</h1>
          <span>Router Admin</span>
        </div>
      </div>
      <div class="sidebar-nav">
        <a class="nav-item active" data-page="status" onclick="navigate('status')">
          <span class="nav-icon">&#x25C9;</span>
          <span class="nav-label">Status</span>
        </a>
        <a class="nav-item" data-page="gateways" onclick="navigate('gateways')">
          <span class="nav-icon">&#x25CB;</span>
          <span class="nav-label">Gateways</span>
        </a>
        <a class="nav-item" data-page="telemetry" onclick="navigate('telemetry')">
          <span class="nav-icon">&#x25A0;</span>
          <span class="nav-label">Telemetry</span>
        </a>
        <a class="nav-item" data-page="moderation" onclick="navigate('moderation')">
          <span class="nav-icon">&#x25B2;</span>
          <span class="nav-label">Moderation</span>
        </a>
        <a class="nav-item" data-page="settings" onclick="navigate('settings')">
          <span class="nav-icon">&#x2699;</span>
          <span class="nav-label">Settings</span>
        </a>
      </div>
      <div class="sidebar-footer">
        Wayfinder v${version}<br>
        <a href="https://ar.io" target="_blank">ar.io network</a> &middot;
        <a href="https://docs.ar.io" target="_blank">docs</a>
      </div>
    </nav>

    <!-- Content Area -->
    <main class="main">
      <!-- Status Page -->
      <div id="page-status" class="page active">
        <div class="page-header">
          <h2>Status</h2>
          <p>Router health and performance overview</p>
        </div>
        <div id="status-content"><div class="spinner"></div></div>
      </div>

      <!-- Gateways Page -->
      <div id="page-gateways" class="page">
        <div class="page-header">
          <h2>Gateways</h2>
          <p>ar.io network gateway peers and health</p>
        </div>
        <div id="gateways-content"><div class="spinner"></div></div>
      </div>

      <!-- Telemetry Page -->
      <div id="page-telemetry" class="page">
        <div class="page-header">
          <h2>Telemetry</h2>
          <p>Request metrics and gateway performance</p>
        </div>
        <div id="telemetry-content"><div class="spinner"></div></div>
      </div>

      <!-- Moderation Page -->
      <div id="page-moderation" class="page">
        <div class="page-header">
          <h2>Moderation</h2>
          <p>Content blocking and moderation controls</p>
        </div>
        <div id="moderation-content"><div class="spinner"></div></div>
      </div>

      <!-- Settings Page -->
      <div id="page-settings" class="page">
        <div class="page-header">
          <h2>Settings</h2>
          <p>Current router configuration</p>
        </div>
        <div id="settings-content"><div class="spinner"></div></div>
      </div>

      <!-- Setup Wizard -->
      <div id="page-setup" class="page">
        <div class="page-header">
          <h2>Setup Wizard</h2>
          <p>Configure your Wayfinder Router for the ar.io network</p>
        </div>
        <div id="setup-content"></div>
      </div>
    </main>
  </div>

  <script>${clientJs()}</script>
</body>
</html>`;
}
