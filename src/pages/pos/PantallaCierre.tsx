import { useEffect, useState } from "react";
import CorteDeCaja from "../../components/CorteDeCaja";
import { parsearMontoO } from "../../lib/dinero";
import { Icon } from "../../components/Icon";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Modal,
  Select,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtHora, fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { Caja } from "../../types";

/** Motivo libre: es el único que pide escribir la descripción y el sentido. */
const OTRO = "__otro__";

/**
 * Los movimientos de efectivo que de verdad pasan en un turno. El motivo decide
 * el sentido: nadie ingresa un "pago a proveedor".
 */
const MOTIVOS: { etiqueta: string; tipo: "INGRESO" | "EGRESO" }[] = [
  { etiqueta: "Sencillo", tipo: "INGRESO" },
  { etiqueta: "Devolución", tipo: "EGRESO" },
  { etiqueta: "Pago a proveedor", tipo: "EGRESO" },
  { etiqueta: "Retiro", tipo: "EGRESO" },
];

export default function PantallaCierre({
  caja,
  onAtras,
  onCerrada,
}: {
  caja: Caja;
  onAtras: () => void;
  onCerrada: (cerrada: Caja) => void;
}) {
  const { incluye } = useAuth();
  const resumen = useApi(() => api.resumenCaja(caja.id), [caja.id]);
  const [contado, setContado] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [movimientoAbierto, setMovimientoAbierto] = useState(false);
  const [viendoProductos, setViendoProductos] = useState(false);

  const r = resumen.datos;
  /**
   * El conteo arranca con el saldo esperado ya puesto: acelera el arqueo de la
   * mayoría de los turnos, donde la caja cuadra. Si el cajero ya tecleó algo no
   * se pisa — corregirle el número mientras cuenta sería peor que no ayudarlo.
   */
  const [precargado, setPrecargado] = useState(false);
  const esperado = r?.saldoEsperado ?? 0;
  useEffect(() => {
    // Sólo una vez, y sólo si el cajero todavía no escribió nada.
    if (precargado || !r || contado !== "") return;
    setContado(String(esperado));
    setPrecargado(true);
  }, [r, esperado, contado, precargado]);
  // Con parseo de coma: en Bolivia se teclea "150,50" y Number() da NaN, que
  // caía a 0 sin avisar — el conteo del cierre quedaba en cero y la diferencia
  // mostraba un faltante enorme que nadie había cometido.
  const contadoNum = parsearMontoO(contado, NaN);

  // La diferencia sólo tiene sentido una vez que se contó: mostrarla en 0
  // antes de teclear haría parecer que la caja ya cuadra. Se valida igual
  // que la apertura: el `min="0"` del input es sólo una pista del navegador
  // y un monto negativo dejaba el arqueo del turno con un faltante falso.
  const conteoHecho = contado !== "" && Number.isFinite(contadoNum) && contadoNum >= 0;
  const diferencia = Math.round((contadoNum - esperado) * 100) / 100;

  async function cerrar() {
    setError("");
    if (!conteoHecho)
      return setError(
        contado !== ""
          ? "El efectivo contado no puede ser negativo."
          : "Contá el efectivo que hay en la caja.",
      );
    setEnviando(true);
    try {
      // Se pasa la caja que devuelve el cierre: es la unica fuente con los
      // montos ya calculados por el backend. Releerla despues no sirve —
      // /caja/actual responde null en cuanto la caja queda cerrada.
      const cerrada = await api.cerrarCaja(caja.id, {
        montoCierre: contadoNum,
        ...(nota.trim() ? { notaCierre: nota.trim() } : {}),
      });
      onCerrada(cerrada);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la caja");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="flex items-center gap-2 border-b border-borde bg-white px-4 py-3">
        <button
          onClick={onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div>
          <h1 className="text-[15px] font-bold text-texto">Cierre de caja</h1>
          <p className="text-xs text-texto-3">
            Abierta desde {fmtHora(caja.fechaApertura)}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {resumen.cargando ? (
          <Cargando texto="Calculando el arqueo…" />
        ) : !r ? (
          <ErrorMsg>{resumen.error}</ErrorMsg>
        ) : (
          <>
            <section className="card p-4">
              <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-texto-4">
                Movimiento del turno
              </h2>
              <dl className="space-y-1.5 text-sm">
                <Fila etiqueta="Fondo de apertura" valor={r.montoApertura} />
                <Fila
                  etiqueta={`Ventas (${r.cantidadVentas})`}
                  valor={r.totalVentas}
                />
                {r.porFormaPago.map((f) => (
                  <Fila key={f.nombre} etiqueta={f.nombre} valor={f.monto} sangria />
                ))}
                {r.cambioEntregado > 0 && (
                  <Fila etiqueta="Cambio entregado" valor={-r.cambioEntregado} />
                )}
                {r.ingresos > 0 && <Fila etiqueta="Ingresos de efectivo" valor={r.ingresos} />}
                {r.egresos > 0 && <Fila etiqueta="Egresos de efectivo" valor={-r.egresos} />}
                {r.abonosEfectivo > 0 && (
                  <Fila etiqueta="Abonos de créditos (efectivo)" valor={r.abonosEfectivo} />
                )}
                {/* Un abono cobrado por QR entró al negocio pero NO al cajón:
                    sin esta fila el cajero veía el total de cobros del turno
                    sin poder explicar por qué el efectivo no llegaba. */}
                {r.abonosPorFormaPago
                  ?.filter(
                    (f) => f.monto > 0 && !f.nombre.toLowerCase().includes("efectivo"),
                  )
                  .map((f) => (
                    <Fila
                      key={f.nombre}
                      etiqueta={`Abonos por ${f.nombre} (no es efectivo)`}
                      valor={f.monto}
                      apagado
                    />
                  ))}
                {r.creditoOtorgado > 0 && (
                  <Fila
                    etiqueta="Fiado otorgado (no es efectivo)"
                    valor={r.creditoOtorgado}
                    apagado
                  />
                )}
                {r.anuladas > 0 && (
                  <div className="flex justify-between pt-1 text-texto-3">
                    <dt>Ventas anuladas</dt>
                    <dd>{r.anuladas}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-3 flex items-center justify-between border-t border-borde pt-3">
                <span className="text-[13px] font-bold text-texto">
                  Efectivo esperado en caja
                </span>
                <span className="text-lg font-extrabold text-texto">
                  {fmtMoney(esperado)}
                </span>
              </div>
            </section>

            {/* La capacidad ya exige ADMIN o SUPERVISOR: el backend lo pide
                con RolesGuard y no tiene sentido ofrecerle al cajero un botón
                que le va a dar 403. */}
            {incluye("movimientos_caja") && (
              <Boton
                variante="ghost"
                icono="swap"
                onClick={() => setMovimientoAbierto(true)}
                className="w-full"
              >
                Registrar movimiento de efectivo
              </Boton>
            )}

            <section className="card p-4">
              <Campo
                label="Efectivo contado"
                hint="Contá los billetes y monedas que hay en la caja"
              >
                <button
                  type="button"
                  onClick={() => setViendoProductos(true)}
                  className="mb-2 flex w-full items-center gap-2 rounded-xl border border-borde px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted"
                >
                  <Icon name="box" size={17} />
                  <span className="flex-1">Ver qué salió del mostrador</span>
                  <Icon name="chevronRight" size={16} />
                </button>

                <div className="mb-2">
                  <CorteDeCaja
                    titulo="Contar billete por billete"
                    onTotal={(t) => setContado(t > 0 ? String(t) : "")}
                  />
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  placeholder="0,00"
                  className="text-lg font-bold"
                />
              </Campo>

              {conteoHecho && (
                <div
                  className={`mt-3 rounded-xl px-4 py-3 text-center ${
                    diferencia === 0
                      ? "bg-primary-50 text-primary-700"
                      : diferencia > 0
                        ? "bg-info-bg text-info-text"
                        : "bg-danger-bg text-danger-text"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {diferencia === 0
                      ? "La caja cuadra"
                      : diferencia > 0
                        ? "Sobrante"
                        : "Faltante"}
                  </p>
                  <p className="text-2xl font-extrabold">
                    {fmtMoney(Math.abs(diferencia))}
                  </p>
                </div>
              )}

              <div className="mt-3">
                <Campo label="Nota del cierre (opcional)">
                  <Input
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Ej. faltó cambio de Bs 2"
                  />
                </Campo>
              </div>

              <ErrorMsg>{error}</ErrorMsg>
            </section>
          </>
        )}
      </div>

      <div className="border-t border-borde bg-white p-4">
        <Boton
          onClick={cerrar}
          disabled={enviando || resumen.cargando}
          className="w-full py-3 text-base"
        >
          {enviando ? "Cerrando…" : "Cerrar caja"}
        </Boton>
      </div>

      {viendoProductos && (
        <ProductosDelTurno cajaId={caja.id} onClose={() => setViendoProductos(false)} />
      )}

      {movimientoAbierto && (
        <DialogoMovimiento
          cajaId={caja.id}
          onClose={() => setMovimientoAbierto(false)}
          onGuardado={() => {
            setMovimientoAbierto(false);
            // El movimiento cambia el efectivo esperado: hay que recalcular.
            resumen.recargar();
          }}
        />
      )}
    </div>
  );
}

function Fila({
  etiqueta,
  valor,
  sangria,
  apagado,
}: {
  etiqueta: string;
  valor: number;
  sangria?: boolean;
  apagado?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${sangria ? "pl-3" : ""} ${
        apagado ? "text-texto-4" : "text-texto-2"
      }`}
    >
      <dt className={sangria ? "text-[13px]" : ""}>{etiqueta}</dt>
      <dd className={sangria ? "text-[13px]" : ""}>{fmtMoney(valor)}</dd>
    </div>
  );
}

function DialogoMovimiento({
  cajaId,
  onClose,
  onGuardado,
}: {
  cajaId: number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("EGRESO");
  const [motivo, setMotivo] = useState<string>(OTRO);
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    setError("");
    const m = parsearMontoO(monto, NaN);
    if (!Number.isFinite(m) || m <= 0) return setError("Poné un monto mayor a cero.");
    if (!descripcion.trim()) return setError("Contá para qué fue el movimiento.");

    setEnviando(true);
    try {
      await api.crearMovimientoCaja(cajaId, {
        tipo,
        monto: m,
        descripcion: descripcion.trim(),
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Movimiento de efectivo"
      subtitulo="Entradas y salidas que no son ventas"
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={enviando}>
            {enviando ? "Guardando…" : "Registrar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        {/* Los motivos de siempre, que además deciden el sentido: elegir
            "Sencillo" y tener que marcar aparte que es un ingreso es pedirle al
            cajero que traduzca algo que el motivo ya dice. */}
        <Campo label="Motivo">
          <div className="flex flex-wrap gap-2">
            {MOTIVOS.map((m) => (
              <button
                key={m.etiqueta}
                type="button"
                onClick={() => {
                  setMotivo(m.etiqueta);
                  setTipo(m.tipo);
                  // Con un motivo de la lista la descripción es la etiqueta:
                  // no hay nada más que escribir.
                  setDescripcion(m.etiqueta);
                }}
                className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                  motivo === m.etiqueta
                    ? "bg-primary-boton text-white"
                    : "border border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMotivo(OTRO);
                setDescripcion("");
              }}
              className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                motivo === OTRO
                  ? "bg-primary-boton text-white"
                  : "border border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              Otro
            </button>
          </div>
          <p
            className={`mt-1.5 text-xs font-semibold ${
              tipo === "INGRESO" ? "text-primary-700" : "text-danger-text"
            }`}
          >
            {tipo === "INGRESO" ? "Entra plata a la caja" : "Sale plata de la caja"}
          </p>
        </Campo>

        {motivo === OTRO && (
          <Campo label="Tipo">
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "INGRESO" | "EGRESO")}
            >
              <option value="EGRESO">Egreso — sale plata de la caja</option>
              <option value="INGRESO">Ingreso — entra plata a la caja</option>
            </Select>
          </Campo>
        )}

        <Campo label="Monto">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            autoFocus
            className="font-bold"
          />
        </Campo>

        {/* Con un motivo de la lista la descripción ya está resuelta; sólo
            "Otro" obliga a escribirla. */}
        {motivo === OTRO && (
          <Campo label="Descripción">
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={tipo === "EGRESO" ? "Ej. compra de hielo" : "Ej. vuelto del dueño"}
            />
          </Campo>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/** Comprobante del arqueo, con lo que se contó y la diferencia. */
export function CierreOk({ caja, onSalir }: { caja: Caja; onSalir: () => void }) {
  const diferencia = caja.montoDiferencia ?? 0;
  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
          <Icon name="check" size={32} strokeWidth={2.5} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-texto">Caja cerrada</h1>
        <p className="mt-1 text-[13px] text-texto-3">
          Turno de {fmtHora(caja.fechaApertura)} a {fmtHora(caja.fechaCierre)}
        </p>

        <dl className="card mt-5 space-y-2 p-4 text-left text-sm">
          <div className="flex justify-between text-texto-2">
            <dt>Fondo de apertura</dt>
            <dd>{fmtMoney(caja.montoApertura)}</dd>
          </div>
          <div className="flex justify-between font-bold text-texto">
            <dt>Efectivo contado</dt>
            <dd>{fmtMoney(caja.montoCierre ?? 0)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-borde pt-2">
            <dt className="text-texto-2">Diferencia</dt>
            <dd>
              <Badge tono={diferencia === 0 ? "verde" : diferencia > 0 ? "azul" : "rojo"}>
                {diferencia === 0
                  ? "Cuadra"
                  : `${diferencia > 0 ? "Sobrante" : "Faltante"} ${fmtMoney(Math.abs(diferencia))}`}
              </Badge>
            </dd>
          </div>
          {caja.notaCierre && (
            <p className="border-t border-borde pt-2 text-[13px] italic text-texto-3">
              {caja.notaCierre}
            </p>
          )}
        </dl>

        <Boton onClick={onSalir} className="mt-5 w-full">
          Volver
        </Boton>
      </div>
    </div>
  );
}

/**
 * Lo que salió del mostrador en el turno, agrupado por categoría.
 *
 * El arqueo dice cuánta plata entró; esto dice qué se vendió para que entrara.
 * Va acá y no en Reportes a propósito: el cajero que cierra su turno tiene que
 * poder verlo sin el módulo de reportes, que se vende aparte.
 *
 * Ya viene agrupado y ordenado del backend: no se reordena acá.
 */
function ProductosDelTurno({
  cajaId,
  onClose,
}: {
  cajaId: number;
  onClose: () => void;
}) {
  const datos = useApi(() => api.reporteCierreProductos(cajaId), [cajaId]);
  const d = datos.datos;

  /** Una fila por producto, con su categoría, para que la planilla se pueda ordenar. */
  function exportar() {
    if (!d) return;
    const filas = d.categorias.flatMap((c) =>
      c.items.map((i) => ({
        Categoria: c.nombre,
        Producto: i.nombre,
        Cantidad: i.cantidad,
        Precio: i.precio,
        Total: i.total,
      })),
    );
    if (filas.length === 0) return;

    const cols = ["Categoria", "Producto", "Cantidad", "Precio", "Total"];
    const esc = (v: unknown) => {
      const t = v === null || v === undefined ? "" : String(v);
      // Coma decimal para que Excel es-BO sume la columna, y apóstrofe si la
      // celda arranca como fórmula (ver bajarCsv en Reportes).
      const num = typeof v === "number" ? String(v).replace(".", ",") : t;
      const seguro =
        num.length > 0 && "=+@-".includes(num[0]) && !/^-?[\d.,]+$/.test(num)
          ? `'${num}`
          : num;
      return `"${seguro.replace(/"/g, '""')}"`;
    };
    const csv = [
      cols.map(esc).join(";"),
      ...filas.map((f) => cols.map((c) => esc(f[c as keyof typeof f])).join(";")),
    ].join("\r\n");

    const url = URL.createObjectURL(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `productos-turno-${cajaId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      abierto
      titulo="Productos vendidos"
      subtitulo={`Turno #${cajaId}`}
      onClose={onClose}
      acciones={
        d && d.lineas > 0 ? (
          <Boton variante="ghost" icono="download" onClick={exportar}>
            Exportar
          </Boton>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <ErrorMsg>{datos.error}</ErrorMsg>
        {datos.cargando ? (
          <Cargando />
        ) : !d || d.lineas === 0 ? (
          <p className="py-6 text-center text-[13px] text-texto-3">
            En este turno todavía no se vendió nada.
          </p>
        ) : (
          <>
            <div className="flex justify-between rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">
              <span className="text-texto-2">
                {fmtNum(d.unidades, 2)} unidades · {fmtNum(d.lineas)}{" "}
                {d.lineas === 1 ? "producto" : "productos"}
              </span>
              <span className="font-bold text-texto">{fmtMoney(d.total)}</span>
            </div>

            {d.categorias.map((c) => (
              <div key={c.nombre}>
                <div className="flex items-baseline justify-between">
                  <h4 className="text-[13px] font-bold text-texto">{c.nombre}</h4>
                  <span className="text-xs text-texto-3">
                    {fmtNum(c.unidades, 2)} u · {fmtMoney(c.total)}
                  </span>
                </div>
                <ul className="mt-1 divide-y divide-borde-soft">
                  {c.items.map((i) => (
                    <li key={i.nombre} className="flex items-center gap-2 py-1.5 text-[13px]">
                      <span className="min-w-0 flex-1 truncate text-texto-2">{i.nombre}</span>
                      <span className="shrink-0 text-texto-3">
                        {fmtNum(i.cantidad, 2)} × {fmtMoney(i.precio)}
                      </span>
                      <span className="w-20 shrink-0 text-right font-bold text-texto">
                        {fmtMoney(i.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
