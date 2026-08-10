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
  // Payments — the secret key is never sent to the browser.
  stripeConfigured: boolean;
  stripePublishableKey: string | null;
  paymentsTestMode: boolean;
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
