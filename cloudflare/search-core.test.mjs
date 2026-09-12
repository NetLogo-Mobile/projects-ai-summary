import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeRecord, searchRecords, tokenizeKeywords } from "./search-core.mjs";

function fixture(overrides = {}) {
  return normalizeRecord({
    id: overrides.id || "a".repeat(24),
    name: overrides.name || "",
    userName: overrides.userName || "",
    editorName: overrides.editorName || "",
    year: overrides.year ?? 2024,
    readability: overrides.readability ?? 0.5,
    primaryDiscipline: overrides.primaryDiscipline || "[]",
    secondaryDiscipline: overrides.secondaryDiscipline || "[]",
    keyWords: overrides.keyWords || "[]",
    source: overrides.source || "",
    summary: overrides.summary || "",
  });
}

test("tokenizeKeywords splits on spaces and punctuation", () => {
  assert.deepEqual(tokenizeKeywords("力学, 电路 黑洞"), ["力学", "电路", "黑洞"]);
});

test("searchRecords ranks title hits above summary hits", () => {
  const titleHit = fixture({ id: "1".repeat(24), name: "力学入门", year: 2020 });
  const summaryHit = fixture({ id: "2".repeat(24), summary: "这是一篇关于力学的文章", year: 2025 });
  const results = searchRecords([summaryHit, titleHit], { keywords: ["力学"], limit: 10 });
  assert.equal(results[0].id, titleHit.id);
});

test("searchRecords requires every keyword to match", () => {
  const both = fixture({ id: "3".repeat(24), name: "量子力学", keyWords: '["黑洞"]' });
  const onlyOne = fixture({ id: "4".repeat(24), name: "量子计算" });
  const results = searchRecords([both, onlyOne], { keywords: ["量子", "黑洞"], limit: 10 });
  assert.deepEqual(results.map((row) => row.id), [both.id]);
});

test("searchRecords filters by author and year", () => {
  const target = fixture({ id: "5".repeat(24), userName: "张三", year: 2021 });
  const other = fixture({ id: "6".repeat(24), userName: "李四", year: 2021 });
  const results = searchRecords([target, other], { author: "张三", yearFrom: 2020, yearTo: 2022, limit: 10 });
  assert.deepEqual(results.map((row) => row.id), [target.id]);
});

test("searchRecords caps the limit at 50", () => {
  const many = Array.from({ length: 60 }, (_, index) =>
    fixture({ id: String(index).padStart(24, "0"), name: "力学" }),
  );
  const results = searchRecords(many, { keywords: ["力学"], limit: 999 });
  assert.equal(results.length, 50);
});
