import { useState } from "react";
import { Chips, EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import {
  Badge,
  Boton,
  Cargando,
  Confirmar,
  ErrorMsg,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Encargo, EstadoEncargo } from "../../types";
import { FormEncargo } from "./FormEncargo";

/**
 * Encargos: lo que alguien pidió y no había.
 *
 * Es la pantalla más barata del rubro y la que más venta recupera. Hoy, cuando
 * una farmacia no tiene algo, la respuesta es "no tengo" y el cliente cruza la
 * calle. Anotarlo convierte eso en "te lo consigo para el jueves" — y de paso
 * le dice al dueño qué comprar, que es la otra mitad del valor.
 *
 * El flujo es lineal y de un paso por vez: anotado → pedido → llegó →
 * entregado. Por eso el botón principal de cada tarjeta dice lo que sigue ("Ya
 * lo pedí", "Llegó", "Se lo entregué") en vez de abrir un selector de estados:
 * en el mostrador no se elige un estado, se cuenta lo que acaba de pasar.
 */

const ESTADOS: Record<
  EstadoEncargo,
  { label: string; tono: "gris" | "azul" | "verde" | "amarillo"; siguiente?: EstadoEncargo; accion?: string }
> = {
  ANOTADO: { label: "Anotado", tono: "gris", siguiente: "PEDIDO", accion: "Ya lo pedí" },
  PEDIDO: { label: "Pedido", tono: "azul", siguiente: "LLEGO", accion: "Llegó" },
  LLEGO: { label: "Llegó", tono: "amarillo", siguiente: "ENTREGADO", accion: "Se lo entregué" },
  ENTREGADO: { label: "Entregado", tono: "verde" },
  CANCELADO: { label: "Cancelado", tono: "gris" },
};

type Filtro = "abiertos" | EstadoEncargo;

const OPCIONES: readonly (readonly [Filtro, string])[] = [
  ["abiertos", "Pendientes"],
  ["ANOTADO", "Anotados"],
  ["PEDIDO", "Pedidos"],
  ["LLEGO", "Llegaron"],
  ["ENTREGADO", "Entregados"],
] as const;

export default function Encargos() {
  const [filtro, setFiltro] = useState<Filtro>("abiertos");
  const lista = useApi(
    () =>
      api
        .getEncargos(filtro === "abiertos" ? {} : { estado: filtro, incluirCerrados: true })
        // Con qué filtro se pidió: ver `datos`, abajo.
        .then((r) => ({ ...r, filtro })),
    [filtro],
  );
  const [creando, setCreando] = useState(false);
  const [cancelando, setCancelando] = useState<Encargo | null>(null);
  const [moviendo, setMoviendo] = useState<number | null>(null);
  const [error, setError] = useState("");

  // B14: `useApi` conserva lo cargado mientras vuelve a pedir, y eso es lo que
  // se quiere después de mover un encargo: la lista entera se iba a spinner
  // por tocar "Ya lo pedí" y volvía a aparecer. Pero al cambiar el chip lo que
  // hay es de OTRO filtro —"Entregados" mostraba un instante los pendientes
  // con sus botones—, así que sólo cuenta lo que se pidió con el de ahora.
  const datos = lista.datos?.filtro === filtro ? lista.datos : null;

  async function mover(encargo: Encargo, estado: EstadoEncargo) {
    setError("");
    setMoviendo(encargo.id);
    try {
      await api.cambiarEstadoEncargo(encargo.id, estado);
      lista.recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setMoviendo(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Encargos"
        subtitulo={
          datos ? `${datos.abiertos} esperando` : "Lo que pidieron y no había"
        }
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nuevo
          </Boton>
        }
      />

      <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
        Cuando alguien pregunta por algo que no hay, anotalo acá con su teléfono.
        Al llegar la mercadería tenés a quién avisarle — y el dueño ve qué le
        están pidiendo.
      </p>

      {datos && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Contador n={datos.anotados} titulo="Anotados" ayuda="Falta pedirlos" />
          <Contador n={datos.pedidos} titulo="Pedidos" ayuda="En camino" />
          <Contador
            n={datos.llegaron}
            titulo="Llegaron"
            ayuda="Avisar al cliente"
            destacado={datos.llegaron > 0}
          />
          <Contador n={datos.entregados} titulo="Entregados" ayuda="Listos" />
        </div>
      )}

      <Chips valor={filtro} opciones={OPCIONES} onChange={(v) => setFiltro(v as Filtro)} />

      <ErrorMsg>{error}</ErrorMsg>

      {lista.cargando && !datos ? (
        <Cargando />
      ) : lista.error ? (
        // Falló la carga: el error con su salida, y nada más. Antes, debajo del
        // cartel rojo seguía "No hay nada pendiente", y las dos cosas juntas se
        // leían como que no había encargos cuando en verdad no se sabía.
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : !datos || datos.items.length === 0 ? (
        <div className="card">
          <Vacio
            icono="bell"
            titulo={filtro === "abiertos" ? "No hay nada pendiente" : "Sin encargos acá"}
            texto="Anotá lo que te pidan y no tengas: es la venta que hoy se va a la farmacia de enfrente."
            accion={
              <Boton icono="plus" onClick={() => setCreando(true)}>
                Nuevo encargo
              </Boton>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {datos.items.map((e) => (
            <Tarjeta
              key={e.id}
              encargo={e}
              procesando={moviendo === e.id}
              onAvanzar={() => {
                const sig = ESTADOS[e.estado].siguiente;
                if (sig) void mover(e, sig);
              }}
              onCancelar={() => setCancelando(e)}
            />
          ))}
        </ul>
      )}

      {creando && (
        <FormEncargo
          onClose={() => setCreando(false)}
          onGuardado={() => {
            setCreando(false);
            lista.recargar();
          }}
        />
      )}

      <Confirmar
        abierto={!!cancelando}
        titulo="Cancelar el encargo"
        texto={
          cancelando
            ? `"${cancelando.descripcion}" queda cerrado sin entregar. Se usa cuando el cliente no volvió o el proveedor no lo consiguió.`
            : ""
        }
        etiquetaOk="Cancelar el encargo"
        peligroso
        onCancel={() => setCancelando(null)}
        onOk={() => {
          if (cancelando) void mover(cancelando, "CANCELADO");
          setCancelando(null);
        }}
      />
    </div>
  );
}

function Contador({
  n,
  titulo,
  ayuda,
  destacado,
}: {
  n: number;
  titulo: string;
  ayuda: string;
  /** "Llegaron" es el único que pide acción hoy: alguien está esperando. */
  destacado?: boolean;
}) {
  return (
    <div className={`card p-4 ${destacado ? "ring-2 ring-warning" : ""}`}>
      <p
        className={`text-3xl font-extrabold ${
          n === 0 ? "text-texto-4" : destacado ? "text-warning-text" : "text-texto"
        }`}
      >
        {n}
      </p>
      <p className="text-[13px] font-bold text-texto">{titulo}</p>
      <p className="text-xs text-texto-3">{ayuda}</p>
    </div>
  );
}

function Tarjeta({
  encargo: e,
  procesando,
  onAvanzar,
  onCancelar,
}: {
  encargo: Encargo;
  procesando: boolean;
  onAvanzar: () => void;
  onCancelar: () => void;
}) {
  const estado = ESTADOS[e.estado];
  const abierto = e.estado !== "ENTREGADO" && e.estado !== "CANCELADO";

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold text-texto">{e.descripcion}</h3>
            <Badge tono={estado.tono}>{estado.label}</Badge>
            {e.muyPedido && <Badge tono="rojo">Muy pedido</Badge>}
          </div>
          {e.producto && (
            <p className="mt-0.5 text-[13px] text-texto-3">
              {e.producto.nombre}
              {e.producto.laboratorio && ` · ${e.producto.laboratorio}`}
              {e.cantidad > 1 && ` · ${fmtNum(e.cantidad)} u.`}
            </p>
          )}
        </div>

        {abierto && (
          <div className="flex shrink-0 items-center gap-2">
            {estado.accion && (
              <Boton icono="check" onClick={onAvanzar} disabled={procesando}>
                {procesando ? "…" : estado.accion}
              </Boton>
            )}
            <button
              onClick={onCancelar}
              aria-label="Cancelar el encargo"
              className="rounded-lg p-2 text-texto-3 hover:bg-danger-bg hover:text-danger-text"
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        )}
      </div>

      {/* Ya hay stock de lo que encargó: se le puede avisar aunque el encargo
          figure todavía como pedido al proveedor. Pasa seguido — la mercadería
          entra por una compra normal y nadie relaciona una cosa con la otra. */}
      {e.hayStock && abierto && e.estado !== "LLEGO" && (
        <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-[13px] text-warning-text">
          Ya hay stock de esto en el inventario: podés avisarle.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-texto-3">
        {e.clienteNombre && (
          <span className="flex items-center gap-1.5 font-semibold text-texto-2">
            <Icon name="user" size={15} />
            {e.clienteNombre}
          </span>
        )}
        {e.clienteTelefono && (
          <a
            href={`tel:${e.clienteTelefono}`}
            className="flex items-center gap-1.5 text-primary-700 hover:underline"
          >
            <Icon name="phone" size={15} />
            {e.clienteTelefono}
          </a>
        )}
        <span className="flex items-center gap-1.5">
          <Icon name="clock" size={15} />
          {e.diasEsperando === 0
            ? "Hoy"
            : e.diasEsperando === 1
              ? "Hace 1 día"
              : `Hace ${e.diasEsperando} días`}
          <span className="text-texto-4">({fmtFecha(e.creadoEn)})</span>
        </span>
        {e.pedidoPor > 1 && <span>{e.pedidoPor} personas lo están esperando</span>}
      </div>

      {e.nota && <p className="mt-2 text-[13px] italic text-texto-3">{e.nota}</p>}
    </li>
  );
}
