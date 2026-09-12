import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchQuery, keywordToFts } from "./worker.mjs";

function countPlaceholders(sql) {
  return (sql.match(/\?/g) || []).length;
}

test("empty keywords keeps one LIMIT bind", () => {
  const { sql, binds } = buildSearchQuery([], { limit: 20 });
  assert.equal(countPlaceholders(sql), 1);
  assert.deepEqual(binds, [20]);
  assert.match(sql, /FROM data /);
  assert.doesNotMatch(sql, /data_fts/);
  assert.doesNotMatch(sql, /_priority/);
});

test("each keyword is bound once for ranking", () => {
  const keywords = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const { sql, binds } = buildSearchQuery(keywords, { limit: 50 });
  assert.equal(countPlaceholders(sql), binds.length);
  assert.equal(binds.length, 1 + keywords.length + 1);
  assert.equal(binds.at(-1), 50);
  assert.ok(sql.includes("p.k0"));
  assert.ok(sql.includes("p.k7"));
  assert.match(sql, /JOIN data_fts/);
  assert.match(sql, /data_fts MATCH p\.q/);
  assert.match(sql, /SELECT data\.\*/);
});

test("author and year filters share the parameter subquery", () => {
  const { sql, binds } = buildSearchQuery(["力学"], {
    author: "张三",
    yearFrom: 2020,
    yearTo: 2025,
    limit: 10,
  });
  assert.equal(countPlaceholders(sql), binds.length);
  assert.equal(binds.at(-1), 10);
  assert.deepEqual(binds.slice(-3, -1), [2020, 2025]);
  assert.equal(binds[1], "力学");
  assert.match(binds[0], /力学/);
  assert.match(binds[0], /张三/);
  assert.match(sql, /data_fts MATCH p\.q/);
  assert.match(sql, /year >= \?/);
  assert.match(sql, /year <= \?/);
});

test("eight keywords stay well below D1's ~100 variable limit", () => {
  const { binds } = buildSearchQuery(["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"], { limit: 20 });
  assert.ok(binds.length < 20);
});

test("keywordToFts keeps two-character Chinese as one token", () => {
  assert.equal(keywordToFts("力学"), '"力学"');
});

test("keywordToFts expands longer Chinese into adjacent bigrams", () => {
  assert.equal(keywordToFts("静力学"), '("静力" + "力学")');
});

test("keywordToFts uses prefix match for Latin fragments", () => {
  assert.equal(keywordToFts("net"), "net*");
  assert.equal(keywordToFts("NetLogo"), "netlogo*");
});
