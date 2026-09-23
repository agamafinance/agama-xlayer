export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Top-left wing */}
      <path d="M12 12 L3 4 C3 4 4 9 6 11 C8 12.5 10.5 12.4 12 12 Z" />
      {/* Bottom-left wing */}
      <path d="M12 12 L3 20 C3 20 4 15 6 13 C8 11.5 10.5 11.6 12 12 Z" />
      {/* Top-right wing */}
      <path d="M12 12 L21 4 C21 4 20 9 18 11 C16 12.5 13.5 12.4 12 12 Z" />
      {/* Bottom-right wing */}
      <path d="M12 12 L21 20 C21 20 20 15 18 13 C16 11.5 13.5 11.6 12 12 Z" />
    </svg>
  );
}
