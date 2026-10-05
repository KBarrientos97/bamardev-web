import { useMemo, useRef, useState } from "react";
import { Chips, EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtMoney, fmtNum } from "../../lib/format";
import { contiene } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import type { ProveedorConCompras, ProveedorInput } from "../../types";
import { PERIODOS, rangoDe, type Periodo } from "./periodo";

/**
 * Proveedores: a quién se le compra, y cuánto.
 *
 * La lista va ordenada por lo que se le compró en el período —arriba el que
 * más pesa—, porque es la pregunta que se hace el dueño al negociar un precio
 * o un plazo. Tocar uno abre su ficha: los datos para llamarlo y sus últimos
 * ingresos. Se crean acá o al vuelo desde el ingreso de mercadería.
 */
export default function Proveedores() {
  const [periodo, setPeriodo] = useState<Periodo>("gestion");
  const [q, setQ] = useState("");
  const [conBajas, setConBajas] = useState(false);
  const [abierto, setAbierto] = useState<ProveedorConCompras | "nuevo" | null>(null);
  const { desde, hasta } = rangoDe(periodo);

  const lista = useApi(
    () => api.proveedores({ desde, hasta, inactivos: conBajas }),
    [desde, hasta, conBajas],
  );

  const filtrados = useMemo(() => {
    const texto = q.trim();
    return (lista.datos ?? [])
      .filter((p) => !texto || contiene(p.nombre, texto) || contiene(p.nit, texto))
      .sort((a, b) => b.compras.total - a.compras.total || a.nombre.localeCompare(b.nombre, "es"));
  }, [lista.datos, q]);

  const total = filtrados.reduce((a, p) => a + p.compras.total, 0);
  const ingresos = filtrados.reduce((a, p) => a + p.compras.ingresos, 0);
  const periodoTexto = PERIODOS.find(([k]) => k === periodo)?.[1].toLowerCase();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Proveedores"
        subtitulo="A quién se le compra, y cuánto."
        accion={
          <Boton icono="plus" onClick={() => setAbierto("nuevo")}>
            Nuevo proveedor
          </Boton>
        }
      />

      <div className="space-y-3 rounded-2xl border border-borde bg-white p-4">
        <Chips valor={periodo} opciones={PERIODOS} onChange={setPeriodo} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 basis-60">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-4">
              <Icon name="search" size={17} />
            </span>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o NIT"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-texto-2">
            <input
              type="checkbox"
              checked={conBajas}
              onChange={(e) => setConBajas(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Ver los dados de baja
          </label>
        </div>
      </div>

      {lista.cargando && !lista.datos ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : filtrados.length === 0 ? (
        <Vacio
          icono="truck"
          titulo={q ? "Ningún proveedor coincide" : "Todavía no hay proveedores"}
          texto={
            q
              ? "Probá con otro nombre o NIT."
              : "Cargalos acá o al recibir mercadería: en el ingreso se eligen o se crean al vuelo."
          }
        />
      ) : (
        <>
          <p className="text-[13px] text-texto-3">
            Comprado {periodoTexto}:{" "}
            <strong className="text-texto">{fmtMoney(total)}</strong> en {fmtNum(ingresos)}{" "}
            {ingresos === 1 ? "ingreso" : "ingresos"}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtrados.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setAbierto(p)}
                  className={`card flex h-full w-full flex-col p-4 text-left transition-shadow hover:shadow-md ${
                    p.activo ? "" : "opacity-60"
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[15px] font-bold text-texto">{p.nombre}</span>
                    {!p.activo && <Badge tono="gris">Dado de baja</Badge>}
                  </span>
                  <span className="mt-0.5 text-xs text-texto-3">
                    {[p.nit && `NIT ${p.nit}`, p.telefono, p.contacto].filter(Boolean).join(" · ") ||
                      "Sin datos de contacto"}
                  </span>
                  <span className="mt-auto pt-3 text-lg font-extrabold text-texto">
                    {fmtMoney(p.compras.total)}
                  </span>
                  <span className="text-xs text-texto-3">
                    {p.compras.ingresos > 0
                      ? `${fmtNum(p.compras.ingresos)} ${p.compras.ingresos === 1 ? "ingreso" : "ingresos"} ${periodoTexto}`
                      : `Sin compras ${periodoTexto}`}
                    {" · "}
                    {p.ultimaCompra ? `última ${fmtFecha(p.ultimaCompra)}` : "nunca se le compró"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {abierto && (
        <FichaProveedor
          proveedor={abierto === "nuevo" ? null : abierto}
          desde={desde}
          hasta={hasta}
          onClose={() => setAbierto(null)}
          onCambio={() => {
            lista.recargar();
          }}
        />
      )}
    </div>
  );
}

/**
 * La ficha: los datos (editables) y sus últimos ingresos. Para uno nuevo, sólo
 * los datos. Dar de baja no borra: deja de ofrecerse en el ingreso, y sus
 * compras viejas siguen diciendo a quién se le compró.
 */
function FichaProveedor({
  proveedor: p,
  desde,
  hasta,
  onClose,
  onCambio,
}: {
  proveedor: ProveedorConCompras | null;
  desde: string;
  hasta: string;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [datos, setDatos] = useState<Required<ProveedorInput>>({
    nombre: p?.nombre ?? "",
    nit: p?.nit ?? "",
    telefono: p?.telefono ?? "",
    contacto: p?.contacto ?? "",
    nota: p?.nota ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  /**
   * El guardado en curso. `disabled={guardando}` no alcanza: el botón se
   * apaga recién en el render siguiente, dos clics en el mismo tick entraban
   * los dos y el servidor acepta el mismo nombre y NIT repetidos.
   */
  const enVuelo = useRef(false);
  const [error, setError] = useState("");
  const [bajando, setBajando] = useState(false);
  const detalle = useApi(
    () => (p ? api.proveedor(p.id, { desde, hasta }) : Promise.resolve(null)),
    [p?.id, desde, hasta],
  );

  const cambiar = (campo: keyof ProveedorInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDatos((d) => ({ ...d, [campo]: e.target.value }));

  async function guardar() {
    if (enVuelo.current) return;
    if (datos.nombre.trim().length < 2) return setError("Escribí el nombre del proveedor");
    enVuelo.current = true;
    setGuardando(true);
    setError("");
    try {
      if (p) await api.actualizarProveedor(p.id, datos);
      else await api.crearProveedor(datos);
      onCambio();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      enVuelo.current = false;
      setGuardando(false);
    }
  }

  async function cambiarAlta(activo: boolean) {
    if (!p) return;
    setError("");
    try {
      if (activo) await api.actualizarProveedor(p.id, { activo: true });
      else await api.darDeBajaProveedor(p.id);
      onCambio();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo");
    }
  }

  return (
    <>
      <Modal
        abierto
        titulo={p ? p.nombre : "Nuevo proveedor"}
        subtitulo={p ? (p.activo ? undefined : "Dado de baja") : "Una droguería, distribuidora o laboratorio"}
        onClose={onClose}
        cerrarAlClicAfuera={false}
        acciones={
          <>
            {p &&
              (p.activo ? (
                <Boton variante="ghost" onClick={() => setBajando(true)} className="mr-auto">
                  Dar de baja
                </Boton>
              ) : (
                <Boton variante="ghost" onClick={() => cambiarAlta(true)} className="mr-auto">
                  Volver a dar de alta
                </Boton>
              ))}
            <Boton variante="ghost" onClick={onClose}>
              Cancelar
            </Boton>
            <Boton onClick={guardar} disabled={guardando} icono="check">
              {p ? "Guardar" : "Crear proveedor"}
            </Boton>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
          className="space-y-3"
        >
          <ErrorMsg>{error}</ErrorMsg>
          <Campo label="Nombre *">
            <Input value={datos.nombre} onChange={cambiar("nombre")} maxLength={120} autoFocus={!p} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="NIT">
              <Input value={datos.nit} onChange={cambiar("nit")} maxLength={30} />
            </Campo>
            <Campo label="Teléfono">
              <Input value={datos.telefono} onChange={cambiar("telefono")} maxLength={30} />
            </Campo>
          </div>
          <Campo label="Contacto" hint="El vendedor o visitador con el que se habla">
            <Input value={datos.contacto} onChange={cambiar("contacto")} maxLength={120} />
          </Campo>
          <Campo label="Nota">
            <Input
              value={datos.nota}
              onChange={cambiar("nota")}
              maxLength={300}
              placeholder="Ej: entrega martes y jueves, paga a 30 días"
            />
          </Campo>
          <button type="submit" hidden />
        </form>

        {p && (
          <section className="mt-5 border-t border-borde-soft pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[14px] font-bold text-texto">Últimos ingresos</h3>
              {detalle.datos && (
                <span className="text-[13px] text-texto-3">
                  {fmtMoney(detalle.datos.compras.total)} en el período
                </span>
              )}
            </div>
            {detalle.cargando && !detalle.datos ? (
              <Cargando />
            ) : !detalle.datos || detalle.datos.ultimosIngresos.length === 0 ? (
              <p className="mt-2 text-[13px] text-texto-3">
                Todavía no tiene ingresos con este proveedor elegido.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-borde-soft">
                {detalle.datos.ultimosIngresos.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0 text-[13px]">
                      <span className="font-semibold text-texto">
                        {fmtFecha(m.fecha)}
                        {m.comprobante && ` · ${m.comprobante}`}
                      </span>
                      <span className="block text-xs text-texto-4">
                        {m.almacen} · {m.items} {m.items === 1 ? "artículo" : "artículos"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[13px] font-bold text-texto">
                      {fmtMoney(m.monto)}
                      {m.estado === "PENDIENTE" && (
                        <span className="block">
                          <Badge tono="amarillo">Pendiente</Badge>
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </Modal>

      <Confirmar
        abierto={bajando}
        titulo={`¿Dar de baja a ${p?.nombre ?? ""}?`}
        texto="Deja de ofrecerse al cargar un ingreso. Sus compras de antes siguen diciendo a quién se le compró, y se lo puede volver a dar de alta."
        etiquetaOk="Dar de baja"
        peligroso
        onCancel={() => setBajando(false)}
        onOk={() => {
          setBajando(false);
          void cambiarAlta(false);
        }}
      />
    </>
  );
}
