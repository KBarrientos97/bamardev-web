import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PromoNoDisponible, pedirPromoPublica } from "../../lib/promociones/apiPromociones";
import type { PromoPublica as Promo } from "../../lib/promociones/tipos";
import { NoDisponible } from "./PaginaPublica";
import { MarcaBamarDev } from "./VistaPagina";

/**
 * `/p/:subdominio/promo/:slug`: la página pública de una promoción
 * (PLAN-CRM-Y-PROMOCIONES §6.6). Es a donde llevan los enlaces de campaña.
 *
 * Fuera de la sesión, como la página del negocio, y con su misma paleta
 * propia (estilos en línea con el color del negocio: no es la app, es la
 * vitrina). Título, condiciones en lenguaje claro, el código si es genérico
 * y el botón de WhatsApp del negocio con el texto "Quiero la promo…".
 */
export default function PromoPublica() {
  const { subdominio, slug } = useParams();
  const [promo, setPromo] = useState<Promo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!subdominio || !slug) {
      setError("Esta promoción no está disponible");
      return;
    }
    pedirPromoPublica(subdominio, slug)
      .then((p) => vivo && setPromo(p))
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(e instanceof PromoNoDisponible || e instanceof Error ? e.message : "Error");
      });
    return () => {
      vivo = false;
    };
  }, [subdominio, slug]);

  useEffect(() => {
    if (!promo) return;
    const anterior = document.title;
    document.title = `${promo.promo.nombre} · ${promo.negocio.nombre}`;
    return () => {
      document.title = anterior;
    };
  }, [promo]);

  if (error) return <NoDisponible mensaje={error} />;
  if (!promo) {
    return <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" aria-label="Cargando" />;
  }
  const color = promo.negocio.color?.hex ?? "#0C875E";
  const p = promo.promo;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#F6F7F9",
        fontFamily: "Roboto, system-ui, sans-serif",
        padding: "24px 16px",
      }}
    >
      <main style={{ maxWidth: 480, margin: "0 auto" }}>
        <a
          href={promo.negocio.paginaUrl ?? undefined}
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#1F2937" }}
        >
          {promo.negocio.logoUrl ? (
            <img src={promo.negocio.logoUrl} alt="" width={40} height={40} style={{ borderRadius: 999 }} />
          ) : (
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: color,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
              }}
            >
              {promo.negocio.iniciales ?? promo.negocio.nombre.slice(0, 2).toUpperCase()}
            </span>
          )}
          <strong style={{ fontSize: 15 }}>{promo.negocio.nombre}</strong>
        </a>

        <section
          style={{
            marginTop: 16,
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <div style={{ background: color, color: "#fff", padding: "22px 20px" }}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.9 }}>{p.programada ? "Muy pronto" : "Promoción"}</p>
            <h1 style={{ margin: "4px 0 0", fontSize: 24, lineHeight: 1.2 }}>{p.nombre}</h1>
            <p style={{ margin: "8px 0 0", fontSize: 17, fontWeight: 700 }}>{p.beneficio}</p>
          </div>
          <div style={{ padding: 20 }}>
            {p.descripcion && <p style={{ margin: "0 0 12px", color: "#374151", fontSize: 15 }}>{p.descripcion}</p>}
            <ul style={{ margin: 0, paddingLeft: 18, color: "#4B5563", fontSize: 14, lineHeight: 1.7 }}>
              {p.condiciones.slice(1).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>

            {p.codigo && (
              <div
                style={{
                  marginTop: 16,
                  border: `2px dashed ${color}`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>
                  <span style={{ display: "block", fontSize: 12, color: "#6B7280" }}>Tu código</span>
                  <strong style={{ fontSize: 22, letterSpacing: 2, color: "#1F2937" }}>{p.codigo}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(p.codigo!).then(() => setCopiado(true));
                  }}
                  style={{
                    border: "none",
                    background: "#F3F4F6",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>
            )}
            {p.conCodigo && !p.codigo && (
              <p style={{ marginTop: 14, fontSize: 13, color: "#6B7280" }}>
                Pedí tu código al negocio: es personal.
              </p>
            )}

            {promo.whatsapp && (
              <a
                href={promo.whatsapp}
                target="_blank"
                rel="noreferrer"
                style={{
                  marginTop: 18,
                  display: "block",
                  textAlign: "center",
                  background: color,
                  color: "#fff",
                  borderRadius: 14,
                  padding: "14px 16px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Quiero la promo por WhatsApp
              </a>
            )}
            {promo.negocio.paginaUrl && (
              <a
                href={promo.negocio.paginaUrl}
                style={{
                  marginTop: 10,
                  display: "block",
                  textAlign: "center",
                  color: "#374151",
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                Ver la página del negocio
              </a>
            )}
          </div>
        </section>

        <a
          href="https://bamardev.com"
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "center",
            gap: 6,
            alignItems: "center",
            fontSize: 12,
            color: "#6B7280",
            textDecoration: "none",
          }}
        >
          <MarcaBamarDev />
          Hecho con BamarDev
        </a>
      </main>
    </div>
  );
}
