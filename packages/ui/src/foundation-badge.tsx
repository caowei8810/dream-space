export interface FoundationBadgeProps {
  label: string;
}

export function FoundationBadge({ label }: FoundationBadgeProps) {
  return <p style={{ color: "#0e8f7c", fontWeight: 600 }}>{label}</p>;
}
