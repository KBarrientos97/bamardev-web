import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { apiAgenda } from "../../lib/agenda/apiAgenda";
import type { ClienteFicha } from "../../lib/agenda/tiposAgenda";
import { fmtMoney } from "../../lib/format";
import NuevoCliente, { SinResultadosCliente } from "../agenda/NuevoCliente";
import type { Descuentos } from "./useDescuentos";

/**
 * Los renglones de descuento bajo el subtotal del carrito, el campo del
 * cupón y, si el negocio tiene fichas, el cliente de la venta (para los
 * cupones "uno por cliente" y para su historial).
 *
 * Sólo se dibuja con `promociones` prendida: el carrito de Omar no cambia.
 */
export default function BloqueDescuentos({
  descuentos,
  conClientes = false,
  puedeCrearClientes = false,
}: {
  descuentos: Descuentos;
  /** El negocio tiene la ficha de clientes (`clientes`). */
  conClientes?: boolean;
  /** Alta rápida si no lo encuentra (QA DIA-09, `cliente.editar`). */
  puedeCrearClientes?: boolean;
}) {
  const d = descuentos;
  const [codigo, setCodigo] = useState("");
  if (!d.activo) return null;
  const c = d.cotizacion;

  return (
    <div className="space-y-1.5" data-testid="bloque-descuentos">
      {c?.aplicadas.map((a) => (
        <div key={a.promocionId} className="flex justify-between text-primary-700">
          <dt className="flex min-w-0 items-center gap-1.5">
            <Icon name="trendingDown" size={14} />
            <span className="truncate">
              {a.nombre}
              {a.codigo && <span className="ml-1 text-xs font-semibold">({a.codigo})</span>}
            </span>
          </dt>
          <dd className="shrink-0 font-semibold">− {fmtMoney(a.monto)}</dd>
        </div>
      ))}
      {c?.descartadas.map((x, i) => (
        <p key={`${x.codigo ?? x.promocionId}-${i}`} className="text-xs text-warning-text">
          {x.codigo ?? x.nombre}: {x.motivo}
        </p>
      ))}
      {d.cargando && <p className="text-xs text-texto-3">Calculando descuentos…</p>}
      {d.error && (
        <p className="flex items-center gap-2 text-xs text-danger-text">
          {d.error}
          <button type="button" onClick={d.recotizar} className="font-semibold underline">
            Reintentar
          </button>
        </p>
      )}

      {d.conCupones && (
        <form
          className="flex gap-1.5 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            d.agregarCupon(codigo);
            setCodigo("");
          }}
        >
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código de cupón"
            aria-label="Código de cupón"
            maxLength={20}
            className="min-w-0 flex-1 rounded-lg border border-borde bg-white px-2.5 py-1.5 text-sm uppercase outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!codigo.trim()}
            className="rounded-lg bg-primary-50 px-3 text-sm font-semibold text-primary-700 disabled:opacity-50"
          >
            Aplicar
          </button>
        </form>
      )}
      {d.cupones.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.cupones.map((cu) => (
            <span
              key={cu}
              className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700"
            >
              {cu}
              <button
                type="button"
                aria-label={`Quitar el cupón ${cu}`}
                onClick={() => d.quitarCupon(cu)}
                className="text-primary-700/70 hover:text-primary-700"
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {conClientes && <ClienteDeLaVenta descuentos={d} puedeCrear={puedeCrearClientes} />}
    </div>
  );
}

/**
 * Buscar al cliente por nombre o teléfono y dejarlo en la venta. Si no está,
 * lo dice y ofrece darlo de alta ahí mismo (QA DIA-09).
 */
function ClienteDeLaVenta({ descuentos, puedeCrear }: { descuentos: Descuentos; puedeCrear: boolean }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<ClienteFicha | null>(null);
  const [opciones, setOpciones] = useState<ClienteFicha[]>([]);
  /** Lo que ya respondió el backend: "Sin resultados" no se dice antes. */
  const [buscado, setBuscado] = useState("");
  const [creando, setCreando] = useState(false);
  const texto = q.trim();

  const elegir = (o: ClienteFicha) => {
    setElegido(o);
    descuentos.setClienteId(o.id);
    setAbierto(false);
    setQ("");
  };

  useEffect(() => {
    if (!abierto || texto.length < 2) {
      setOpciones([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      apiAgenda
        .buscarClientes(texto)
        .then((r) => {
          if (!vivo) return;
          setOpciones(r.slice(0, 6));
          setBuscado(texto);
        })
        .catch(() => vivo && setOpciones([]));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [texto, abierto]);

  // Vaciar la venta (o cobrarla) suelta al cliente.
  useEffect(() => {
    if (descuentos.clienteId == null) setElegido(null);
  }, [descuentos.clienteId]);

  if (elegido && descuentos.clienteId === elegido.id) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5 text-xs">
        <span className="flex items-center gap-1.5 text-texto-2">
          <Icon name="user" size={13} />
          {elegido.nombre}
        </span>
        <button
          type="button"
          onClick={() => descuentos.setClienteId(null)}
          className="font-semibold text-texto-3 hover:text-texto"
        >
          Quitar
        </button>
      </div>
    );
  }
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-texto-3 hover:text-texto"
      >
        <Icon name="user" size={13} />
        Asociar cliente
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nombre o teléfono"
        aria-label="Buscar cliente"
        className="w-full rounded-lg border border-borde bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary"
      />
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => elegir(o)}
          className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-muted"
        >
          {o.nombre}
          {o.telefono && <span className="ml-1 text-xs text-texto-3">{o.telefono}</span>}
        </button>
      ))}
      {opciones.length === 0 && texto.length >= 2 && buscado === texto && (
        <SinResultadosCliente compacto puedeCrear={puedeCrear} onCrear={() => setCreando(true)} />
      )}
      {creando && (
        <NuevoCliente
          textoBuscado={q}
          etiquetaExistente={(nombre) => `Elegir a ${nombre}`}
          onClose={() => setCreando(false)}
          onListo={(c) => {
            setCreando(false);
            elegir(c);
          }}
        />
      )}
    </div>
  );
}
