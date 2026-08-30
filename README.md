# Jewellery ERP

Offline-first jewellery retail ERP built with Electron + React + SQLite.

## Current development baseline

This checkpoint establishes the **multi-retailer / multi-tenant foundation**.

### Data isolation rule

Every retailer is a tenant. Users, branches, items, customers, rates, invoices,
payments, old-gold transactions, audit records, sync records and API keys are
scoped to a `tenant_id`.

The tenant is resolved by the backend from the authenticated user/API key. The
renderer is not trusted to choose a tenant.

### Development login

Default development tenant:

- Retailer code: `MAIN`
- Username: `admin`
- Password: `admin123`

Change the password before real use.

## Setup on a new machine

Use Node 22 LTS or newer supported by the current Electron toolchain.

```bash
npm install
npm run electron:dev
```

Do **not** include or copy `node_modules` between operating systems. Install
dependencies locally on the target Mac/Windows/Linux machine.

## Database

The local database is stored under Electron's `userData` directory:

`jewellery-erp.db`

The migration is additive for the existing single-retailer database: existing
records are assigned to the default `MAIN` tenant. Do not delete a production
database as part of a normal code update.

## Phase 0 security target

The backend must always derive:

`authenticated user -> tenant -> permitted branch -> role -> permission`

No renderer-supplied `tenant_id` is accepted as an authorization decision.

## Architecture safeguards — foundation checkpoint

This checkpoint establishes the offline-first multi-tenant foundation:

- Local SQLite remains the operational database and does not require internet access.
- Tenant identity is resolved from authenticated users; IPC/API callers cannot choose another tenant for reads or writes.
- Branch access is checked separately from tenant access.
- Schema migrations are recorded in `schema_migrations` so future releases can evolve the database without deleting customer data.
- SQLite uses WAL mode, foreign-key enforcement, a busy timeout, and normal synchronous durability.
- `stock_movements` provides a durable inventory-ledger foundation rather than relying only on an item's current status.
- `sync_queue` has lifecycle metadata (`status`, `attempts`, `last_error`, `synced_at`, `payload_hash`, `next_attempt_at`) for future asynchronous cloud synchronization.
- Backups use SQLite's online backup API and are integrity-checked; a SHA-256 sidecar is created for verification.
- Manual backup is permission-protected and audited.
- Future cloud/Google Drive backup should upload encrypted backup artifacts or tenant-scoped sync payloads; the cloud must never be the live SQLite database.

### Data-growth rules

Operational screens should use indexed search, filters, and pagination. Avoid loading entire tables into React. Large historical/audit datasets should eventually support archival/retention policies without deleting required financial history. New business tables must include tenant ownership and appropriate branch ownership where applicable.
