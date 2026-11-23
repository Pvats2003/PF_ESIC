import { describe, expect, it } from "vitest";
import { buildMessage, payByDate, reminderKind, type MessageSetup, type MonthFigures } from "@/lib/domain/messages";
import { addDays } from "@/lib/format/dates";

const SETUP: MessageSetup = {
  templates: {
    dues_we_pay: {
      hi: "नमस्ते {owner_name} जी,\n{firm_name} का {month} का PF/ESIC विवरण:\nPF: ₹{pf}\nESIC: ₹{esic}\nसेवा शुल्क: ₹{charge}\nकुल देय राशि: ₹{total_due}\nकृपया {pay_by} तक भुगतान करें।\n{business_name}",
      en: "Total payable: ₹{total_due} by {pay_by}. {business_name}",
    },
    challan_ready_client_pays: { en: "{month}: PF ₹{pf} ESIC ₹{esic}, pay before {due_date}. Our charge ₹{charge}" },
    overdue: { hi: "{firm_name} की ₹{balance} राशि बकाया है ({months})।" },
  },
  business: { name_en: "Rajeev Kumar Mishra", name_hi: "राजीव कुमार मिश्रा", phones: [], due_day: 15 },
};
const M: MonthFigures = {
  firm_name: "UTTAM ENGINEERING", owner_name: "Ramesh", wage_month: "2026-11-01", due_date: "2026-12-15", challan_payer: "us",
  pf_paise: 12_310_00, esic_paise: 1_931_00, charge_paise: 500_00, extras_paise: 0, owes: 14_741_00, overdue: false,
};

describe("reminders", () => {
  it("fills the Hindi 'we pay' template with Indian amounts and Hindi dates", () => {
    expect(buildMessage("dues_we_pay", M, SETUP, "hi")).toBe(
      "नमस्ते Ramesh जी,\nUTTAM ENGINEERING का नवंबर 2026 का PF/ESIC विवरण:\nPF: ₹12,310\nESIC: ₹1,931\nसेवा शुल्क: ₹500\nकुल देय राशि: ₹14,741\nकृपया 13 दिसंबर तक भुगतान करें।\nराजीव कुमार मिश्रा",
    );
  });
  it("asks for payment two days before the due date", () => {
    expect(payByDate("2026-12-15")).toBe("2026-12-13");
    expect(buildMessage("dues_we_pay", M, SETUP, "en")).toBe("Total payable: ₹14,741 by 13/12/2026. Rajeev Kumar Mishra");
  });
  it("client-pays months ask only for our charge", () => {
    expect(buildMessage("challan_ready_client_pays", { ...M, challan_payer: "client" }, SETUP, "en")).toBe("November 2026: PF ₹12,310 ESIC ₹1,931, pay before 15/12/2026. Our charge ₹500");
  });
  it("overdue lists the months and the balance", () => {
    expect(buildMessage("overdue", { ...M, overdue: true }, SETUP, "hi", { balancePaise: 3_200_00, months: ["2026-10-01", "2026-11-01"] }))
      .toBe("UTTAM ENGINEERING की ₹3,200 राशि बकाया है (अक्टूबर 2026, नवंबर 2026)।");
  });
  it("picks the right reminder", () => {
    expect(reminderKind({ overdue: true, owes: 1, challan_payer: "us" })).toBe("overdue");
    expect(reminderKind({ overdue: true, owes: 0, challan_payer: "client" })).toBe("challan_ready_client_pays");
    expect(reminderKind({ overdue: false, owes: 5, challan_payer: "us" })).toBe("dues_we_pay");
  });
});

it("addDays crosses months and years", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
});

describe("messages that need no amounts", () => {
  const setup = { templates: {}, business: { name_en: "Rajeev Kumar Mishra", name_hi: "राजीव कुमार मिश्रा", phones: [], due_day: 15 } };
  const m = { firm_name: "Uttam Engineering", firm_name_hi: null, owner_name: "Ramesh", wage_month: "2026-11-01" };
  it("asks for attendance and wages in either language", async () => {
    const { extraMessage } = await import("@/lib/domain/messages");
    expect(extraMessage("ask_details", m, setup, "en")).toContain("November 2026 attendance and wages for Uttam Engineering");
    expect(extraMessage("ask_details", m, setup, "hi")).toContain("नवंबर 2026 का हाज़िरी और वेतन विवरण");
    expect(extraMessage("free", m, setup, "hi")).toMatch(/^नमस्ते Ramesh जी,[\s\S]*राजीव कुमार मिश्रा$/);
  });
});
