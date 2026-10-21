import { C } from '../theme/theme';
import { ASL_LOGO_SRC } from '../assets/asl-logos';

export const ASLCrest = ({ size = 40 }: { size?: number }) => (
  <img
    src={ASL_LOGO_SRC}
    alt="ASL"
    width={size}
    height={size}
    style={{ display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(26, 39, 82, 0.2))' }}
  />
);

export const ASLLogoFull = ({ size = 32, color = C.cream }: { size?: number; color?: string }) => (
  <div className="flex items-center gap-3">
    <ASLCrest size={size} />
    <div>
      <div className="font-display text-white tracking-wider leading-none" style={{ fontSize: size * 0.85, color }}>ASL</div>
      <div className="font-mono text-[7px] tracking-[0.3em] mt-0.5" style={{ color, opacity: 0.6 }}>NORTH AMERICA PREMIER</div>
    </div>
  </div>
);
