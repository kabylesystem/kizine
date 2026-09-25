import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

function load<T>(file: string, tag: string): T[] {
  const xml = readFileSync(file, "utf8").replace(/^﻿/, "");
  const doc = parser.parse(xml) as { TABLE: Record<string, T | T[]> };
  const node = doc.TABLE[tag];
  return Array.isArray(node) ? node : node ? [node] : [];
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return "";
  return String(v).trim();
};

export interface CiqualFood {
  code: string;
  nameFr: string;
  nameEn: string;
  grp: string;
  ssgrp: string;
  ssssgrp: string;
}

export interface CiqualConst {
  code: string;
  nameFr: string;
  infoods: string;
}

export const CONST = {
  energyKcal: "328",
  energyKj: "327",
  protein: "25000",
  carb: "31000",
  sugar: "32000",
  fat: "40000",
  satFat: "40302",
  fiber: "34100",
  salt: "10004",
  water: "400",
  calcium: "10110",
  iron: "10260",
  magnesium: "10120",
  potassium: "10200",
  zinc: "10300",
  vitaminC: "55100",
  vitaminD: "52200",
  vitaminB12: "56310",
  folate: "56600",
} as const;

export interface CiqualDb {
  foods: Map<string, CiqualFood>;
  constituents: Map<string, CiqualConst>;
  compo: Map<string, Map<string, { value: number; confidence: string }>>;
  groupLabel: Map<string, string>;
}

function parseTeneur(rawValue: string): number | null {
  if (!rawValue) return null;
  const cleaned = rawValue.replace(/</g, "").replace(/,/g, ".").replace(/\s|traces/gi, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function loadCiqual(dir: string): CiqualDb {
  const rawFoods = load<Record<string, unknown>>(`${dir}/666252.xml`, "ALIM");
  const rawConsts = load<Record<string, unknown>>(`${dir}/666246.xml`, "CONST");
  const rawGroups = load<Record<string, unknown>>(`${dir}/666250.xml`, "ALIM_GRP");
  const rawCompo = load<Record<string, unknown>>(`${dir}/666249.xml`, "COMPO");

  const foods = new Map<string, CiqualFood>();
  for (const f of rawFoods) {
    const code = cell(f["alim_code"]);
    foods.set(code, {
      code,
      nameFr: cell(f["alim_nom_fr"]),
      nameEn: cell(f["alim_nom_eng"]),
      grp: cell(f["alim_grp_code"]),
      ssgrp: cell(f["alim_ssgrp_code"]),
      ssssgrp: cell(f["alim_ssssgrp_code"]),
    });
  }

  const constituents = new Map<string, CiqualConst>();
  for (const c of rawConsts) {
    const code = cell(c["const_code"]);
    constituents.set(code, {
      code,
      nameFr: cell(c["const_nom_fr"]),
      infoods: cell(c["code_INFOODS"]),
    });
  }

  const groupLabel = new Map<string, string>();
  for (const g of rawGroups) {
    groupLabel.set(cell(g["alim_grp_code"]), cell(g["alim_grp_nom_fr"]));
    const ss = cell(g["alim_ssgrp_code"]);
    if (ss) groupLabel.set(ss, cell(g["alim_ssgrp_nom_fr"]));
    const sss = cell(g["alim_ssssgrp_code"]);
    if (sss && sss !== "000000") groupLabel.set(sss, cell(g["alim_ssssgrp_nom_fr"]));
  }

  const compo = new Map<string, Map<string, { value: number; confidence: string }>>();
  for (const row of rawCompo) {
    const alim = cell(row["alim_code"]);
    const constCode = cell(row["const_code"]);
    const value = parseTeneur(cell(row["teneur"]));
    if (value === null) continue;
    let bucket = compo.get(alim);
    if (!bucket) {
      bucket = new Map();
      compo.set(alim, bucket);
    }
    bucket.set(constCode, { value, confidence: cell(row["code_confiance"]) || "?" });
  }

  return { foods, constituents, compo, groupLabel };
}

export interface CiqualNutrients {
  kcal: number | null;
  protein: number | null;
  carb: number | null;
  sugar: number | null;
  fat: number | null;
  satFat: number | null;
  fiber: number | null;
  salt: number | null;
  confidence: string;
  micros: Record<string, number | null>;
}

export function nutrientsOf(dbx: CiqualDb, code: string): CiqualNutrients {
  const bucket = dbx.compo.get(code);
  const get = (c: string): number | null => bucket?.get(c)?.value ?? null;
  return {
    kcal: get(CONST.energyKcal),
    protein: get(CONST.protein),
    carb: get(CONST.carb),
    sugar: get(CONST.sugar),
    fat: get(CONST.fat),
    satFat: get(CONST.satFat),
    fiber: get(CONST.fiber),
    salt: get(CONST.salt),
    confidence: bucket?.get(CONST.energyKcal)?.confidence ?? "?",
    micros: {
      calcium: get(CONST.calcium),
      iron: get(CONST.iron),
      magnesium: get(CONST.magnesium),
      potassium: get(CONST.potassium),
      zinc: get(CONST.zinc),
      vitaminC: get(CONST.vitaminC),
      vitaminD: get(CONST.vitaminD),
      vitaminB12: get(CONST.vitaminB12),
      folate: get(CONST.folate),
    },
  };
}

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/** Matches a term at a word boundary so "oeuf" does not match "boeuf". */
export const hasTerm = (haystack: string, term: string): boolean => {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(term, from);
    if (i === -1) return false;
    const before = i === 0 ? " " : haystack[i - 1]!;
    if (!/[a-z0-9]/.test(before)) return true;
    from = i + 1;
  }
};
