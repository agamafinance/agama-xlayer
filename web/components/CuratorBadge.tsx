import clsx from 'clsx';

const CURATORS: Record<string, { bg: string; fg: string; letter: string }> = {
  Steakhouse: { bg: '#0BAB5C', fg: '#FFFFFF', letter: 'S' },
  Gauntlet: { bg: '#1E2742', fg: '#7B8AFF', letter: 'G' },
  MEV: { bg: '#1F2937', fg: '#FFFFFF', letter: 'M' },
  Smokehouse: { bg: '#0BAB5C', fg: '#FFFFFF', letter: 'S' },
};

export function CuratorBadge({
  name,
  size = 22,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  if (name === 'Agama') {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-[14px] text-fg select-none', className)}>
        <img
          src="/agama-logo-circle.svg"
          alt="Agama"
          style={{ height: size, width: size, transform: 'translateY(4px)' }}
          className="rounded-full"
        />
        <span style={{ transform: 'translateY(3px)' }}>Agama</span>
      </span>
    );
  }
  const info = CURATORS[name] ?? {
    bg: '#1F2937',
    fg: '#FFFFFF',
    letter: name.slice(0, 1).toUpperCase(),
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-full ring-1 ring-[#254839]/15 select-none',
        className
      )}
      style={{
        width: size,
        height: size,
        background: info.bg,
        color: info.fg,
        fontSize: size * 0.55,
        fontWeight: 700,
        lineHeight: 1,
      }}
      aria-label={name}
    >
      {info.letter}
    </span>
  );
}
