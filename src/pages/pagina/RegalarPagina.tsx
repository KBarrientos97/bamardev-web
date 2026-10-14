import { useEffect, useState, type CSSProperties } from "react";
import TarjetaRegalo from "../../components/regalos/TarjetaRegalo";
import { urlWhatsappConTexto } from "../../lib/pagina/catalogo";
import { esDiseno, montoTexto, NOMBRE_DISENO, type DisenoRegalo } from "../../lib/regalos/disenos";
import type { RegalosPublicos } from "../../lib/pagina/tipos";
import { mensajeRegalo } from "../../lib/regalos/pedidoRegalo";
import type { ContactoWhatsapp } from "../../lib/pagina/whatsapp";
import { ElegirDestino } from "./EleccionWhatsapp";

/**
 * "Regalá una gift card" desde la página (IDEAS/6 #6). El cliente elige el
 * diseño (los que ofrece el negocio, con su color y su rubro), el monto, para
 * quién y la dedicatoria, y lo pide por WhatsApp. El negocio cobra como
 * siempre y la emite en el POS con ese diseño: de ahí sale el enlace de la
 * tarjeta para reenviar. No hay cobro en la página.
 */

export default function RegalarPagina({
  abierto,
  onCerrar,
  negocio,
  color,
  rubro,
  fotoUrl,
  regalos,
  destinos,
}: {
  abierto: boolean;
  onCerrar: () => void;
  negocio: string;
  color: string;
  rubro: string | null | undefined;
  fotoUrl: string | null;
  regalos: RegalosPublicos;
  /**
   * Los WhatsApp a los que se puede pedir (13-oct): con uno, directo; con
   * varios (sucursales con su número), el cliente elige a cuál.
   */
  destinos: ContactoWhatsapp[];
}) {
  const disenos = regalos.disenos.filter(esDiseno);
  const [diseno, setDiseno] = useState<DisenoRegalo>(esDiseno(regalos.diseno) ? regalos.diseno : disenos[0] ?? "MINIMAL");
  const [monto, setMonto] = useState<number | null>(regalos.montos[0] ?? null);
  const [libre, setLibre] = useState("");
  const [para, setPara] = useState("");
  const [de, setDe] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [destinoElegido, setDestino] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const montoLibre = Number(libre.replace(",", "."));
  const elegido = libre.trim() ? (Number.isFinite(montoLibre) ? Math.round(montoLibre) : null) : monto;
  // Se recuerda por URL: si cambia la lista, una elección vieja no apunta a otro número.
  const destino = destinos.length === 1 ? destinos[0] : (destinos.find((d) => d.url === destinoElegido) ?? null);
  const valido = elegido != null && elegido >= regalos.montoMin && elegido <= regalos.montoMax && !!destino;
  const url =
    valido && destino
      ? urlWhatsappConTexto(destino.url, mensajeRegalo(negocio, { diseno, monto: elegido, para, de, mensaje }))
      : undefined;
  const campo: CSSProperties = { border: "1px solid #D1D5DB", borderRadius: 10, padding: "10px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" };
  const chip = (activo: boolean): CSSProperties => ({
    border: `1.5px solid ${activo ? color : "#D1D5DB"}`,
    background: activo ? color : "#ffffff",
    color: activo ? "#ffffff" : "#1F2937",
    borderRadius: 999,
    padding: "8px 14px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Regalá una gift card"
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <section
        style={{
          background: "#ffffff",
          width: "min(560px, 100%)",
          maxHeight: "94dvh",
          overflowY: "auto",
          borderRadius: "18px 18px 0 0",
          padding: 18,
          fontFamily: "Roboto, system-ui, sans-serif",
          color: "#1F2937",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Regalá una gift card</h2>
          <button type="button" aria-label="Cerrar" onClick={onCerrar} style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer" }}>
            ×
          </button>
        </header>

        <TarjetaRegalo
          datos={{ diseno, rubro, color, negocio, monto: valido ? elegido : null, para, de, fotoUrl }}
          titulo={`Vista previa: ${NOMBRE_DISENO[diseno].nombre}`}
        />

        {disenos.length > 1 && (
          <div role="radiogroup" aria-label="Diseño" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {disenos.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={d === diseno}
                aria-label={NOMBRE_DISENO[d].nombre}
                onClick={() => setDiseno(d)}
                style={{
                  flex: "0 0 96px",
                  padding: 0,
                  border: `2px solid ${d === diseno ? color : "transparent"}`,
                  borderRadius: 12,
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <TarjetaRegalo datos={{ diseno: d, rubro, color, negocio, monto: elegido, fotoUrl }} style={{ borderRadius: 10 }} />
              </button>
            ))}
          </div>
        )}

        <div>
          <div style={{ fontSize: 13, color: "#4B5563", marginBottom: 6 }}>Monto</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {regalos.montos.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={!libre.trim() && monto === m}
                onClick={() => {
                  setMonto(m);
                  setLibre("");
                }}
                style={chip(!libre.trim() && monto === m)}
              >
                {montoTexto(m)}
              </button>
            ))}
            {regalos.montoLibre && (
              <input
                aria-label="Otro monto"
                inputMode="numeric"
                placeholder={regalos.montos.length ? "Otro monto" : "Monto en Bs"}
                value={libre}
                onChange={(e) => setLibre(e.target.value.replace(/[^\d.,]/g, ""))}
                style={{ ...campo, width: 130 }}
              />
            )}
          </div>
          {libre.trim() && !valido && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#B91C1C" }}>
              Entre {montoTexto(regalos.montoMin)} y {montoTexto(regalos.montoMax)}.
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input aria-label="Para" placeholder="Para (María)" value={para} maxLength={40} onChange={(e) => setPara(e.target.value)} style={campo} />
          <input aria-label="De" placeholder="De (vos)" value={de} maxLength={40} onChange={(e) => setDe(e.target.value)} style={campo} />
        </div>
        <textarea
          aria-label="Dedicatoria"
          placeholder="Dedicatoria (¡Feliz cumple!)"
          value={mensaje}
          maxLength={200}
          rows={2}
          onChange={(e) => setMensaje(e.target.value)}
          style={{ ...campo, resize: "vertical" }}
        />

        {(regalos.vigenciaDias || regalos.condiciones) && (
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>
            {regalos.vigenciaDias ? `Válida por ${regalos.vigenciaDias} días desde que se emite. ` : ""}
            {regalos.condiciones ?? ""}
          </p>
        )}

        {destinos.length > 1 && (
          <ElegirDestino
            opciones={destinos}
            elegido={destino ? destinos.indexOf(destino) : null}
            onElegir={(i) => setDestino(destinos[i].url)}
            color={color}
            titulo="¿A qué sucursal se la pedís?"
          />
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!valido}
          onClick={(e) => !valido && e.preventDefault()}
          style={{
            border: "none",
            borderRadius: 999,
            background: color,
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 15,
            padding: "12px 18px",
            textAlign: "center",
            textDecoration: "none",
            opacity: valido ? 1 : 0.5,
          }}
        >
          Pedirla por WhatsApp
        </a>
        <p style={{ margin: 0, fontSize: 12, color: "#6B7280", textAlign: "center" }}>
          El negocio te dice cómo pagar y te manda la tarjeta lista para reenviar.
        </p>
      </section>
    </div>
  );
}
