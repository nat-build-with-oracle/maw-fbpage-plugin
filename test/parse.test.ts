import { expect, test } from "bun:test";
import { bkk, handler, isId, line1, parse } from "../src/index";

test("parse flags", () => {
  const o = parse(["--as", "yaisai", "comments", "--unreplied", "--limit", "5"]);
  expect(o.page).toBe("yaisai");
  expect(o.unreplied).toBe(true);
  expect(o.limit).toBe(5);
  expect(o.rest).toEqual(["comments"]);
});

test("no Page is an error, never a default Page", async () => {
  const old = process.env.PAGE; delete process.env.PAGE;
  const r = await handler({ source: "cli", args: ["info"] });
  if (old !== undefined) process.env.PAGE = old;
  expect(r.ok).toBe(false);
  expect(r.error).toContain("which Page");
});

test("bad comment id is refused before any network call", async () => {
  const r = await handler({ source: "cli", args: ["--as", "x", "reply", "abc", "hi"] });
  expect(r.ok).toBe(false);
  expect(r.error).toContain("usage");
});

test("ids, Bangkok time, first line", () => {
  expect(isId("122095000197569430_4721050578131663")).toBe(true);
  expect(isId("12a")).toBe(false);
  expect(bkk("2026-11-26T03:50:00+0000")).toBe("2026-11-26 10:50");
  expect(line1("hello\nworld")).toBe("hello");
});

test("help", async () => {
  const r = await handler({ source: "cli", args: [] });
  expect(r.output).toContain("maw fbpage");
});

test("--help after --as still prints help", async () => {
  const r = await handler({ source: "cli", args: ["--as", "yaisai", "--help"] });
  expect(r.ok).toBe(true);
  expect(r.output).toContain("maw fbpage");
});
