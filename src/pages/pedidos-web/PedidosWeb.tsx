import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Chips } from "../../components/filtros";
import { AvisoOk, Badge, Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import { EVENTO_PEDIDOS_WEB } from "../../lib/pedidosWeb/contador";
import type { Bandeja, PedidoWeb } from "../../lib/pedidosWeb/tipos";
import { useSucursales } from "../../lib/useSucursales";
import DetallePedidoWeb from "./DetallePedidoWeb";
import { haceCuanto, minutosEsperando, totalDe } from "./logica";

type Vista = "nuevos" | "aceptados" | "camino" | "hoy";

/** Cada cuánto se refresca la bandeja: lo mismo que el contador del menú. */
export const REFRESCO_BANDEJA_MS = 10_000;

/** Cuánto dura en pantalla el aviso de lo que se acaba de hacer (aceptar, rechazar, un conflicto). */
export const DURACION_AVISO_MS = 8_000;

/** A los 10 minutos un pedido sin respuesta vence: la tarjeta avisa antes. */
const MIN_AMBAR = 5;
const MIN_ROJO = 8;

/**
 * La bandeja «Pedidos web» (13-nov): lo que los clientes piden desde la página
 * del negocio. Nuevos (esperan respuesta), Aceptados (ya son venta, todavía no
 * salieron), En camino y Hoy (entregados y los que no se tomaron).
 *
 * Se refresca sola cada 10 s con la pestaña visible; si se corta la señal,
 * queda lo último que se vio con un aviso, no una bandeja en cero.
 */
export default function PedidosWeb() {
  const sucursales = useSucursales();
  const [datos, setDatos] = useState<Bandeja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [vista, setVista] = useState<Vista>("nuevos");
  const [abierto, setAbierto] = useState<PedidoWeb | null>(null);
  const [aviso, setAviso] = useState("");
  const [conflicto, setConflicto] = useState("");

  // Cuánto se adelanta (o atrasa) el servidor respecto de esta PC: «hace 3 min»
  // y el ámbar/rojo se cuentan con la hora del servidor, no con la de la PC (PW-17).
  const [desfase, setDesfase] = useState(0);
  const ahora = useCallback(() => Date.now() + desfase, [desfase]);
  /** La última bandeja pedida: una respuesta lenta de la sucursal anterior no pisa la nueva (PW-17). */
  const vuelta = useRef(0);

  // «Rechazaste el pedido N° 36…» confirma lo que acaba de pasar: a los segundos sobra. Quedaba pegado
  // encima de «Entregados hoy» mucho después (QA R1, N12). Lo mismo con «Ya lo aceptó…».
  useEffect(() => {
    if (!aviso) return;
    const id = window.setTimeout(() => setAviso(""), DURACION_AVISO_MS);
    return () => window.clearTimeout(id);
  }, [aviso]);
  useEffect(() => {
    if (!conflicto) return;
    const id = window.setTimeout(() => setConflicto(""), DURACION_AVISO_MS);
    return () => window.clearTimeout(id);
  }, [conflicto]);

  const sucursalId = sucursales.sucursalId;
  const cargar = useCallback(async () => {
    const n = ++vuelta.current;
    try {
      const b = await apiPedidosWeb.bandeja(sucursalId);
      if (n !== vuelta.current) return;
      setDatos(b);
      const delServidor = b.ahora ? Date.parse(b.ahora) : NaN;
      if (Number.isFinite(delServidor)) setDesfase(delServidor - Date.now());
      setError("");
    } catch (e) {
      if (n !== vuelta.current) return;
      setError(e instanceof Error ? e.message : "No se pudo cargar la bandeja");
    } finally {
      if (n === vuelta.current) setCargando(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    void cargar();
    const refrescar = () => {
      if (!document.hidden) void cargar();
    };
    const id = window.setInterval(refrescar, REFRESCO_BANDEJA_MS);
    document.addEventListener("visibilitychange", refrescar);
    window.addEventListener(EVENTO_PEDIDOS_WEB, refrescar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refrescar);
      window.removeEventListener(EVENTO_PEDIDOS_WEB, refrescar);
    };
  }, [cargar]);

  if (abierto) {
    return (
      <DetallePedidoWeb
        fila={abierto}
        ahora={ahora}
        onVolver={() => setAbierto(null)}
        onHecho={(m) => {
          setAbierto(null);
          setConflicto("");
          setAviso(m);
          void cargar();
        }}
        onConflicto={(m) => {
          setAbierto(null);
          setAviso("");
          setConflicto(m);
          void cargar();
        }}
      />
    );
  }

  const nuevos = datos?.nuevos ?? [];
  const aceptados = datos?.aceptados ?? [];
  const enCamino = datos?.enCamino ?? [];
  const entregados = datos?.entregadosHoy ?? [];
  const noTomados = datos?.noTomadosHoy ?? [];
  // Con el número en la etiqueta sólo cuando ya se sabe: nada de «0» mientras carga.
  const n = (k: number) => (datos ? ` (${k})` : "");
  const opciones = [
    ["nuevos", `Nuevos${n(nuevos.length)}`],
    ["aceptados", `Aceptados${n(aceptados.length)}`],
    ["camino", `En camino${n(enCamino.length)}`],
    ["hoy", "Hoy"],
  ] as const satisfies readonly (readonly [Vista, string])[];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      <header>
        <h1 className="text-xl font-bold text-texto">Pedidos web</h1>
        <p className="mt-0.5 text-[13px] text-texto-3">Lo que tus clientes piden desde tu página.</p>
      </header>

      {sucursales.elegir && <Chips valor={sucursales.valorChip} opciones={sucursales.opciones} onChange={sucursales.alElegir} />}
      <Chips
        envolver
        valor={vista}
        opciones={opciones}
        onChange={(v) => {
          // Cambiar de pestaña es pasar a otra cosa: el aviso de la acción anterior se va.
          setAviso("");
          setConflicto("");
          setVista(v);
        }}
      />

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{conflicto}</ErrorMsg>
      {error && datos ? (
        <p role="status" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
          Sin conexión con el servidor: te mostramos lo último que supimos. Se actualiza solo.
        </p>
      ) : (
        <ErrorMsg onReintentar={() => void cargar()}>{error}</ErrorMsg>
      )}

      {cargando && !datos ? (
        <Cargando />
      ) : !datos ? null : vista === "nuevos" ? (
        <Lista
          pedidos={nuevos}
          vacio={{ icono: "bolsa", titulo: "No hay pedidos nuevos", texto: "Cuando un cliente pida desde tu página, lo vas a ver acá y te avisamos con un sonido." }}
          onAbrir={setAbierto}
          ahora={ahora}
          conEspera
        />
      ) : vista === "aceptados" ? (
        <Lista
          pedidos={aceptados}
          vacio={{ icono: "check", titulo: "Nada por salir", texto: "Los pedidos que aceptes aparecen acá hasta que el repartidor salga." }}
          onAbrir={setAbierto}
          ahora={ahora}
        />
      ) : vista === "camino" ? (
        <Lista
          pedidos={enCamino}
          vacio={{ icono: "truck", titulo: "Nadie en camino", texto: "Cuando un repartidor toque «Ya salí del local», el pedido pasa acá." }}
          onAbrir={setAbierto}
          ahora={ahora}
        />
      ) : (
        <div className="space-y-5">
          <section aria-label="Entregados hoy" className="space-y-2">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-texto-3">Entregados hoy ({entregados.length})</h2>
            <Lista pedidos={entregados} vacio={{ icono: "check", titulo: "Todavía no entregaste ninguno hoy" }} onAbrir={setAbierto} ahora={ahora} />
          </section>
          <section aria-label="No tomados hoy" className="space-y-2">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-texto-3">No tomados ({noTomados.length})</h2>
            <Lista pedidos={noTomados} vacio={{ icono: "check", titulo: "Ninguno rechazado, vencido ni cancelado" }} onAbrir={setAbierto} ahora={ahora} />
          </section>
        </div>
      )}
    </div>
  );
}

function Lista({
  pedidos,
  vacio,
  onAbrir,
  ahora,
  conEspera = false,
}: {
  pedidos: PedidoWeb[];
  vacio: { icono: "bolsa" | "check" | "truck"; titulo: string; texto?: string };
  onAbrir: (p: PedidoWeb) => void;
  /** La hora del servidor en este momento. */
  ahora: () => number;
  /** En «Nuevos», cuánto lleva esperando el cliente (a los 10 minutos vence). */
  conEspera?: boolean;
}) {
  if (pedidos.length === 0) {
    return (
      <div className="card">
        <Vacio icono={vacio.icono} titulo={vacio.titulo} texto={vacio.texto} />
      </div>
    );
  }
  return (
    <ul className="space-y-2.5">
      {pedidos.map((p) => {
        const min = minutosEsperando(p.creadoEn, ahora());
        const urgencia = conEspera ? (min >= MIN_ROJO ? "rojo" : min >= MIN_AMBAR ? "amarillo" : "gris") : "gris";
        return (
          <li key={p.id}>
            <button type="button" onClick={() => onAbrir(p)} className="card flex w-full items-center gap-3 p-4 text-left transition-shadow hover:shadow-md">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  p.estado === "NUEVO" ? "bg-warning-bg text-warning-text" : p.estado === "ACEPTADO" ? "bg-primary-50 text-primary-700" : "bg-muted text-texto-3"
                }`}
              >
                <Icon name={p.tipo === "DELIVERY" ? "truck" : "bolsa"} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-texto">
                  N° {String(p.numero).padStart(2, "0")} · {p.nombre}
                </p>
                <p className="truncate text-xs text-texto-3">
                  {p.tipo === "DELIVERY" ? p.direccion : "Paso a recoger"}
                  {p.sucursal ? ` · ${p.sucursal}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tono={p.tipo === "DELIVERY" ? "azul" : "morado"}>{p.tipo === "DELIVERY" ? "Delivery" : "Recoger"}</Badge>
                  <Badge tono={p.formaPago === "QR" ? "verde" : "gris"}>{p.formaPago === "QR" ? "QR" : "Efectivo"}</Badge>
                  <Badge tono={urgencia}>{haceCuanto(p.creadoEn, ahora())}</Badge>
                  {p.estado !== "NUEVO" && p.estado !== "ACEPTADO" && <Badge tono="rojo">{etiquetaNoTomado(p)}</Badge>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-texto">{fmtMoney(totalDe(p))}</p>
                <Icon name="chevronRight" size={18} color="#94A3B8" />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function etiquetaNoTomado(p: PedidoWeb): string {
  return p.estado === "RECHAZADO" ? "Rechazado" : p.estado === "VENCIDO" ? "Venció" : "Cancelado";
}
