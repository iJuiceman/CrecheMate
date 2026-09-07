/* Generates docs/CrecheMate-Staff-Guide.pdf — the staff feature summary +
 * basic instructions. Re-run after feature changes:  node docs/staff-guide.js
 * Uses the repo's pdfkit. Flowing layout (no absolute y), so it paginates
 * itself; the footer pass zeroes the bottom margin (pdfkit adds runaway pages
 * for text placed below maxY otherwise). */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const TEAL = "#0d9488";
const TEAL_DARK = "#0f766e";
const INK = "#1f2933";
const MUTED = "#6b7280";
const CORAL = "#e11d48";
const LINE = "#e7e0d6";

const OUT = path.join(__dirname, "CrecheMate-Staff-Guide.pdf");
const doc = new PDFDocument({
  size: "A4",
  margins: { top: 60, bottom: 64, left: 56, right: 56 },
  bufferPages: true,
  info: { Title: "CrecheMate Staff Guide", Author: "CrecheMate" },
});
doc.pipe(fs.createWriteStream(OUT));

const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

// ── helpers (flowing layout only) ──
function ensure(space) {
  if (doc.y + space > doc.page.height - doc.page.margins.bottom) doc.addPage();
}
function h1(text) {
  ensure(60);
  doc.moveDown(doc.y > 80 ? 1.2 : 0);
  doc.fillColor(TEAL_DARK).font("Helvetica-Bold").fontSize(16).text(text);
  const y = doc.y + 2;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + W, y).lineWidth(1.2).strokeColor(TEAL).stroke();
  doc.moveDown(0.5);
}
function h2(text) {
  ensure(46);
  doc.moveDown(0.7);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(text);
  doc.moveDown(0.15);
}
function p(text, opts = {}) {
  ensure(30);
  doc.fillColor(opts.color ?? INK).font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).text(text, { lineGap: 2.2, ...opts });
  doc.moveDown(0.25);
}
function bullet(text) {
  ensure(26);
  const x = doc.page.margins.left;
  doc.fillColor(TEAL).font("Helvetica-Bold").fontSize(10).text("•", x + 4, doc.y, { continued: false, lineBreak: false });
  doc.fillColor(INK).font("Helvetica").fontSize(10).text(text, x + 18, doc.y, { width: W - 18, lineGap: 2 });
  doc.x = x;
  doc.moveDown(0.18);
}
function steps(items) {
  items.forEach((s, i) => {
    ensure(26);
    const x = doc.page.margins.left;
    doc.fillColor(TEAL_DARK).font("Helvetica-Bold").fontSize(10).text(`${i + 1}.`, x + 4, doc.y, { lineBreak: false });
    doc.fillColor(INK).font("Helvetica").fontSize(10).text(s, x + 22, doc.y, { width: W - 22, lineGap: 2 });
    doc.x = x;
    doc.moveDown(0.18);
  });
}
function note(text) {
  ensure(34);
  doc.moveDown(0.2);
  const x = doc.page.margins.left;
  const startY = doc.y;
  doc.fillColor(INK).font("Helvetica-Oblique").fontSize(9.5).text(text, x + 12, startY + 6, { width: W - 24, lineGap: 2 });
  const endY = doc.y + 6;
  doc.rect(x, startY, 4, endY - startY).fillColor(TEAL).fill();
  doc.x = x;
  doc.y = endY;
  doc.moveDown(0.4);
}

// ── Cover header ──
doc.rect(0, 0, doc.page.width, 130).fillColor(TEAL).fill();
doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(28).text("CrecheMate", doc.page.margins.left, 42);
doc.font("Helvetica").fontSize(13).text("Staff guide — features & everyday instructions", doc.page.margins.left, 78);
doc.fontSize(9).fillColor("#ccfbf1").text(`Prepared ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`, doc.page.margins.left, 100);
doc.y = 150;
doc.x = doc.page.margins.left;

p("CrecheMate runs the club's on-site creche: families and children, pre-booked sessions and walk-in drop-ins, check-in and check-out, fees and card payments, waivers, incidents, and the staff roster. Staff sign in with their own username and password. Everything below works from any browser on the club network.", { color: MUTED });

