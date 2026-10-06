import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { avisarClic } from "../../lib/pagina/apiPagina";
import { urlPrivacidadDe, urlReservaDe } from "../../lib/pagina/rutas";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { cargarFuentesPagina } from "../../lib/pagina/aspecto";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import VistaPagina, { MarcaBamarDev } from "./VistaPagina";


/**
 * Pone título y etiquetas para compartir. WhatsApp y Facebook no ejecutan
 * JavaScript, así que esto no les llega (para eso el enlace corto les sirve
 * el HTML con Open Graph, y la página las Pages Functions, también en
 * `link.bamardev.com`): sirve para la pestaña del navegador y para quien sí lo lee.
 */
function useMetadatosPagina(p: Pagina | null) {
  useEffect(() => {
    if (!p) return;
    const anterior = document.title;
    document.title = p.nombre;
    const metas: HTMLMetaElement[] = [];
    const poner = (atributo: "name" | "property", clave: string, valor: string) => {
      const m = document.createElement("meta");
      m.setAttribute(atributo, clave);
      m.content = valor;
      document.head.appendChild(m);
      metas.push(m);
    };
    poner("name", "description", p.og.descripcion);
    poner("property", "og:title", p.og.titulo);
    poner("property", "og:description", p.og.descripcion);
    poner("name", "theme-color", p.color.hex);
    return () => {
      document.title = anterior;
      metas.forEach((m) => m.remove());
    };
  }, [p]);
}

export function NoDisponible({ mensaje = "Esta página no está disponible" }: { mensaje?: string }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#F6F7F9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "Roboto, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 360,
          width: "100%",
          background: "#ffffff",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          padding: 28,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#1F2937" }}>{mensaje}</h1>
        <p style={{ fontSize: 14, color: "#4B5563", margin: "0 0 18px" }}>
          Revisá que el enlace esté bien escrito o pedile al negocio su dirección.
        </p>
        <a
          href="https://bamardev.com"
          style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "#6B7280", textDecoration: "none" }}
        >
          <MarcaBamarDev />
          Hecho con BamarDev
        </a>
      </div>
    </div>
  );
}

function Cargando() {
  return (
    <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" aria-label="Cargando">
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ height: 200, background: "#E5E7EB" }} />
        <div
          style={{ width: 104, height: 104, borderRadius: 999, background: "#E5E7EB", margin: "-52px auto 0", border: "4px solid #fff" }}
        />
      </div>
    </div>
  );
}

/**
 * `/p/:subdominio`: la página pública del negocio (PLAN-PAGINA-NEGOCIO §2).
 * Fuera de la sesión de la app: la ve cualquiera, y un error acá nunca manda
 * al login. También en `link.bamardev.com/<subdominio>` (RutasLink.tsx).
 */
export default function PaginaPublica() {
  const { subdominio } = useParams();
  const { pagina, error } = usePaginaPublica(subdominio);
  useEffect(cargarFuentesPagina, []);
  useMetadatosPagina(pagina);

  if (error) return <NoDisponible mensaje={error} />;
  if (!pagina) return <Cargando />;
  return (
    <VistaPagina
      pagina={pagina}
      urlReservar={urlReservaDe(pagina.subdominio)}
      urlPrivacidad={urlPrivacidadDe(pagina.subdominio)}
      alClic={(e) => avisarClic(pagina.subdominio, e.id)}
    />
  );
}
