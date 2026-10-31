import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Boton, Confirmar, ErrorMsg } from "../../components/ui";
import { apiTickets } from "../../lib/apiTickets";
import { useAuth } from "../../store/AuthContext";
import { urlApi } from "../../lib/apiMenuDigital";
import { useReciboNegocio } from "../../lib/menuDigital/useReciboNegocio";
import { fmtCantidad } from "../../lib/format";
import {
  anunciar,
  coloresDeTema,
  desbloquearAudio,
  numeroTicket,
  paletaTv,
  sonarTono,
} from "../../lib/tickets/llamado";
import {
  AJUSTES_TV_DE_FABRICA,
  TEMAS_TV,
  TONOS_TV,
  type AjustesTicketsTv,
  type TemaTv,
  type TextosTv,
  type TicketPedido,
  type TonoTv,
} from "../../types/tickets";
import { PestanasTickets, SiNo, Segmentado, Tarjeta } from "./piezas";
import AccesoDespacho from "./AccesoDespacho";
import { tienePermiso } from "../../lib/permisos";
import { LienzoTv, TableroTv, type DatosTableroTv } from "./TableroTv";
import { entregados, listos, preparando, useTableroTickets } from "./useTableroTickets";

/**
 * Tickets y pedidos: lo que el encargado mira y arma de los pedidos con
 * número (extra `tickets_pedido`).
 *
 *  - Pedidos: los de hoy en tres columnas, la TV en vivo, su enlace, el
 *    despacho (y su acceso para otro equipo) y la numeración del día.
 *  - Diseño de la pantalla: tema, textos y qué se muestra, con la TV de
 *    verdad como vista previa.
 *  - Sonido y voz: el tono, la voz que dice el número y cuánto se resalta.
 *
 * Los cambios de diseño y sonido se guardan solos (y la TV los toma en la
 * vuelta siguiente): no hay un "Guardar" que olvidarse de tocar.
 */
type Pestana = "pedidos" | "diseno" | "sonido";

const PESTANAS: { valor: Pestana; texto: string; icono: "ticket" | "pantalla" | "volumen" }[] = [
  { valor: "pedidos", texto: "Pedidos", icono: "ticket" },
  { valor: "diseno", texto: "Diseño de la pantalla", icono: "pantalla" },
  { valor: "sonido", texto: "Sonido y voz", icono: "volumen" },
];

export default function TicketsPedidos() {
  const [pestana, setPestana] = useState<Pestana>("pedidos");
  const tablero = useTableroTickets();
  const aj = useAjustesTv();
  const [llamandoPrueba, setLlamandoPrueba] = useState<number | null>(null);
  const { negocio } = useAuth();
  // El logo de Configuración: el mismo que ve la TV.
  const recibo = useReciboNegocio();
  const datosTv = useDatosTv(tablero.datos?.tickets ?? [], tablero.desfase, pestana !== "pedidos", negocio?.nombre ?? "");

  const probarLlamado = useCallback(async () => {
    const n = datosTv.listos[0]?.numero ?? datosTv.preparando[0]?.numero ?? 72;
    await desbloquearAudio();
    setLlamandoPrueba(n);
    void anunciar(n, aj.ajustes);
    setTimeout(() => setLlamandoPrueba(null), aj.ajustes.segundosResaltado * 1000);
  }, [aj.ajustes, datosTv]);

  const vistaPrevia = (
    <LienzoTv modo="previa" fondo={paletaTv(aj.ajustes).fondo}>
      <TableroTv
        ajustes={aj.ajustes}
        datos={datosTv}
        llamando={llamandoPrueba}
        logoUrl={recibo?.logo ? urlApi(recibo.logo) : null}
      />
    </LienzoTv>
  );

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-texto">Tickets y pedidos</h1>
            <p className="mt-0.5 text-sm text-texto-3">
              Los pedidos con número de hoy y la pantalla que los llama, como en un banco.
            </p>
          </div>
          <PestanasTickets<Pestana> opciones={PESTANAS} valor={pestana} onCambiar={setPestana} />
        </header>

        {aj.error && (
          <div className="mt-4">
            <ErrorMsg onReintentar={aj.recargar}>{aj.error}</ErrorMsg>
          </div>
        )}

        {pestana === "pedidos" && <PestanaPedidos tablero={tablero} vistaPrevia={vistaPrevia} />}
        {pestana === "diseno" && (
          <PestanaDiseno aj={aj} vistaPrevia={vistaPrevia} onProbar={() => void probarLlamado()} />
        )}
        {pestana === "sonido" && <PestanaSonido aj={aj} onProbar={() => void probarLlamado()} />}
      </div>
    </div>
  );
}

