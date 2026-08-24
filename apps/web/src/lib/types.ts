export interface EmergencyContact {
  id?: string;
  name: string;
  relationship?: string | null;
  phone: string;
  canPickup: boolean;
}

export interface ChildFull {
  id: string;
  firstName: string;
  lastName: string;
  birthMonth: number | null;
  birthYear: number | null;
  age: number | null;
  hasMedicalNotes: boolean; // present in list responses; medicalNotes text only on detail
  medicalNotes: string | null;
  active: boolean;
  emergencyContacts: EmergencyContact[];
}

export interface Guardian {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string | null;
  phone: string;
  email: string | null;
  addressLine: string | null;
  suburb: string | null;
  postcode: string | null;
  notes: string | null;
  waiverSigned: boolean;
  waiverAcceptedAt: string | null;
  waiverVersion: number | null;
  waiverSignature: string | null; // decrypted, detail view only
  children: ChildFull[];
}

export type AttendanceStatus = "booked" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type PaymentStatus = "unpaid" | "paid" | "waived";

export interface Attendance {
  id: string;
  status: AttendanceStatus;
  isDropIn: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  court: string | null;
  courtBookingName: string | null;
  feeCents: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  notes: string | null;
  child: {
    id: string;
    name: string;
    age: number | null;
    medicalNotes: string | null;
    guardian: { name: string; phone: string; relationship: string | null } | null;
    emergencyContacts: { name: string; phone: string; relationship: string | null; canPickup: boolean }[];
  } | null;
}

export interface Roster {
  capacity: number;
  inCareCount: number;
  hourlyRateCents: number;
  courts: string[];
  inCare: Attendance[];
  expected: Attendance[];
  finished: Attendance[];
}

export interface Dashboard {
  capacity: number;
  inCareCount: number;
  spacesFree: number;
  expectedToday: number;
  finishedToday: number;
  outstandingCents: number;
  outstandingCount: number;
}

export interface Settings {
  id: string;
  name: string;
  timezone: string;
  capacity: number;
  hourlyRateCents: number;
  openTime: string;
  closeTime: string;
  abn: string | null;
  courts: string[];
  waiverText: string | null;
  waiverVersion: number;
  // Payments — the secret key is never sent to the browser.
  stripeConfigured: boolean;
  stripePublishableKey: string | null;
  paymentsTestMode: boolean;
  // Xero export config (finance module).
  xeroAccountCode: string;
  xeroTaxType: string;
  xeroInvoicePrefix: string;
}

export const XERO_TAX_TYPES = ["GST Free Income", "GST on Income", "BAS Excluded"];

export interface FinanceSummary {
  range: { from: string; to: string };
  xero: { accountCode: string; taxType: string; invoicePrefix: string };
  facility: { name: string; abn: string | null; timezone: string };
  totals: {
    collectedCents: number;
    refundedCents: number;
    netCents: number;
    outstandingCents: number;
    waivedCents: number;
  };
  byMethod: { method: string; cents: number }[];
  rows: {
    id: string;
    kind: "fee" | "prepayment";
    invoiceNumber: string;
    paidDate: string;
    serviceDate: string;
    child: string;
    guardian: string;
    guardianEmail: string | null;
    method: string;
    amountCents: number;
  }[];
  refunds: {
    id: string;
    invoiceNumber: string;
    creditNumber: string;
    paidDate: string;
    refundDate: string;
    child: string;
    parent: string;
    parentEmail: string | null;
    amountCents: number;
  }[];
}

export interface BookingConfig {
  facilityName: string;
  timezone: string;
  openTime: string;
  closeTime: string;
  hourlyRateCents: number;
  capacity: number;
  maxDaysAhead: number;
  courts: string[];
}

export interface BookingRequestRow {
  id: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string | null;
  childName: string;
  childFirstName: string;
  childLastName: string;
  childBirthMonth: number | null;
  childBirthYear: number | null;
  childAge: number | null;
  requestedStart: string;
  requestedEnd: string;
  court: string | null;
  courtBookingName: string | null;
  feeCents: number;
  paymentStatus: PaymentStatus;
  notes: string | null;
  createdAt: string;
  suggestedMatch: {
    familyId: string;
    childId: string;
    childName: string;
    guardianName: string;
    phoneMatches: boolean;
  } | null;
}

// Incident tick-box categories — keys must match INCIDENT_TYPES in the API's
// incidents.dto.ts.
export const INCIDENT_TYPES = [
  { key: "fall_or_trip", label: "Fall or trip" },
  { key: "bump_or_bruise", label: "Bump or bruise" },
  { key: "cut_or_graze", label: "Cut or graze" },
  { key: "bite", label: "Bite" },
  { key: "allergic_reaction", label: "Allergic reaction" },
  { key: "illness", label: "Illness / vomiting" },
  { key: "behavioural", label: "Behavioural" },
  { key: "other", label: "Other" },
] as const;

export const incidentTypeLabel = (key: string) =>
  INCIDENT_TYPES.find((t) => t.key === key)?.label ?? key;

export interface Incident {
  id: string;
  occurredAt: string;
  reportedBy: "staff" | "parent";
  reporterName: string | null;
  types: string[];
  description: string | null;
  child: { id: string; name: string } | null;
  loggedBy: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  actor: string | null; // resolved staff name; null = unauthenticated/public
  actorUsername: string | null;
  actorRole: string | null;
  ip: string | null;
  userAgent: string | null;
  method: string;
  path: string;
  action: string;
  targetId: string | null;
  status: number;
  durationMs: number;
  detail: { body?: unknown; query?: unknown } | null;
}

export interface AuditList {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditEntry[];
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
