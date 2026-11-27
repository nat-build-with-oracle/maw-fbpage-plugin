// maw fbpage: run a Facebook Page from the terminal through the Graph API.
//
//   maw fbpage info                                   name, id, followers, link
//   maw fbpage posts [--limit N]                      recent posts: time, comments, reactions, first line
//   maw fbpage comments [--unreplied] [--limit N|--all]  every comment, replies nested, PAGE marks ours
//   maw fbpage reply <comment_id> "<text>" [--dry] [--force]
//                                                     reply as the Page; refuses if the Page already replied
//   maw fbpage scheduled                              scheduled posts, soonest first
//   maw fbpage stats <video_id>                       lifetime video insights (views, watch time, ...)
//   --as <page> or PAGE=<page>                        token from `pass show facebook/<page>-page-token`
//   --pass <path>                                     use another pass entry
//
// The token is read from pass on every call and is never printed or stored. Output shows parsed fields only,
// never raw response bodies or paging URLs (they carry the token).
import { spawnSync } from "node:child_process";

type InvokeContext = { source: "cli" | string; args: string[] };
type PluginResult = { ok: boolean; output?: string; error?: string };

const API = "https://graph.facebook.com/v27.0";

const HELP = `maw fbpage — run a Facebook Page through the Graph API

  maw fbpage info                                  name, id, followers, link
  maw fbpage posts [--limit N]                     recent posts with comment and reaction counts
  maw fbpage comments [--unreplied] [--limit N|--all]  every comment on the last N posts (default 25), replies nested, PAGE marks ours
  maw fbpage reply <comment_id> "<text>" [--dry] [--force]
                                                   reply as the Page (refuses a second reply unless --force)
  maw fbpage scheduled                             scheduled posts, soonest first
  maw fbpage stats <video_id>                      lifetime video insights

  --as <page> or PAGE=<page>   token from pass facebook/<page>-page-token (required)
  --pass <path>                another pass entry
  token: read per call, never printed. Times are Bangkok.`;

export type Opts = { page: string; pass: string; limit: number; unreplied: boolean; dry: boolean; force: boolean; rest: string[] };

export function parse(args: string[]): Opts {
  const o: Opts = { page: process.env.PAGE || "", pass: "", limit: 25, unreplied: false, dry: false, force: false, rest: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--as") o.page = args[++i] ?? "";
    else if (a.startsWith("--as=")) o.page = a.slice(5);
    else if (a === "--pass") o.pass = args[++i] ?? "";
    else if (a === "--limit") o.limit = Number(args[++i] ?? 25) || 25; else if (a === "--all") o.limit = 100000;
    else if (a === "--unreplied") o.unreplied = true;
    else if (a === "--dry") o.dry = true;
    else if (a === "--force") o.force = true;
    else o.rest.push(a);
  }
  return o;
}

export const isId = (s: string | undefined) => !!s && /^\d+(_\d+)?$/.test(s);

export const bkk = (iso: string | number) =>
  new Date(typeof iso === "number" ? iso * 1000 : iso)
    .toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" })
    .slice(0, 16);

export const line1 = (s: string | undefined, n = 70) => (s ?? "").split("\n")[0]!.slice(0, n);

function token(o: Opts): string {
  const path = o.pass || `facebook/${o.page}-page-token`;
  const r = spawnSync("pass", ["show", path], { encoding: "utf8" });
  if (r.error) throw new Error(`cannot run pass: ${r.error.message}`);
  const t = (r.stdout ?? "").split("\n")[0]!.trim();
  if (r.status !== 0 || !t) throw new Error(`no token in pass at ${path}`);
  return t;
}

async function graph(tok: string, method: "GET" | "POST", path: string, params: Record<string, string | number> = {}): Promise<any> {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: tok });
  const res = method === "GET"
    ? await fetch(`${API}/${path}?${q}`)
    : await fetch(`${API}/${path}`, { method: "POST", body: q });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new Error(`graph ${res.status} code ${e.code ?? "?"}: ${String(e.message ?? "error").slice(0, 200)}`);
  }
  return json;
}

const fail = (msg: string): PluginResult => ({ ok: false, error: `maw fbpage: ${msg}` });

