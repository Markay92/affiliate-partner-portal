/**
 * Circular ring loader — a light track with a brand-blue arc that spins.
 * The arc uses `currentColor`, so set the colour via a text-* class on the
 * element (defaults to the brand accent). Used for every loading state.
 */
export function Spinner({
  className = 'w-6 h-6',
  strokeWidth = 3.5,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={`animate-spin text-brand ${className}`}
      viewBox="0 0 50 50"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="25" cy="25" r="21" stroke="var(--ds-hair)" strokeWidth={strokeWidth} />
      <circle cx="25" cy="25" r="21" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray="34 200" />
    </svg>
  );
}
