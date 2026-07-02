/** SVG Donut Chart — dipakai di landing page dan dashboard admin agar tampilannya konsisten. */
export default function DonutChart({
  size,
  segments,
  centerLabel,
}: {
  size: number;
  segments: { value: number; color: string }[];
  centerLabel?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const innerR = r * 0.55;

  let startAngle = -Math.PI / 2;

  function describeArc(start: number, end: number, outer: number, inner: number) {
    const x1 = cx + outer * Math.cos(start);
    const y1 = cy + outer * Math.sin(start);
    const x2 = cx + outer * Math.cos(end);
    const y2 = cy + outer * Math.sin(end);
    const x3 = cx + inner * Math.cos(end);
    const y3 = cy + inner * Math.sin(end);
    const x4 = cx + inner * Math.cos(start);
    const y4 = cy + inner * Math.sin(start);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${outer} ${outer} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  }

  const paths = segments.map((seg) => {
    const angle = total > 0 ? (seg.value / total) * 2 * Math.PI : 0;
    const endAngle = startAngle + angle;
    const d = describeArc(startAngle, endAngle, r, innerR);
    startAngle = endAngle;
    return { d, color: seg.color };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth="2" />
      ))}
      {centerLabel && (
        <>
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="bold" fill="#1e293b">{centerLabel}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#64748b">Total</text>
        </>
      )}
    </svg>
  );
}
