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

export const ASLLogoFull = ({ size = 32, color = "hsl(var(--foreground))" }: { size?: number; color?: string }) => (
  <div className="flex items-center gap-3">
    <ASLCrest size={size} />
    <div>
      <div className="font-semibold leading-none" style={{ fontSize: size * 0.85, color }}>ASL</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground" style={{ color }}>North America Premier</div>
    </div>
  </div>
);
