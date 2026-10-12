import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Captcha from "../../publico/Captcha";
import { siteKeyTurnstile } from "../../lib/turnstile";
import { enviarMensaje, ErrorChat, inicioChat, urlSegura, type BloqueChat } from "../../lib/chat/apiChat";
import { dejarMensaje } from "../../lib/chat/apiAsistente";

/**
 * El asistente de la página del negocio (IDEAS/3b-CHATBOT-SIN-IA): una
 * burbuja abajo a la derecha que abre un chat. Responde con reglas y con los
 * datos públicos del negocio; no es una IA y lo dice.
 *
 * · Sólo con el extra `asistente_pagina` (lo decide PaginaPublica) y si el
 *   servicio responde el saludo (`/chat/<sub>/inicio`): si no, nada cambia.
 * · El captcha (Turnstile) va en modo discreto: invisible salvo que Cloudflare
 *   dude. El primer mensaje espera el token y sale solo.
 * · Las horas libres llevan a la reserva con el servicio y la hora ya
 *   elegidos: el chat nunca reserva.
 * · "Dejar un mensaje" va directo al backend, con su propio captcha.
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
}: {
  subdominio: string;
  nombre: string;
  /** El color de la página (`pagina.color.hex`): una de las muestras, siempre oscura. */
  color: string;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sesionId, setSesionId] = useState<string | null>(() => leerSesion(subdominio));
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
  /** El primer mensaje, esperando el token de Turnstile. */
  const [enEspera, setEnEspera] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const burbuja = useRef<HTMLButtonElement>(null);
  const yaAbrio = useRef(false);

  const siteKey = siteKeyTurnstile();
  const pideCaptcha = !!siteKey && !sesionId;

  useEffect(() => {
    let vivo = true;
    void inicioChat(subdominio).then((bloques) => {
      if (vivo && bloques) setMensajes([{ de: "asistente", bloques }]);
    });
    return () => {
      vivo = false;
    };
  }, [subdominio]);

  useEffect(() => {
    fondo.current?.scrollIntoView?.({ block: "end" });
  }, [mensajes, abierto]);

  // Al abrir, el foco va al campo; al cerrar, vuelve a la burbuja (teclado y
  // lectores de pantalla no quedan perdidos).
  useEffect(() => {
    if (abierto) {
      yaAbrio.current = true;
      campo.current?.focus();
    } else if (yaAbrio.current) {
      burbuja.current?.focus();
    }
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [abierto]);

  // Llegó el token con un mensaje esperando: sale solo.
  useEffect(() => {
    if (enEspera && captcha) {
      const t = enEspera;
      setEnEspera(null);
      void mandar(t, captcha);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enEspera, captcha]);

  if (!mensajes) return null;

  const agregar = (m: Mensaje) => setMensajes((ms) => [...(ms ?? []), m]);

  async function mandar(limpio: string, token: string | null) {
    setEnviando(true);
    try {
      const r = await enviarMensaje(subdominio, {
        ...(sesionId ? { sesionId } : {}),
        texto: limpio,
        ...(token ? { captcha: token } : {}),
      });
      setSesionId(r.sesionId);
      guardarSesion(subdominio, r.sesionId);
      agregar({ de: "asistente", bloques: r.bloques });
    } catch (e) {
      if (e instanceof ErrorChat && e.captcha) {
        // Sesión vencida: hay que verificar de nuevo; el mensaje queda en espera.
        setSesionId(null);
        guardarSesion(subdominio, null);
        setEnEspera(limpio);
      } else {
        agregar({
          de: "asistente",
          bloques: [{ tipo: "texto", texto: "No pude responder ahora. Probá de nuevo en un rato o escribile al negocio." }],
        });
      }
    } finally {
      setEnviando(false);
      // El token de Turnstile es de un solo uso: el servicio ya lo gastó.
      if (token) {
        setCaptcha(null);
        setVueltaCaptcha((v) => v + 1);
      }
    }
  }

  function enviar(t: string) {
    const limpio = t.trim().slice(0, MAX_LARGO);
    if (!limpio || enviando || enEspera) return;
    setTexto("");
    agregar({ de: "cliente", bloques: [{ tipo: "texto", texto: limpio }] });
    if (pideCaptcha && !captcha) {
      setEnEspera(limpio);
      return;
    }
    void mandar(limpio, pideCaptcha ? captcha : null);
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    enviar(texto);
  }

  if (!abierto) {
    return (
      <button
        ref={burbuja}
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

  const ocupado = enviando || !!enEspera;

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
      <header style={{ background: color, color: "#ffffff", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombre}</div>
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

      <div
        aria-live="polite"
        style={{ flex: 1, overflowY: "auto", padding: 12, background: "#F6F7F9", display: "flex", flexDirection: "column", gap: 8 }}
      >
        {mensajes.map((m, i) => (
          <Burbuja key={i} de={m.de} color={color}>
            {m.bloques.map((b, j) => (
              <BloqueVista
                key={j}
                bloque={b}
                color={color}
                subdominio={subdominio}
                alElegir={enviar}
                deshabilitado={ocupado}
                alDejarMensaje={(t) => agregar({ de: "asistente", bloques: [{ tipo: "texto", texto: t }] })}
              />
            ))}
          </Burbuja>
        ))}
        {ocupado && <div style={{ fontSize: 13, color: "#6B7280", padding: "0 4px" }}>{enEspera ? "Verificando…" : "Escribiendo…"}</div>}
        <div ref={fondo} />
      </div>

      <form onSubmit={alEnviar} style={{ borderTop: "1px solid #E5E7EB", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {pideCaptcha && siteKey && <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} discreto />}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={MAX_LARGO}
            placeholder="Escribí tu consulta"
            aria-label="Tu consulta"
            style={{ flex: 1, minWidth: 0, border: "1px solid #D1D5DB", borderRadius: 999, padding: "10px 14px", fontSize: 14, outline: "none" }}
          />
          <button
            type="submit"
            disabled={ocupado || !texto.trim()}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "0 16px",
              background: color,
              color: "#ffffff",
              fontWeight: 600,
              fontSize: 14,
              cursor: ocupado || !texto.trim() ? "default" : "pointer",
              opacity: ocupado || !texto.trim() ? 0.5 : 1,
            }}
          >
            Enviar
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>
          No escribas datos de salud. Las respuestas salen de la información que publica el negocio.
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

const pastilla = (color: string) => ({
  border: `1px solid ${color}`,
  color,
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 13,
  textDecoration: "none",
  background: "#ffffff",
});

function BloqueVista({
  bloque,
  color,
  subdominio,
  alElegir,
  deshabilitado,
  alDejarMensaje,
}: {
  bloque: BloqueChat;
  color: string;
  subdominio: string;
  alElegir: (texto: string) => void;
  deshabilitado: boolean;
  alDejarMensaje: (confirmacion: string) => void;
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
              urlSegura(h.url) ? (
                <a key={h.hora} href={h.url} aria-label={`Reservar ${bloque.etiquetaFecha} a las ${h.hora}`} style={pastilla(color)}>
                  {h.hora}
                </a>
              ) : (
                <span key={h.hora} style={pastilla("#6B7280")}>
                  {h.hora}
                </span>
              ),
            )}
          </div>
          {urlSegura(bloque.masUrl) && (
            <a href={bloque.masUrl} style={{ color, fontWeight: 600, fontSize: 13 }}>
              Ver más horarios →
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
              style={{ ...pastilla(color), cursor: deshabilitado ? "default" : "pointer" }}
            >
              {o}
            </button>
          ))}
        </div>
      );

    case "dejarMensaje":
      return <FormularioMensaje subdominio={subdominio} color={color} alEnviar={alDejarMensaje} />;
  }
}