// ── 1. Signing in & roles ──
h1("Signing in & roles");
bullet("Sign in with your personal username and password (usernames are lower-case; email is not used for login). Never share accounts — the audit trail records who did what.");
bullet("Educator accounts can run the desk: roster, check-in/out, families, bookings, incidents, and view the creche roster.");
bullet("Admin accounts also see Reports, Finance, Staff, the Audit log and Settings, and can schedule the creche roster.");

// ── 2. Today's roster (dashboard) ──
h1("Today's roster — the main screen");
p("The dashboard is your home screen. It refreshes itself every few seconds.");
bullet("In charge banner (top): who is rostered to run the creche right now, from the creche roster. A red banner means no one is rostered — tell an admin.");
bullet("Stat tiles: children in care vs capacity, expected today, finished today, and unpaid fees outstanding.");
bullet("Today at a glance: a timeline bar for every child today — outlined = booked (not arrived), solid teal = in care right now, grey = finished. The red line is the current time. Hover a bar for times and court.");
bullet("In care now: each child's card shows age, medical alerts (red), parent and emergency contacts, which court the parent is on, time in care and the running fee. Use “Change” to update the court if the parent moves.");
bullet("Expected today: booked children awaiting arrival — check them in from here.");
bullet("Finished today: checked-out children with their fee and payment status; take payment from the card.");

h2("Check in a booked child");
steps([
  "Find the child under “Expected today”.",
  "Enter or pick the court the parent will be on (the creche is for players — the session must match their court booking).",
  "Press “Check in”. If the parent hasn't signed the current waiver, the signing screen opens — see “Waivers” below.",
]);

h2("Check in a walk-in (drop-in)");
steps([
  "Press “+ Check a child in” at the top of the dashboard.",
  "Search by child or parent name / phone. If the family isn't found, add them first under Families & children.",
  "Set the court, then press “Check in” next to the child. A “Waiver signature needed” tag means the signing screen will open first.",
]);

h2("Check out & take payment");
steps([
  "On the child's “In care now” card, press “Check out”. The fee is finalised from the actual time in care.",
  "The child moves to “Finished today”. If a fee is owing, use the payment buttons: Cash, Card, Eftpos, or Card (online) for a Stripe card payment at the desk.",
  "“Waive” (admins/policy) clears the fee without payment — use only when instructed.",
]);
note("Fees are the hourly rate billed in 30-minute blocks, rounded up — a short stay still bills a 30-minute minimum. Online pre-booked sessions are already paid.");

// ── 3. Waivers ──
h1("Waivers — mandatory before care");
p("A child cannot be checked in until their parent/guardian has accepted the current waiver. CrecheMate enforces this on every check-in.");
bullet("At the desk: when a parent hasn't accepted (or the waiver text has been updated since they last did), the signing screen opens automatically at check-in. Hand the parent the screen — they read the agreement and sign with a finger, then the check-in completes.");
bullet("Online bookings: the parent must tick “I have read and accept” on the booking form, which is recorded against the family.");
bullet("Kiosk self-registration: new families who register on the iPad sign the waiver as part of the form.");
bullet("Family pages show the status — “Waiver signed”, “Waiver accepted online”, or an amber “Waiver not accepted / waiver needed” tag.");
note("Admins: editing the waiver wording under Settings bumps its version, and every parent will be asked to sign the new version at their next check-in.");

// ── 4. Families & children ──
h1("Families & children");
bullet("Search by child or parent name, or phone. Red “medical” tags flag children with allergies / medical requirements — always read the child's card before care.");
bullet("Add a family with “+ New family”: parent details, an optional second parent/guardian, and the child (birth month/year). The parents are the child's emergency contacts automatically — add extra contacts (grandparent, carer, other) only if the family wants more people listed, and tick who may collect the child.");
bullet("Open a family to edit parent details (including the second parent — clear the first name to remove them), add more children, book a session, or check a child straight in.");
bullet("Children's medical notes and waiver signatures are encrypted — they only appear where staff need them.");
bullet("Parents can also self-register on the iPad kiosk (the /intake screen): their details, child, emergency contacts and a signed waiver, with no staff time needed.");

