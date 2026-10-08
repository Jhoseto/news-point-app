import { discoveryRobots } from "@/lib/discovery";
import { shareOrigin } from "@/lib/share-card";

export default function robots() { return discoveryRobots(shareOrigin()); }
