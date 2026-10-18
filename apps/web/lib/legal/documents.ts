import { termsDocument } from "./terms";
import { personalDataDocument } from "./personal-data";
import { cookiesDocument } from "./cookies";
import type { LegalDocument } from "./types";

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [termsDocument, personalDataDocument, cookiesDocument];
export { termsDocument, personalDataDocument, cookiesDocument };
