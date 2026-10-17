// Icon SVG tự vẽ, nét 1.75 thống nhất — thay emoji (checklist redesign: emoji
// icon là dấu vân tay AI). Kích thước điều khiển bằng className.
type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function IconShield({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3l7 3v5c0 4.4-2.8 7.6-7 9.5C7.8 18.6 5 15.4 5 11V6l7-3z" />
      <path d="M9.5 11.5l2 2 3.5-4" />
    </svg>
  );
}

export function IconClock({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconAsk({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4.5 6.5h11a2 2 0 012 2v5a2 2 0 01-2 2H9l-4.5 3v-3h0a2 2 0 01-2-2v-5a2 2 0 012-2z" />
      <path d="M19.5 10.5h.5a2 2 0 012 2v3.5a2 2 0 01-2 2h-.5v2.5l-2.5-1.7" />
    </svg>
  );
}

export function IconCalc({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5v.01" />
    </svg>
  );
}

export function IconChart({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 4v16h16" />
      <path d="M8 15v-4M12 15V8M16 15v-6" />
    </svg>
  );
}

export function IconHeart({ className, filled }: P & { filled?: boolean }) {
  return (
    <svg {...base} className={className} fill={filled ? "currentColor" : "none"} aria-hidden>
      <path d="M12 20s-7-4.6-9-9c-1.2-2.7.5-5.8 3.4-6.4 1.9-.4 3.9.5 5.6 2.6 1.7-2.1 3.7-3 5.6-2.6C20.5 5.2 22.2 8.3 21 11c-2 4.4-9 9-9 9z" />
    </svg>
  );
}

// Bộ icon thông số căn — theo hàng meta của card Veedoo (loại · diện tích · PN)
export function IconPin({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 21s6.5-5.7 6.5-10a6.5 6.5 0 10-13 0c0 4.3 6.5 10 6.5 10z" />
      <circle cx="12" cy="10.8" r="2.4" />
    </svg>
  );
}

export function IconHouse({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 10.6L12 4l8 6.6" />
      <path d="M6 9.8V19h12V9.8" />
    </svg>
  );
}

export function IconArea({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />
    </svg>
  );
}

export function IconBed({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M3 18v-8M3 13h18v5M21 18v-3" />
      <path d="M7 13v-2.5a1.5 1.5 0 011.5-1.5h8A1.5 1.5 0 0118 10.5V13" />
    </svg>
  );
}

export function IconSearch({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8L20 20" />
    </svg>
  );
}

// ── Bộ icon khu quản trị (09/09/2026, thay emoji — docs/06 §6.11) ─────────────
export function IconGrid({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>);
}
export function IconUsers({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.2c2.5.2 4.3 1.7 5 4.3" /></svg>);
}
export function IconChat({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5v-7z" /></svg>);
}
export function IconList({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>);
}
export function IconEdit({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>);
}
export function IconSettings({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>);
}
export function IconBell({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>);
}
export function IconPlus({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M12 5v14M5 12h14" /></svg>);
}
export function IconTrash({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
}
export function IconDownload({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M12 4v11M7 10l5 5 5-5M4 19h16" /></svg>);
}
export function IconWarning({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M12 4l9 16H3l9-16z" /><path d="M12 10v4M12 17.5v.5" /></svg>);
}
export function IconCheck({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
}
export function IconX({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>);
}
export function IconEye({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>);
}
export function IconRefresh({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>);
}
export function IconBot({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><rect x="5" y="8" width="14" height="11" rx="2" /><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6" /></svg>);
}
export function IconAlertDot({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><circle cx="12" cy="12" r="8" /><path d="M12 8v5M12 16v.5" /></svg>);
}
export function IconNote({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M6 3h9l5 5v13H6V3z" /><path d="M14 3v6h6M9 13h6M9 17h6" /></svg>);
}
export function IconTarget({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></svg>);
}
export function IconMoney({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9h.01M18 15h.01" /></svg>);
}
export function IconLogout({ className }: P) {
  return (<svg {...base} className={className} aria-hidden><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" /></svg>);
}
