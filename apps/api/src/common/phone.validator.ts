import { registerDecorator, ValidationOptions } from "class-validator";

// Australian phone numbers, tolerant of the usual formatting: spaces, dashes,
// parentheses, and an optional +61 country code. Accepts mobiles (04xx) and
// landlines (02/03/07/08). Examples: "0400 123 456", "(02) 9876 5432",
// "+61 400 123 456".
export function normalizeAuPhone(raw: string): string {
  return (raw ?? "").replace(/[\s()\-.]/g, "");
}

export function isAuPhone(raw: string): boolean {
  const n = normalizeAuPhone(raw);
  // 0[2-478]######## (10 digits) or +61[2-478]######## (drop the leading 0).
  return /^0[2-478]\d{8}$/.test(n) || /^\+?61[2-478]\d{8}$/.test(n);
}

export function IsAuPhone(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isAuPhone",
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isAuPhone(value);
        },
        defaultMessage() {
          return "Enter a valid Australian phone number, e.g. 0400 123 456 or 02 9876 5432";
        },
      },
    });
  };
}
