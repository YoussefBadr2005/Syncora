export default function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls = { sm: "h-4 w-4", md: "h-8 w-8", lg: "h-12 w-12" }[size];
  return (
    <div className={`animate-spin rounded-full border-b-2 border-indigo-600 ${cls}`} />
  );
}