// ── Pedidos ───────────────────────────────────────────────────────────────

function PestanaPedidos({
  tablero,
  vistaPrevia,
}: {
  tablero: ReturnType<typeof useTableroTickets>;
  vistaPrevia: ReactNode;
}) {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { datos, error, aplicar, recargar } = tablero;
  const [aviso, setAviso] = useState("");
  const [confirmarReinicio, setConfirmarReinicio] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const ahora = Date.now() + tablero.desfase;

  const accion = async (fn: () => Promise<TicketPedido>) => {
    setAviso("");
    try {
      await aplicar(fn);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo hacer");
    }
  };

  const reiniciar = async () => {
    setReiniciando(true);
    try {
      await apiTickets.reiniciar();
      setConfirmarReinicio(false);
      await tablero.recargarTrasCambio();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo reiniciar");
    } finally {
      setReiniciando(false);
    }
  };

  const tickets = datos?.tickets ?? [];
  const columnas: { titulo: string; lista: TicketPedido[] }[] = [
    { titulo: "En preparación", lista: preparando(tickets) },
    { titulo: "Listos", lista: listos(tickets) },
    { titulo: "Entregados", lista: entregados(tickets) },
  ];

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        {error && !datos && <ErrorMsg onReintentar={() => void recargar()}>{error}</ErrorMsg>}
        {aviso && (
          <div className="mb-3">
            <ErrorMsg>{aviso}</ErrorMsg>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {columnas.map((c) => (
            <section key={c.titulo} className="min-w-0 rounded-2xl bg-muted p-3">
              <h2 className="flex items-center gap-2 px-1 text-[12px] font-bold uppercase tracking-[0.12em] text-texto-2">
                {c.titulo}
                <span className="rounded-full bg-white px-2 py-0.5 text-[12px] tabular-nums text-texto">{c.lista.length}</span>
              </h2>
              <div className="mt-3 space-y-3">
                {c.lista.length === 0 && <p className="px-1 py-6 text-center text-[13px] text-texto-4">Nada por acá</p>}
                {c.lista.map((t) => (
                  <TarjetaTicket key={t.id} t={t} ahora={ahora} onAccion={accion} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* `min-w-0`: sin él, debajo de 1280 px (tablet, celular) la columna
          tomaba el ancho del lienzo de la TV (1600 px, que se dibuja entero y
          se escala) y la pantalla quedaba enorme y cortada a la derecha. */}
      <aside className="min-w-0 space-y-4">
        <Tarjeta titulo="Vista previa de la TV">{vistaPrevia}</Tarjeta>
        <EnlaceTv />
        <Tarjeta titulo="Despacho">
          <p className="text-[13px] text-texto-2">
            Quien entrega marca listo cada pedido que sale de la cocina, o escribe su número, y suena en la TV.
          </p>
          <Boton icono="fuego" className="mt-3 w-full" onClick={() => navigate("/despacho")}>
            Abrir pantalla de despacho
          </Boton>
        </Tarjeta>
        {/* La tablet de la cocina entra con su propio acceso. Lo crea quien
            administra usuarios: es una credencial, aunque no ocupe lugar. */}
        {tienePermiso(usuario, "usuarios.administrar") && <AccesoDespacho />}
        <Tarjeta titulo="Numeración del día">
          <p className="text-sm text-texto-2">
            Siguiente ticket:{" "}
            <b className="font-mono text-lg text-texto">{datos ? numeroTicket(datos.siguiente) : "…"}</b>
          </p>
          <p className="mt-1 text-[12px] text-texto-3">Vuelve sola a 0001 cada día a las 6 de la mañana.</p>
          <Boton variante="ghost" icono="girar" className="mt-3 w-full" onClick={() => setConfirmarReinicio(true)}>
            Reiniciar numeración
          </Boton>
        </Tarjeta>
      </aside>

      <Confirmar
        abierto={confirmarReinicio}
        titulo="¿Reiniciar la numeración?"
        texto="El próximo cobro sale con 0001. Los pedidos que ya están en la pantalla siguen hasta que se entreguen."
        etiquetaOk="Reiniciar"
        peligroso
        procesando={reiniciando}
        onCancel={() => setConfirmarReinicio(false)}
        onOk={() => void reiniciar()}
      />
    </div>
  );
}

function TarjetaTicket({
  t,
  ahora,
  onAccion,
}: {
  t: TicketPedido;
  ahora: number;
  onAccion: (fn: () => Promise<TicketPedido>) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const enMesa = t.items.filter((i) => i.consumo === "MESA");
  const llevar = t.items.filter((i) => i.consumo !== "MESA");
  const minutos = Math.max(0, Math.floor((ahora - Date.parse(t.creadoEn)) / 60_000));
  const una = (fn: () => Promise<TicketPedido>) => async () => {
    if (ocupado) return;
    setOcupado(true);
    await onAccion(fn);
    setOcupado(false);
  };
  const resumen = (items: TicketPedido["items"]) =>
    items.map((i) => `${fmtCantidad(i.cantidad)}× ${i.producto}${i.nota ? ` (${i.nota})` : ""}`).join(" · ");

  return (
    <article
      className={`rounded-2xl border bg-white p-3.5 ${t.estado === "LISTO" ? "border-primary/40" : "border-borde"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`font-mono text-[28px] font-black leading-none tabular-nums ${t.estado === "ENTREGADO" ? "text-texto-3" : "text-texto"}`}
        >
          {numeroTicket(t.numero)}
        </span>
        <div className="flex flex-wrap justify-end gap-1">
          {enMesa.length > 0 && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">Mesa</span>
          )}
          {llevar.length > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">Llevar</span>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-0.5 text-[13px] text-texto-2">
        {enMesa.length > 0 && (
          <p>
            <b className="text-texto">Mesa:</b> {resumen(enMesa)}
          </p>
        )}
        {llevar.length > 0 && (
          <p>
            <b className="text-texto">Llevar:</b> {resumen(llevar)}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-texto-3">hace {minutos} min</span>
        {/* `flex-wrap`: "Llamar" y "Entregado" miden ~225 px y en una columna
            angosta (tres columnas con el menú abierto) se metían en la de al lado. */}
        <div className="flex flex-wrap gap-2">
          {t.estado === "PREPARANDO" && (
            <Boton icono="bell" className="px-3 py-2" disabled={ocupado} onClick={una(() => apiTickets.listo(t.id))}>
              Listo · llamar
            </Boton>
          )}
          {t.estado === "LISTO" && (
            <>
              <Boton variante="ghost" icono="volumen" className="px-3 py-2" disabled={ocupado} onClick={una(() => apiTickets.llamar(t.id))}>
                Llamar
              </Boton>
              <Boton icono="check" className="px-3 py-2" disabled={ocupado} onClick={una(() => apiTickets.entregar(t.id))}>
                Entregado
              </Boton>
            </>
          )}
          {t.estado === "ENTREGADO" && (
            <button
              type="button"
              disabled={ocupado}
              onClick={una(() => apiTickets.reabrir(t.id))}
              className="text-[13px] font-semibold text-primary-700 hover:underline disabled:opacity-50"
            >
              Reabrir
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * El enlace de la TV: se genera una vez y se abre en el televisor (o en la
 * compu enchufada a él). Generar otro corta a la TV que tenía el anterior.
 */
function EnlaceTv() {
  const [llave, setLlave] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    apiTickets
      .llave()
      .then((r) => setLlave(r.llave))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer el enlace"));
  }, []);

  const url = llave ? `${window.location.origin}/tv/tickets/${llave}` : "";
  const generar = async () => {
    setGenerando(true);
    setError("");
    try {
      setLlave((await apiTickets.nuevaLlave()).llave);
      setConfirmar(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el enlace");
    } finally {
      setGenerando(false);
    }
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("No se pudo copiar: seleccioná el enlace y copialo a mano.");
    }
  };

  return (
    <Tarjeta titulo="Pantalla de la TV">
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {llave === undefined ? (
        <p className="text-[13px] text-texto-3">Cargando…</p>
      ) : llave === null ? (
        <>
          <p className="text-[13px] text-texto-2">
            Generá el enlace y abrilo en el televisor de los tickets. No pide usuario ni contraseña.
          </p>
          <Boton icono="pantalla" className="mt-3 w-full" disabled={generando} onClick={() => void generar()}>
            {generando ? "Generando…" : "Generar enlace de la TV"}
          </Boton>
        </>
      ) : (
        <>
          <p className="break-all rounded-lg bg-muted px-2.5 py-2 font-mono text-[12px] text-texto-2">{url}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Boton icono="arrowUpRight" onClick={() => window.open(url, "_blank", "noopener")}>
              Abrir en TV
            </Boton>
            <Boton variante="ghost" icono={copiado ? "check" : "copiar"} onClick={() => void copiar()}>
              {copiado ? "Copiado" : "Copiar"}
            </Boton>
          </div>
          <p className="mt-2 text-[12px] text-texto-3">
            En la TV: tocá la pantalla una vez para que suene, y doble clic para verla completa.
          </p>
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            className="mt-2 text-[12px] font-semibold text-texto-3 underline-offset-2 hover:text-texto hover:underline"
          >
            Generar otro enlace
          </button>
        </>
      )}
      <Confirmar
        abierto={confirmar}
        titulo="¿Generar otro enlace?"
        texto="Todas las pantallas del local dejan de andar en el momento: la de tickets y las del menú digital, que usan la misma llave. Hay que abrir el enlace nuevo en cada una. Sirve si el enlace se compartió con quien no debía."
        etiquetaOk="Generar otro"
        peligroso
        procesando={generando}
        onCancel={() => setConfirmar(false)}
        onOk={() => void generar()}
      />
    </Tarjeta>
  );
}

// ── Diseño de la pantalla ────────────────────────────────────────────────

const NOMBRE_TEMA: Record<TemaTv, string> = {
  rojo: "Rojo y amarillo",
  verde: "Verde",
  brasa: "Brasa",
  crema: "Crema",
  personalizado: "Personalizado",
};

const CAMPOS_TEXTO: { clave: keyof TextosTv; etiqueta: string }[] = [
  { clave: "listos", etiqueta: "Título de listos" },
  { clave: "llamando", etiqueta: "Título al llamar" },
  { clave: "etiqueta", etiqueta: "Palabra sobre el número" },
  { clave: "frase", etiqueta: "Frase bajo el número (también la dice la voz)" },
  { clave: "preparacion", etiqueta: "Título de preparación" },
  { clave: "pieIzquierda", etiqueta: "Pie · izquierda" },
  { clave: "pieDerecha", etiqueta: "Pie · derecha" },
];

function PestanaDiseno({
  aj,
  vistaPrevia,
  onProbar,
}: {
  aj: ReturnType<typeof useAjustesTv>;
  vistaPrevia: ReactNode;
  onProbar: () => void;
}) {
  const a = aj.ajustes;
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <Tarjeta
          titulo="Pantalla de tickets"
          accion={
            <div className="flex items-center gap-2">
              <EstadoGuardado estado={aj.guardado} />
              <Boton variante="ghost" icono="bell" className="px-3 py-2" onClick={onProbar}>
                Probar llamado
              </Boton>
            </div>
          }
        >
          {vistaPrevia}
          <p className="mt-2 text-[12px] text-texto-3">
            Así se ve en la TV. Sin pedidos de hoy, la vista previa muestra números de ejemplo.
          </p>
        </Tarjeta>
      </div>
      <div className="space-y-4">
        <Tarjeta titulo="Tema">
          <div className="grid grid-cols-3 gap-2">
            {TEMAS_TV.map((tema) => {
              const c = coloresDeTema(tema, a.colores);
              return (
                <button
                  key={tema}
                  type="button"
                  aria-pressed={a.tema === tema}
                  onClick={() => aj.cambiar({ tema })}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-2.5 text-[12px] font-semibold ${
                    a.tema === tema ? "border-primary-boton text-primary-700" : "border-borde text-texto-2 hover:bg-muted"
                  }`}
                >
                  <span className="flex gap-1">
                    <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: c.fondo }} />
                    <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: c.acento }} />
                  </span>
                  {NOMBRE_TEMA[tema]}
                </button>
              );
            })}
          </div>
          {a.tema === "personalizado" && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(
                [
                  ["fondo", "Fondo"],
                  ["acento", "Acento y número"],
                  ["texto", "Texto"],
                ] as const
              ).map(([k, etiqueta]) => (
                <label key={k} className="flex flex-col items-center gap-1 text-[12px] text-texto-2">
                  <input
                    type="color"
                    value={a.colores[k]}
                    onChange={(e) => aj.cambiar({ colores: { ...a.colores, [k]: e.target.value.toUpperCase() } })}
                    className="h-9 w-full cursor-pointer rounded-lg border border-borde bg-white"
                  />
                  {etiqueta}
                </label>
              ))}
            </div>
          )}
        </Tarjeta>
        <Tarjeta titulo="Qué se muestra">
          <SiNo etiqueta="Logo o nombre del negocio" activo={a.logo} onCambiar={(v) => aj.cambiar({ logo: v })} />
          <SiNo etiqueta="Reloj" activo={a.reloj} onCambiar={(v) => aj.cambiar({ reloj: v })} />
          <SiNo
            etiqueta="Columna «En preparación»"
            detalle="Sin ella, la TV sólo muestra los listos"
            activo={a.mostrarPreparacion}
            onCambiar={(v) => aj.cambiar({ mostrarPreparacion: v })}
          />
          <SiNo
            etiqueta="Minutos de espera"
            activo={a.mostrarMinutos}
            onCambiar={(v) => aj.cambiar({ mostrarMinutos: v })}
          />
        </Tarjeta>
        <Tarjeta titulo="Textos">
          <div className="space-y-2.5">
            {CAMPOS_TEXTO.map((c) => (
              <label key={c.clave} className="block">
                <span className="mb-1 block text-[12px] font-semibold text-texto-2">{c.etiqueta}</span>
                <input
                  value={a.textos[c.clave]}
                  maxLength={c.clave.startsWith("pie") ? 80 : 60}
                  onChange={(e) => aj.cambiar({ textos: { ...a.textos, [c.clave]: e.target.value } })}
                  className="w-full rounded-xl border border-borde bg-white px-3 py-2 text-sm text-texto outline-none focus:border-primary"
                />
              </label>
            ))}
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}

