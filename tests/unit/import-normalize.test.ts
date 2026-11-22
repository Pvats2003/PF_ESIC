import { describe, expect, it } from "vitest";
import { compactKey, isGenericTailVariant, isTypoVariant, normalizeName, splitNameAndService } from "@/lib/import/normalize";

describe("normalizeName", () => {
  it.each([
    ["UTTAM ENGG", "UTTAM ENGINEERING"],
    ["UTTAM ENGINEERING ", "UTTAM ENGINEERING"],
    ["BHOJALA MANDAL COLLAGE", "BHOJALA MANDAL COLLEGE"],
    ["SAMARPAN HOSPITA ", "SAMARPAN HOSPITAL"],
    ["SUNIIL KUMAR ", "SUNIL KUMAR"],
    ["MD. IRSHAD ALAM ", "MD IRSHAD ALAM"],
    ["HARSH MECH. INSIGHT ", "HARSH MECH INSIGHT"],
    ["K D YADAV & SONS", "K D YADAV AND SONS"],
    ["MAHTAB CONST.", "MAHTAB CONSTRUCTION"],
    ["MAHTAB CONTRACTION", "MAHTAB CONSTRUCTION"],
    ["Sharma Grinding Indus", "SHARMA GRINDING INDUSTRIES"],
    ["RAJESH KR MALAKAR", "RAJESH KUMAR MALAKAR"],
    ["3.Rajesh Kumar Paswan", "RAJESH KUMAR PASWAN"],
    ["1. Nirmala Enterprises", "NIRMALA ENTERPRISES"],
    ["RAJESH KUMAR `", "RAJESH KUMAR"],
  ])("%j → %s", (raw, out) => expect(normalizeName(raw)).toBe(out));

  it("treats missing spaces as the same name", () => {
    expect(compactKey("PankajKumar")).toBe(compactKey("PANKAJ KUMAR"));
    expect(compactKey("NAND LAL & SONS")).toBe(compactKey("NANDLAL AND SONS"));
  });
});

describe("similar-name rules never merge different people", () => {
  it.each([
    ["RAJESH KUMAR", "RAJESH KUMAR MALAKAR"],
    ["RAJESH KUMAR", "Rajesh Kumar Paswan"],
    ["RAJESH KUMAR MALAKAR", "Rajesh Kumar Paswan"],
    ["SUNIL KUMAR", "SUNIL AND SONS"],
    ["SUNIL KUMAR", "SUNIL ENTERPRISES"],
    ["SUNIL AND SONS", "SUNIL ENTERPRISES"],
    ["RAJ KUMAR", "RAJ ENGINEERING"],
    ["MAHTAB CONSTRUCTION", "MAHTAB & BROTHERS"],
    ["OM PRAKASH", "OM PRAKASH PASWAN"],
  ])("%s ≠ %s", (a, b) => {
    expect(compactKey(a)).not.toBe(compactKey(b));
    expect(isTypoVariant(a, b)).toBe(false);
    expect(isGenericTailVariant(a, b)).toBe(false);
  });

  it.each([
    ["BHOJALA MANDAL COLLAGE", "BHOJAL MANDAL COLLAGE"],
    ["KAILASH CHOUDHARY", "KAILASH CHAUDHARY"],
    ["PRADEEEP ENTERPRISES", "PRADEEP ENTERPRISES"],
    ["MD IRFAN AHAMAD ANSSRI", "MD IRFAN AHMAD ANSARI"],
    ["MD. BALAL AHMED", "Md. Balal Ahamad"],
  ])("%s ~ %s (suggested, needs approval)", (a, b) => expect(isTypoVariant(a, b)).toBe(true));

  it("RAJ ENGINEERING WORKS is RAJ ENGINEERING plus a generic word", () => {
    expect(isGenericTailVariant("RAJ ENGINEERING", "RAJ ENGINEERING WORKS ")).toBe(true);
    expect(isGenericTailVariant("SUNIL", "SUNIL AND SONS")).toBe(false);
  });
});

describe("splitNameAndService", () => {
  it.each([
    ["Md Irshad Alam PF & Esic Registration", "Md Irshad Alam", "PF & Esic Registration"],
    ["1. Nirmala Enterprises- Registration", "Nirmala Enterprises", "Registration"],
    ["SHRAWAN ELECTRICAL PF", "SHRAWAN ELECTRICAL", "PF"],
    ["RAJESH KUMAR MALAKAR", "RAJESH KUMAR MALAKAR", null],
    ["PF Claim", "PF Claim", null],
  ])("%j", (raw, name, service) => expect(splitNameAndService(raw)).toEqual({ name, service }));
});
