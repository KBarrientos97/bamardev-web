import type { CSSProperties } from "react";
import { VERSION_POLITICA, type ContactoNegocio } from "./util";

export interface PropsPolitica {
  negocio: string;
  /** Cómo escribirle al negocio, con el número a la vista (B08). */
  contacto: ContactoNegocio | null;
  version?: string;
  /** Color de los enlaces (la página del negocio usa el suyo). */
  colorEnlace?: string;
}

const subtitulo: CSSProperties = { fontSize: 15, fontWeight: 700, margin: "18px 0 4px" };
const parrafo: CSSProperties = { margin: "0 0 10px" };

/**
 * La política de privacidad del negocio para su cliente final: **una sola**
 * para la página del negocio (`/p/<sub>/privacidad`) y la reserva online
 * (`/r/<sub>/privacidad`), que antes tenían dos textos distintos (B08 de la
 * ronda 1 de QA). Plantilla v0.1 de legal/PRIVACIDAD-CLIENTE-FINAL.md,
 * ampliada con lo que de verdad se guarda; a revisar con un abogado antes de
 * PROD (PLAN-AGENDA-BELLEZA §17).
 *
 * Si cambia lo que se guarda (backend `reserva-publica`, la página o la
 * telemetría), este texto cambia con él y sube la versión.
 */
export default function PoliticaNegocio({ negocio: n, contacto, version = VERSION_POLITICA, colorEnlace }: PropsPolitica) {
  const enlace: CSSProperties = { color: colorEnlace, textDecoration: "underline" };
  return (
    <div>
      <p style={parrafo}>
        <strong>{n}</strong> usa tu nombre y tu teléfono para agendar, confirmar y recordarte tus citas, y para atenderte.{" "}
        {n} es el responsable de tus datos y no los vende. Los guarda en <strong>BamarDev</strong>, la plataforma que usa
        para su agenda, que solo los trata por cuenta de {n}.
      </p>

      <h2 style={subtitulo}>Qué se guarda si reservás por internet</h2>
      <p style={parrafo}>
        Tu nombre y tu teléfono, la nota que escribas, la cita (servicios, día, hora y con quién) y cuándo aceptaste esta
        política. Si ya sos cliente de {n} con ese teléfono, la cita se suma a tu ficha. Para frenar reservas falsas se
        guarda también una huella cifrada de tu conexión, que no deja saber tu dirección de internet y se borra a los 2
        días.
      </p>
      <p style={parrafo}>
        Si un dato de salud (como una alergia) es necesario para atenderte, se te pedirá en el local y solo lo verá quien
        te atienda. Por eso la reserva por internet no te pide ninguno.
      </p>

      <h2 style={subtitulo}>Qué queda en tu teléfono</h2>
      <p style={parrafo}>
        Estas páginas no usan cookies ni herramientas de publicidad o de seguimiento. Si reservás, tu navegador guarda el
        enlace de tu reserva para mostrarte “Ver mi reserva”; lo borrás borrando los datos del sitio. Los botones de la
        página de {n} solo cuentan cuántas veces se tocan, sin saber quién. Cloudflare, el servicio que entrega estas
        páginas, cuenta las visitas en forma agregada y sin cookies.
      </p>

      <h2 style={subtitulo}>Cuánto tiempo y cómo pedir que los borren</h2>
      <p style={parrafo}>
        Tus datos se guardan mientras seas cliente de {n} o hasta que pidas borrarlos. Para verlos, corregirlos o
        borrarlos, escribile a {n}
        {contacto ? (
          <>
            {" "}
            <a href={contacto.url} style={enlace}>
              {contacto.texto}
            </a>
          </>
        ) : null}
        . También podés pedirlo desde el enlace de tu reserva: {n} revisa el pedido y, como el teléfono de una reserva
        no se verifica, puede confirmar que seas vos antes de borrar.
      </p>
      <p style={{ fontSize: 12, color: "#6B7280", margin: "14px 0 0" }}>Versión {version}.</p>
    </div>
  );
}

