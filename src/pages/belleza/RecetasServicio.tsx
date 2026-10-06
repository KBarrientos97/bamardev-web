import { useState } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import {
  AvisoOk,
  Boton,
  Cargando,
  ErrorMsg,
  Input,
  Kpi,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../../components/ui";
import { apiExtras, type InsumoElegible, type RecetaServicio } from "../../lib/belleza/apiExtras";
import { parsearMontoO } from "../../lib/dinero";
import { fmtMoney, fmtNum } from "../../lib/format";
import { fmtCantidad } from "../../lib/belleza/formato";
import { useApi } from "../../lib/useApi";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo guardar");

type Pestana = "recetas" | "margen";

/**
 * Insumos por servicio (feature `consumo_servicio`): qué gasta cada servicio
 * ("Tinte raíz": 60 g de tinte + 90 ml de oxidante) y cuánto cuesta y deja.
 *
 * Al cobrar el servicio, la venta descuenta la receta del almacén de la
 * sucursal; lo realmente usado se corrige desde la cita.
 */
export default function RecetasServicio() {
  const [pestana, setPestana] = useState<Pestana>("recetas");
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Insumos por servicio"
        subtitulo="Lo que gasta cada servicio se descuenta del stock al cobrarlo, y su costo entra a la rentabilidad."
      />
      <div className="flex gap-1.5" role="tablist" aria-label="Vista">
        {(
          [
            ["recetas", "Recetas"],
            ["margen", "Costo y margen"],
          ] as [Pestana, string][]
        ).map(([valor, texto]) => (
          <button
            key={valor}
            role="tab"
            aria-selected={pestana === valor}
            onClick={() => setPestana(valor)}
            className={`rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              pestana === valor
                ? "border-primary bg-primary-50 text-primary-700"
                : "border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
      {pestana === "recetas" ? <Recetas /> : <Margen />}
    </div>
  );
}

function Recetas() {
  const recetas = useApi(() => apiExtras.recetas(), []);
  const insumos = useApi(() => apiExtras.insumos(), []);
  const [editando, setEditando] = useState<RecetaServicio | null>(null);
  const [aviso, setAviso] = useAviso();

  if (recetas.cargando && !recetas.datos) return <Cargando />;
  if (recetas.error) return <ErrorMsg onReintentar={recetas.recargar}>{recetas.error}</ErrorMsg>;
  if (!recetas.datos?.length)
    return (
      <div className="card">
        <Vacio icono="sack" titulo="Todavía no hay servicios" texto="Crealos en Configuración de agenda." />
      </div>
    );
  return (
    <>
      <AvisoOk>{aviso}</AvisoOk>
      <ul className="space-y-2" aria-label="Servicios">
        {recetas.datos.map((r) => (
          <li key={r.servicioId} className="card flex flex-wrap items-center gap-3 p-3.5">
            <div className="min-w-0 flex-[1_1_240px]">
              <p className="text-sm font-bold text-texto">{r.servicio}</p>
              <p className="text-[12px] text-texto-3">
                {r.items.length
                  ? r.items.map((i) => `${fmtCantidad(i.cantidad)} ${i.unidad ?? ""} ${i.insumo}`.replace(/\s+/g, " ")).join(" · ")
                  : "Sin receta: no descuenta insumos"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-texto">{fmtMoney(r.costo)}</p>
              <p className="text-[12px] text-texto-3">costo de insumos</p>
            </div>
            <Boton variante="ghost" onClick={() => setEditando(r)}>
              <Icon name="edit" size={15} /> Receta
            </Boton>
          </li>
        ))}
      </ul>
      <EditarReceta
        receta={editando}
        insumos={insumos.datos ?? []}
        onClose={() => setEditando(null)}
        onGuardada={(r) => {
          setEditando(null);
          recetas.recargar();
          setAviso(`Receta de ${r.servicio} guardada`);
        }}
      />
    </>
  );
}

interface Fila {
  insumoId: number | "";
  cantidad: string;
}

export function EditarReceta({
  receta,
  insumos,
  onClose,
  onGuardada,
}: {
  receta: RecetaServicio | null;
  insumos: InsumoElegible[];
  onClose: () => void;
  onGuardada: (r: RecetaServicio) => void;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [deQuien, setDeQuien] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Al abrir otra receta, las filas arrancan con lo guardado (patrón de
  // "estado que depende de una prop", sin efecto).
  if (receta && deQuien !== receta.servicioId) {
    setDeQuien(receta.servicioId);
    setFilas(receta.items.map((i) => ({ insumoId: i.insumoId, cantidad: String(i.cantidad) })));
    setError("");
  }

  const porId = new Map(insumos.map((i) => [i.id, i]));
  const costo = filas.reduce((s, f) => {
    const i = f.insumoId ? porId.get(f.insumoId) : undefined;
    return s + (i ? i.costo * parsearMontoO(f.cantidad) : 0);
  }, 0);

  const guardar = async () => {
    if (!receta) return;
    setError("");
    const items = filas
      .filter((f) => f.insumoId !== "" || f.cantidad.trim())
      .map((f) => ({ insumoId: Number(f.insumoId), cantidad: parsearMontoO(f.cantidad) }));
    if (items.some((i) => !i.insumoId)) return setError("Elegí el insumo de cada renglón.");
    if (items.some((i) => !(i.cantidad > 0))) return setError("Cada insumo necesita una cantidad mayor a 0.");
    setGuardando(true);
    try {
      onGuardada(await apiExtras.guardarReceta(receta.servicioId, items));
      setDeQuien(null);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={!!receta}
      titulo={receta ? `Receta de ${receta.servicio}` : "Receta"}
      subtitulo="Cantidad por cada servicio, en la unidad del insumo."
      onClose={() => {
        setDeQuien(null);
        onClose();
      }}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton
            variante="ghost"
            onClick={() => {
              setDeQuien(null);
              onClose();
            }}
            disabled={guardando}
          >
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar receta"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorMsg>{error}</ErrorMsg>
        {filas.length === 0 && (
          <p className="text-[13px] text-texto-3">Sin insumos: el servicio no descuenta nada del stock.</p>
        )}
        {filas.map((f, n) => {
          const insumo = f.insumoId ? porId.get(f.insumoId) : undefined;
          return (
            <div key={n} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  aria-label={`Insumo ${n + 1}`}
                  value={f.insumoId}
                  onChange={(e) =>
                    setFilas((fs) => fs.map((x, i) => (i === n ? { ...x, insumoId: Number(e.target.value) || "" } : x)))
                  }
                >
                  <option value="">Elegí un insumo…</option>
                  {insumos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                      {i.unidad ? ` (${i.unidad})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-24">
                <Input
                  aria-label={`Cantidad ${n + 1}`}
                  type="number"
                  value={f.cantidad}
                  onChange={(e) =>
                    setFilas((fs) => fs.map((x, i) => (i === n ? { ...x, cantidad: e.target.value } : x)))
                  }
                  placeholder="0"
                />
              </div>
              <span className="w-8 text-[12px] text-texto-3">{insumo?.unidad ?? ""}</span>
              <button
                type="button"
                aria-label={`Quitar insumo ${n + 1}`}
                onClick={() => setFilas((fs) => fs.filter((_, i) => i !== n))}
                className="rounded-lg p-1.5 text-texto-3 hover:bg-muted"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          );
        })}
        <Boton variante="soft" icono="plus" onClick={() => setFilas((fs) => [...fs, { insumoId: "", cantidad: "" }])}>
          Agregar insumo
        </Boton>
        <p className="text-right text-sm text-texto-2">
          Costo por servicio <strong className="text-texto">{fmtMoney(costo)}</strong>
        </p>
      </div>
    </Modal>
  );
}

