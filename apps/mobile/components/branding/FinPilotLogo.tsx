import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

type FinPilotLogoProps = {
  showTagline?: boolean;
  width?: number;
};

export function FinPilotLogo({ showTagline = true, width = 220 }: FinPilotLogoProps) {
  const viewBox = showTagline ? '44 78 540 160' : '44 86 500 108';
  const aspectRatio = showTagline ? 540 / 160 : 500 / 108;
  const height = width / aspectRatio;

  return (
    <Svg width={width} height={height} viewBox={viewBox} fill="none">
      <Circle cx="144" cy="170" r="88" stroke="#7C3AED" strokeOpacity="0.35" />
      <Circle cx="144" cy="170" r="68" stroke="#7C3AED" strokeWidth="2.5" />
      <Circle cx="144" cy="170" r="52" fill="#7C3AED" fillOpacity="0.12" />

      <Polygon points="144,102 174,158 144,142 114,158" fill="#7C3AED" />
      <Polygon points="144,142 174,158 144,238 114,158" fill="#A855F7" fillOpacity="0.7" />
      <Polygon points="84,180 144,142 144,162 96,192" fill="#FFFFFF" fillOpacity="0.18" />
      <Polygon points="204,180 144,142 144,162 192,192" fill="#FFFFFF" fillOpacity="0.1" />

      <Circle cx="144" cy="170" r="7" fill="#FFFFFF" />

      <Line x1="144" y1="84" x2="144" y2="98" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
      <Line x1="144" y1="242" x2="144" y2="256" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
      <Line x1="60" y1="170" x2="74" y2="170" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
      <Line x1="214" y1="170" x2="228" y2="170" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />

      <G>
        <SvgText
          x="268"
          y="185"
          fill="#FFFFFF"
          fontFamily="Arial"
          fontSize="52"
          fontWeight="700"
        >
          Fin
        </SvgText>
        <SvgText
          x="358"
          y="185"
          fill="#A855F7"
          fontFamily="Arial"
          fontSize="52"
          fontWeight="700"
        >
          Pilot
        </SvgText>
      </G>

      {showTagline ? (
        <>
          <SvgText
            x="270"
            y="218"
            fill="#A855F7"
            fontFamily="Arial"
            fontSize="16"
            fontWeight="500"
          >
            YOUR MONEY CO-PILOT
          </SvgText>
          <Line x1="270" y1="232" x2="580" y2="232" stroke="#7C3AED" strokeOpacity="0.4" />
        </>
      ) : null}
    </Svg>
  );
}
