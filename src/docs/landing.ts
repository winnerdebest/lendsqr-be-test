import { env } from '../config/env';

export function renderLandingPageHtml(dbConnected: boolean, dbLatencyMs: number): string {
  const statusColor = dbConnected ? '#39CD62' : '#E4033B';
  const statusLabel = dbConnected ? 'All Systems Operational' : 'Database Degraded';
  const karmaConfigured = Boolean(env.ADJUTOR_API_KEY && env.ADJUTOR_API_KEY.trim().length > 0);
  const paystackConfigured = Boolean(env.PAYSTACK_SECRET_KEY && env.PAYSTACK_SECRET_KEY.trim().length > 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lendsqr Wallet Service — Full-Stack / DevOps Assessment</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --navy: #213F7D;
      --teal: #39CDCC;
      --slate: #545F7D;
      --bg: #FBFBFB;
      --white: #FFFFFF;
      --success: #39CD62;
      --warning: #E9B200;
      --danger: #E4033B;
      --border: rgba(33, 63, 125, 0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Work Sans', 'Avenir Next', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg);
      color: var(--slate);
      line-height: 1.6;
    }
    .topbar {
      background: var(--white);
      border-bottom: 1px solid var(--border);
      padding: 1.1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 12px rgba(33, 63, 125, 0.04);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 700;
      font-size: 1.35rem;
      color: var(--navy);
      text-decoration: none;
      letter-spacing: -0.02em;
    }
    .brand-badge {
      background: rgba(57, 205, 204, 0.14);
      color: var(--navy);
      border: 1px solid var(--teal);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--white);
      border: 1px solid var(--border);
      padding: 0.4rem 0.9rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--navy);
    }
    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: ${statusColor};
      box-shadow: 0 0 0 4px ${dbConnected ? 'rgba(57, 205, 98, 0.18)' : 'rgba(228, 3, 59, 0.18)'};
    }
    .container {
      max-width: 1080px;
      margin: 2.5rem auto;
      padding: 0 1.5rem;
    }
    .hero {
      background: linear-gradient(135deg, #213F7D 0%, #162B56 100%);
      color: var(--white);
      border-radius: 12px;
      padding: 2.75rem 2.5rem;
      box-shadow: 0 12px 32px rgba(33, 63, 125, 0.14);
      margin-bottom: 2rem;
    }
    .hero h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      letter-spacing: -0.02em;
    }
    .hero p {
      color: rgba(255, 255, 255, 0.86);
      max-width: 740px;
      font-size: 1.02rem;
      margin-bottom: 1.75rem;
    }
    .cta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.9rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.4rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.92rem;
      text-decoration: none;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .btn:hover { transform: translateY(-1px); opacity: 0.95; }
    .btn-primary {
      background: var(--teal);
      color: #0E234B;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.12);
      color: var(--white);
      border: 1px solid rgba(255, 255, 255, 0.25);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.4rem;
      box-shadow: 0 4px 16px rgba(33, 63, 125, 0.03);
    }
    .card-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
      color: var(--slate);
      margin-bottom: 0.4rem;
    }
    .card-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--navy);
      margin-bottom: 0.35rem;
    }
    .card-desc {
      font-size: 0.86rem;
      color: var(--slate);
    }
    .table-card {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.75rem;
      box-shadow: 0 4px 16px rgba(33, 63, 125, 0.03);
    }
    .table-card h2 {
      color: var(--navy);
      font-size: 1.2rem;
      margin-bottom: 1rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th, td {
      text-align: left;
      padding: 0.75rem 0.9rem;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--navy);
      font-weight: 600;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    code {
      font-family: 'JetBrains Mono', Consolas, monospace;
      background: rgba(33, 63, 125, 0.06);
      color: var(--navy);
      padding: 0.18rem 0.45rem;
      border-radius: 4px;
      font-size: 0.84rem;
    }
    .method {
      display: inline-block;
      font-weight: 700;
      font-size: 0.74rem;
      padding: 0.18rem 0.5rem;
      border-radius: 4px;
      min-width: 58px;
      text-align: center;
    }
    .m-post { background: rgba(57, 205, 204, 0.18); color: #0F5E5E; }
    .m-get { background: rgba(33, 63, 125, 0.12); color: var(--navy); }
    .m-patch { background: rgba(233, 178, 0, 0.18); color: #7C5E00; }
    .m-delete { background: rgba(228, 3, 59, 0.14); color: var(--danger); }
    footer {
      text-align: center;
      margin: 2.5rem 0;
      font-size: 0.85rem;
      color: var(--slate);
    }
  </style>
</head>
<body>
  <header class="topbar">
    <a href="/" class="brand">
      <span>lendsqr</span>
      <span class="brand-badge">Wallet & Ledger API v1</span>
    </a>
    <div class="status-pill">
      <span class="status-dot"></span>
      <span>${statusLabel} (${dbLatencyMs}ms)</span>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <h1>Lendsqr Wallet & Double-Entry Ledger Service</h1>
      <p>
        Built by <strong>Winner OrluVictor</strong> for the Lendsqr Full-Stack / DevOps Engineer Assessment.
        Engineered with Node.js, TypeScript, Express, PostgreSQL, pessimistic row-level locking,
        idempotency replay protection, Lendsqr Adjutor Karma blacklist checks, and Paystack funding.
      </p>
      <div class="cta-row">
        <a href="/docs" class="btn btn-primary">Explore Interactive Swagger Docs &rarr;</a>
        <a href="/health" class="btn btn-secondary">JSON Health Check (/health)</a>
        <a href="/docs.json" class="btn btn-secondary">OpenAPI 3.0 Spec (/docs.json)</a>
      </div>
    </section>

    <section class="grid">
      <div class="card">
        <div class="card-label">Concurrency & Safety</div>
        <div class="card-value">Row-Locked ACID</div>
        <div class="card-desc">Deterministic <code>ORDER BY id FOR UPDATE</code> locking prevents race conditions & deadlocks.</div>
      </div>
      <div class="card">
        <div class="card-label">Monetary Precision</div>
        <div class="card-value">BIGINT Kobo + Ledger</div>
        <div class="card-desc">Zero floating-point math. Every balance update writes balanced debit & credit ledger entries.</div>
      </div>
      <div class="card">
        <div class="card-label">Blacklist Verification</div>
        <div class="card-value">${karmaConfigured ? 'Karma + Local DB' : 'Local DB Ready'}</div>
        <div class="card-desc">Checks Lendsqr Adjutor Karma API (<code>Karma Lookup</code>) and local blacklist at onboarding.</div>
      </div>
      <div class="card">
        <div class="card-label">Wallet Funding</div>
        <div class="card-value">${paystackConfigured ? 'Paystack + Sim' : 'Simulated + Paystack'}</div>
        <div class="card-desc">Idempotent funding via Paystack test mode checkout/webhook or instant simulated deposit.</div>
      </div>
    </section>

    <section class="table-card">
      <h2>Core API Endpoints</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Auth / Headers</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="method m-post">POST</span></td>
            <td><code>/v1/auth/register</code></td>
            <td>Public</td>
            <td>Onboard user + NGN wallet after local & Adjutor Karma blacklist check</td>
          </tr>
          <tr>
            <td><span class="method m-post">POST</span></td>
            <td><code>/v1/auth/login</code></td>
            <td>Public</td>
            <td>Authenticate active user and issue JWT</td>
          </tr>
          <tr>
            <td><span class="method m-get">GET</span></td>
            <td><code>/v1/users/me</code></td>
            <td><code>Bearer JWT</code></td>
            <td>Current user profile & wallet summary</td>
          </tr>
          <tr>
            <td><span class="method m-get">GET</span></td>
            <td><code>/v1/wallets/me</code></td>
            <td><code>Bearer JWT</code></td>
            <td>Wallet balance & live double-entry ledger reconciliation</td>
          </tr>
          <tr>
            <td><span class="method m-post">POST</span></td>
            <td><code>/v1/wallets/fund</code></td>
            <td><code>Bearer JWT</code> + <code>Idempotency-Key</code></td>
            <td>Fund wallet via Paystack test mode or instant simulation</td>
          </tr>
          <tr>
            <td><span class="method m-post">POST</span></td>
            <td><code>/v1/transfers</code></td>
            <td><code>Bearer JWT</code> + <code>Idempotency-Key</code></td>
            <td>Atomic row-locked Wallet A &rarr; Wallet B transfer</td>
          </tr>
          <tr>
            <td><span class="method m-get">GET</span></td>
            <td><code>/v1/transactions</code></td>
            <td><code>Bearer JWT</code></td>
            <td>Paginated transaction history with filters</td>
          </tr>
          <tr>
            <td><span class="method m-patch">PATCH</span></td>
            <td><code>/v1/admin/users/:id/block</code></td>
            <td><code>x-admin-key</code></td>
            <td>Block user account with audited reason</td>
          </tr>
          <tr>
            <td><span class="method m-patch">PATCH</span></td>
            <td><code>/v1/admin/users/:id/unblock</code></td>
            <td><code>x-admin-key</code></td>
            <td>Unblock user account with audited reason</td>
          </tr>
          <tr>
            <td><span class="method m-post">POST</span></td>
            <td><code>/v1/admin/blacklist</code></td>
            <td><code>x-admin-key</code></td>
            <td>Add identity to local blacklist</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>

  <footer>
    Lendsqr Backend Engineering Assessment &middot; Winner OrluVictor
  </footer>
</body>
</html>`;
}

export function renderSwaggerDocsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Documentation — Lendsqr Wallet Service</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      background: #FBFBFB;
      font-family: 'Work Sans', 'Avenir Next', -apple-system, sans-serif;
    }
    .lsq-header {
      background: #213F7D;
      color: #FFFFFF;
      padding: 0.9rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #39CDCC;
    }
    .lsq-header a {
      color: #FFFFFF;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.92rem;
    }
    .lsq-brand {
      font-size: 1.2rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .lsq-pill {
      background: #39CDCC;
      color: #0E234B;
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title {
      color: #213F7D;
      font-family: 'Work Sans', sans-serif;
    }
    .swagger-ui .btn.authorize {
      color: #213F7D;
      border-color: #39CDCC;
    }
    .swagger-ui .btn.execute {
      background-color: #213F7D;
      border-color: #213F7D;
    }
  </style>
</head>
<body>
  <div class="lsq-header">
    <div class="lsq-brand">
      <span>lendsqr</span>
      <span class="lsq-pill">OpenAPI 3.0 Explorer</span>
    </div>
    <div>
      <a href="/">&larr; Back to Service Dashboard</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '/docs.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true
      });
    };
  </script>
</body>
</html>`;
}
