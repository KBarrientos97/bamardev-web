import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TarjetaRegalo from "../../components/regalos/TarjetaRegalo";
import { BASE_API, urlDeImagen } from "../../lib/pagina/apiPagina";
import { urlPaginaDe } from "../../lib/pagina/rutas";
import { fechaCorta, montoTexto, tonos } from "../../lib/regalos/disenos";
import { compartirComoImagen, puedeCompartirImagen } from "../../lib/compartirTicket";
import { NoDisponible } from "./PaginaPublica";

/**
 * Lo que ve quien recibe una gift card (IDEAS/6 #6): el enlace que el negocio
 * comparte después de emitirla en el POS. La tarjeta con su diseño, la
 * dedicatoria, cuánto le queda y el código para dictar en la caja; y los
 * botones para guardarla o reenviarla como imagen.
 */

export interface RegaloPublico {
  negocio: {
    nombre: string;
    subdominio: string;
    rubroClave: string;
    color: { clave: string; hex: string };
    logoUrl: string | null;
  };
  diseno: string;
  monto: number;
  saldo: number;
  codigo: string;
  venceEn: string | null;
  para: string | null;
  de: string | null;
  mensaje: string | null;
  /** USABLE · AGOTADA · VENCIDA · ANULADA */
  estado: string;
}

const ESTADO: Record<string, string> = {
  USABLE: "Lista para usar",
  AGOTADA: "Ya se usó completa",
  VENCIDA: "Venció",
  ANULADA: "Anulada por el negocio",
};

export default function VerRegalo() {
  const { subdominio = "", token = "" } = useParams();
  const [r, setR] = useState<RegaloPublico | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const tarjeta = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`${BASE_API}/publico/pagina/${encodeURIComponent(subdominio)}/regalo/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!vivo) return;
        if (res.status === 404) return setError("Esta gift card no existe o el enlace está mal copiado");
        if (!res.ok) return setError("No se pudo cargar la gift card. Probá de nuevo en un rato.");
        setR((await res.json()) as RegaloPublico);
      })
      .catch(() => vivo && setError("No se pudo cargar la gift card. Revisá tu conexión."));
    return () => {
      vivo = false;
    };
  }, [subdominio, token]);

  useEffect(() => {
    if (r) document.title = `Gift card de ${r.negocio.nombre}`;
  }, [r]);

  if (error) return <NoDisponible mensaje={error} />;
  if (!r) return <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" aria-label="Cargando" />;

  const t = tonos(r.negocio.color.hex);
  const vence = fechaCorta(r.venceEn);
  const usable = r.estado === "USABLE";

  async function guardar() {
    if (!tarjeta.current) return;
    const res = await compartirComoImagen(tarjeta.current, `gift-card-${r!.negocio.subdominio}.png`);
    if (!res.ok && res.motivo === "error") setAviso("No se pudo armar la imagen. Probá con una captura de pantalla.");
  }

  const enlace = typeof location !== "undefined" ? location.href : "";
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `${r.para ? `¡${r.para}, ` : "¡"}te regalaron una gift card de ${r.negocio.nombre}! Mirala acá: ${enlace}`,
  )}`;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: t.tinte,
        display: "flex",
        justifyContent: "center",
        padding: "28px 16px",
        fontFamily: "Roboto, system-ui, sans-serif",
        color: "#1F2937",
      }}
    >
      <div style={{ width: "min(460px, 100%)", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, textAlign: "center" }}>
          {r.para ? `¡${r.para}, tenés un regalo!` : "¡Tenés un regalo!"}
        </h1>

        <div ref={tarjeta} style={{ borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,.18)" }}>
          <TarjetaRegalo
            datos={{
              diseno: r.diseno,
              rubro: r.negocio.rubroClave,
              color: r.negocio.color.hex,
              negocio: r.negocio.nombre,
              monto: r.monto,
              para: r.para,
              de: r.de,
              codigo: r.codigo,
              vence: r.venceEn,
              fotoUrl: urlDeImagen(r.negocio.logoUrl),
            }}
          />
        </div>

        {r.mensaje && (
          <blockquote
            style={{
              margin: 0,
              background: "#ffffff",
              borderRadius: 14,
              padding: "14px 16px",
              fontSize: 16,
              lineHeight: 1.5,
              borderLeft: `4px solid ${t.base}`,
              whiteSpace: "pre-line",
            }}
          >
            {r.mensaje}
            {r.de && <footer style={{ marginTop: 6, fontSize: 13, color: "#6B7280" }}>— {r.de}</footer>}
          </blockquote>
        )}

        <section style={{ background: "#ffffff", borderRadius: 14, padding: 16, display: "grid", gap: 8, fontSize: 14 }} aria-label="Datos de la gift card">
          <Fila etiqueta="Estado" valor={ESTADO[r.estado] ?? r.estado} fuerte={!usable} />
          <Fila etiqueta="Saldo" valor={`${montoTexto(r.saldo)}${r.saldo !== r.monto ? ` de ${montoTexto(r.monto)}` : ""}`} />
          <Fila etiqueta="Válida hasta" valor={vence ?? "No vence"} />
          <Fila etiqueta="Código" valor={r.codigo} mono />
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6B7280" }}>
            En {r.negocio.nombre} decí el código al pagar: se descuenta del saldo, aunque sea en varias visitas.
          </p>
        </section>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void guardar()}
            style={{ flex: 1, minWidth: 150, border: "none", borderRadius: 999, background: t.base, color: t.sobreBase, fontWeight: 700, padding: "12px 16px", cursor: "pointer" }}
          >
            {puedeCompartirImagen() ? "Compartir imagen" : "Descargar imagen"}
          </button>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, minWidth: 150, borderRadius: 999, background: r.negocio.color.hex, color: "#ffffff", fontWeight: 700, padding: "12px 16px", textAlign: "center", textDecoration: "none" }}
          >
            Reenviar por WhatsApp
          </a>
        </div>
        {aviso && <p style={{ margin: 0, fontSize: 13, color: "#B91C1C", textAlign: "center" }}>{aviso}</p>}

        <Link to={urlPaginaDe(r.negocio.subdominio)} style={{ textAlign: "center", color: t.oscuro, fontWeight: 600 }}>
          Ver {r.negocio.nombre}
        </Link>
      </div>
    </main>
  );
}

function Fila({ etiqueta, valor, mono, fuerte }: { etiqueta: string; valor: string; mono?: boolean; fuerte?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#6B7280" }}>{etiqueta}</span>
      <strong style={{ fontFamily: mono ? "ui-monospace, Menlo, monospace" : undefined, color: fuerte ? "#B91C1C" : undefined }}>{valor}</strong>
    </div>
  );
}
