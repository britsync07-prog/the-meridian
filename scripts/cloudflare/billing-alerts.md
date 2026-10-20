# Cloudflare billing alerts — configuration record

**D-04** protects the R2 bucket from ever billing by combining two mechanisms:
**Cloudflare budget alerts at 80% of each metered quota** and **lifecycle rules
on the two growing prefixes** (`raw/` at 7 days, `media/` at 12 months).

This file records the alerts: which quotas they cover, the exact dashboard
path, and — importantly — **what they can and cannot do**.

---

## The honest caveat, first

**Cloudflare budget alerts are informational only. They notify; they do not
cap usage.** Cloudflare's own wording is that the alert "does not cap your
usage or impact your account in any way." Two further limits apply:

- **Usage is processed once per day, for the prior day's activity.** An alert
  fires the *day after* a threshold is reached, not in real time.
- **Budget alerts are spend-threshold based, not percentage-of-quota based.**
  The "80% of each metered quota" thresholds below are therefore a *target to
  set against the metered usage Cloudflare's dashboard reports*, not a
  percentage the dashboard can be asked to watch for.

**The real cap on storage growth is the lifecycle rule set**, created by
`scripts/cloudflare/r2-lifecycle.mjs` and proven by
`scripts/cloudflare/verify-lifecycle.mjs`. The lifecycle rules delete objects,
so GB-months and Class A/B operations stay inside the free allowance **by
construction** — which no alert can do.

**The percentage-of-ceiling alerts (50% and 75%) belong to the Phase 7 audit
Worker (OPS-03)**, which reads the same registry — `config/free-tier-limits.json`
— and measures each ceiling against observed usage. That is the actual
ceiling-crossing signal, and it is a Phase 7 deliverable, not a dashboard
setting.

---

## The metered quotas to alert on

Each row names the **quota id** from `config/free-tier-limits.json`. The
threshold is the point at which an alert should be set, expressed as a share
of the registry's value. **The numeric value lives in the registry and is not
repeated here** — a ceiling written into two places is a ceiling that has
already drifted.

| Quota id | Product | Alert at | Note |
|----------|---------|----------|------|
| `r2_storage_gb_month` | R2 storage | 80% of the registry value | The bucket's growth is capped by the lifecycle rules; this alert is the second line of defence. |
| `r2_class_a_ops_per_month` | R2 Class A operations | 80% of the registry value | Writes and lists. The feed ingest is the bulk of it. |
| `r2_class_b_ops_per_month` | R2 Class B operations | 80% of the registry value | Reads and heads. The serve-time image check (D-18) adds one read per image view. |
| `workers_requests_per_day` | Workers requests | 80% of the registry value | The story tier is the only tier that spends them; static asset requests are free and unlimited. |
| `d1_rows_read_per_day` | D1 rows read | 80% of the registry value | D1 bills rows *scanned*, so a missing index shows up here. |
| `d1_rows_written_per_day` | D1 rows written | 80% of the registry value | Physical rows, including index amplification. |
| `d1_storage_mb_per_database` | D1 storage per database | 80% of the registry value | The single-database topology (ADR 0002) makes this one number to watch. |
| `kv_writes_per_day` | KV writes to different keys | 80% of the registry value | KV is a small hot cache, not a page cache. |
| `brevo_emails_per_day` | Brevo daily sends | 80% of the registry value | The newsletter's daily ceiling. |
| `open_meteo_calls_per_day` | Open-Meteo daily calls | 80% of the registry value | Calls are cached; the count is small. |
| `static_asset_files_per_project` | Static asset files per project | 80% of the registry value | The per-shard file budget. The Phase 7 audit Worker's percentage alert is the real tripwire here. |

The registry is the only legal home for a ceiling value. Reading a number out
of this table instead of `limit('<quota id>')` in
`shared/config/free-tier-limits.ts` would reintroduce the drift that the
OPS-01 scan exists to prevent — and the scan covers this directory.

---

## The exact dashboard path

**Cloudflare Dashboard → Manage Account → Billing → Billable Usage → Budget
Alerts**

For each quota in the table above:

1. Open **Manage Account → Billing → Billable Usage**.
2. Select the **Budget Alerts** control and create a new alert.
3. Set the **notification threshold** to the metered usage figure that
   corresponds to 80% of the registry's value for that quota id.
4. Set the **notification frequency** to daily. Cloudflare processes usage
   once per day for the prior day's activity, so a shorter frequency does not
   produce an earlier alert.
5. Set the **recipient** to the account's own email address.

### Confirm the R2 bucket

**Cloudflare Dashboard → R2 Object Storage → bucket list**

The bucket named `meridian` must appear. It was created by
`scripts/cloudflare/r2-lifecycle.mjs`, and its two lifecycle rules are proven
by `scripts/cloudflare/verify-lifecycle.mjs`.

---

## Recipients, until a domain exists

**No custom domain exists yet (D-10).** The domain is bought only after the
site earns revenue, so until then:

- **Alert recipients and the billing contact are the account's own email
  address.** There is no project-specific address to use, because there is no
  domain to host one.
- **The budget alerts do not reach a domain-bound address.** This is recorded
  rather than worked around: the alerts are informational, and the mechanism
  that actually protects the budget — the lifecycle rules — is on the bucket
  and needs no recipient at all.

---

## What to check, and when

| When | What | How |
|------|------|-----|
| Every deploy | The bucket still carries exactly two prefix-scoped lifecycle rules | `node scripts/cloudflare/verify-lifecycle.mjs` |
| Every deploy | The bucket's live rule listing has no empty-prefix rule | The same script — it exits non-zero on one |
| Monthly | Each metered quota's usage against the registry | Cloudflare Dashboard → Billing → Billable Usage |
| Phase 7 | Percentage-of-ceiling alerts at 50% and 75% | The audit Worker (OPS-03), reading `config/free-tier-limits.json` |
| After a domain exists | Move the alert recipients to a domain-bound address | Phase 7, with the domain migration (D-14) |

---

## References

- `config/free-tier-limits.json` — the registry, and the only legal home for a
  ceiling value.
- `shared/config/free-tier-limits.ts` — the only module permitted to read a
  ceiling.
- `scripts/cloudflare/r2-lifecycle.mjs` — the idempotent creator for the two
  lifecycle rules. **This is the real cap.**
- `scripts/cloudflare/verify-lifecycle.mjs` — the live proof that no rule can
  match the `og/` prefix or the bucket root.
- `docs/adr/0005-free-tier-ceiling-and-no-spend.md` — the standing no-spend
  decision (D-05) and the same honesty about what alerts can do.
- `docs/adr/0001-delivery-model.md` — the delivery model, including the eight
  static shards.
- `.planning/phases/01-foundation-free-tier-contract-architecture-decisions/01-CONTEXT.md`
  — D-04, D-05, D-10, D-15, D-19.
