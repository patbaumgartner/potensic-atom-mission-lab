import { Icon, type IconName } from "./icons";

export function StatCard({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-ic">
        <Icon name={icon} />
      </span>
      <div className="stat-body">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
