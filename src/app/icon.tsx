import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #00bcd4, #1e88e5)', borderRadius: '20%' }}>
        <span style={{ fontSize: 18, color: 'white', fontWeight: 'bold' }}>N</span>
      </div>
    ),
    { ...size }
  );
}
