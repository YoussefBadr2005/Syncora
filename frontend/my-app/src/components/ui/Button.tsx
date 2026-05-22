"use client";
type Variant = "primary" | "secondary" | "ghost" | "danger";
const cls: Record<Variant, string> = {
  primary: "bg-primary text-surface-container-lowest hover:bg-primary/90",
  secondary: "border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
  ghost: "text-on-surface-variant hover:text-on-surface",
  danger: "text-error border border-[rgba(255,180,171,0.2)] bg-[rgba(255,180,171,0.05)] hover:bg-[rgba(255,180,171,0.1)]",
};
export default function Button({
  variant = "primary", className = "", ...props
}: { variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${cls[variant]} ${className}`}
    />
  );
}
