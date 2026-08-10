import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { encryptField } from "../common/encryption.util";
import { IntakeDto } from "./intake.dto";

// Shown until an admin customises the waiver under Settings → Waiver. Kept
// deliberately generic — the facility should replace it with their own wording
// and have it reviewed. Not legal advice.
export const DEFAULT_WAIVER = `Parent / Guardian Agreement

By registering my child for care at this service, I acknowledge and agree that:

1. Care & supervision. Educators will care for my child with reasonable skill
   and diligence during the hours my child is signed in.

2. Emergencies & medical treatment. If my child is injured or becomes unwell
   and I cannot be contacted, I authorise staff to seek and consent to medical
   or ambulance treatment. I am responsible for the costs of any such treatment.

3. Health information. The allergy, medical and emergency-contact details I
   provide are accurate to the best of my knowledge, and I will keep them up to
   date.

4. Collection. My child will only be released to me or to the emergency contacts
   I have authorised to collect them.

5. Fees. I agree to pay the applicable fees for the care my child receives.

6. Privacy. I consent to the service collecting and holding the information in
   this form for the purpose of caring for my child, handled in line with the
   service's privacy obligations.

I have read and understood this agreement and I am the parent or legal guardian
of the child named in this form.`;

@Injectable()
export class IntakeService {
  constructor(private prisma: PrismaService) {}

  /** Public: what the parent-facing kiosk form needs to render. */
  async info() {
    const s = await this.prisma.facilitySettings.findFirst();
    return {
      facilityName: s?.name ?? "CrecheMate",
      waiverText: s?.waiverText?.trim() ? s.waiverText : DEFAULT_WAIVER,
      waiverVersion: s?.waiverVersion ?? 1,
      // The form offers these year options; kept here so it stays in one place.
      yearRange: { from: 2010, to: 2026 },
    };
  }

  /** Public: a parent registers their family and signs the waiver. */
  async submit(dto: IntakeDto) {
    const s = await this.prisma.facilitySettings.findFirst();
    const waiverVersion = s?.waiverVersion ?? 1;

    const guardian = await this.prisma.guardian.create({
      data: {
        firstName: dto.guardian.firstName.trim(),
        lastName: dto.guardian.lastName.trim(),
        relationship: dto.guardian.relationship?.trim() || null,
        phone: dto.guardian.phone.trim(),
        email: dto.guardian.email?.trim().toLowerCase() || null,
        // No address collected on the parent form.
        waiverSignatureEncrypted: encryptField(dto.waiverSignature),
        waiverAcceptedAt: new Date(),
        waiverVersion,
        children: {
          create: {
            firstName: dto.child.firstName.trim(),
            lastName: dto.child.lastName.trim(),
            birthMonth: dto.child.birthMonth,
            birthYear: dto.child.birthYear,
            medicalNotesEncrypted: dto.child.medicalNotes?.trim()
              ? encryptField(dto.child.medicalNotes.trim())
              : null,
            emergencyContacts: {
              create: dto.child.emergencyContacts.map((e) => ({
                name: e.name.trim(),
                relationship: e.relationship?.trim() || null,
                phone: e.phone.trim(),
                canPickup: e.canPickup ?? true,
              })),
            },
          },
        },
      },
      include: { children: true },
    });

    // Return only what the confirmation screen needs — this is a public route.
    return { ok: true, childFirstName: guardian.children[0]?.firstName ?? "" };
  }
}