/**
 * Nombre, teléfono y consulta para el negocio (lo ve en "Mi asistente"). Con
 * su propio captcha (el del chat ya se gastó) y un campo trampa para bots.
 */
function FormularioMensaje({ subdominio, color, alEnviar }: { subdominio: string; color: string; alEnviar: (t: string) => void }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [consulta, setConsulta] = useState("");
  const [trampa, setTrampa] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const siteKey = siteKeyTurnstile();

  if (listo) return <p style={{ margin: 0, color: "#047857" }}>Listo, mensaje enviado.</p>;

  const campoEstilo = { border: "1px solid #D1D5DB", borderRadius: 10, padding: "8px 10px", fontSize: 14, width: "100%" } as const;
  const valido = nombre.trim().length >= 2 && telefono.replace(/\D/g, "").length >= 7 && consulta.trim().length >= 2;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!valido || enviando) return;
    if (siteKey && !captcha) {
      setError("Esperá un segundo: estamos verificando que no seas un robot.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      await dejarMensaje(subdominio, {
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        mensaje: consulta.trim(),
        ...(captcha ? { captcha } : {}),
        ...(trampa ? { sitioWeb: trampa } : {}),
      });
      setListo(true);
      alEnviar("Le pasé tu mensaje al negocio. Te van a contactar al teléfono que dejaste.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el mensaje");
      if (siteKey) {
        setCaptcha(null);
        setVuelta((v) => v + 1);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} aria-label="Dejar un mensaje al negocio" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input aria-label="Tu nombre" placeholder="Tu nombre" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} style={campoEstilo} />
      <input
        aria-label="Tu teléfono"
        placeholder="Tu teléfono"
        inputMode="tel"
        maxLength={20}
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        style={campoEstilo}
      />
      <textarea
        aria-label="Tu consulta para el negocio"
        placeholder="Tu consulta"
        rows={3}
        maxLength={500}
        value={consulta}
        onChange={(e) => setConsulta(e.target.value)}
        style={{ ...campoEstilo, resize: "vertical" }}
      />
      {/* Campo trampa: invisible y fuera del Tab; si viene lleno, es un bot. */}
      <input
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        value={trampa}
        onChange={(e) => setTrampa(e.target.value)}
        style={{ position: "absolute", left: -10000, width: 1, height: 1, opacity: 0 }}
      />
      {siteKey && <Captcha key={vuelta} siteKey={siteKey} onToken={setCaptcha} discreto />}
      {error && <p style={{ margin: 0, fontSize: 12, color: "#B91C1C" }}>{error}</p>}
      <button
        type="submit"
        disabled={!valido || enviando}
        style={{
          border: "none",
          borderRadius: 999,
          padding: "8px 14px",
          background: color,
          color: "#ffffff",
          fontWeight: 600,
          fontSize: 14,
          opacity: !valido || enviando ? 0.5 : 1,
          cursor: !valido || enviando ? "default" : "pointer",
        }}
      >
        {enviando ? "Enviando…" : "Enviar al negocio"}
      </button>
    </form>
  );
}

function IconoChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
    </svg>
  );
}
