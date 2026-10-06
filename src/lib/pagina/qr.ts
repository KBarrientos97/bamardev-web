import QRCode from "qrcode";

/** Lo que se muestra debajo del QR: sin `https://`, que nadie lo tipea. */
export function textoEnlace(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** El QR en SVG, con la corrección del cartel. */
export function svgDeQr(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 0,
    color: { dark: "#111827", light: "#ffffff" },
  }).then((svg) => svg.replace("<svg ", '<svg width="100%" height="100%" '));
}
