import type { CSSProperties } from 'react';

import { at } from './motion';

/** The pieces the manual's scenes are drawn from (ADR-035). */

/** A step row: a dot that lights, a name, and a line of detail. */
export function Step({
  y,
  name,
  t,
  lit = 'accent',
}: {
  y: number;
  name: string;
  t: number;
  lit?: string;
}) {
  return (
    <g>
      <rect className="card" x="20" y={y} width="150" height="26" rx="5" />
      <circle className={`${lit} light`} cx="34" cy={y + 13} r="5" style={at(t)} />
      <text x="46" y={y + 17}>
        {name}
      </text>
    </g>
  );
}

/** A window: a frame with a title bar, at (x, y). */
export function Window({
  x,
  y,
  width,
  height,
  title,
  className = '',
  style,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <g className={className} style={style}>
      <rect className="card" x={x} y={y} width={width} height={height} rx="4" />
      <rect className="layer" x={x} y={y} width={width} height="14" rx="4" />
      <text className="small" x={x + 6} y={y + 10}>
        {title}
      </text>
      <rect className="line" x={x + 8} y={y + 22} width={width * 0.6} height="4" rx="2" />
      <rect className="line" x={x + 8} y={y + 32} width={width * 0.4} height="4" rx="2" />
    </g>
  );
}
