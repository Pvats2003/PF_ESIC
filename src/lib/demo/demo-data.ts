/**
 * Made-up demo data (no real clients). Deterministic: the same seed always
 * produces the same data, so screenshots and tests are stable.
 */
import { dueDateFor, type ISODate } from "@/lib/format/dates";

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIX = ["Shree", "Maa", "New", "Jai", "Om", "Sai", "Ganga", "Kosi", "Vikram", "Anand", "Durga", "Mithila", "Lakshmi", "Bharat", "Kaveri"];
const CORE = ["Ganesh", "Tara", "Saraswati", "Hanuman", "Laxmi", "Kali", "Shiv", "Ram", "Krishna", "Gauri", "Surya", "Vindhya", "Narmada", "Vaishali", "Champa"];
const SUFFIX = ["Engineering", "Construction", "Enterprises", "Electricals", "Grinding Works", "& Sons", "Traders", "Builders", "Fabricators", "Services"];
const OWNERS = ["Ramesh Prasad", "Sunita Devi", "Md. Arif", "Vinod Yadav", "Pooja Kumari", "Santosh Mandal", "Rakesh Sah", "Anil Paswan", "Neha Singh", "Manoj Choudhary", "Rekha Devi", "Ajay Kumar"];
const INSTITUTIONS = ["City Care Hospital", "Kosi Valley College", "Bharat Steel Pvt Ltd"];

export interface DemoClient {
  key: string;
  firmName: string;
  ownerName: string;
  phone: string;
  partnerCode: "A" | "R" | null;
  chargePaise: number;
  challanPayer: "us" | "client";
  language: "hi" | "en";
  pfCode: string;
  esicCode: string;
  esicVerified: boolean;
  basePf: number; // rupees
}

export interface DemoRecord {
  clientKey: string;
  month: ISODate;
  pfPaise: number | null;
  esicPaise: number | null;
  chargePaise: number;
  challanPayer: "us" | "client";
  dueDate: ISODate;
  partnerCode: "A" | "R" | null;
  legacySettled: boolean;
  challanPaidOn: ISODate | null;
  pfTrrn: string | null;
  paid: "none" | "part" | "full";
  notified: boolean;
}

export function buildDemoData(seed = 42, count = 38) {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const names = new Set<string>();
  const clients: DemoClient[] = [];

  for (let i = 0; i < count; i++) {
    let firm = i < INSTITUTIONS.length ? INSTITUTIONS[i] : `${pick(PREFIX)} ${pick(CORE)} ${pick(SUFFIX)}`;
    while (names.has(firm)) firm = `${pick(PREFIX)} ${pick(CORE)} ${pick(SUFFIX)}`;
    names.add(firm);
    const free = rnd() < 0.06;
    const charge = free ? 0 : pick([200, 300, 500, 500, 500, 800, 1000, 1000, 1500, 2000]) * 100;
    clients.push({
      key: `demo-${String(i + 1).padStart(2, "0")}`,
      firmName: firm,
      ownerName: pick(OWNERS),
      phone: `+919${String(Math.floor(rnd() * 1e9)).padStart(9, "0")}`,
      partnerCode: free ? null : rnd() < 0.78 ? "A" : "R",
      chargePaise: charge,
      challanPayer: rnd() < 0.15 ? "client" : "us",
      language: rnd() < 0.8 ? "hi" : "en",
      pfCode: `BRBHA${String(3500000 + Math.floor(rnd() * 99999)).padStart(7, "0")}000`,
      esicCode: `420021${String(Math.floor(rnd() * 1e7)).padStart(7, "0")}0001`,
      esicVerified: rnd() < 0.5,
      basePf: Math.round(1500 + rnd() * rnd() * 60000),
    });
  }

  const months: ISODate[] = ["2026-09-01", "2026-10-01", "2026-11-01"];
  const records: DemoRecord[] = [];
  for (const c of clients) {
    months.forEach((month, mi) => {
      const pf = Math.round(c.basePf * (0.9 + rnd() * 0.2));
      const esic = Math.round(pf * (0.14 + rnd() * 0.03));
      const entered = mi < 2 || rnd() < 0.6; // November is still being entered
      const legacy = mi === 0;
      const paid: DemoRecord["paid"] = legacy ? "full" : mi === 1 ? (rnd() < 0.8 ? "full" : rnd() < 0.5 ? "part" : "none") : entered && rnd() < 0.25 ? "full" : "none";
      const challanPaid = legacy || (mi === 1 && paid === "full" && rnd() < 0.9);
      records.push({
        clientKey: c.key,
        month,
        pfPaise: entered ? pf * 100 : null,
        esicPaise: entered ? esic * 100 : null,
        chargePaise: c.chargePaise,
        challanPayer: c.challanPayer,
        dueDate: dueDateFor(month, 15),
        partnerCode: c.partnerCode,
        legacySettled: legacy,
        challanPaidOn: challanPaid ? dueDateFor(month, 10 + Math.floor(rnd() * 5)) : null,
        pfTrrn: challanPaid ? String(3_000_000_000_000 + Math.floor(rnd() * 1e12)) : null,
        paid,
        notified: entered && (mi === 1 || rnd() < 0.5),
      });
    });
  }
  return { clients, records, months };
}
