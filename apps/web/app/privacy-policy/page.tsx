import { LegalPage, legalMetadata } from "@/components/legal-page";
import { termsDocument } from "@/lib/legal/terms";

export const metadata = legalMetadata(termsDocument);
export default function TermsPage() { return <LegalPage document={termsDocument} />; }
