import { useState } from "react";
import { Icon } from "../../../components/Icon";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Modal,
  Select,
  useAviso,
  Vacio,
} from "../../../components/ui";
import { apiSpa } from "../../../lib/agenda/apiSpa";
import type { Servicio } from "../../../lib/agenda/tiposConfigAgenda";
import type { Paquete } from "../../../lib/agenda/tiposSpa";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { Casilla } from "./comun";
import { mensajeDe } from "./utilConfig";

/**
 * Paquetes de sesiones (feature `paquetes`, agenda fase 3): "5 masajes",
 * "4 limpiezas + 1 facial". Se venden en el POS como cualquier artículo, a un
 * cliente con ficha, y le quedan como saldo con vencimiento; al cobrar una
 * cita de ese servicio se usa una sesión en vez de cobrarla.
 */
export default function TabPaquetes({ servicios }: { servicios: Servicio[] }) {
  const paquetes = useApi(() => apiSpa.paquetes(), []);
  const [editando, setEditando] = useState<Paquete | "nuevo" | null>(null);
  const [aviso, setAviso] = useAviso();

  if (paquetes.cargando && !paquetes.datos) return <Cargando />;
  const lista = paquetes.datos ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-texto-3">
          Se venden en el punto de venta; cambiar uno sólo afecta lo que se venda desde ahora.
        </p>
        <Boton icono="plus" onClick={() => setEditando("nuevo")}>
          Nuevo paquete
        </Boton>
      </div>
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg onReintentar={paquetes.recargar}>{paquetes.error}</ErrorMsg>

      {lista.length === 0 ? (
        <div className="card">
          <Vacio
            icono="package"
            titulo="Todavía no hay paquetes"
            texto="Armá bonos de varias sesiones prepagas: 5 masajes, 10 depilaciones…"
            accion={
              <Boton icono="plus" onClick={() => setEditando("nuevo")}>
                Nuevo paquete
              </Boton>
            }
          />
        </div>
      ) : (
        <ul className="card divide-y divide-borde-soft">
          {lista.map((p) => (
            <li key={p.productoId} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-texto">{p.nombre}</span>
                  {!p.activo && <Badge>No se vende</Badge>}
                </div>
                <p className="mt-0.5 text-[13px] text-texto-3">
                  {fmtMoney(p.precio)} · vale {p.vigenciaDias} días
                </p>
                <p className="mt-1 text-[13px] text-texto-2">
                  {p.items.map((i) => `${i.sesiones} × ${i.servicio}`).join(" · ")}
                </p>
              </div>
              <Boton
                variante="ghost"
                icono="edit"
                onClick={() => setEditando(p)}
                aria-label={`Editar ${p.nombre}`}
                className="shrink-0"
              >
                Editar
              </Boton>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <FormPaquete
          paquete={editando === "nuevo" ? null : editando}
          servicios={servicios}
          onClose={() => setEditando(null)}
          onGuardado={(p) => {
            setEditando(null);
            setAviso(`"${p.nombre}" quedó guardado.`);
            paquetes.recargar();
          }}
        />
      )}
    </div>
  );
}

interface FilaItem {
  servicioId: string;
  sesiones: string;
}

function FormPaquete({
  paquete,
  servicios,
  onClose,
  onGuardado,
}: {
  paquete: Paquete | null;
  servicios: Servicio[];
  onClose: () => void;
  onGuardado: (p: Paquete) => void;
}) {
  const [nombre, setNombre] = useState(paquete?.nombre ?? "");
  const [precio, setPrecio] = useState(paquete ? String(paquete.precio) : "");
  const [vigencia, setVigencia] = useState(paquete ? String(paquete.vigenciaDias) : "90");
  const [activo, setActivo] = useState(paquete?.activo ?? true);
  const [items, setItems] = useState<FilaItem[]>(
    paquete?.items.map((i) => ({ servicioId: String(i.servicioId), sesiones: String(i.sesiones) })) ?? [
      { servicioId: "", sesiones: "5" },
    ],
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const opciones = servicios.filter((s) => s.activo);
  const cambiar = (i: number, campo: keyof FilaItem, valor: string) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  const guardar = async () => {
    const p = Number(precio);
    const v = Number(vigencia);
    if (!nombre.trim()) return setError("Poné el nombre del paquete.");
    if (precio.trim() === "" || !Number.isFinite(p) || p < 0) return setError("El precio tiene que ser un número, cero o más.");
    if (!Number.isInteger(v) || v < 1) return setError("La vigencia va en días enteros, uno o más.");
    const elegidos = items.filter((x) => x.servicioId);
    if (!elegidos.length) return setError("Elegí al menos un servicio.");
    const ids = elegidos.map((x) => x.servicioId);
    if (new Set(ids).size !== ids.length) return setError("Un servicio está dos veces: sumá las sesiones en una sola línea.");
    const malas = elegidos.some((x) => !Number.isInteger(Number(x.sesiones)) || Number(x.sesiones) < 1);
    if (malas) return setError("Las sesiones van en números enteros, una o más.");
    const cuerpo = {
      nombre: nombre.trim(),
      precio: p,
      vigenciaDias: v,
      items: elegidos.map((x) => ({ servicioId: Number(x.servicioId), sesiones: Number(x.sesiones) })),
    };
    setGuardando(true);
    setError("");
    try {
      const guardado = paquete
        ? await apiSpa.editarPaquete(paquete.productoId, { ...cuerpo, activo })
        : await apiSpa.crearPaquete(cuerpo);
      onGuardado(guardado);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={paquete ? `Editar ${paquete.nombre}` : "Nuevo paquete"}
      subtitulo="Se vende en el punto de venta como un artículo más."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="5 masajes relajantes" autoFocus />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Precio">
            <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0.00" />
          </Campo>
          <Campo label="Vale (días)" hint="Desde el día de la compra.">
            <Input type="number" inputMode="numeric" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
          </Campo>
        </div>
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-texto-2">Sesiones que trae</p>
          {items.map((x, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  aria-label={`Servicio ${i + 1}`}
                  value={x.servicioId}
                  onChange={(e) => cambiar(i, "servicioId", e.target.value)}
                >
                  <option value="">Elegí un servicio</option>
                  {opciones.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-24">
                <Input
                  aria-label={`Sesiones ${i + 1}`}
                  type="number"
                  inputMode="numeric"
                  value={x.sesiones}
                  onChange={(e) => cambiar(i, "sesiones", e.target.value)}
                />
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  aria-label={`Quitar servicio ${i + 1}`}
                  onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-texto-3 hover:bg-muted"
                >
                  <Icon name="trash" size={17} />
                </button>
              )}
            </div>
          ))}
          <Boton
            variante="soft"
            icono="plus"
            onClick={() => setItems((xs) => [...xs, { servicioId: "", sesiones: "1" }])}
          >
            Otro servicio
          </Boton>
        </div>
        {paquete && (
          <Casilla checked={activo} onChange={setActivo} ayuda="Los ya vendidos siguen valiendo.">
            Se vende
          </Casilla>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
