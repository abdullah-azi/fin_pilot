export const palette = {
  background: '#F4F8F7',
  surface: '#FFFFFF',
  teal: '#157A6E',
  tealSoft: '#D9F1ED',
  amber: '#F3B248',
  green: '#1F9D6E',
  coral: '#F06A63',
  text: '#17322F',
  textMuted: '#5B726E',
  border: '#D6E2DF',
  gray500: '#7D918D',
} as const;

export const authPalette = {
  background: '#0D0D0F',
  surface: '#16161A',
  surfaceRaised: '#1D1D22',
  border: '#2C2C33',
  text: '#F5F7FA',
  textMuted: '#7B7F8A',
  textSoft: '#505463',
  violet: '#7C3AED',
  violetBright: '#9F67FF',
  green: '#22C55E',
  amber: '#F59E0B',
  danger: '#F06A63',
} as const;

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

export const typography = {
  display: {
    fontSize: 34,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  title: {
    fontSize: 30,
    fontWeight: '700' as const,
    lineHeight: 36,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  bodyStrong: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    lineHeight: 18,
  },
  microLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 16,
    letterSpacing: 0.7,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: '#0F1C1A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
  },
  authCard: {
    shadowColor: authPalette.violet,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
  },
  authButton: {
    shadowColor: authPalette.violetBright,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
  },
  authLogo: {
    shadowColor: authPalette.violetBright,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
} as const;

export const theme = {
  app: {
    colors: palette,
  },
  auth: {
    colors: authPalette,
  },
  spacing,
  radius,
  typography,
  shadows,
} as const;
