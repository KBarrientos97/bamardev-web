import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import InputMonto from "../components/InputMonto";
import { Buscador, Chips, EncabezadoPagina } from "../components/filtros";
import { AvisoGastosAtrasados } from "../components/AvisoGastosAtrasados";
import { CampoCategoria, PanelCategorias } from "../components/CategoriasGasto";
import { ProximosAutomaticos } from "../components/ProximosAutomaticos";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Kpi,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../components/ui";
import { api } from "../lib/api";
import { cubre, esPositivo, excede } from "../lib/dinero";
import { leerMonto, montoParaEditar } from "../lib/montoTecleado";
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
} from "../lib/gastos";
import { fmtFecha, fmtMoney } from "../lib/format";
import { useApi } from "../lib/useApi";
import { useSucursales } from "../lib/useSucursales";
import type {
  CategoriaGasto,
  FiltroGasto,
  Gasto,
  GastoInput,
  MetodoPagoGasto,
} from "../types";

/**
 * Gastos operativos: el libro del RESULTADO.
 *
 * La regla que gobierna todo el módulo: **un gasto NO es un movimiento de
 * caja**. Son dos libros distintos y cada uno responde otra pregunta. El del
 * resultado (esto) dice qué gastó el negocio este mes —el alquiler de
 * septiembre es gasto de septiembre aunque se pague en octubre—; el del
 * efectivo (los movimientos de caja) dice qué salió del cajón y cuándo.
 *
 * Por eso registrar un gasto acá no abre ningún egreso de caja. Si el dueño
 * además quiere reflejar la salida de plata, la carga a mano: decisión suya,
 * no efecto lateral.
 *
 * Espejo de la pantalla de Android (`GastosFragment`): las dos leen el mismo
 * backend y tienen que decir lo mismo.
 */

/** El respiro antes de consultar lo tecleado, igual que en la app. */
const DEBOUNCE_MS = 350;

