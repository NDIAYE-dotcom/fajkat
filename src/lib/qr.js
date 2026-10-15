// QR code en SVG, noir sur blanc (tokens d'impression) : il se lit partout, imprimé ou à
// l'écran. La bibliothèque qrcode n'est chargée qu'au premier QR dessiné.

function couleursQr() {
  const style = getComputedStyle(document.documentElement)
  return {
    dark: style.getPropertyValue('--impression-encre').trim() || undefined,
    light: style.getPropertyValue('--impression-fond').trim() || undefined,
  }
}

export async function dessinerQr(texte) {
  const { default: QRCode } = await import('qrcode')
  return QRCode.toString(texte, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: couleursQr(),
  })
}
