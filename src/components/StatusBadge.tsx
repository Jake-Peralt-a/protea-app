import { STATUS_META, type RegistrationStatus } from "@/lib/status";

const TONE_STYLES: Record<string, { background: string; color: string }> = {
  neutral: { background: "var(--info-bg)", color: "var(--muted)" },
  info: { background: "var(--info-bg)", color: "var(--primary)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
};

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  const meta = STATUS_META[status];
  const style = TONE_STYLES[meta.tone];
  return (
    <span className="badge" style={style}>
      {meta.label}
    </span>
  );
}
