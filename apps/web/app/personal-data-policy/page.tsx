import { LegalPage, legalMetadata } from "@/components/legal-page";
import { personalDataDocument } from "@/lib/legal/personal-data";

export const metadata = legalMetadata(personalDataDocument);
export default function PersonalDataPage() { return <LegalPage document={personalDataDocument} />; }
