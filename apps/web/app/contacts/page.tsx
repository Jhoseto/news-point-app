import { PublicInfoPage, publicInfoMetadata } from "@/components/public-info-page";

export const metadata = publicInfoMetadata("contacts");

export default function ContactsPage() {
  return <PublicInfoPage kind="contacts" />;
}
