import { useEffect, useMemo, useRef, useState } from "react";
import { AvisoGastosAtrasados } from "../../components/AvisoGastosAtrasados";
import { Link } from "react-router-dom";
import { Buscador, Chips, EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { ProximosAutomaticos } from "../../components/ProximosAutomaticos";
import {
  AvisoOk,
  Badge,
  Boton,
  Cargando,
  ErrorMsg,
  Input,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { esPositivo } from "../../lib/dinero";
import { fmtFecha, fmtMoney } from "../../lib/format";
import {
  badgeEstado,
  contar,
  finDeMes,
  fmtSobreVentas,
  gastosSuperanVentas,
  hoyIso,
  inicioDeMes,
  METODOS,
  opcionesFiltro,
  saldado,
  sobreVentas as calcularSobreVentas,
  textoVencimiento,
} from "../../lib/gastos";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import type { CategoriaGasto, FiltroGasto, Gasto, TipoCostoGasto } from "../../types";
import { FormGasto, PanelPago } from "../Gastos";

/**
 * Gastos operativos de la farmacia.
 *
 * Es el mismo libro que la pantalla de siempre —el mismo backend, las mismas
 * reglas de `lib/gastos.ts`, el mismo formulario y el mismo panel de pago—
 * armado como la maqueta y para el teléfono:
 *
 * - Cada gasto es una tarjeta que se toca; el detalle y lo que se hace con él
 *   (pagar, corregir, eliminar) van en un popup, no en una fila de botones.
 * - Se filtra por categoría con chips, pero sólo con las que tienen gastos en
 *   el período: veinticuatro chips no le sirven a nadie.
 * - El mes se recorre con flechas, que es lo que se usa desde el celular.
 * - Las categorías se administran desde acá: una farmacia no carga garrafas
 *   de gas ni comisión de delivery, y sí puede querer "Regente" o "SEDES".
 *
 * Se elige en `App.tsx` por rubro: la pantalla de Gastos de siempre no se
 * entera de que existe esta.
 */

const DEBOUNCE_MS = 350;

/** Color de cada categoría del pack que más se usa; las demás, por turno. */
const COLOR_CATEGORIA: Record<string, string> = {
  ALQUILER: "bg-violet-100 text-violet-700",
  SUELDOS: "bg-blue-100 text-blue-700",
  CARGAS_SOCIALES: "bg-blue-100 text-blue-700",
  LUZ: "bg-amber-100 text-amber-700",
  AGUA: "bg-cyan-100 text-cyan-700",
  INTERNET: "bg-pink-100 text-pink-700",
  TELEFONO: "bg-emerald-100 text-emerald-700",
  IMPUESTOS: "bg-red-100 text-red-700",
  MANTENIMIENTO: "bg-lime-100 text-lime-700",
  OTROS: "bg-slate-100 text-slate-600",
};
const TURNO = [
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-sky-100 text-sky-700",
];

function colorDe(codigo: string): string {
  if (COLOR_CATEGORIA[codigo]) return COLOR_CATEGORIA[codigo];
  // Siempre el mismo color para la misma categoría propia, sin guardarlo.
  let h = 0;
  for (const c of codigo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TURNO[h % TURNO.length];
}

const NOMBRE_METODO = Object.fromEntries(METODOS) as Record<string, string>;

/** "septiembre de 2026", para el selector de mes. */
function nombreMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString("es-BO", {
    month: "long",
    year: "numeric",
  });
  // Sólo la primera: con `capitalize` salía "Septiembre De 2026".
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function GastosFarmacia() {
  const [mes, setMes] = useState(() => hoyIso().slice(0, 7));
  const [filtro, setFiltro] = useState<FiltroGasto>("TODOS");
  const [categoria, setCategoria] = useState("");
  const [q, setQ] = useState("");
  const [qBuscado, setQBuscado] = useState("");

  useEffect(() => {
    if (q === "") {
      setQBuscado("");
      return;
    }
    const t = setTimeout(() => setQBuscado(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const suc = useSucursales();

  const [elegido, setElegido] = useState<Gasto | null>(null);
  const [editando, setEditando] = useState<Gasto | null | undefined>(undefined);
  const [pagando, setPagando] = useState<Gasto | null>(null);
  const [conCategorias, setConCategorias] = useState(false);
  const [aviso, mostrarAviso] = useAviso();

  const desde = inicioDeMes(`${mes}-01`);
  const hasta = finDeMes(`${mes}-01`);
  const esteMes = mes === hoyIso().slice(0, 7);

  const resumen = useApi(
    () => api.getResumenGastos({ desde, hasta, sucursalId: suc.sucursalId }),
    [desde, hasta, suc.sucursalId],
  );
  // La categoría se filtra acá y no en el servidor: los chips salen de esta
  // misma lista, y si el servidor la recortara quedaría un solo chip.
  const lista = useApi(
    () =>
      api.getGastos({
        desde,
        hasta,
        filtro: filtro === "TODOS" ? undefined : filtro,
        q: qBuscado || undefined,
        sucursalId: suc.sucursalId,
      }),
    [desde, hasta, filtro, qBuscado, suc.sucursalId],
  );
  const categorias = useApi(() => api.getCategoriasGasto(), []);

  const recargar = () => {
    lista.recargar();
    resumen.recargar();
  };

  const gastos = useMemo(() => lista.datos ?? [], [lista.datos]);
  const chipsCategoria = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const g of gastos) vistas.set(g.categoria, g.categoriaNombre ?? g.categoria);
    return [
      ["", "Todas"] as const,
      ...[...vistas].sort((a, b) => a[1].localeCompare(b[1], "es")),
    ] as (readonly [string, string])[];
  }, [gastos]);
  // Si la categoría elegida deja de tener gastos (otro mes, otro filtro), se
  // vuelve a "Todas" en vez de mostrar una lista vacía sin chip marcado.
  const categoriaVigente = chipsCategoria.some(([k]) => k === categoria) ? categoria : "";
  const visibles = categoriaVigente
    ? gastos.filter((g) => g.categoria === categoriaVigente)
    : gastos;

  const r = resumen.datos;
  // El número real, sin tope (ver `sobreVentas` en lib/gastos): con el tope, un
  // mes que gastó el triple de lo vendido decía "100.0%".
  const sobreVentas = r ? calcularSobreVentas(r.total, r.ventasPeriodo) : null;
  const superaVentas = !!r && gastosSuperanVentas(r.total, r.ventasPeriodo);

  // El detalle muestra la versión más nueva del gasto: después de un pago,
  // la lista se recarga y el popup tiene que decir el saldo nuevo.
  const elegidoVivo = elegido ? (gastos.find((g) => g.id === elegido.id) ?? elegido) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:space-y-5 sm:p-5">
      <EncabezadoPagina
        titulo="Gastos operativos"
        subtitulo="El alquiler, los sueldos y los servicios de la farmacia"
        accion={
          <Boton onClick={() => setEditando(null)}>
            <Icon name="plus" size={16} /> Nuevo gasto
          </Boton>
        }
      />

      {aviso && <AvisoOk>{aviso}</AvisoOk>}

      {resumen.error ? (
        <ErrorMsg onReintentar={resumen.recargar}>{resumen.error}</ErrorMsg>
      ) : resumen.cargando || !r ? (
        <Cargando texto="Cargando el resumen…" />
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Numero
            etiqueta="Total del mes"
            valor={fmtMoney(r.total)}
            pie={contar(r.cantidad, "gasto", "gastos")}
          />
          <Numero
            etiqueta="Pagado"
            valor={fmtMoney(r.pagado)}
            pie={contar(r.cantidadPagados, "pagado", "pagados")}
            tono="text-primary-700"
          />
          <Numero
            etiqueta="Por pagar"
            valor={fmtMoney(r.pendiente)}
            pie={
              r.cantidadVencidos > 0
                ? `${contar(r.cantidadVencidos, "vencido", "vencidos")} · ${fmtMoney(r.vencido)}`
                : contar(r.cantidadPendientes, "pendiente", "pendientes")
            }
            tono={esPositivo(r.pendiente) ? "text-warning-text" : undefined}
            alerta={r.cantidadVencidos > 0}
          />
          <Numero
            etiqueta="Sobre las ventas"
            valor={sobreVentas == null ? "—" : fmtSobreVentas(sobreVentas)}
            pie={
              sobreVentas == null
                ? "Sin ventas en el mes"
                : superaVentas
                  ? `Más que lo vendido (${fmtMoney(r.ventasPeriodo)})`
                  : `Ventas ${fmtMoney(r.ventasPeriodo)}`
            }
            tono={superaVentas ? "text-danger-text" : undefined}
            alerta={superaVentas}
          />
        </div>
      )}

      {/* Mes, sucursal y búsqueda. En el teléfono cada cosa ocupa su renglón. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-borde bg-white p-1">
          <button
            onClick={() => setMes(moverMes(mes, -1))}
            aria-label="Mes anterior"
            className="rounded-lg p-2 text-texto-2 hover:bg-muted"
          >
            <Icon name="chevronLeft" size={18} />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-semibold text-texto">
            {nombreMes(mes)}
          </span>
          <button
            onClick={() => setMes(moverMes(mes, 1))}
            aria-label="Mes siguiente"
            disabled={esteMes}
            className="rounded-lg p-2 text-texto-2 hover:bg-muted disabled:opacity-30"
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
        {suc.elegir && (
          <Select
            value={suc.valorSelect}
            onChange={(e) => suc.alElegirSelect(e.target.value)}
            className="w-auto"
            aria-label="Sucursal"
          >
            <option value="">Todas las sucursales</option>
            {suc.sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        )}
        <div className="min-w-[220px] flex-1">
          <Buscador valor={q} onChange={setQ} placeholder="Buscar concepto o proveedor…" />
        </div>
      </div>

      <AvisoGastosAtrasados
        atrasado={r?.atrasado}
        viendo={filtro === "ATRASADOS"}
        onVer={() => setFiltro("ATRASADOS")}
      />

      <Chips
        valor={filtro}
        opciones={opcionesFiltro((r?.atrasado?.cantidad ?? 0) > 0 || filtro === "ATRASADOS")}
        onChange={setFiltro}
      />
      {chipsCategoria.length > 2 && (
        <Chips valor={categoriaVigente} opciones={chipsCategoria} onChange={setCategoria} />
      )}

      {/* De a dos siempre, y en el teléfono sin la explicación: son accesos,
          y la lista de gastos no puede quedar a media pantalla de distancia. */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/gastos/automaticos"
          className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-3 transition hover:bg-primary-100 sm:p-4"
        >
          <Icon name="swap" size={20} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-primary-700 sm:text-base">
              Gastos automáticos
            </span>
            <span className="hidden text-sm text-texto-3 sm:block">
              El alquiler y los sueldos se cargan solos cada mes
            </span>
          </span>
        </Link>
        <button
          onClick={() => setConCategorias(true)}
          className="flex items-center gap-3 rounded-xl border border-borde bg-white p-3 text-left transition hover:bg-muted sm:p-4"
        >
          <Icon name="grid" size={20} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-texto sm:text-base">Categorías</span>
            <span className="hidden text-sm text-texto-3 sm:block">
              Sacá las que no usás y agregá las de la farmacia
            </span>
          </span>
        </button>
      </div>

      <ProximosAutomaticos mes={mes} sucursalId={suc.sucursalId} />

      {lista.cargando ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : visibles.length === 0 ? (
        <div className="card">
          <Vacio
            icono="archive"
            titulo={
              filtro !== "TODOS" || qBuscado
                ? "Ningún gasto con ese filtro"
                : "Todavía no hay gastos en este mes"
            }
            texto="Acá van el alquiler, los sueldos del regente y los auxiliares, la luz y los impuestos."
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((g) => (
            <li key={g.id}>
              <FilaGasto gasto={g} onClick={() => setElegido(g)} />
            </li>
          ))}
        </ul>
      )}

      {elegidoVivo && (
        <DetalleGasto
          gasto={elegidoVivo}
          onCerrar={() => setElegido(null)}
          onPagar={() => setPagando(elegidoVivo)}
          onEditar={() => setEditando(elegidoVivo)}
          onEliminado={(texto) => {
            setElegido(null);
            mostrarAviso(texto);
            recargar();
          }}
        />
      )}

      {editando !== undefined && (
        <FormGasto
          gasto={editando}
          categorias={categorias.datos ?? []}
          sucursalSugerida={suc.sucursalId}
          onCerrar={() => setEditando(undefined)}
          onGuardado={(texto) => {
            setEditando(undefined);
            mostrarAviso(texto);
            recargar();
          }}
        />
      )}

      {pagando && (
        <PanelPago
          gasto={pagando}
          onCerrar={() => setPagando(null)}
          onPagado={(texto) => {
            setPagando(null);
            mostrarAviso(texto);
            recargar();
          }}
        />
      )}

      {conCategorias && (
        <Categorias
          lista={categorias.datos ?? []}
          cargando={categorias.cargando}
          onCerrar={() => setConCategorias(false)}
          onCambio={(texto) => {
            mostrarAviso(texto);
            categorias.recargar();
            // Un renombre cambia cómo se ve cada fila de la lista.
            lista.recargar();
          }}
        />
      )}
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Numero({
  etiqueta,
  valor,
  pie,
  tono,
  alerta,
}: {
  etiqueta: string;
  valor: string;
  pie: string;
  tono?: string;
  alerta?: boolean;
}) {
  return (
    <div className={`card min-w-0 p-3.5 sm:p-4 ${alerta ? "border-danger/40" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4 sm:text-[12px]">
        {etiqueta}
      </p>
      <p
        className={`mt-1.5 break-words text-lg font-extrabold leading-tight tracking-tight sm:text-2xl ${
          tono ?? "text-texto"
        }`}
      >
        {valor}
      </p>
      <p className={`mt-1 text-xs ${alerta ? "font-semibold text-danger-text" : "text-texto-3"}`}>
        {pie}
      </p>
    </div>
  );
}

function Inicial({ gasto: g, grande }: { gasto: Pick<Gasto, "categoria" | "categoriaNombre">; grande?: boolean }) {
  const nombre = g.categoriaNombre ?? g.categoria;
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-xl font-extrabold ${colorDe(
        g.categoria,
      )} ${grande ? "h-12 w-12 text-lg" : "h-10 w-10 text-[15px]"}`}
    >
      {nombre.slice(0, 1).toUpperCase()}
    </span>
  );
}

function FilaGasto({ gasto: g, onClick }: { gasto: Gasto; onClick: () => void }) {
  const vence = textoVencimiento(g);
  const b = badgeEstado(g);
  const parcial = !saldado(g) && esPositivo(g.pagado);
  return (
    <button
      onClick={onClick}
      className="card flex w-full items-center gap-3 p-3.5 text-left transition-shadow hover:shadow-md sm:p-4"
    >
      <Inicial gasto={g} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-texto">{g.concepto}</p>
        <p className="mt-0.5 truncate text-xs text-texto-3">
          {g.categoriaNombre ?? g.categoria} · {fmtFecha(g.fecha)}
          {g.metodoPago && saldado(g) ? ` · ${NOMBRE_METODO[g.metodoPago] ?? g.metodoPago}` : ""}
          {g.recurrente ? " · automático" : ""}
        </p>
        {(vence || parcial) && (
          <p
            className={`mt-0.5 truncate text-xs ${
              g.vencido ? "font-semibold text-danger-text" : "text-texto-3"
            }`}
          >
            {vence}
            {vence && parcial ? " · " : ""}
            {parcial ? `saldo ${fmtMoney(g.saldo)}` : ""}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-texto">{fmtMoney(g.monto)}</p>
        <Badge tono={b.tono} className="mt-1">
          {b.texto}
        </Badge>
      </div>
    </button>
  );
}

/**
 * Lo que se sabe de un gasto y lo que se hace con él.
 *
 * Eliminar pide confirmar en el mismo popup: un gasto borrado desaparece del
 * resultado de un mes que quizás ya se cerró, y no hay papelera.
 */
function DetalleGasto({
  gasto: g,
  onCerrar,
  onPagar,
  onEditar,
  onEliminado,
}: {
  gasto: Gasto;
  onCerrar: () => void;
  onPagar: () => void;
  onEditar: () => void;
  onEliminado: (texto: string) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");
  const b = badgeEstado(g);
  const vence = textoVencimiento(g);

  const eliminar = async () => {
    if (borrando) return;
    setBorrando(true);
    setError("");
    try {
      await api.eliminarGasto(g.id);
      onEliminado(`${g.concepto}: eliminado`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el gasto");
      setBorrando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={g.concepto}
      onClose={onCerrar}
      acciones={
        confirmando ? (
          <>
            <Boton variante="ghost" onClick={() => setConfirmando(false)} disabled={borrando}>
              No, dejarlo
            </Boton>
            <Boton variante="danger" onClick={eliminar} disabled={borrando}>
              {borrando ? "Eliminando…" : "Sí, eliminar"}
            </Boton>
          </>
        ) : (
          <>
            <Boton variante="ghost" onClick={() => setConfirmando(true)} className="mr-auto">
              <Icon name="trash" size={16} /> Eliminar
            </Boton>
            <Boton variante="ghost" onClick={onEditar}>
              <Icon name="edit" size={16} /> Editar
            </Boton>
            {!saldado(g) && <Boton onClick={onPagar}>Registrar pago</Boton>}
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Inicial gasto={g} grande />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-texto-3">{g.categoriaNombre ?? g.categoria}</p>
            <p className="text-2xl font-extrabold text-texto">{fmtMoney(g.monto)}</p>
          </div>
          <Badge tono={b.tono}>{b.texto}</Badge>
        </div>

        {!saldado(g) && esPositivo(g.pagado) && (
          <p className="rounded-xl bg-info-bg px-3 py-2 text-[13px] text-info-text">
            Pagado {fmtMoney(g.pagado)} · falta {fmtMoney(g.saldo)}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Dato titulo="Fecha" valor={fmtFecha(g.fecha)} />
          <Dato
            titulo="Vence"
            valor={g.fechaVencimiento ? fmtFecha(g.fechaVencimiento) : "No vence"}
            nota={vence ?? undefined}
            alerta={g.vencido && !saldado(g)}
          />
          <Dato
            titulo="Método"
            valor={g.metodoPago ? (NOMBRE_METODO[g.metodoPago] ?? g.metodoPago) : "—"}
          />
          <Dato titulo="Tipo" valor={g.recurrente ? "Automático, cada mes" : "Puntual"} />
          {g.beneficiario && <Dato titulo="A quién" valor={g.beneficiario} />}
          {g.sucursal && <Dato titulo="Sucursal" valor={g.sucursal} />}
          {g.numeroFactura && <Dato titulo="Factura" valor={g.numeroFactura} />}
          {g.nit && <Dato titulo="NIT" valor={g.nit} />}
        </dl>

        {g.nota && (
          <p className="rounded-xl bg-muted px-3 py-2 text-[13px] text-texto-2">{g.nota}</p>
        )}

        {confirmando && (
          <p className="rounded-xl bg-danger-bg px-3 py-2 text-[13px] text-danger-text">
            ¿Eliminar este gasto? Deja de contar en el resultado del mes y no se
            puede deshacer.
          </p>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function Dato({
  titulo,
  valor,
  nota,
  alerta,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{titulo}</dt>
      <dd className="truncate font-semibold text-texto">{valor}</dd>
      {nota && (
        <dd className={`text-xs ${alerta ? "font-semibold text-danger-text" : "text-texto-3"}`}>
          {nota}
        </dd>
      )}
    </div>
  );
}

// ── Categorías ──────────────────────────────────────────────────────────────

const NOMBRE_TIPO: Record<TipoCostoGasto, string> = { FIJO: "Fijo", VARIABLE: "Variable" };

/**
 * Las categorías del negocio: el pack base más las propias.
 *
 * Retirar no borra: los gastos que ya la usan la conservan (el backend hace
 * una baja lógica). Por eso una retirada se recupera creándola de nuevo con el
 * mismo nombre. Fijo o variable importa: el punto de equilibrio divide por esa
 * línea.
 */
function Categorias({
  lista,
  cargando,
  onCerrar,
  onCambio,
}: {
  lista: CategoriaGasto[];
  cargando: boolean;
  onCerrar: () => void;
  onCambio: (texto: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCostoGasto>("FIJO");
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** `ocupado` llega tarde para un doble Enter: la categoría se creaba dos veces. */
  const enVuelo = useRef(false);
  const [error, setError] = useState("");

  const correr = async (clave: string, accion: () => Promise<string>) => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setOcupado(clave);
    setError("");
    try {
      onCambio(await accion());
      if (clave === "nueva") setNombre("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      enVuelo.current = false;
      setOcupado(null);
    }
  };

  const activas = lista.filter((c) => c.activa !== false);

  return (
    <Modal
      abierto
      titulo="Categorías de gasto"
      subtitulo="Las que se ofrecen al cargar un gasto"
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
    >
      <div className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nombre.trim();
            if (n.length < 2) return setError("Escribí el nombre de la categoría.");
            correr("nueva", async () => {
              await api.crearCategoriaGasto({ nombre: n, tipoCosto: tipo });
              return `Categoría ${n} lista`;
            });
          }}
        >
          <div className="min-w-[10rem] flex-1">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nueva: Regente, SEDES, Cadena de frío…"
              aria-label="Nombre de la categoría nueva"
            />
          </div>
          <Select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoCostoGasto)}
            className="w-auto"
            aria-label="Tipo de costo"
          >
            <option value="FIJO">Fijo</option>
            <option value="VARIABLE">Variable</option>
          </Select>
          <Boton type="submit" disabled={ocupado === "nueva"}>
            <Icon name="plus" size={16} /> Agregar
          </Boton>
        </form>

        <ErrorMsg>{error}</ErrorMsg>

        {cargando && activas.length === 0 ? (
          <Cargando />
        ) : (
          <ul className="max-h-[50vh] divide-y divide-borde-soft overflow-y-auto rounded-xl border border-borde">
            {activas.map((c) => (
              <li key={c.codigo} className="flex items-center gap-3 px-3 py-2.5">
                <Inicial gasto={{ categoria: c.codigo, categoriaNombre: c.nombre }} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-texto">
                  {c.nombre}
                  {c.propia && <span className="ml-1.5 text-xs font-normal text-texto-4">propia</span>}
                </span>
                {/* Tocar el tipo lo da vuelta: es la corrección más común y
                    la que más mueve el punto de equilibrio. */}
                <button
                  onClick={() =>
                    correr(c.codigo, async () => {
                      const nuevo: TipoCostoGasto = c.tipoCosto === "FIJO" ? "VARIABLE" : "FIJO";
                      await api.actualizarCategoriaGasto(c.codigo, { tipoCosto: nuevo });
                      return `${c.nombre} pasa a ${NOMBRE_TIPO[nuevo].toLowerCase()}`;
                    })
                  }
                  disabled={ocupado === c.codigo}
                  title="Cambiar entre fijo y variable"
                  className="shrink-0 rounded-lg border border-borde px-2 py-1 text-xs font-semibold text-texto-2 hover:bg-muted"
                >
                  {NOMBRE_TIPO[c.tipoCosto]}
                </button>
                <button
                  onClick={() =>
                    correr(c.codigo, async () => {
                      await api.eliminarCategoriaGasto(c.codigo);
                      return `${c.nombre} ya no se ofrece`;
                    })
                  }
                  disabled={ocupado === c.codigo}
                  aria-label={`Retirar ${c.nombre}`}
                  title="Retirar de la lista"
                  className="shrink-0 rounded-lg p-1.5 text-texto-3 hover:bg-danger-bg hover:text-danger-text"
                >
                  <Icon name="x" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-texto-3">
          Retirar no borra nada: los gastos que ya la usan la conservan. Para
          recuperar una que retiraste, agregala de nuevo con el mismo nombre.
        </p>
      </div>
    </Modal>
  );
}
