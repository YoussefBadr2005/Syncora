export default function EmptyState({ title, hint, action }: {
  title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <p className="text-sm font-medium text-on-surface">{title}</p>
      {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
      {action}
    </div>
  );
}
