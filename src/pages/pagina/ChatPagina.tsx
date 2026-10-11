import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Captcha from "../../publico/Captcha";
import { siteKeyTurnstile } from "../../lib/turnstile";
import {
  chatDisponible,
  enviarMensaje,
  ErrorChat,
  urlSegura,
  type BloqueChat,
} from "../../lib/chat/apiChat";

/**
 * El asistente de la página del negocio (IDEAS/3b-CHATBOT-SIN-IA): una
 * burbuja abajo a la derecha que abre un chat. Responde con reglas y con los
 * datos públicos del negocio; no es una IA y lo dice.
 *
 * · Sólo aparece si el servicio responde: apagado o sin desplegar, la página
 *   queda igual que antes.
 * · El saludo se arma acá, sin llamar al servicio: abrir la burbuja no gasta
 *   un captcha ni una sesión.
 * · El captcha (Turnstile) se pide una vez, antes del primer mensaje; después
 *   alcanza con la sesión.
 * · Las horas libres llevan a la reserva de siempre: el chat nunca reserva.
 */

interface Mensaje {
  de: "cliente" | "asistente";
  bloques: BloqueChat[];
}

const MAX_LARGO = 300;

function claveSesion(subdominio: string) {
  return `chat:${subdominio}`;
}

function leerSesion(subdominio: string): string | null {
  try {
    return sessionStorage.getItem(claveSesion(subdominio));
  } catch {
    return null;
  }
}

function guardarSesion(subdominio: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(claveSesion(subdominio), id);
    else sessionStorage.removeItem(claveSesion(subdominio));
  } catch {
    // Sin storage (modo privado estricto): la sesión vive sólo en memoria.
  }
}

export default function ChatPagina({
  subdominio,
  nombre,
  color,
  reservar,
}: {
  subdominio: string;
  nombre: string;
  /** El color de la página (`pagina.color.hex`): una de las muestras, siempre oscura. */
  color: string;
  reservar: boolean;
}) {
  const [disponible, setDisponible] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => [
    {
      de: "asistente",
      bloques: [
        {
          tipo: "texto",
          texto: `¡Hola! Soy el asistente automático de ${nombre}. Preguntame por horarios, precios, ubicación${reservar ? " u horas libres para reservar" : ""}.`,
        },
        { tipo: "opciones", opciones: ["Horarios", "Precios", "Ubicación", ...(reservar ? ["Reservar"] : [])] },
      ],
    },
  ]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sesionId, setSesionId] = useState<string | null>(() => leerSesion(subdominio));
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);

  const siteKey = siteKeyTurnstile();
  const pideCaptcha = !!siteKey && !sesionId;

  useEffect(() => {
    let vivo = true;
    void chatDisponible().then((ok) => {
      if (vivo) setDisponible(ok);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    fondo.current?.scrollIntoView?.({ block: "end" });
  }, [mensajes, abierto]);

  if (!disponible) return null;

  async function enviar(t: string) {
    const limpio = t.trim().slice(0, MAX_LARGO);
    if (!limpio || enviando) return;
    if (pideCaptcha && !captcha) {
      setAviso("Completá la verificación de abajo para empezar.");
      return;
    }
    setAviso(null);
    setTexto("");
    setMensajes((m) => [...m, { de: "cliente", bloques: [{ tipo: "texto", texto: limpio }] }]);
    setEnviando(true);
    try {
      const r = await enviarMensaje(subdominio, {
        ...(sesionId ? { sesionId } : {}),
        texto: limpio,
        ...(pideCaptcha && captcha ? { captcha } : {}),
      });
      setSesionId(r.sesionId);
      guardarSesion(subdominio, r.sesionId);
      setMensajes((m) => [...m, { de: "asistente", bloques: r.bloques }]);
    } catch (e) {
      if (e instanceof ErrorChat && e.captcha) {
        // Sesión vencida: hay que verificar de nuevo y reenviar.
        setSesionId(null);
        guardarSesion(subdominio, null);
        setAviso("Por seguridad, completá la verificación y volvé a enviar tu consulta.");
      } else {
        setMensajes((m) => [
          ...m,
          {
            de: "asistente",
            bloques: [{ tipo: "texto", texto: "No pude responder ahora. Probá de nuevo en un rato o escribile al negocio." }],
          },
        ]);
      }
    } finally {
      setEnviando(false);
      // El token de Turnstile es de un solo uso: el backend ya lo gastó.
      if (pideCaptcha) {
        setCaptcha(null);
        setVueltaCaptcha((v) => v + 1);
      }
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    void enviar(texto);
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el asistente"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 50,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderRadius: 999,
          border: "none",
          background: color,
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 600,
          boxShadow: "0 6px 20px rgba(0,0,0,.18)",
          cursor: "pointer",
          fontFamily: "Roboto, system-ui, sans-serif",
        }}
      >
        <IconoChat />
        ¿Tenés una consulta?
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label={`Asistente de ${nombre}`}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 50,
        width: "min(380px, calc(100vw - 32px))",
        height: "min(580px, calc(100dvh - 32px))",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        borderRadius: 16,
        border: "1px solid #E5E7EB",
        boxShadow: "0 12px 40px rgba(0,0,0,.22)",
        overflow: "hidden",
        fontFamily: "Roboto, system-ui, sans-serif",
        color: "#1F2937",
      }}
    >
      <header
        style={{
          background: color,
          color: "#ffffff",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nombre}
          </div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Asistente automático · no es una persona</div>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cerrar el asistente"
          style={{ background: "transparent", border: "none", color: "#ffffff", fontSize: 22, lineHeight: 1, cursor: "pointer", padding: 4 }}
        >
          ×
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, background: "#F6F7F9", display: "flex", flexDirection: "column", gap: 8 }}>
        {mensajes.map((m, i) => (
          <Burbuja key={i} de={m.de} color={color}>
            {m.bloques.map((b, j) => (
              <BloqueVista key={j} bloque={b} color={color} alElegir={(t) => void enviar(t)} deshabilitado={enviando} />
            ))}
          </Burbuja>
        ))}
        {enviando && (
          <div aria-live="polite" style={{ fontSize: 13, color: "#6B7280", padding: "0 4px" }}>
            Escribiendo…
          </div>
        )}
        <div ref={fondo} />
      </div>

      <form onSubmit={alEnviar} style={{ borderTop: "1px solid #E5E7EB", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {pideCaptcha && siteKey && <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} />}
        {aviso && <p style={{ margin: 0, fontSize: 12, color: "#B91C1C" }}>{aviso}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={MAX_LARGO}
            placeholder="Escribí tu consulta"
            aria-label="Tu consulta"
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid #D1D5DB",
              borderRadius: 999,
              padding: "10px 14px",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "0 16px",
              background: color,
              color: "#ffffff",
              fontWeight: 600,
              fontSize: 14,
              cursor: enviando || !texto.trim() ? "default" : "pointer",
              opacity: enviando || !texto.trim() ? 0.5 : 1,
            }}
          >
            Enviar
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>
          No escribas datos personales ni de salud. Las respuestas salen de la información que publica el negocio.
        </p>
      </form>
    </section>
  );
}

