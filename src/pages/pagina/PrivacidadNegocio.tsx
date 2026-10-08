import { useEffect, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { paleta } from "../../lib/pagina/aspecto";
import { cargarFuentesPagina } from "../../lib/pagina/estilos";
import { contactoDe } from "../../lib/pagina/contacto";
import { urlPaginaDe } from "../../lib/pagina/rutas";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import PoliticaNegocio from "../../publico/PoliticaNegocio";
import { NoDisponible } from "./PaginaPublica";
import { ANCHO_ESCRITORIO, MarcaBamarDev } from "./VistaPagina";

/**
 * `/p/:subdominio/privacidad`: la política para el cliente del negocio. Es el
 * mismo texto que `/r/<sub>/privacidad` (`PoliticaNegocio`): un negocio tiene
 * una sola política (B08). El responsable de los datos es el negocio.
 *
 * `siNoHay`: lo que se muestra si la página no está publicada. En el host
 * link, `/<sub>/privacidad` es de la página y de la reserva a la vez, y un
 * negocio puede tener sólo la reserva (ver RutasLink.tsx).
 *
 * En la computadora no se parte en columnas (es un texto para leer de
 * corrido): la hoja se ensancha hasta un largo de renglón cómodo y gana aire.
 */
export default function PrivacidadNegocio({ siNoHay }: { siNoHay?: ReactNode }) {
  const { subdominio } = useParams();
  const escritorio = useCoincideMedia(`(min-width: ${ANCHO_ESCRITORIO}px)`);
  const { pagina, error } = usePaginaPublica(subdominio);
  // Sólo Roboto: acá el nombre no va con la letra de la página.
  useEffect(() => cargarFuentesPagina(), []);
  if (error) return siNoHay ?? <NoDisponible mensaje={error} />;
  if (!pagina) return null;
  const c = paleta(pagina.color.hex);
  const contacto = contactoDe(pagina);
  const n = pagina.nombre;
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#F6F7F9",
        fontFamily: "Roboto, system-ui, sans-serif",
        padding: escritorio ? "48px 32px" : 16,
      }}
    >
      <article
        style={{
          maxWidth: escritorio ? 760 : 560,
          margin: "0 auto",
          background: "#ffffff",
          border: "1px solid #E5E7EB",
          borderRadius: escritorio ? 20 : 16,
          padding: escritorio ? "36px 48px" : 24,
          color: "#1F2937",
          lineHeight: 1.55,
        }}
      >
        <Link to={urlPaginaDe(pagina.subdominio)} style={{ fontSize: 14, color: c.oscuro, fontWeight: 500 }}>
          ← Volver a {n}
        </Link>
        <h1 style={{ fontSize: escritorio ? 28 : 22, margin: "14px 0 12px" }}>Tus datos en {n}</h1>
        <div style={{ fontSize: 15 }}>
          <PoliticaNegocio negocio={n} contacto={contacto} colorEnlace={c.oscuro} />
        </div>
        <a
          href="https://bamardev.com/privacidad"
          style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "#6B7280", marginTop: 6 }}
        >
          <MarcaBamarDev />
          Privacidad de BamarDev
        </a>
      </article>
    </div>
  );
}