function Margen() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const rep = useApi(
    () => apiExtras.rentabilidadServicios({ desde: desde || undefined, hasta: hasta || undefined }),
    [desde, hasta],
  );
  const d = rep.datos;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <Input aria-label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="w-40">
          <Input aria-label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>
      {rep.cargando && !d ? (
        <Cargando />
      ) : rep.error ? (
        <ErrorMsg onReintentar={rep.recargar}>{rep.error}</ErrorMsg>
      ) : !d || !d.servicios.length ? (
        <div className="card">
          <Vacio icono="chart" titulo="Sin servicios cobrados en estos días" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi etiqueta="Ingreso por servicios" valor={fmtMoney(d.ingreso)} icono="dollar" />
            <Kpi etiqueta="Costo de insumos" valor={fmtMoney(d.costoInsumos)} icono="sack" tono="amarillo" />
            <Kpi etiqueta="Margen" valor={fmtMoney(d.margen)} icono="trendingUp" />
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-texto-4">
                <tr>
                  <th className="p-3">Servicio</th>
                  <th className="p-3 text-right">Cobrados</th>
                  <th className="p-3 text-right">Ingreso</th>
                  <th className="p-3 text-right">Insumos</th>
                  <th className="p-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde-soft">
                {d.servicios.map((s) => (
                  <tr key={s.servicioId}>
                    <td className="p-3 font-semibold text-texto">{s.servicio}</td>
                    <td className="p-3 text-right text-texto-2">{fmtNum(s.cantidad)}</td>
                    <td className="p-3 text-right text-texto-2">{fmtMoney(s.ingreso)}</td>
                    <td className="p-3 text-right text-texto-2">
                      {fmtMoney(s.costoInsumos)}
                      <span className="block text-[11px] text-texto-4">{fmtMoney(s.costoPorServicio)} c/u</span>
                    </td>
                    <td className="p-3 text-right font-semibold text-texto">
                      {fmtMoney(s.margen)}
                      <span className="block text-[11px] font-normal text-texto-4">
                        {s.margenPct == null ? "—" : `${Math.round(s.margenPct)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