// every post (follows the "after" cursor, never prints paging URLs), every comment, replies nested under it
async function comments(tok: string, o: Opts): Promise<string> {
  const me = await graph(tok, "GET", "me", { fields: "id,name" });
  const fields = "id,created_time,message,comments.limit(100).summary(true){id,from,message,created_time,comments.limit(100){id,from,message,created_time}}";
  const posts: any[] = [];
  let after = "";
  while (posts.length < o.limit) {
    const page = await graph(tok, "GET", "me/posts", { fields, limit: Math.min(25, o.limit - posts.length), ...(after ? { after } : {}) });
    posts.push(...(page.data ?? []));
    after = page.paging?.cursors?.after ?? "";
    if (!page.paging?.next || !after) break;
  }
  const who = (f: any) => (f?.id === me.id ? "PAGE  " : "viewer");
  const out: string[] = [];
  let open = 0, viewer = 0, ours = 0;
  for (const p of posts) {
    const cs: any[] = p.comments?.data ?? [];
    const rows = cs.map((c) => {
      const reps: any[] = c.comments?.data ?? [];
      const mine = c.from?.id === me.id;
      const replied = mine || reps.some((r) => r.from?.id === me.id);
      return { c, reps, mine, replied };
    }).filter((x) => !o.unreplied || !x.replied);
    for (const x of rows) {
      if (x.mine) ours++; else { viewer++; if (!x.replied) open++; }
      ours += x.reps.filter((r) => r.from?.id === me.id).length;
    }
    if (!rows.length) continue;
    out.push(`\n${bkk(p.created_time)}  ${p.id}  ${line1(p.message, 50)}`);
    for (const { c, reps, mine, replied } of rows) {
      const tag = mine ? "PAGE  " : replied ? "viewer replied" : "viewer OPEN   ";
      out.push(`  ${tag}  ${bkk(c.created_time)}  ${c.id}\n      ${line1(c.message, 100)}`);
      for (const r of reps) out.push(`    └ ${who(r.from)}  ${bkk(r.created_time)}  ${r.id}\n        ${line1(r.message, 100)}`);
    }
  }
  out.push(`\n${posts.length} posts · ${viewer} viewer comment(s), ${open} unreplied · ${ours} by ${me.name}`);
  return out.join("\n").trim();
}

export async function handler(ctx: InvokeContext): Promise<PluginResult> {
  const args = ctx.source === "cli" ? (ctx.args ?? []) : [];
  if (!args.length || args.some((a) => a === "-h" || a === "--help") || args[0] === "help") return { ok: true, output: HELP };
  const o = parse(args);
  if (!o.page && !o.pass) return fail("which Page? add --as <page> or PAGE=<page> (e.g. yaisai)");
  const [verb, a, b] = o.rest;

  try {
    if (verb === "reply") {
      if (!isId(a) || !b) return fail('usage: maw fbpage reply <comment_id> "<text>" [--dry] [--force]');
      const tok = token(o);
      const me = await graph(tok, "GET", "me", { fields: "id,name" });
      const reps = (await graph(tok, "GET", `${a}/comments`, { fields: "from" })).data ?? [];
      if (!o.force && reps.some((r: any) => r.from?.id === me.id)) return fail(`${me.name} already replied to ${a} (use --force for a second reply)`);
      if (o.dry) return { ok: true, output: `dry: would reply to ${a} as ${me.name}: ${b}` };
      const r = await graph(tok, "POST", `${a}/comments`, { message: b });
      return { ok: true, output: `replied as ${me.name} (id: ${r.id})` };
    }
    if (verb === "stats") {
      if (!isId(a)) return fail("usage: maw fbpage stats <video_id>");
      const d = (await graph(token(o), "GET", `${a}/video_insights`, { period: "lifetime" })).data ?? [];
      return { ok: true, output: d.map((m: any) => `${m.name.padEnd(42)} ${JSON.stringify(m.values?.[0]?.value)}`).join("\n") || "no insights" };
    }
    const tok = token(o);
    if (verb === "info") {
      const p = await graph(tok, "GET", "me", { fields: "id,name,followers_count,fan_count,link" });
      return { ok: true, output: `${p.name}\n  id ${p.id}\n  followers ${p.followers_count ?? "?"} · likes ${p.fan_count ?? "?"}\n  ${p.link ?? ""}` };
    }
    if (verb === "posts") {
      const d = (await graph(tok, "GET", "me/posts", {
        fields: "id,created_time,message,comments.limit(0).summary(true),reactions.limit(0).summary(true)", limit: o.limit,
      })).data ?? [];
      return { ok: true, output: d.map((p: any) =>
        `${bkk(p.created_time)}  ${String(p.comments?.summary?.total_count ?? 0).padStart(3)}c ${String(p.reactions?.summary?.total_count ?? 0).padStart(3)}r  ${p.id}  ${line1(p.message, 50)}`).join("\n") || "no posts" };
    }
    if (verb === "comments") return { ok: true, output: await comments(tok, o) };
    if (verb === "scheduled") {
      const d = (await graph(tok, "GET", "me/scheduled_posts", { fields: "id,scheduled_publish_time,message", limit: 100 })).data ?? [];
      d.sort((x: any, y: any) => Number(x.scheduled_publish_time) - Number(y.scheduled_publish_time));
      return { ok: true, output: d.map((p: any) => `${bkk(Number(p.scheduled_publish_time))}  ${p.id}  ${line1(p.message, 50)}`).concat(`${d.length} scheduled`).join("\n") };
    }
    return fail(`unknown command: ${verb} (maw fbpage --help)`);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export default handler;

if (import.meta.main) {
  const result = await handler({ source: "cli", args: process.argv.slice(2) });
  if (result.output) console.log(result.output);
  if (result.error) console.error(result.error);
  process.exit(result.ok ? 0 : 1);
}
