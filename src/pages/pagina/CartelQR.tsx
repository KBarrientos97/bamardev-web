import { useEffect, useRef, useState } from "react";
import { Boton, ErrorMsg, Modal } from "../../components/ui";
import { apiPagina, urlDeImagen } from "../../lib/pagina/apiPagina";
import { paleta } from "../../lib/pagina/aspecto";
import { svgDeQr, textoEnlace } from "../../lib/pagina/qr";
import { MarcaBamarDev } from "./VistaPagina";

export interface DatosCartel {
  nombre: string;
  rubro?: string;
  iniciales: string;
  logoUrl: string | null;
  colorHex: string;
  reservar: boolean;
}

/**
 * El cartel A5 del mostrador (lienzo CartelQR, B3). El QR apunta al ENLACE
 * CORTO de la página, nunca a la página: así se re-apunta sin reimprimir y se
 * cuentan los escaneos (PLAN-ACORTADOR U1). Corrección Q: un cartel se
 * ensucia y se dobla (§4.10).
 *
 * Todo con estilos en línea: se imprime en una ventana aparte con su propia
 * hoja A5 (la app fija el papel del ticket, 80 mm, para todo lo demás).
 */
export function Cartel({ datos, url, svgQr }: { datos: DatosCartel; url: string; svgQr: string }) {
  const c = paleta(datos.colorHex);
  const logo = urlDeImagen(datos.logoUrl);
  return (
    <div
      data-testid="cartel-qr"
      style={{
        width: 420,
        height: 595,
        boxSizing: "border-box",
        background: "#ffffff",
        fontFamily: "Roboto, system-ui, sans-serif",
        color: "#1F2937",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ background: c.barra, color: "#ffffff", padding: "28px 28px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        {logo ? (
          <img
            src={logo}
            alt=""
            crossOrigin="anonymous"
            style={{ width: 56, height: 56, borderRadius: 999, objectFit: "cover", background: "#fff", border: "2px solid #fff" }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              background: "#ffffff",
              color: c.barra,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 700,
              flex: "none",
            }}
          >
            {datos.iniciales}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <strong style={{ fontSize: 22, lineHeight: 1.2 }}>{datos.nombre}</strong>
          {datos.rubro && <span style={{ fontSize: 14, opacity: 0.9 }}>{datos.rubro}</span>}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2, fontWeight: 700 }}>
          {datos.reservar ? (
            <>
              Reservá tu turno
              <br />y seguinos
            </>
          ) : (
            <>
              Seguinos y
              <br />
              encontranos
            </>
          )}
        </h1>
        <div
          aria-label={`Código QR de ${textoEnlace(url)}`}
          role="img"
          style={{ width: 220, height: 220, boxSizing: "border-box", border: "2px solid #1F2937", borderRadius: 16, padding: 14 }}
          dangerouslySetInnerHTML={{ __html: svgQr }}
        />
        <span style={{ fontSize: 15, fontWeight: 500 }}>Escaneá con la cámara del celular</span>
        <span style={{ fontSize: 14, color: c.oscuro, fontWeight: 700, wordBreak: "break-all" }}>{textoEnlace(url)}</span>
      </div>
      <div
        style={{
          borderTop: "1px solid #F0F1F4",
          padding: "12px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 11,
          color: "#6B7280",
        }}
      >
        <MarcaBamarDev size={16} />
        Hecho con BamarDev
      </div>
    </div>
  );
}

/** Imprime el cartel en una ventana aparte con su hoja A5. */
function imprimir(nodo: HTMLElement, titulo: string) {
  const v = window.open("", "_blank", "width=600,height=820");
  if (!v) return false;
  v.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo.replace(/</g, "")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap">
<style>@page{size:A5 portrait;margin:0}html,body{margin:0;padding:0}
.hoja{width:148mm;height:210mm;display:flex;align-items:center;justify-content:center;overflow:hidden}
.hoja>div{transform:scale(1.33);transform-origin:center}
@media screen{body{background:#e5e7eb}.hoja{background:#fff;margin:12px auto;box-shadow:0 4px 16px rgba(0,0,0,.15)}}</style>
</head><body><div class="hoja">${nodo.outerHTML}</div></body></html>`);
  v.document.close();
  const lanzar = () => {
    v.focus();
    v.print();
  };
  // Las imágenes (logo) tienen que estar cargadas antes de imprimir.
  if (v.document.readyState === "complete") setTimeout(lanzar, 300);
  else v.addEventListener("load", () => setTimeout(lanzar, 300));
  return true;
}

export default function CartelQR({
  abierto,
  onClose,
  datos,
}: {
  abierto: boolean;
  onClose: () => void;
  datos: DatosCartel;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [bajando, setBajando] = useState(false);
  const nodo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setError("");
    apiPagina
      .enlaceCorto("CARTEL")
      .then(async (e) => {
        const qr = await svgDeQr(e.url);
        if (!vivo) return;
        setUrl(e.url);
        setSvg(qr);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo armar el cartel"));
    return () => {
      vivo = false;
    };
  }, [abierto]);

  const descargar = async () => {
    const el = nodo.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    setBajando(true);
    try {
      const { toPng } = await import("html-to-image");
      const png = await toPng(el, { pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true });
      const a = document.createElement("a");
      a.href = png;
      a.download = `cartel-qr-${datos.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
    } catch {
      setError("No se pudo generar la imagen. Probá con Imprimir y guardá como PDF.");
    } finally {
      setBajando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo="Cartel QR para el mostrador"
      subtitulo="Hoja A5. El QR lleva a tu página por un enlace corto: si algo cambia, no hay que reimprimir."
      onClose={onClose}
      ancho="max-w-xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cerrar
          </Boton>
          <Boton variante="ghost" icono="download" onClick={descargar} disabled={!url || bajando}>
            {bajando ? "Generando…" : "Descargar imagen"}
          </Boton>
          <Boton
            icono="printer"
            disabled={!url}
            onClick={() => {
              const el = nodo.current?.firstElementChild as HTMLElement | null;
              if (el && !imprimir(el, `Cartel QR · ${datos.nombre}`)) {
                setError("El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes.");
              }
            }}
          >
            Imprimir
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorMsg>{error}</ErrorMsg>
        <div className="flex justify-center overflow-x-auto rounded-xl bg-slate-100 p-3">
          <div ref={nodo} className="origin-top shadow-lg max-sm:scale-[0.78] max-sm:-mb-32">
            {url && svg ? (
              <Cartel datos={datos} url={url} svgQr={svg} />
            ) : (
              !error && <div style={{ width: 420, height: 595, background: "#fff" }} aria-busy="true" />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
