import { z } from "zod";

export const CONTACT_ERROR = "Въведете валиден имейл или телефон, започващ с + или 0.";
const email = z.email();

/** Checks syntax, not ownership. Local numbers use 9–10 digits; international numbers follow E.164. */
export function isValidReportContact(value: string): boolean {
  const contact = value.trim();
  if (!contact || contact.length > 200) return false;
  if (contact.includes("@")) {
    if (!email.safeParse(contact).success) return false;
    const [local, domain] = contact.split("@");
    return !!local && local.length <= 64 && !!domain && domain.split(".").every(label => label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
  }
  if (!/^(?:\+|0)/.test(contact)) return false;
  if (!/^[+0-9 ()-]+$/.test(contact)) return false;
  const parentheses = contact.replace(/[^()]/g, "");
  if (parentheses && parentheses !== "()") return false;
  const compact = contact.replace(/[ ()-]/g, "");
  return /^(?:0[0-9]{8,9}|\+[1-9][0-9]{7,14})$/.test(compact);
}

export const reportContactSchema = z.string().trim().max(200).refine(isValidReportContact, CONTACT_ERROR);