function Burbuja({ de, color, children }: { de: Mensaje["de"]; color: string; children: ReactNode }) {
  const cliente = de === "cliente";
  return (
    <div
      style={{
        alignSelf: cliente ? "flex-end" : "flex-start",
        maxWidth: "88%",
        background: cliente ? color : "#ffffff",
        color: cliente ? "#ffffff" : "#1F2937",
        border: cliente ? "none" : "1px solid #E5E7EB",
        borderRadius: 14,
        padding: "8px 12px",
        fontSize: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function BloqueVista({
  bloque,
  color,
  alElegir,
  deshabilitado,
}: {
  bloque: BloqueChat;
  color: string;
  alElegir: (texto: string) => void;
  deshabilitado: boolean;
}) {
  switch (bloque.tipo) {
    case "texto":
      return <p style={{ margin: 0, whiteSpace: "pre-line", lineHeight: 1.4 }}>{bloque.texto}</p>;

    case "items":
      return (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {bloque.items.map((it, i) => (
            <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #F3F4F6", paddingBottom: 4 }}>
              <span>
                {it.nombre}
                {it.duracion && <span style={{ color: "#6B7280", fontSize: 12 }}> · {it.duracion}</span>}
              </span>
              <strong style={{ whiteSpace: "nowrap" }}>{it.precio ?? "Consultar"}</strong>
            </li>
          ))}
        </ul>
      );

    case "horas":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            {bloque.servicio} · {bloque.sucursal}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {bloque.horas.map((h) =>
              urlSegura(bloque.reservarUrl) ? (
                <a
                  key={h}
                  href={bloque.reservarUrl}
                  style={{ border: `1px solid ${color}`, color, borderRadius: 999, padding: "4px 10px", fontSize: 13, textDecoration: "none" }}
                >
                  {h}
                </a>
              ) : (
                <span key={h} style={{ border: "1px solid #D1D5DB", borderRadius: 999, padding: "4px 10px", fontSize: 13 }}>
                  {h}
                </span>
              ),
            )}
          </div>
          {urlSegura(bloque.reservarUrl) && (
            <a href={bloque.reservarUrl} style={{ color, fontWeight: 600, fontSize: 13 }}>
              Reservar {bloque.etiquetaFecha} →
            </a>
          )}
        </div>
      );

    case "ubicacion":
      return (
        <div>
          <strong>{bloque.nombre}</strong>
          {bloque.direccion && <div>{bloque.direccion}</div>}
          {bloque.mapaUrl && urlSegura(bloque.mapaUrl) && (
            <a href={bloque.mapaUrl} target="_blank" rel="noopener noreferrer" style={{ color, fontSize: 13 }}>
              Ver en el mapa
            </a>
          )}
        </div>
      );

    case "enlace":
      if (!urlSegura(bloque.url)) return null;
      return (
        <a
          href={bloque.url}
          target={bloque.url.startsWith("tel:") ? undefined : "_blank"}
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            alignSelf: "flex-start",
            background: color,
            color: "#ffffff",
            borderRadius: 999,
            padding: "6px 12px",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {bloque.etiqueta}
        </a>
      );

    case "opciones":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {bloque.opciones.map((o) => (
            <button
              key={o}
              type="button"
              disabled={deshabilitado}
              onClick={() => alElegir(o)}
              style={{
                border: `1px solid ${color}`,
                background: "#ffffff",
                color,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 13,
                cursor: deshabilitado ? "default" : "pointer",
              }}
            >
              {o}
            </button>
          ))}
        </div>
      );
  }
}

function IconoChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
    </svg>
  );
}
