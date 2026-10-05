import { PublicInfoPage, publicInfoMetadata } from "@/components/public-info-page";

export const metadata = publicInfoMetadata("advertising");

export default function AdvertisingPage() {
  return <PublicInfoPage kind="advertising" />;
}
