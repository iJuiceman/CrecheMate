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
    try {
      const s = await this.prisma.facilitySettings.findFirst();
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
      } else {
        this.logger.error(
          "CHILD_DATA_ENCRYPTION_KEY does not match the key that encrypted existing " +
            "data. Medical notes, waiver signatures, incident details and the Stripe " +
            "secret will read back EMPTY. Restore the original key — no encrypted data " +
            "has been altered.",
        );
      }
    } catch (e) {
      // Includes a missing/wrong-length key (getKey throws). Never block boot.
      this.logger.error(`Encryption canary check failed: ${(e as Error).message}`);
    }
  }
}
