const skinLight = '#F2C9A8';
const skinMid = '#D19C6C';
const skinDark = '#A66A42';

export function BlurIcon({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox='0 0 48 48' width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id='blur_grad_rect' x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0%' stopColor={skinDark} stopOpacity='0.9' />
          <stop offset='100%' stopColor={skinLight} stopOpacity='0.2' />
        </linearGradient>
        <filter
          id='blur_soft_rect'
          x='-50%'
          y='-50%'
          width='200%'
          height='200%'
        >
          <feGaussianBlur stdDeviation='2.5' />
        </filter>
      </defs>

      <rect
        x='10'
        y='13'
        width='28'
        height='22'
        rx='8'
        fill={skinMid}
        opacity='0.14'
        filter='url(#blur_soft_rect)'
      />
      <rect
        x='12'
        y='15'
        width='24'
        height='18'
        rx='6'
        fill='url(#blur_grad_rect)'
        filter='url(#blur_soft_rect)'
      />
    </svg>
  );
}

export function PixelateIcon({ size = 48 }: { size?: number }) {
  const colors = [skinDark, skinMid, skinLight];
  const cells: JSX.Element[] = [];
  const cell = 6; // 6px squares
  const cols = 4,
    rows = 3;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 12 + c * cell;
      const y = 15 + r * cell;
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={x}
          y={y}
          width={cell}
          height={cell}
          fill={colors[(r + c) % 3]}
        />
      );
    }
  }

  return (
    <svg viewBox='0 0 48 48' width={size} height={size} aria-hidden>
      <defs>
        <clipPath id='px_clip'>
          <rect x='12' y='15' width='24' height='18' rx='5' />
        </clipPath>
      </defs>

      <g clipPath='url(#px_clip)' shapeRendering='crispEdges'>
        {cells}
      </g>
    </svg>
  );
}

export function BoxIcon({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox='0 0 48 48' width={size} height={size} aria-hidden>
      <rect x='15' y='15' width='18' height='18' rx='2' fill='black' />
    </svg>
  );
}
