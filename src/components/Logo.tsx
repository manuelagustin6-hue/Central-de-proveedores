export function Logo({ size = 40, color = '#333333', withText = false }: { size?: number; color?: string; withText?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="HA Emprendimientos">
        <rect x="24" y="10" width="52" height="72" stroke={color} strokeWidth="5" fill="none" />
        <text x="50" y="42" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="26" fill={color}>H</text>
        <text x="50" y="72" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="26" fill={color}>A</text>
      </svg>
      {withText && (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <strong style={{ fontSize: 15, letterSpacing: '0.02em', color }}>HA Emprendimientos</strong>
          <span style={{ fontSize: 11, letterSpacing: '0.25em', color, opacity: 0.7 }}>PROVEEDORES</span>
        </span>
      )}
    </span>
  );
}
