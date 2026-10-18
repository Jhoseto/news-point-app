import { LegalPage, legalMetadata } from "@/components/legal-page";
import { cookiesDocument } from "@/lib/legal/cookies";

export const metadata = legalMetadata(cookiesDocument);
export default function CookiesPage() { return <LegalPage document={cookiesDocument} />; }
