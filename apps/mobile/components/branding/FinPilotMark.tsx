import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

type FinPilotMarkProps = {
  size?: number;
};

export function FinPilotMark({ size = 72 }: FinPilotMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <Defs>
        <LinearGradient id="finpilotMarkBg" x1="32" y1="24" x2="164" y2="188" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#9F67FF" />
          <Stop offset="0.5" stopColor="#7C3AED" />
          <Stop offset="1" stopColor="#5A23C8" />
        </LinearGradient>
        <LinearGradient
          id="finpilotMarkGlow"
          x1="56"
          y1="52"
          x2="140"
          y2="152"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#C6A8FF" stopOpacity="0.42" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Rect x="24" y="20" width="152" height="160" rx="40" fill="url(#finpilotMarkBg)" />
      <Rect x="24" y="20" width="152" height="160" rx="40" fill="url(#finpilotMarkGlow)" />

      <Path
        d="M64 132C76 116.8 89.333 108.667 104 107.6C118.667 106.533 131.333 95.6667 142 75"
        stroke="#F6FFFE"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M127.5 75H142V89.5"
        stroke="#F6FFFE"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <Circle cx="100" cy="102" r="39" stroke="#F6FFFE" strokeOpacity="0.34" strokeWidth="8" />
      <Path
        d="M100 65L111.5 98.5L100 110.5L88.5 98.5L100 65Z"
        fill="#F6FFFE"
        fillOpacity="0.92"
      />
      <Circle cx="100" cy="102" r="8" fill="#16161A" stroke="#F6FFFE" strokeWidth="5" />
    </Svg>
  );
}
