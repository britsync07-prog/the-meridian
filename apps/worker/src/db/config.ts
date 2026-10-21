/**
 * The environment the Worker runs with, and the one place the database
 * identifier is resolved.
 *
 * OPS-14 requires the database identifier to be a *configuration value*. That
 * has two halves:
 *
 *   1. It must not be a constant in the code. It lives in the `d1_databases`
 *      binding of `apps/worker/wrangler.jsonc`.
 *   2. It must be overridable without touching that file either, so a staging
 *      database can be pointed at with an environment variable and no commit.
 *
 * `resolveDatabaseId` is the single indirection between the two. Every other
 * module asks this function where the database is, and never answers the
 * question for itself.
 */

/**
 * The D1 binding, plus the identifier the runtime surfaces on it.
 *
 * `__dbId` is the binding's configured database id. It is not part of the
 * published `D1Database` type, so it is declared here rather than cast at
 * every use site.
 *
 * It is also not guaranteed to exist: the Workers runtime exposes the D1
 * binding as an object with `alwaysPrimarySession` and `fetcher` on it, and
 * no identifier. The fallback is therefore best-effort — `MERIDIAN_DB_ID` is
 * the operative source, and the authoritative configuration value remains
 * the `database_id` of the `d1_databases` binding itself.
 */
export interface D1Binding extends D1Database {
  /** The configured database id, when the runtime surfaces it. */
  readonly __dbId?: string;
}

/** Everything the Worker reads from its environment. */
export interface MeridianEnv {
  /** The D1 binding. The only way to reach the datastore. */
  DB: D1Binding;
  /** The R2 binding. Created in plan 01-04. */
  R2: R2Bucket;
  /** The KV binding for feed polling state (ETag, Last-Modified, etc). */
  KV: KVNamespace;
  /**
   * An optional Worker text variable that overrides the binding's database
   * id. This is what makes "point the project at a different database" a
   * configuration change with no code edit and no config edit.
   */
  MERIDIAN_DB_ID?: string;
}

/**
 * Resolve the identifier of the database this Worker talks to.
 *
 * Resolution order:
 *   1. `MERIDIAN_DB_ID` — an explicit override, read from `.dev.vars` in
 *      local development or from a Worker variable in a deployment. Blank
 *      values are ignored, so an unset variable cannot blank the identifier.
 *   2. `DB.__dbId` — the identifier the `d1_databases` binding is configured
 *      with, when the runtime surfaces it.
 *   3. `''` — the identifier could not be determined. Callers that need it
 *      must treat this as a configuration error rather than proceeding.
 *
 * The authoritative configuration value is the `database_id` of the
 * `d1_databases` binding in `apps/worker/wrangler.jsonc`. This function only
 * reports it; it never decides where the datastore lives.
 */
export function resolveDatabaseId(env: MeridianEnv): string {
  const override = env.MERIDIAN_DB_ID?.trim();
  if (override && override.length > 0) return override;

  const fromBinding = env.DB?.__dbId?.trim();
  if (fromBinding && fromBinding.length > 0) return fromBinding;

  return '';
}
