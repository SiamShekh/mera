import { QRCodeSVG } from 'qrcode.react'

/** Project logo in the center of deposit QR codes (`public/logo.png`) */
export const PROJECT_LOGO_URL = '/logo.png'

type DepositQrProps = {
  address: string
  size?: number
}

/**
 * Solana deposit QR with project logo centered (high error correction for logo cutout).
 */
export function DepositQr({ address, size = 220 }: DepositQrProps) {
  const logoSize = Math.round(size * 0.2)

  return (
    <QRCodeSVG
      value={address}
      size={size}
      level="H"
      includeMargin={false}
      bgColor="#ffffff"
      fgColor="#0a0a0a"
      imageSettings={{
        src: PROJECT_LOGO_URL,
        height: logoSize,
        width: logoSize,
        excavate: true,
        crossOrigin: 'anonymous',
      }}
    />
  )
}
