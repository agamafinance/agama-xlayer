export function EthMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M8 1.5L3 8.4L8 11.1L13 8.4L8 1.5Z" fill="#1B1B1B" />
      <path d="M8 1.5L3 8.4L8 6.5V1.5Z" fill="#5A5A5A" />
      <path d="M8 12L3 9.2L8 14.5L13 9.2L8 12Z" fill="#1B1B1B" />
      <path d="M8 14.5V12L3 9.2L8 14.5Z" fill="#5A5A5A" />
    </svg>
  );
}
