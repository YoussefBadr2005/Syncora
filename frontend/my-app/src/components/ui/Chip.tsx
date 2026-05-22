export default function Chip({ dot, color, children }: {
  dot?: string; color?: string; children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: (color ?? "#8e9192") + "18", color: color ?? "#c4c7c8" }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}
