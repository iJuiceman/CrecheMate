import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { decryptField, encryptField } from "./encryption.util";

const SENTINEL = "crechemate-encryption-canary-v1";

/**
 * Verifies at boot that CHILD_DATA_ENCRYPTION_KEY can still read data it
 * previously wrote. `decryptField` returns "" on an undecryptable value, so a
 * wrong or rotated key would otherwise make every medical note, waiver
 * signature, incident detail and the Stripe secret silently read back empty —
 * a dangerous false negative for allergies. We store a sentinel once and
 * re-check it each boot, logging loudly (never mutating data) on mismatch.
 */
@Injectable()
export class EncryptionHealthService implements OnModuleInit {
  private readonly logger = new Logger("EncryptionHealth");

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    let s;
    try {
      s = await this.prisma.facilitySettings.findFirst();
    } catch (e) {
      // Transient (DB not ready yet) — don't block boot on a hiccup.
      this.logger.error(`Encryption canary check skipped (DB unavailable): ${(e as Error).message}`);
      return;
    }
    if (!s) return; // no settings row yet (fresh DB) — canary is set on a later boot
    if (!s.encryptionCanary) {
      await this.prisma.facilitySettings.update({
        where: { id: s.id },
        data: { encryptionCanary: encryptField(SENTINEL) },
      });
      this.logger.log("Encryption canary initialised.");
      return;
    }
    if (decryptField(s.encryptionCanary) === SENTINEL) {
      this.logger.log("Encryption key verified against stored canary.");
      return;
    }
    // Wrong/rotated key: FAIL CLOSED rather than silently reading medical notes,
    // waiver signatures, incident details and the Stripe secret back as EMPTY.
    this.logger.error(
      "CHILD_DATA_ENCRYPTION_KEY does not match the key that encrypted existing data. " +
        "Refusing to start so blank allergy/medical info is never shown. Restore the " +
        "original key — no encrypted data has been altered.",
    );
    throw new Error("Encryption key mismatch — refusing to start.");
  }
}
