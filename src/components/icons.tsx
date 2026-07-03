// Small inline SVG icon set used across the app (stat cards, brand mark).

export type IconName = "pin" | "ruler" | "clock" | "layers" | "compass" | "battery" | "home";

export function Icon({ name }: { name: IconName }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "pin":
      return (
        <svg {...p}>
          <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      );
    case "ruler":
      return (
        <svg {...p}>
          <path d="M3 17 17 3l4 4L7 21z" />
          <path d="M7 11l2 2M11 7l2 2M9 15l1 1" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "layers":
      return (
        <svg {...p}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 13 9 5 9-5" />
        </svg>
      );
    case "compass":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="m16 8-5 3-3 5 5-3 3-5Z" />
        </svg>
      );
    case "battery":
      return (
        <svg {...p}>
          <rect x="2" y="8" width="16" height="9" rx="2" />
          <path d="M20 11v3" />
          <path d="M5 11v3M8 11v3" />
        </svg>
      );
    case "home":
      return (
        <svg {...p}>
          <path d="M4 11l8-6 8 6" />
          <path d="M6 10v9h12v-9" />
        </svg>
      );
  }
}

export function DroneMark() {
  return (
    <svg
      className="brand-mark"
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="5" r="2.4" />
      <circle cx="19" cy="5" r="2.4" />
      <circle cx="5" cy="19" r="2.4" />
      <circle cx="19" cy="19" r="2.4" />
      <path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3" />
      <rect x="9.3" y="9.3" width="5.4" height="5.4" rx="1.3" />
    </svg>
  );
}
