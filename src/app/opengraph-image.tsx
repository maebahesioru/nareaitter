import { ImageResponse } from 'next/og';

export const alt = 'Twitter馴れ合いサークル';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 80, fontWeight: 'bold', color: 'white', marginBottom: 20 }}>
          Twitter馴れ合いサークル
        </div>
        <div style={{ fontSize: 36, color: '#f5d0fe', textAlign: 'center' }}>
          X（Twitter）の交流をグリッド状に一覧表示
        </div>
      </div>
    ),
    { ...size }
  );
}
