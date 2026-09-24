import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M10 17h10" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" />
  </Icon>
);

export const GridIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
);

export const PinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
    <circle cx="12" cy="11" r="2" />
  </Icon>
);

export const MapIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 4 6 2 5-2v14l-5 2-6-2-5 2V6l5-2Z" />
    <path d="M9 4v14M15 6v14" />
  </Icon>
);

export const FlagIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 21V4" />
    <path d="M6 5h11l-2 3.5L17 12H6" />
  </Icon>
);

export const ColumnsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 20V9M9.7 20V9M14.3 20V9M19 20V9M3.5 20h17M4 9h16L12 4 4 9Z" />
  </Icon>
);

export const BadgeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3 5 6v5.2c0 4.2 2.9 7.2 7 8.8 4.1-1.6 7-4.6 7-8.8V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const PenIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20h4l10-10-4-4L4 16v4Z" />
    <path d="m13 7 4 4" />
  </Icon>
);

export const GlobeIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M4 12h16M12 4c2.2 2.4 3.3 5.1 3.3 8S14.2 17.6 12 20c-2.2-2.4-3.3-5.1-3.3-8S9.8 6.4 12 4Z" />
  </Icon>
);

export const TrophyIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
    <path d="M8 6H5.5A2.5 2.5 0 0 0 8 10M16 6h2.5A2.5 2.5 0 0 1 16 10M12 13v3M9 20h6M10 16h4" />
  </Icon>
);

export const ChipIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M9 3v4M12 3v4M15 3v4M9 17v4M12 17v4M15 17v4M3 9h4M3 12h4M3 15h4M17 9h4M17 12h4M17 15h4" />
  </Icon>
);

export const BriefcaseIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 13h18" />
  </Icon>
);

export const HeartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9Z" />
  </Icon>
);

export const PaletteIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4a8 8 0 1 0 0 16h1.2a2 2 0 0 0 1.5-3.3 2 2 0 0 1 1.6-3.2H17a5 5 0 0 0 5-5.2A8 8 0 0 0 12 4Z" />
    <circle cx="8" cy="10" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="10" cy="7" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="14" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
  </Icon>
);

export const CupIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 4h10v6a5 5 0 0 1-10 0V4Z" />
    <path d="M16 6h2.5A2.5 2.5 0 0 1 16 11M8 19h8M9 15.5c.4 1.2 1.5 3.5 3 3.5s2.6-2.3 3-3.5" />
  </Icon>
);

export const BallotIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="m8.5 9 1.5 1.5L13 7.5M8.5 15l1.5 1.5L13 13.5" />
  </Icon>
);

export const BoltIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />
  </Icon>
);

export const CloudSunIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 6.5a3.5 3.5 0 0 1 6.6 1.6M5.4 4.4l.9.9M4 9h1.3M8 3v1.3" />
    <path d="M17 19H8.5a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.5 1.2 3 3 0 0 1-.6 5.8Z" />
  </Icon>
);

export const CarIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 16.5V19a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-2.5M19 16.5V19a1 1 0 0 0 1 1h.5a1 1 0 0 0 1-1v-2.5" />
    <path d="M4.5 16.5h15a1 1 0 0 0 1-1v-3a2 2 0 0 0-1.5-1.9l-1.2-3.3A2 2 0 0 0 15.9 6H8.1a2 2 0 0 0-1.9 1.3L5 10.6a2 2 0 0 0-1.5 1.9v3a1 1 0 0 0 1 1Z" />
    <path d="M7 13.5h.01M17 13.5h.01" />
  </Icon>
);

export const CameraIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h9A1.5 1.5 0 0 1 15 8.5v7A1.5 1.5 0 0 1 13.5 17h-9A1.5 1.5 0 0 1 3 15.5v-7Z" />
    <path d="m15 11 4.6-2.6a.8.8 0 0 1 1.2.7v5.8a.8.8 0 0 1-1.2.7L15 13" />
  </Icon>
);

export const MegaphoneIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l7 4V6.5l-7 4H4.5A1.5 1.5 0 0 0 3 12Z" />
    <path d="M17.5 9.5a3.5 3.5 0 0 1 0 5M7 15v4.5" />
  </Icon>
);

export const FeatherIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19.5 4.5a6 6 0 0 0-8.5 0L5 10.5V19h8.5l6-6a6 6 0 0 0 0-8.5Z" />
    <path d="M5 19 12 12M15 9h-3v3" />
  </Icon>
);

export const BookIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
  </Icon>
);

export const LinkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
);

export const ExternalIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

export const FacebookIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z" />
  </svg>
);

export const XIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
  </svg>
);

export const LinkedInIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M6.9 8.8H3.6V20h3.3V8.8ZM5.2 3.5a1.9 1.9 0 1 0 0 3.9 1.9 1.9 0 0 0 0-3.9ZM20.4 13.6c0-3-1.6-5-4.3-5-1.4 0-2.4.8-2.8 1.5V8.8H10V20h3.3v-5.6c0-1.5.3-2.9 2.1-2.9s1.8 1.7 1.8 3V20h3.3v-6.4Z" />
  </svg>
);