export default function Gastos() {
  const [mes, setMes] = useState(() => hoyIso().slice(0, 7));
  const [filtro, setFiltro] = useState<FiltroGasto>("TODOS");
  /** Lo que se está tecleando. */
  const [q, setQ] = useState("");
  /** Lo que de verdad se consultó. Sin esto salía una petición por letra:
   *  escribir "delapaz" eran siete consultas y la lista parpadeaba con
   *  resultados de búsquedas viejas. */
  const [qBuscado, setQBuscado] = useState("");

  useEffect(() => {
    // Vaciar el campo recarga al instante; escribir espera un respiro.
    if (q === "") {
      setQBuscado("");
      return;
    }
    const t = setTimeout(() => setQBuscado(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);
  // `elegir` ya encapsula la condicion: usuario de organizacion Y mas de un
  // local. Con un solo local el filtro no aparece, que es lo correcto.
  const { sucursalId, valorSelect, alElegirSelect, sucursales, elegir } =
    useSucursales();

  const [editando, setEditando] = useState<Gasto | null | undefined>(undefined);
  const [pagando, setPagando] = useState<Gasto | null>(null);
  const [deshaciendo, setDeshaciendo] = useState<Gasto | null>(null);
  const [borrando, setBorrando] = useState<Gasto | null>(null);
  const [aviso, mostrarAviso] = useAviso();

  const desde = inicioDeMes(`${mes}-01`);
  const hasta = finDeMes(`${mes}-01`);

  const resumen = useApi(
    () => api.getResumenGastos({ desde, hasta, sucursalId }),
    [desde, hasta, sucursalId],
  );
  const lista = useApi(
    () =>
      api.getGastos({
        desde,
        hasta,
        // "TODOS" es una pestana de la pantalla, no un valor del backend: alla
        // se representa NO mandando el parametro. Enviarlo devolvia 400 y la
        // lista arrancaba rota en su estado inicial. Igual que `FiltroGasto`
        // en la app, donde TODOS lleva `query = null`.
        filtro: filtro === "TODOS" ? undefined : filtro,
        q: qBuscado || undefined,
        sucursalId,
      }),
    [desde, hasta, filtro, qBuscado, sucursalId],
  );
  const categorias = useApi(() => api.getCategoriasGasto(), []);

  const recargar = () => {
    lista.recargar();
    resumen.recargar();
  };

  const gastos = lista.datos ?? [];
  const r = resumen.datos;

  /**
   * Cuánto de las ventas del período se fue en gastos: el número real, sin el
   * tope de 100 que se le había puesto para coincidir con la app (ver
   * `sobreVentas` en lib/gastos). Pasado el 100 va en rojo: el mes ya perdió
   * plata antes de contar la mercadería.
   */
  const sobreVentas = r ? calcularSobreVentas(r.total, r.ventasPeriodo) : null;
  const superaVentas = !!r && gastosSuperanVentas(r.total, r.ventasPeriodo);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:space-y-5 sm:p-5">
      <EncabezadoPagina
        titulo="Gastos operativos"
        subtitulo="Lo que gasta el negocio, aparte de lo que sale de la caja"
        accion={
          <Boton onClick={() => setEditando(null)}>
            <Icon name="plus" size={16} /> Nuevo gasto
          </Boton>
        }
      />

      {aviso && <AvisoOk>{aviso}</AvisoOk>}

      {/* El hero. Si el resumen falla se muestra el error y NO los números del
          período anterior: un total viejo al lado de la lista nueva miente sin
          que nada lo diga. */}
      {resumen.error ? (
        <ErrorMsg onReintentar={resumen.recargar}>{resumen.error}</ErrorMsg>
      ) : resumen.cargando || !r ? (
        // `useApi` conserva los datos viejos mientras vuela la consulta nueva,
        // asi que sin esto el hero mostraba el total de septiembre arriba de la
        // lista de octubre durante todo el viaje.
        <Cargando texto="Cargando el resumen…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            etiqueta="Total del período"
            valor={fmtMoney(r?.total ?? 0)}
            pie={contar(r?.cantidad ?? 0, "gasto", "gastos")}
          />
          <Kpi etiqueta="Pagado" valor={fmtMoney(r?.pagado ?? 0)} />
          <Kpi
            etiqueta="Pendiente"
            valor={fmtMoney(r?.pendiente ?? 0)}
            pie={
              // Con el MONTO, no sólo el conteo: "3 vencidos" no dice si son
              // Bs 300 o Bs 9.500, y el dato ya viene en la misma respuesta.
              r && r.cantidadVencidos > 0
                ? `${contar(r.cantidadVencidos, "vencido", "vencidos")} · ${fmtMoney(r.vencido)}`
                : undefined
            }
          />
          <Kpi
            etiqueta="Sobre las ventas"
            valor={sobreVentas == null ? "—" : fmtSobreVentas(sobreVentas)}
            pie={
              r && sobreVentas != null
                ? superaVentas
                  ? `Más que lo vendido (${fmtMoney(r.ventasPeriodo)})`
                  : `Ventas ${fmtMoney(r.ventasPeriodo)}`
                : "Sin ventas en el período"
            }
            alerta={superaVentas}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Campo label="Mes">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </Campo>
        {elegir && (
          <Campo label="Sucursal">
            <Select
              value={valorSelect}
              onChange={(e) => alElegirSelect(e.target.value)}
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
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

      {/* La puerta a las reglas, en el mismo lugar que en la app: es la
          pregunta que sigue cuando uno ve el alquiler repetido cada mes. */}
      <Link
        to="/gastos/automaticos"
        className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4 transition hover:bg-primary-100"
      >
        <Icon name="swap" size={20} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-primary-700">
            Gastos automáticos
          </span>
          <span className="block text-sm text-texto-3">
            Los que se repiten todos los meses: la app los carga sola el día que
            corresponde
          </span>
        </span>
      </Link>

      <ProximosAutomaticos mes={mes} sucursalId={sucursalId} />

      {lista.cargando ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : gastos.length === 0 ? (
        <Vacio
          icono="archive"
          titulo="Todavía no cargaste ningún gasto en este período"
          texto="Acá van el alquiler, los sueldos y los servicios."
        />
      ) : (
        <ul className="space-y-2">
          {gastos.map((g) => {
            const vence = textoVencimiento(g);
            return (
              <li
                key={g.id}
                className="card flex flex-wrap items-center gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{g.concepto}</span>
                    <Badge tono="gris">{g.categoriaNombre ?? g.categoria}</Badge>
                    {g.sucursal && <Badge tono="gris">{g.sucursal}</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-texto-3">
                    {fmtFecha(g.fecha)}
                    {g.beneficiario ? ` · ${g.beneficiario}` : ""}
                    {vence && (
                      <span className={g.vencido ? "font-semibold text-danger-text" : undefined}>
                        {" · "}
                        {vence}
                      </span>
                    )}
                  </div>
                  {/* La barra sólo aparece cuando hay un pago parcial: un gasto
                      sin pagos o ya saldado no tiene nada que mostrar. */}
                  {!saldado(g) && esPositivo(g.pagado) && (
                    <div className="mt-2 text-xs text-texto-3">
                      Pagado {fmtMoney(g.pagado)} · saldo {fmtMoney(g.saldo)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmtMoney(g.monto)}</div>
                  {(() => {
                    const b = badgeEstado(g);
                    return <Badge tono={b.tono}>{b.texto}</Badge>;
                  })()}
                </div>
                {/* flex-wrap: con cuatro botones, en el teléfono no entran en
                    un renglón y se salían de la tarjeta. */}
                <div className="flex flex-wrap justify-end gap-2">
                  {!saldado(g) && (
                    <Boton variante="ghost" onClick={() => setPagando(g)}>
                      Registrar pago
                    </Boton>
                  )}
                  {/* En la fila y no sólo dentro de "Registrar pago", que se
                      esconde con el gasto saldado: el caso típico —marcó "Ya
                      lo pagué" por error— no tenía salida (G-01). */}
                  {esPositivo(g.pagado) && (
                    <Boton variante="ghost" onClick={() => setDeshaciendo(g)}>
                      Deshacer el último pago
                    </Boton>
                  )}
                  <Boton variante="ghost" onClick={() => setEditando(g)}>
                    Editar
                  </Boton>
                  {/* Un gasto cargado dos veces inflaba el total del mes y
                      restaba de más en el Estado de resultado, y en esta
                      pantalla no había cómo sacarlo (G-02). */}
                  <Boton
                    variante="ghost"
                    onClick={() => setBorrando(g)}
                    aria-label={`Eliminar ${g.concepto}`}
                    title="Eliminar"
                  >
                    <Icon name="trash" size={16} />
                  </Boton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editando !== undefined && (
        <FormGasto
          gasto={editando}
          categorias={categorias.datos ?? []}
          sucursalSugerida={sucursalId}
          onCerrar={() => setEditando(undefined)}
          onGuardado={(texto) => {
            setEditando(undefined);
            mostrarAviso(texto);
            recargar();
          }}
          onCatalogo={(nuevo) => {
            categorias.setDatos(nuevo);
            // Un renombre cambia cómo se lee cada fila de la lista.
            lista.recargar();
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

      {deshaciendo && (
        <ConfirmarAccion
          titulo="Deshacer el último pago"
          etiquetaOk="Sí, deshacer"
          etiquetaEnCurso="Deshaciendo…"
          accion={() => api.deshacerUltimoPagoGasto(deshaciendo.id)}
          onCerrar={() => setDeshaciendo(null)}
          onListo={() => {
            setDeshaciendo(null);
            mostrarAviso(`${deshaciendo.concepto}: se deshizo el último pago`);
            recargar();
          }}
        >
          <AvisoDeshacerPago gasto={deshaciendo} />
        </ConfirmarAccion>
      )}

      {borrando && (
        <ConfirmarAccion
          titulo="¿Eliminar este gasto?"
          etiquetaOk="Sí, eliminar"
          etiquetaEnCurso="Eliminando…"
          accion={() => api.eliminarGasto(borrando.id)}
          onCerrar={() => setBorrando(null)}
          onListo={() => {
            setBorrando(null);
            mostrarAviso(`${borrando.concepto}: eliminado`);
            recargar();
          }}
        >
          <div className="space-y-2 text-sm text-texto-2">
            <p>
              <strong>{borrando.concepto}</strong> · {fmtMoney(borrando.monto)}
            </p>
            <p>
              Se borra el gasto y sus pagos registrados
              {esPositivo(borrando.pagado) ? ` (${fmtMoney(borrando.pagado)} pagados)` : ""}. Deja de
              contar en el resultado del mes y no se puede deshacer.
            </p>
          </div>
        </ConfirmarAccion>
      )}
    </div>
  );
}

// ── Confirmaciones ──────────────────────────────────────────────────────────

/**
 * Pregunta antes de tocar la plata de un gasto, y no se cierra hasta que el
 * backend contesta.
 *
 * No es el `Confirmar` de siempre por dos cosas. El error se muestra adentro:
 * si deshacer falla, quien lo pidió tiene que leerlo donde lo pidió, no en un
 * cartel de la pantalla que quedó tapada. Y el candado es un ref: deshacer no
 * es idempotente —cada llamada borra el último pago que encuentra— y un doble
 * clic sobre un sueldo pagado en dos veces se llevaba también el adelanto,
 * porque `setEnCurso(true)` no frena el segundo clic del mismo tick.
 */
function ConfirmarAccion({
  titulo,
  etiquetaOk,
  etiquetaEnCurso,
  accion,
  onCerrar,
  onListo,
  children,
}: {
  titulo: string;
  etiquetaOk: string;
  etiquetaEnCurso: string;
  accion: () => Promise<unknown>;
  onCerrar: () => void;
  onListo: () => void;
  children: ReactNode;
}) {
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState("");
  const enVuelo = useRef(false);

  const confirmar = async () => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setEnCurso(true);
    setError("");
    try {
      await accion();
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
      enVuelo.current = false;
      setEnCurso(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={titulo}
      // Con la llamada en vuelo no se cierra: cerrarlo no la frena, y la
      // pantalla quedaría sin decir si pasó o no.
      onClose={() => {
        if (!enVuelo.current) onCerrar();
      }}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={enCurso}>
            No, dejarlo
          </Boton>
          <Boton variante="danger" onClick={confirmar} disabled={enCurso}>
            {enCurso ? etiquetaEnCurso : etiquetaOk}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </div>
    </Modal>
  );
}

/**
 * Lo que se dice antes de deshacer un pago.
 *
 * NO dice de cuánto fue el último pago, porque no se sabe: el gasto trae lo
 * pagado en total y no sus pagos, y el backend borra sólo el último. Decía
 * "Deshacer el último pago de Bs 800" sobre un sueldo pagado 500 + 300, y se
 * iban los 300 (BUG-finanzas-4). Por eso va lo pagado hasta hoy, aparte, y lo
 * que pasa en los dos casos posibles.
 */
function AvisoDeshacerPago({ gasto }: { gasto: Gasto }) {
  return (
    <div className="space-y-2 text-sm text-texto-2">
      <p>
        <strong>{gasto.concepto}</strong> · pagado hasta hoy{" "}
        <strong>{fmtMoney(gasto.pagado)}</strong> de {fmtMoney(gasto.monto)}
      </p>
      <p>
        Se borra sólo el último pago registrado, con su fecha y su método. Si se pagó de una vez, el
        gasto vuelve a quedar pendiente; si se pagó en partes, queda lo anterior. El gasto sigue
        cargado.
      </p>
    </div>
  );
}

// ── Formulario ──────────────────────────────────────────────────────────────

export function FormGasto({
  gasto,
  categorias,
  sucursalSugerida,
  onCerrar,
  onGuardado,
  onCatalogo,
}: {
  /** null = alta. */
  gasto: Gasto | null;
  categorias: CategoriaGasto[];
  sucursalSugerida: number | null;
  onCerrar: () => void;
  onGuardado: (texto: string) => void;
  /**
   * Con esto el formulario deja crear y corregir categorías sin salir del
   * gasto (G-03), y recibe el catálogo que quedó. La farmacia no lo pasa: las
   * administra desde su propia pantalla y su formulario queda como estaba.
   */
  onCatalogo?: (lista: CategoriaGasto[]) => void;
}) {
  const [concepto, setConcepto] = useState(gasto?.concepto ?? "");
  const [categoria, setCategoria] = useState(gasto?.categoria ?? "");
  const [monto, setMonto] = useState(gasto ? montoParaEditar(gasto.monto) : "");
  const [fecha, setFecha] = useState(gasto?.fecha ?? hoyIso());
  const [vence, setVence] = useState(gasto?.fechaVencimiento ?? "");
  const [beneficiario, setBeneficiario] = useState(gasto?.beneficiario ?? "");
  const [nota, setNota] = useState(gasto?.nota ?? "");
  /** Sólo en el alta: al editar, lo que salió se corrige con un pago. */
  const [pagado, setPagado] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPagoGasto>("EFECTIVO");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  /** Ver `PanelPago`: el estado no frena el segundo clic del mismo tick. */
  const enVuelo = useRef(false);
  /** true mientras el cuerpo del formulario muestra el panel de categorías. */
  const [conCategorias, setConCategorias] = useState(false);
  const panel = conCategorias && !!onCatalogo;

  const guardar = async () => {
    if (enVuelo.current) return;
    const m = leerMonto(monto);
    if (!concepto.trim()) return setError("Ponele un concepto al gasto.");
    if (!categoria) return setError("Elegí una categoría.");
    if (m == null || !esPositivo(m)) return setError("El monto tiene que ser mayor a cero.");
    // El monto no puede quedar por debajo de lo ya pagado (G-04). El PATCH no
    // toca `pagado`, así que un alquiler de Bs 1.000 pagado entero y corregido
    // a 600 quedaba "Total 600 / Pagado 1.000", y lo pagado de más se comía
    // el pendiente de los otros gastos del mes. Lo que corresponde es deshacer
    // el pago primero. El backend también lo rechaza; si su 400 llega igual
    // (otro pagó mientras tanto), el catch de abajo muestra su mensaje.
    if (gasto && excede(gasto.pagado, m)) {
      return setError(
        `Ya se pagaron ${fmtMoney(gasto.pagado)}: deshacé el pago antes de bajar el monto.`,
      );
    }
    if (vence && vence < fecha) {
      return setError("El vencimiento no puede ser anterior a la fecha del gasto.");
    }

    const input: GastoInput = {
      concepto: concepto.trim(),
      categoria,
      monto: m,
      fecha,
      fechaVencimiento: vence || null,
      beneficiario: beneficiario.trim() || null,
      nota: nota.trim() || null,
      // Al editar se conserva el local que ya tenía; al crear, el que está
      // filtrado en la pantalla (si el dueño mira la Sucursal Sur, el gasto
      // que carga es casi seguro de ahí).
      sucursalId: gasto ? gasto.sucursalId : sucursalSugerida,
      ...(gasto ? {} : { pagado, metodoPago: pagado ? metodo : null }),
    };

    enVuelo.current = true;
    setGuardando(true);
    setError("");
    try {
      if (gasto) {
        await api.actualizarGasto(gasto.id, input);
        onGuardado("Gasto actualizado");
      } else {
        await api.crearGasto(input);
        onGuardado("Gasto cargado");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el gasto");
      enVuelo.current = false;
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={panel ? "Categorías de gasto" : gasto ? "Editar gasto" : "Nuevo gasto"}
      subtitulo={panel ? "Tocá una para elegirla" : undefined}
      // Con el panel abierto, cerrar (la X o Escape) vuelve al gasto: cerrar
      // todo tiraba lo que ya estaba escrito.
      onClose={panel ? () => setConCategorias(false) : onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        panel ? (
          <Boton variante="ghost" onClick={() => setConCategorias(false)}>
            Volver al gasto
          </Boton>
        ) : (
          <>
            <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Boton>
          </>
        )
      }
    >
      {panel && onCatalogo && (
        <PanelCategorias
          categorias={categorias}
          elegida={categoria}
          onElegir={(c) => {
            setCategoria(c.codigo);
            setConCategorias(false);
          }}
          onCatalogo={(lista) => {
            // Se retiró la que estaba elegida: se pide elegir otra en vez de
            // guardar el gasto en una que ya no se ofrece. Menos si es la que el
            // gasto YA tenía: retirarla no toca los gastos que la usan (lo dice
            // el panel), y vaciarla frenaba Guardar con "Elegí una categoría",
            // así que para corregirle la nota había que cambiarle la categoría.
            // `CampoCategoria` la sigue ofreciendo como "ya no se ofrece".
            const estaba = categorias.some((c) => c.codigo === categoria);
            const seRetiro = estaba && !lista.some((c) => c.codigo === categoria);
            if (seRetiro && categoria !== gasto?.categoria) setCategoria("");
            onCatalogo(lista);
          }}
        />
      )}
      {/* Escondido y no desmontado mientras se ve el panel: así vuelve con lo
          escrito y sin que el autofoco salte de nuevo al concepto. */}
      <div className="space-y-3" hidden={panel}>
        <Campo label="Concepto">
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Alquiler del local"
            autoFocus
          />
        </Campo>
        <CampoCategoria
          categorias={categorias}
          valor={categoria}
          onChange={setCategoria}
          original={gasto ? { codigo: gasto.categoria, nombre: gasto.categoriaNombre } : null}
          onAdministrar={onCatalogo ? () => setConCategorias(true) : undefined}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Monto (Bs)">
            <InputMonto value={monto} onChange={setMonto} placeholder="0,00" />
          </Campo>
          <Campo label="Fecha del gasto">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
        </div>
        <Campo label="Vence (opcional)">
          <Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Beneficiario (opcional)">
            <Input
              value={beneficiario}
              onChange={(e) => setBeneficiario(e.target.value)}
              placeholder="Ej: DELAPAZ"
            />
          </Campo>
          <Campo label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
        </div>

        {/* Al editar no se toca: el backend no deja que un PATCH escriba la
            plata, y tiene razón —`pagado` es la suma de los pagos, cada uno con
            su fecha y su método— así que mostrarlo tocable sería mentir. */}
        {!gasto && (
          <div className="rounded-xl border border-borde p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pagado}
                onChange={(e) => setPagado(e.target.checked)}
              />
              Ya lo pagué
            </label>
            {pagado && (
              <div className="mt-2">
                <Campo label="Método de pago">
                  <Select
                    value={metodo}
                    onChange={(e) => setMetodo(e.target.value as MetodoPagoGasto)}
                  >
                    {METODOS.map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
            )}
          </div>
        )}

        {error && <ErrorMsg>{error}</ErrorMsg>}
      </div>
    </Modal>
  );
}

// ── Registrar pago ──────────────────────────────────────────────────────────

export function PanelPago({
  gasto,
  onCerrar,
  onPagado,
}: {
  gasto: Gasto;
  onCerrar: () => void;
  onPagado: (texto: string) => void;
}) {
  const [monto, setMonto] = useState(montoParaEditar(gasto.saldo));
  const [fechaPago, setFechaPago] = useState(hoyIso());
  const [metodo, setMetodo] = useState<MetodoPagoGasto>(gasto.metodoPago ?? "EFECTIVO");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  /**
   * El candado de verdad.
   *
   * `setGuardando(true)` no frena un segundo clic en el MISMO tick: React
   * batchea el estado y las dos llamadas entran antes del re-render. Con
   * "Deshacer el último pago" eso duele: el endpoint no es idempotente, borra
   * el último pago que encuentra, y un doble clic nervioso sobre un sueldo
   * pagado en dos veces se lleva también el adelanto que estaba bien.
   */
  const enVuelo = useRef(false);
  /**
   * true mientras se pregunta si deshacer. Antes el enlace llamaba directo a
   * la API: un toque de paso borraba un pago, con su fecha y su método, sin
   * ninguna pregunta (BUG-finanzas-1). Se pregunta acá mismo y no en otro
   * popup encima, que Escape cerraría de a dos.
   */
  const [preguntandoDeshacer, setPreguntandoDeshacer] = useState(false);

  const confirmar = async () => {
    if (enVuelo.current) return;
    const m = leerMonto(monto);
    if (m == null || !esPositivo(m) || excede(m, gasto.saldo)) {
      return setError("El pago tiene que ser mayor a cero y no puede superar el saldo.");
    }
    enVuelo.current = true;
    setGuardando(true);
    setError("");
    try {
      await api.pagarGasto(gasto.id, {
        // Cuando se paga el saldo entero se manda `undefined` y no el número:
        // entre que se abrió la pantalla y se confirma pudo entrar otro pago, y
        // el saldo viejo lo sobrepagaría.
        monto: cubre(m, gasto.saldo) ? undefined : m,
        fechaPago,
        metodoPago: metodo,
      });
      onPagado("Pago registrado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago");
      enVuelo.current = false;
      setGuardando(false);
    }
  };

  const deshacer = async () => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setGuardando(true);
    setError("");
    try {
      await api.deshacerUltimoPagoGasto(gasto.id);
      onPagado("Se deshizo el último pago");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo deshacer el pago");
      enVuelo.current = false;
      setGuardando(false);
    }
  };

  if (preguntandoDeshacer) {
    return (
      <Modal
        abierto
        titulo="Deshacer el último pago"
        // Ver `ConfirmarAccion`: con la llamada en vuelo no se cierra.
        onClose={() => {
          if (!enVuelo.current) onCerrar();
        }}
        cerrarAlClicAfuera={false}
        acciones={
          <>
            <Boton
              variante="ghost"
              onClick={() => {
                setError("");
                setPreguntandoDeshacer(false);
              }}
              disabled={guardando}
            >
              No, dejarlo
            </Boton>
            <Boton variante="danger" onClick={deshacer} disabled={guardando}>
              {guardando ? "Deshaciendo…" : "Sí, deshacer"}
            </Boton>
          </>
        }
      >
        <div className="space-y-3">
          <AvisoDeshacerPago gasto={gasto} />
          {error && <ErrorMsg>{error}</ErrorMsg>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      abierto
      titulo="Registrar pago"
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={confirmar} disabled={guardando}>
            {guardando ? "Registrando…" : "Confirmar pago"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-texto-3">
          {gasto.concepto} · saldo <strong>{fmtMoney(gasto.saldo)}</strong>
        </p>
        <Campo label="Cuánto pagaste (Bs)">
          <InputMonto value={monto} onChange={setMonto} autoFocus />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Cuándo se pagó">
            <Input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </Campo>
          <Campo label="Método de pago">
            <Select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPagoGasto)}
            >
              {METODOS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        {/* Deshacer es lo que arregla haberlo cargado por error. Sólo aparece
            si hay algo que deshacer. Lo pagado va APARTE del enlace: decía
            "Deshacer el último pago de Bs 800" con el total de un sueldo
            pagado 500 + 300, y lo que se iba eran los 300 (BUG-finanzas-4). */}
        {esPositivo(gasto.pagado) && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-texto-3">
            <span>
              Pagado hasta hoy <strong className="text-texto-2">{fmtMoney(gasto.pagado)}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setError("");
                setPreguntandoDeshacer(true);
              }}
              disabled={guardando}
              className="underline disabled:opacity-50"
            >
              Deshacer el último pago
            </button>
          </div>
        )}

        {error && <ErrorMsg>{error}</ErrorMsg>}
      </div>
    </Modal>
  );
}
