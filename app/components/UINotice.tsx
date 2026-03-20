'use client';

export interface UINoticeProps {
  notice: { msg: string; color?: string } | null;
  isMobile: boolean;
}

export default function UINotice({ notice, isMobile }: UINoticeProps) {
  if (!notice) return null;

  const color = notice.color ?? '#39FF14';

  return (
    <>
      <style>{`
        @keyframes ww-notice-in {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .ww-notice-anim {
          animation: ww-notice-in 0.22s cubic-bezier(0.22,1,0.36,1) forwards;
        }
      `}</style>

      {/* Corner decorations */}
      <div
        className="ww-notice-anim absolute top-14 left-1/2"
        style={{
          position: 'absolute',
          top: '3.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          maxWidth: isMobile ? '92%' : 420,
        }}
      >
        {/* TL corner */}
        <span style={{
          position: 'absolute', top: -2, left: -2,
          width: 8, height: 8,
          borderTop: `2px solid ${color}`,
          borderLeft: `2px solid ${color}`,
          pointerEvents: 'none',
        }} />
        {/* TR corner */}
        <span style={{
          position: 'absolute', top: -2, right: -2,
          width: 8, height: 8,
          borderTop: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          pointerEvents: 'none',
        }} />
        {/* BL corner */}
        <span style={{
          position: 'absolute', bottom: -2, left: -2,
          width: 8, height: 8,
          borderBottom: `2px solid ${color}`,
          borderLeft: `2px solid ${color}`,
          pointerEvents: 'none',
        }} />
        {/* BR corner */}
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 8, height: 8,
          borderBottom: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          pointerEvents: 'none',
        }} />

        <div
          style={{
            background: 'rgba(0,0,0,0.82)',
            border: `1px solid ${color}55`,
            fontFamily: '"Press Start 2P", monospace',
            fontSize: '8px',
            color,
            boxShadow: `0 0 12px ${color}33, 0 10px 24px rgba(0,0,0,0.35)`,
            padding: '8px 12px',
            textAlign: 'center',
          }}
        >
          {notice.msg}
        </div>
      </div>
    </>
  );
}