// ── Sonido y voz ──────────────────────────────────────────────────────────

const NOMBRE_TONO: Record<TonoTv, string> = {
  banco: "Banco · ding-dong",
  campanilla: "Campanilla · tres notas",
  ascensor: "Ascensor · suave",
  bip: "Bip doble",
};

function PestanaSonido({ aj, onProbar }: { aj: ReturnType<typeof useAjustesTv>; onProbar: () => void }) {
  const a = aj.ajustes;
  return (
    <div className="mt-5 grid max-w-4xl gap-4 md:grid-cols-2">
      <Tarjeta titulo="Tono de aviso" accion={<EstadoGuardado estado={aj.guardado} />}>
        <div className="grid gap-2 sm:grid-cols-2">
          {TONOS_TV.map((tono) => (
            <button
              key={tono}
              type="button"
              aria-pressed={a.tono === tono}
              onClick={() => {
                aj.cambiar({ tono });
                void desbloquearAudio().then(() => sonarTono(tono, a.volumen));
              }}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-[13px] font-semibold ${
                a.tono === tono ? "border-primary-boton bg-primary-50 text-primary-700" : "border-borde text-texto-2 hover:bg-muted"
              }`}
            >
              <Icon name="volumen" size={16} />
              {NOMBRE_TONO[tono]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-texto-3">Tocá uno para escucharlo.</p>
      </Tarjeta>
      <Tarjeta titulo="Voz y volumen">
        <SiNo
          etiqueta="Voz en español"
          detalle="«Ticket, cero, cero, siete, dos…»"
          activo={a.voz}
          onCambiar={(v) => aj.cambiar({ voz: v })}
        />
        <label className="block py-2">
          <span className="text-sm font-semibold text-texto">Volumen · {a.volumen}%</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={a.volumen}
            onChange={(e) => aj.cambiar({ volumen: Number(e.target.value) })}
            className="mt-2 w-full accent-[var(--color-primary-boton)]"
          />
        </label>
        <div className="flex items-center justify-between gap-3 py-2">
          <span className="text-sm font-semibold text-texto">Repetir aviso</span>
          <Segmentado
            etiqueta="Repetir aviso"
            valor={a.repetir}
            onCambiar={(v) => aj.cambiar({ repetir: v })}
            opciones={[
              { valor: 1, texto: "1×" },
              { valor: 2, texto: "2×" },
              { valor: 3, texto: "3×" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <span className="text-sm font-semibold text-texto">Resaltar en pantalla</span>
          <Segmentado
            etiqueta="Resaltar en pantalla"
            valor={a.segundosResaltado}
            onCambiar={(v) => aj.cambiar({ segundosResaltado: v })}
            opciones={[
              { valor: 10, texto: "10 s" },
              { valor: 15, texto: "15 s" },
              { valor: 30, texto: "30 s" },
            ]}
          />
        </div>
        <label className="block py-2">
          <span className="mb-1 block text-[12px] font-semibold text-texto-2">Frase después del número</span>
          <input
            value={a.textos.frase}
            maxLength={60}
            onChange={(e) => aj.cambiar({ textos: { ...a.textos, frase: e.target.value } })}
            className="w-full rounded-xl border border-borde bg-white px-3 py-2 text-sm text-texto outline-none focus:border-primary"
          />
        </label>
        <Boton variante="ghost" icono="play" className="mt-2 w-full" onClick={onProbar}>
          Probar sonido y voz
        </Boton>
        <p className="mt-2 text-[12px] text-texto-3">
          La voz es la del navegador: en algunos televisores suena distinta, y en los que no tienen voz en español
          suena sólo el tono.
        </p>
      </Tarjeta>
    </div>
  );
}

function EstadoGuardado({ estado }: { estado: "" | "guardando" | "guardado" | "error" }) {
  if (!estado) return null;
  return (
    <span
      className={`text-[12px] font-semibold ${
        estado === "error" ? "text-danger-text" : estado === "guardado" ? "text-primary-700" : "text-texto-3"
      }`}
    >
      {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : "No se guardó"}
    </span>
  );
}

// ── Estado ────────────────────────────────────────────────────────────────

/**
 * El diseño y el sonido: se cargan una vez y cada cambio se guarda solo, un
 * momento después del último (escribir un texto no manda una petición por
 * letra). Lo que se manda es el objeto entero: el backend lo normaliza.
 */
function useAjustesTv() {
  const [ajustes, setAjustes] = useState<AjustesTicketsTv>(AJUSTES_TV_DE_FABRICA);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState<"" | "guardando" | "guardado" | "error">("");
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Lo que espera su turno para guardarse (el reloj). */
  const pendiente = useRef<AjustesTicketsTv | null>(null);

  const recargar = useCallback(() => {
    setError("");
    apiTickets
      .ajustes()
      .then((a) => {
        setAjustes(a);
        setCargado(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el diseño de la pantalla"));
  }, []);

  useEffect(() => {
    recargar();
    return () => {
      if (reloj.current) clearTimeout(reloj.current);
      // Se fue de la pantalla antes de que saliera: se manda ya, en vez de
      // perder el último cambio sin aviso.
      if (pendiente.current) void apiTickets.guardarAjustes(pendiente.current).catch(() => undefined);
    };
  }, [recargar]);

  const actual = useRef(ajustes);
  actual.current = ajustes;
  const cambiar = useCallback(
    (parcial: Partial<AjustesTicketsTv>) => {
      // Sin lo guardado todavía, guardar pisaría el diseño con los de fábrica.
      if (!cargado) return;
      const nuevos = { ...actual.current, ...parcial };
      actual.current = nuevos;
      setAjustes(nuevos);
      setGuardado("guardando");
      pendiente.current = nuevos;
      if (reloj.current) clearTimeout(reloj.current);
      reloj.current = setTimeout(() => {
        pendiente.current = null;
        apiTickets
          .guardarAjustes(nuevos)
          .then(() => setGuardado("guardado"))
          .catch(() => setGuardado("error"));
      }, 700);
    },
    [cargado],
  );

  return { ajustes, cambiar, guardado, error, recargar };
}

/**
 * Lo que dibuja la vista previa: los pedidos de hoy o, si no hay ninguno (o
 * se está diseñando), unos de ejemplo para ver cómo queda la TV llena.
 */
function useDatosTv(
  tickets: TicketPedido[],
  desfase: number,
  ejemploSiVacio: boolean,
  negocio: string,
): DatosTableroTv {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    const t = ahora + desfase;
    const prep = preparando(tickets).map((x) => ({ numero: x.numero, desde: Date.parse(x.creadoEn) }));
    const lis = listos(tickets).map((x) => ({
      numero: x.numero,
      llamadoEn: x.llamadoEn ? Date.parse(x.llamadoEn) : null,
    }));
    if (ejemploSiVacio && prep.length + lis.length === 0) {
      return {
        negocio: negocio || "Tu negocio",
        ahora: t,
        preparando: [70, 71, 72, 73, 74].map((n, i) => ({ numero: n, desde: t - (14 - i * 3) * 60_000 })),
        listos: [69, 68].map((n, i) => ({ numero: n, llamadoEn: t - i * 60_000 })),
      };
    }
    return { negocio, ahora: t, preparando: prep, listos: lis };
  }, [tickets, ahora, desfase, ejemploSiVacio, negocio]);
}
