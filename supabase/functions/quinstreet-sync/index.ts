import { createClient } from "jsr:@supabase/supabase-js@2";

const AIRTABLE_API = "https://api.airtable.com/v0";
const API_OUTPUT_TABLE = "tblDen0WE7FOOh355";
const AFFILIATES_TABLE = "tbltKCAkgUwjTxZEC";
const QMP_REPORT_ID = "54210";

const FIELD_MAP = [
  "Advertiser", "Var2", "Total Earnings", "Applications", "Approvals", "Card Name",
  "Category", "Click Date", "Click Hour", "Click ID", "Click Key", "Click Time",
  "Clicks", "Conversion ID", "Country Code", "Device Type", "Exchange", "Impr.",
  "Source ID", "Source Name", "Credit Card Type Name", "Process Date",
  "Referring Session URL", "Search ID", "Searches", "Account", "State",
  "State Code", "Sub ID", "Trn_ID", "Var3",
];
const IDX_VAR2 = 1, IDX_CLICK_ID = 9, IDX_CLICK_KEY = 10;
const NUMERIC_FIELDS = new Set(["Total Earnings"]);

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const dateOrNull = (v: unknown) => { const s = String(v ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

async function getQmpToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch("https://reporting.qmp.ai/oauth/generatetoken?grant_type=client_credentials", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`), "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error(`QMP token failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getQmpReport(token: string, start: string, end: string): Promise<any[]> {
  const url = `https://reporting.qmp.ai/api/pub/download/${QMP_REPORT_ID}?startDate=${start}&endDate=${end}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`QMP report failed (${res.status}): ${await res.text()}`);
  return (await res.json())?.data?.records ?? [];
}

async function airtable(method: string, table: string, token: string, base: string, body?: unknown) {
  const res = await fetch(`${AIRTABLE_API}/${base}/${table}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function upsertPostgres(built: any[], source: string) {
  // QMP returns one row per status (click / application / approval) for the same
  // Click ID + Key — and a click can carry SEVERAL approval rows, each with its
  // own Conversion ID + Total Earnings. The table is unique on
  // (click_id, click_key, conv_key) where conv_key = coalesce(conversion_id,'').
  // So we keep ONE row per conversion (preserving each conversion's real gross)
  // rather than summing approvals into a single row. The click/application funnel
  // counts are folded onto the FIRST conversion row for a click, so non-approved
  // funnels stay a single row and nothing is double-counted.
  const num = (v: any) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
  const earnOf = (v: any) => typeof v === "number" ? v : (parseFloat(String(v ?? "").replace(/[$,]/g, "")) || 0);

  const byClick = new Map<string, any>();
  for (const b of built) {
    const f = b.fields;
    const ck = String(f["Click ID"] ?? ""), kk = String(f["Click Key"] ?? "");
    if (!ck && !kk) continue;
    const key = `${ck}|${kk}`;
    let g = byClick.get(key);
    if (!g) { g = { ck, kk, clicks: 0, apps: 0, base: f, anyConv: "", approvals: [] as any[] }; byClick.set(key, g); }
    g.clicks += num(f["Clicks"]);
    g.apps   += num(f["Applications"]);
    // QuinStreet also assigns a Conversion ID to APPLICATIONS, not just approvals,
    // and it can sit on any of the click's rows. Remember the first one we see so a
    // non-approved funnel keys on it consistently — keying off the click row (which
    // has no Conversion ID) would write a second row for a click already stored
    // under its application's id.
    if (!g.anyConv) {
      const rc = f["Conversion ID"] != null ? String(f["Conversion ID"]).trim() : "";
      if (rc) g.anyConv = rc;
    }
    const apprs = num(f["Approvals"]);
    if (apprs > 0) {
      const rawConv = f["Conversion ID"] != null ? String(f["Conversion ID"]).trim() : "";
      const earnEach = earnOf(f["Total Earnings"]) / apprs; // usually apprs=1 → full amount
      for (let i = 0; i < apprs; i++) {
        // Unique conversion key: the real Conversion ID, or a synthetic one when
        // QMP omits it, so distinct conversions never collide on the unique index.
        const convId = rawConv || `${ck}-${kk}-syn${g.approvals.length}`;
        g.approvals.push({ convId, earn: earnEach, fields: f });
      }
    }
  }

  const rows: any[] = [];
  for (const g of byClick.values()) {
    const shared = (f: any, extra: any) => ({
      click_id: g.ck, click_key: g.kk,
      item_name: f["Item Name"] ?? null,
      advertiser: f["Advertiser"] ?? null,
      card_name: f["Card Name"] ?? null,
      affiliate_id: f["Var2"] ?? null,
      click_date: dateOrNull(f["Click Date"]),
      process_date: dateOrNull(f["Process Date"]),
      source, fields: f,
      ...extra,
    });
    if (g.approvals.length === 0) {
      // Funnel only (click / application, no approval). Key on whichever row
      // carried a Conversion ID (the application), not the arbitrary first row.
      const f0 = g.base;
      rows.push(shared(f0, {
        conversion_id: g.anyConv || null,
        clicks: g.clicks ? String(g.clicks) : null,
        applications: g.apps ? String(g.apps) : null,
        approvals: null,
        total_earnings: null,
      }));
    } else {
      g.approvals.forEach((a: any, i: number) => {
        rows.push(shared(a.fields, {
          conversion_id: a.convId,
          // Funnel counts on the first conversion row only.
          clicks: i === 0 && g.clicks ? String(g.clicks) : null,
          applications: i === 0 && g.apps ? String(g.apps) : null,
          approvals: "1",
          total_earnings: a.earn || null,
        }));
      });
    }
  }

  let saved = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from("quinstreet_records").upsert(chunk, { onConflict: "click_id,click_key,conv_key" });
    if (error) throw new Error("pg upsert: " + error.message);
    saved += chunk.length;
  }
  return saved;
}

async function upsertApiOutput(records: any[], token: string, base: string) {
  // Keyed on Click ID + Click Key + Conversion ID — matching the Postgres
  // (click_id, click_key, conv_key) unique index. A click can legitimately carry
  // several conversion rows; keying on Click ID + Click Key alone collapses them
  // into one, which is also what made the old dedupe delete real rows (see
  // dedupeApiOutput below).
  let upserted = 0, failed = 0;
  const errors: string[] = [];
  const byKey = new Map<string, any>();
  const noKey: any[] = [];
  for (const r of records) {
    const ck = r.fields["Click ID"] ?? "", kk = r.fields["Click Key"] ?? "";
    if (!ck && !kk) { noKey.push(r); continue; }
    const convId = r.fields["Conversion ID"] != null ? String(r.fields["Conversion ID"]).trim() : "";
    byKey.set(`${ck}|${kk}|${convId}`, r);
  }
  const merged = [...byKey.values()];
  // Airtable rejects unknown field names, and performUpsert requires every
  // merge-on field present on every record (funnel-only rows have no
  // Conversion ID at all) — sanitize before sending, on top of the raw
  // `fields` used for the Postgres write and the byKey identity above.
  const forAirtable = (r: any) => {
    const f = { ...r.fields };
    delete f["Var2 Raw"];
    f["Conversion ID"] = f["Conversion ID"] != null ? String(f["Conversion ID"]).trim() : "";
    return { fields: f };
  };
  const sendUpsert = (batch: any[]) => airtable("PATCH", API_OUTPUT_TABLE, token, base, {
    performUpsert: { fieldsToMergeOn: ["Click ID", "Click Key", "Conversion ID"] }, typecast: true, records: batch.map(forAirtable),
  });
  for (let i = 0; i < merged.length; i += 10) {
    const batch = merged.slice(i, i + 10);
    const r = await sendUpsert(batch);
    if (r.ok) { upserted += batch.length; }
    else {
      for (const rec of batch) {
        const rr = await sendUpsert([rec]);
        if (rr.ok) upserted += 1;
        else { failed += 1; if (errors.length < 10) errors.push(`key=${rec.fields["Click ID"]}|${rec.fields["Click Key"]} -> ${rr.status} ${rr.body.slice(0, 160)}`); }
        await sleep(220);
      }
    }
    await sleep(220);
  }
  for (let i = 0; i < noKey.length; i += 10) {
    const batch = noKey.slice(i, i + 10);
    const r = await airtable("POST", API_OUTPUT_TABLE, token, base, { typecast: true, records: batch.map(forAirtable) });
    if (r.ok) upserted += batch.length;
    else { failed += batch.length; if (errors.length < 10) errors.push(`create -> ${r.status} ${r.body.slice(0, 160)}`); }
    await sleep(220);
  }
  return { upserted, failed, errors };
}

async function listAllKeys(token: string, base: string) {
  // Identity matches upsertApiOutput / Postgres: Click ID + Click Key + Conversion
  // ID. Grouping on Click ID + Click Key alone (the old behavior) treats every
  // legitimate per-conversion row on the same click as a "duplicate" and deletes
  // all but one — do not regress this.
  let offset: string | undefined;
  const out: { id: string; key: string; created: string }[] = [];
  do {
    const url = new URL(`${AIRTABLE_API}/${base}/${API_OUTPUT_TABLE}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", "Click ID");
    url.searchParams.append("fields[]", "Click Key");
    url.searchParams.append("fields[]", "Conversion ID");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`list (${res.status}): ${await res.text()}`);
    const j = await res.json();
    for (const rec of j.records ?? []) {
      const ck = rec.fields["Click ID"] ?? "", kk = rec.fields["Click Key"] ?? "";
      if (!ck && !kk) continue;
      const convId = rec.fields["Conversion ID"] != null ? String(rec.fields["Conversion ID"]).trim() : "";
      out.push({ id: rec.id, key: `${ck}|${kk}|${convId}`, created: rec.createdTime });
    }
    offset = j.offset;
    await sleep(210);
  } while (offset);
  return out;
}

async function dedupeApiOutput(token: string, base: string, maxDeletes: number) {
  const all = await listAllKeys(token, base);
  const groups = new Map<string, { id: string; created: string }[]>();
  for (const r of all) { const g = groups.get(r.key) ?? []; g.push({ id: r.id, created: r.created }); groups.set(r.key, g); }
  const toDelete: string[] = [];
  let dupKeys = 0;
  for (const g of groups.values()) {
    if (g.length > 1) { dupKeys++; g.sort((a, b) => b.created.localeCompare(a.created)); for (const x of g.slice(1)) toDelete.push(x.id); }
  }
  const slice = toDelete.slice(0, maxDeletes);
  let deleted = 0;
  for (let i = 0; i < slice.length; i += 10) {
    const ids = slice.slice(i, i + 10);
    const url = new URL(`${AIRTABLE_API}/${base}/${API_OUTPUT_TABLE}`);
    for (const id of ids) url.searchParams.append("records[]", id);
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) deleted += ids.length;
    await sleep(220);
  }
  return { scanned: all.length, duplicateKeys: dupKeys, deletable: toDelete.length, deleted, remaining: toDelete.length - deleted };
}

async function loadMap() {
  const { data, error } = await sb.from("affiliate_map").select("ezrxref, affiliate_id");
  if (error) throw new Error("loadMap: " + error.message);
  const map: Record<string, string> = {};
  const knownIds = new Set<string>();
  for (const row of data ?? []) { map[String(row.ezrxref).trim()] = String(row.affiliate_id).trim(); knownIds.add(String(row.affiliate_id).trim()); }
  return { map, knownIds, unknownId: map["ezrxref-0"] ?? "Unknown" };
}

async function refreshMapFromAirtable(token: string, base: string) {
  let offset: string | undefined;
  const rows: any[] = [];
  do {
    const url = new URL(`${AIRTABLE_API}/${base}/${AFFILIATES_TABLE}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", "Affiliate-ID");
    url.searchParams.append("fields[]", "ezrxref-");
    url.searchParams.append("fields[]", "Member Name");
    url.searchParams.set("filterByFormula", "NOT({ezrxref-} = '')");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Affiliates fetch (${res.status}): ${await res.text()}`);
    const j = await res.json();
    for (const rec of j.records ?? []) {
      const ez = String(rec.fields["ezrxref-"] ?? "").trim();
      const aid = String(rec.fields["Affiliate-ID"] ?? "").trim();
      if (ez && aid) rows.push({ ezrxref: ez, affiliate_id: aid, member_name: rec.fields["Member Name"] ?? null, airtable_record_id: rec.id });
    }
    offset = j.offset;
  } while (offset);
  if (rows.length) {
    const { error } = await sb.from("affiliate_map").upsert(rows, { onConflict: "ezrxref" });
    if (error) throw new Error("refreshMap upsert: " + error.message);
  }
  return rows.length;
}

async function pushMapping(m: { ezrxref: string; affiliate_id: string; member_name?: string }, token: string, base: string) {
  const { error } = await sb.from("affiliate_map").upsert({ ezrxref: m.ezrxref, affiliate_id: m.affiliate_id, member_name: m.member_name ?? null }, { onConflict: "ezrxref" });
  if (error) throw new Error("pg upsert: " + error.message);
  const r = await airtable("PATCH", AFFILIATES_TABLE, token, base, {
    performUpsert: { fieldsToMergeOn: ["ezrxref-"] }, typecast: true,
    records: [{ fields: { "ezrxref-": m.ezrxref, "Affiliate-ID": m.affiliate_id } }],
  });
  if (!r.ok) throw new Error(`Airtable affiliate upsert (${r.status}): ${r.body.slice(0, 300)}`);
  return true;
}

function buildRecord(rec: any[], map: Record<string, string>, knownIds: Set<string>, unknownId: string) {
  const fields: Record<string, unknown> = {};
  for (let i = 0; i < FIELD_MAP.length; i++) {
    const name = FIELD_MAP[i];
    let val: unknown = rec[i];
    if (val === null || val === undefined || val === "") continue;
    if (NUMERIC_FIELDS.has(name)) { const n = parseFloat(String(val).replace(/[$,]/g, "")); if (!isFinite(n)) continue; val = n; }
    else val = String(val);
    fields[name] = val;
  }
  const rawVar2 = String(rec[IDX_VAR2] ?? "").trim();
  fields["Var2 Raw"] = rawVar2;
  let var2: string;
  if (map[rawVar2]) var2 = map[rawVar2];
  else if (knownIds.has(rawVar2) || rawVar2.startsWith("ai-")) var2 = rawVar2;
  else var2 = unknownId;
  fields["Var2"] = var2;
  const clickId = String(rec[IDX_CLICK_ID] ?? "");
  const clickKey = String(rec[IDX_CLICK_KEY] ?? "");
  if (clickId || clickKey) fields["Item Name"] = "UN-" + clickId.slice(-2) + clickKey.slice(-4);
  fields["Click ID"] = clickId;
  fields["Click Key"] = clickKey;
  return { fields };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-trigger-secret", "access-control-allow-methods": "GET, POST, OPTIONS" } });
  }
  let cfg: Record<string, string>;
  try { const { data, error } = await sb.rpc("get_quinstreet_config"); if (error) throw error; cfg = data as Record<string, string>; }
  catch (e) { return json({ ok: false, error: "config load failed: " + String(e) }, 500); }

  const url = new URL(req.url);
  const provided = req.headers.get("x-trigger-secret") ?? url.searchParams.get("secret") ?? "";
  if (provided !== cfg.quinstreet_trigger_secret) return json({ ok: false, error: "unauthorized" }, 401);

  const airToken = cfg.airtable_token;
  const base = cfg.airtable_base_id;
  const action = url.searchParams.get("action") ?? "sync";
  const isDryRun = action === "sync" && url.searchParams.get("dryRun") === "1";
  const hasPat = airToken && !airToken.startsWith("REPLACE_");
  const noPatActions = new Set(["status", "records"]);
  const needsPat = !(isDryRun || noPatActions.has(action));
  if (needsPat && !hasPat) return json({ ok: false, error: "AIRTABLE_PAT not set in Vault (secret 'airtable_token')." }, 400);

  try {
    if (action === "records") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 1000);
      let q = sb.from("quinstreet_records").select("*").order("updated_at", { ascending: false }).limit(limit);
      const aff = url.searchParams.get("affiliate");
      if (aff) q = q.eq("affiliate_id", aff);
      const { data } = await q;
      return json({ ok: true, count: data?.length ?? 0, records: data });
    }
    if (action === "status") {
      const { data } = await sb.from("quinstreet_sync_log").select("*").order("id", { ascending: false }).limit(15);
      return json({ ok: true, runs: data });
    }
    if (action === "dedupe") {
      const maxDeletes = parseInt(url.searchParams.get("maxDeletes") ?? "1000", 10);
      return json({ ok: true, ...(await dedupeApiOutput(airToken, base, maxDeletes)) });
    }
    if (action === "map" && req.method === "GET") {
      const { data } = await sb.from("affiliate_map").select("*").order("ezrxref");
      return json({ ok: true, map: data });
    }
    if (action === "map" && req.method === "POST") {
      const body = await req.json();
      await pushMapping(body, airToken, base);
      return json({ ok: true, updated: body });
    }
    if (action === "refreshMap") { const n = await refreshMapFromAirtable(airToken, base); return json({ ok: true, refreshed: n }); }

    const source = url.searchParams.get("source") ?? "manual";
    const doMirror = url.searchParams.get("mirror") === "1"; // Airtable mirror OFF by default; opt in with mirror=1
    const days = parseInt(url.searchParams.get("days") ?? "3", 10);
    const today = new Date();
    const start = url.searchParams.get("startDate") ?? fmtDate(new Date(today.getTime() - days * 86400000));
    const end = url.searchParams.get("endDate") ?? fmtDate(today);

    const { data: logRow } = await sb.from("quinstreet_sync_log").insert({ start_date: start, end_date: end, source, status: "running" }).select("id").single();
    const logId = logRow?.id;

    if (hasPat) { try { await refreshMapFromAirtable(airToken, base); } catch (_) { /* fall back */ } }
    const { map, knownIds, unknownId } = await loadMap();

    const token = await getQmpToken(cfg.quinstreet_client_id, cfg.quinstreet_client_secret);
    const raw = await getQmpReport(token, start, end);
    const built = raw.map((r) => buildRecord(r, map, knownIds, unknownId));

    if (isDryRun) {
      await sb.from("quinstreet_sync_log").update({ finished_at: new Date().toISOString(), fetched: raw.length, upserted: 0, failed: 0, status: "success", error: "dryRun" }).eq("id", logId);
      return json({ ok: true, dryRun: true, range: { start, end }, fetched: raw.length, sample: built.slice(0, 3) });
    }

    const saved = await upsertPostgres(built, source);

    let mirror = { upserted: 0, failed: 0, errors: [] as string[] };
    let mirrorErr: string | null = null;
    if (!doMirror) { mirrorErr = "airtable mirror off (pass mirror=1 to enable)"; }
    else if (!hasPat) { mirrorErr = "airtable mirror skipped (no PAT)"; }
    else { try { mirror = await upsertApiOutput(built, airToken, base); } catch (e) { mirrorErr = "airtable mirror: " + String(e); } }

    const noteParts = [] as string[];
    if (mirror.errors.length) noteParts.push(mirror.errors.join(" | "));
    if (mirrorErr) noteParts.push(mirrorErr);

    await sb.from("quinstreet_sync_log").update({
      finished_at: new Date().toISOString(),
      fetched: raw.length, upserted: saved, failed: mirror.failed,
      status: "success", error: noteParts.length ? noteParts.join(" | ") : null,
    }).eq("id", logId);

    return json({ ok: true, source, range: { start, end }, fetched: raw.length, saved_to_site: saved, mirrored_to_airtable: mirror.upserted, airtable_failed: mirror.failed, notes: noteParts.length ? noteParts : undefined });
  } catch (e) {
    return json({ ok: false, action, error: String(e) }, 500);
  }
});
