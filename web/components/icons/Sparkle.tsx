export function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 0L9.4 5.4L14.8 6.8L9.4 8.2L8 13.6L6.6 8.2L1.2 6.8L6.6 5.4L8 0Z" />
    </svg>
  );
}

export function Sun({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.6 3.4L11.5 4.5M4.5 11.5L3.4 12.6M12.6 12.6L11.5 11.5M4.5 4.5L3.4 3.4" />
    </svg>
  );
}