// ── 5. Bookings ──
h1("Bookings");
p("Bookings live under the Bookings page, with a month calendar coloured by how busy each day is; click a day to see its schedule.");
h2("Booked at the desk");
steps([
  "Open the family › the child › “Book…”.",
  "Pick the date and times, and the court booking it attaches to (required — creche time must match the court booking; note the name it's booked under if it isn't the parent).",
  "Sessions are capped at the maximum booking length (default 2 hours) and must fit opening hours.",
]);
h2("Booked online by parents");
bullet("Parents book at the public booking page, tick the waiver, and pay by card immediately — the booking confirms itself, no staff approval step.");
bullet("Several children can be booked on one session and one payment.");
bullet("If a session fills in the moment between paying and confirming, the payment refunds automatically and the parent is asked to pick another time.");
bullet("The parent's court is NOT collected online — capture it at check-in.");
h2("Cancellations & refunds");
bullet("Cancel from the booking's card (staff action — parents phone or ask at the desk).");
bullet("Paid bookings refund 100% when cancelled earlier than the late-cancel window (default 24 hours before the session), otherwise the late percentage (default 50%). Card refunds go back via Stripe automatically.");

// ── 6. Creche roster ──
h1("Creche roster — who runs the creche");
bullet("The Creche roster page shows a Monday–Sunday grid of operator shifts; use Prev / This week / Next to move between weeks. Today is highlighted.");
bullet("Everyone can view it; the dashboard's “In charge” banner comes straight from it.");
bullet("Admins add a shift with “+ Add” on a day (staff member, times, optional note), and can edit or remove shifts. The same person can't be rostered twice over the same time; two different staff can overlap when working together.");

// ── 7. Incidents ──
h1("Incidents");
steps([
  "Open Incidents › “+ New incident” as soon as practical after the event.",
  "Record the child (if applicable), when it occurred, and who reported it — staff, or a parent reporting at the desk (record the parent's name).",
  "Tick the categories that apply and describe what happened (required when “other” is ticked). Details are stored encrypted.",
]);
note("Incident entries are permanent records — only an admin can delete one.");

// ── 8. Admin areas ──
h1("Admin areas (admin sign-in only)");
bullet("Reports: financial, attendance/occupancy, families and online-booking summaries over any date range, with charts and CSV export.");
bullet("Finance: cash-basis exports for the bookkeeper — Xero sales CSV, transactions CSV and a PDF report.");
bullet("Staff: create accounts, set admin/educator role, reset passwords, suspend accounts (takes effect immediately).");
bullet("Audit log: a permanent trail of every change and who made it.");
bullet("Settings: facility name, opening hours, capacity, hourly rate, maximum booking length, cancellation policy, the court list, the waiver text, Stripe payments and Xero export options.");

// ── 9. Quick reference ──
h1("Quick reference");
bullet("Child arrives (booked) › Dashboard › Expected today › set court › Check in.");
bullet("Child arrives (no booking) › “+ Check a child in” › search › set court › Check in.");
bullet("Parent hasn't signed the waiver › the signing screen opens by itself — hand them the screen.");
bullet("Child leaves › In care now › Check out › take payment from Finished today.");
bullet("New family › Families & children › “+ New family” (or hand the parent the iPad kiosk).");
bullet("Who's in charge? › the banner at the top of the dashboard, or the Creche roster page.");
bullet("Something happened › Incidents › “+ New incident”.");
p(" ");
p("Questions or something not working? Tell your admin — they can check the audit log and settings.", { color: MUTED });

// ── Footer on every page (inside the bottom margin › zero it while painting) ──
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  const saved = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const fy = doc.page.height - 40;
  doc.moveTo(doc.page.margins.left, fy).lineTo(doc.page.margins.left + W, fy).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.fillColor(MUTED).font("Helvetica").fontSize(8);
  doc.text("CrecheMate — Staff guide", doc.page.margins.left, fy + 8, { lineBreak: false });
  doc.text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.margins.left + W - 100, fy + 8, { width: 100, align: "right", lineBreak: false });
  doc.page.margins.bottom = saved;
}

doc.end();
console.log(`Wrote ${OUT}`);
