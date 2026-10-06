import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { cargarFuentesPagina, paleta } from "../../lib/pagina/aspecto";
import { contactoDe } from "../../lib/pagina/contacto";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { NoDisponible } from "./PaginaPublica";
import { MarcaBamarDev } from "./VistaPagina";

/**
 * `/p/:subdominio/privacidad`: la política para el cliente del negocio
 * (legal/PRIVACIDAD-CLIENTE-FINAL.md, texto corto v0.1 con sus marcadores
 * reemplazados). El responsable de los datos es el negocio.
 */
export default function PrivacidadNegocio() {
  const { subdominio } = useParams();
  const { pagina, error } = usePaginaPublica(subdominio);
  useEffect(cargarFuentesPagina, []);
  if (error) return <NoDisponible mensaje={error} />;
  if (!pagina) return null;
  const c = paleta(pagina.color.hex);
  const contacto = contactoDe(pagina);
  const n = pagina.nombre;
  return (
    <div style={{ minHeight: "100dvh", background: "#F6F7F9", fontFamily: "Roboto, system-ui, sans-serif", padding: 16 }}>
      <article
        style={{
          maxWidth: 560,
          margin: "0 auto",
          background: "#ffffff",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          padding: 24,
          color: "#1F2937",
          lineHeight: 1.55,
        }}
      >
        <Link to={`/p/${pagina.subdominio}`} style={{ fontSize: 14, color: c.oscuro, fontWeight: 500 }}>
          ← Volver a {n}
        </Link>
        <h1 style={{ fontSize: 22, margin: "14px 0 12px" }}>Tus datos en {n}</h1>
        <p style={{ fontSize: 15, margin: 0 }}>
          <strong>{n}</strong> usa tu nombre y tu teléfono para agendar, confirmar y recordarte tus citas, y para
          atenderte. {n} es el responsable de tus datos y no los vende. Los guarda en <strong>BamarDev</strong>, la
          plataforma que usa para su agenda, que solo los trata por cuenta de {n}. Si un dato de salud (como una
          alergia) es necesario para atenderte, se te pedirá en el local y solo lo verá quien te atienda. Para ver,
          corregir o borrar tus datos, escribile a {n}
          {contacto ? (
            <>
              {" "}
              (<a href={contacto.url} style={{ color: c.oscuro }}>{contacto.texto}</a>)
            </>
          ) : null}
          .
        </p>
        <p style={{ fontSize: 12, color: "#6B7280", marginTop: 18 }}>
          Esta página no guarda cookies ni datos de quien la visita: los botones sólo cuentan cuántas veces se tocan.
        </p>
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
