export type SocialNetwork = "facebook" | "instagram" | "tiktok" | "youtube";

/** Official profile URLs supplied by Koce. Unset addresses are never rendered as links. */
export const FOOTER_SOCIAL_LINKS: readonly { network: SocialNetwork; name: string; href: string | null }[] = [
  { network: "facebook", name: "Facebook", href: "https://www.facebook.com/NewsPointBulgaria" },
  { network: "instagram", name: "Instagram", href: "https://www.instagram.com/newspointbg" },
  { network: "tiktok", name: "TikTok", href: "https://www.tiktok.com/@newspoint.bg" },
  { network: "youtube", name: "YouTube", href: "https://www.youtube.com/channel/UCN7T3kmi6fYBrP-dLU6q1bg" },
];
