import { useEffect, useMemo, useRef, useState } from "react";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { ApiError } from "../../lib/api";
import {
  apiAgenda,
  clienteDelConflicto,
  huecosDelConflicto,
  mensajeDe,
  mensajeSinEspacio,
} from "../../lib/agenda/apiAgenda";
import { useSpa } from "../../lib/agenda/spa";
import { aMinutos, duracionTexto, fechaNegocio, horaNegocio } from "../../lib/agenda/horaAgenda";
import { lineasDePropuesta, lineasManuales } from "../../lib/agenda/lineasCita";
import type {
  Cita,
  ClienteFicha,
  CrearCitaInput,
  Propuesta,
  Recurso,
  Servicio,
} from "../../lib/agenda/tiposAgenda";
import { fmtMoney } from "../../lib/format";
import { tienePermiso, veSoloSuAgenda } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { quedoEnDuda } from "../../lib/cupo";
import { useBloqueoCupo } from "../../lib/useBloqueoCupo";
import { useAuth } from "../../store/AuthContext";
import { PedirPinCredito } from "../pos/PantallaCredito";
import { SelectorHuecos } from "./SelectorHuecos";

/** Lo que trae la nueva cita cuando se abre tocando un hueco de la grilla. */
export interface PrecargaCita {
  fecha?: string;
  recursoId?: number | null;
  /** "HH:mm": se prefiere el horario propuesto que empiece a esa hora. */
  hora?: string | null;
}

interface LineaForm {
  clave: number;
  servicioId: number | null;
  /** null = cualquiera. */
  recursoId: number | null;
}

/** Sólo dígitos y sin el 591 de adelante: así se compara un teléfono con otro. */
function telNormal(t: string | null | undefined): string {
  const d = (t ?? "").replace(/\D/g, "");
  return d.startsWith("591") && d.length > 8 ? d.slice(3) : d;
}

/** Lo que queda escrito en el formulario mientras la hoja de compra está arriba. */
const SIN_CUPO_CITAS = "No te queda cupo de citas hoy. Comprá créditos para agendarla: lo cargado sigue acá.";

function nuevoRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A5 · Nueva cita (PLAN-AGENDA-BELLEZA §5.2): teléfono → cliente, servicios en
 * orden con su profesional o "cualquiera", el backend propone el primer hueco
 * y se confirma.
 *
 * La regla que más importa: si otro tomó el horario mientras tanto (409
 * HUECO_OCUPADO), se avisa, se reemplaza la lista por los huecos recalculados
 * que trae el error y **no se borra nada de lo cargado** (§7.2). Recepción no
 * tiene que volver a pedirle el teléfono a nadie.
 */
export default function NuevaCita({
  sucursalId,
  precarga,
  soloRecursoIds,
  granularidad: granularidadDada,
  onClose,
  onCreada,
}: {
  sucursalId: number;
  precarga?: PrecargaCita;
  /** El profesional agenda sólo para sí mismo. */
  soloRecursoIds?: number[];
  /**
   * De a cuántos minutos arrancan las citas (regla del negocio). La agenda ya
   * la tiene; si no viene, se piden las reglas, y si tampoco llegan no se
   * valida acá (el backend responde FUERA_DE_GRILLA con su mensaje).
   */
  granularidad?: number;
  onClose: () => void;
  onCreada: (cita: Cita) => void;
}) {
  const { usuario } = useAuth();
  // Quien ve sólo su agenda agenda sólo para sí (PLAN-ROLES-NEGOCIO).
  const esProfesional = veSoloSuAgenda(usuario);
  // Superponer sin PIN: el permiso `agenda.sobreturno` (a la recepción se le
  // puede prender en su rol).
  const esEncargado = tienePermiso(usuario, "agenda.sobreturno");
  // Plan Emprendedor: el cupo de citas del día (cada una fuera del cupo usa
  // 2 créditos). Sin cupo (Básico, Profesional) no cambia nada.
  const {
    verificar: hayLugarParaCita,
    manejarError: rechazoPorCupo,
    registrar: registrarConsumo,
  } = useBloqueoCupo("CITA");
  // El último intento quedó sin respuesta: pudo haber grabado la cita con el
  // último lugar. El reintento (mismo `clienteRequestId`) no se bloquea acá
  // aunque el contador ya diga lleno: lo decide el servidor (ver `quedoEnDuda`).
  const citaEnDuda = useRef(false);
  const hayLugar = () => citaEnDuda.current || hayLugarParaCita();

  const servicios = useApi(() => apiAgenda.servicios(), []);
  const reglas = useApi(
    () =>
      granularidadDada
        ? Promise.resolve(null)
        : Promise.resolve()
            .then(() => apiAgenda.reglas(sucursalId))
            .catch(() => null),
    [sucursalId, granularidadDada],
  );
  const granularidad = granularidadDada ?? reglas.datos?.granularidadMin ?? null;
  const recursos = useApi(() => apiAgenda.recursos(), []);

  const listaServicios = useMemo(
    () => (servicios.datos ?? []).filter((s) => s.activo !== false),
    [servicios.datos],
  );
  // Con la feature `espacios`, la cabina la asigna el backend: no va en "Con"
  // entre las personas (QA S2-15). Sin la feature, un spa que agenda por
  // cabina (§7.6) sí la elige ahí.
  const { espacios: conEspacios } = useSpa();
  const recursosSucursal = useMemo(
    () =>
      (recursos.datos ?? []).filter(
        (r) =>
          r.activo !== false &&
          !(conEspacios && r.tipo === "ESPACIO") &&
          (r.sucursalIds.length === 0 || r.sucursalIds.includes(sucursalId)) &&
          (!soloRecursoIds || soloRecursoIds.includes(r.id)),
      ),
    [recursos.datos, sucursalId, soloRecursoIds, conEspacios],
  );

  // ── Cliente ──
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState<ClienteFicha | null>(null);
  const [sugerencias, setSugerencias] = useState<ClienteFicha[]>([]);

  // ── Servicios y horario ──
  const claves = useRef(1);
  const recursoInicial =
    precarga?.recursoId ?? (soloRecursoIds?.length === 1 ? soloRecursoIds[0] : null);
  const [lineas, setLineas] = useState<LineaForm[]>([
    { clave: 0, servicioId: null, recursoId: recursoInicial },
  ]);
  const [fecha, setFecha] = useState(precarga?.fecha ?? fechaNegocio());
  const [huecos, setHuecos] = useState<Propuesta[] | null>(null);
  const [elegida, setElegida] = useState(0);
  const [cargandoHuecos, setCargandoHuecos] = useState(false);
  const [sobreTurno, setSobreTurno] = useState(false);
  const [horaManual, setHoraManual] = useState(precarga?.hora ?? "09:00");

  // ── Cierre ──
  const [nota, setNota] = useState("");
  const [confirmada, setConfirmada] = useState(false);
  const [error, setError] = useState("");
  const [conflicto, setConflicto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const requestId = useRef(nuevoRequestId());

  const nombreServicio = (id: number) => listaServicios.find((s) => s.id === id)?.nombre ?? "Servicio";
  const nombreRecurso = (id: number) =>
    (recursos.datos ?? []).find((r) => r.id === id)?.nombre ?? "Profesional";

  /** Quién puede hacer ese servicio. Si los datos no los vinculan, todos. */
  function opcionesRecurso(servicioId: number | null): Recurso[] {
    if (!servicioId) return recursosSucursal;
    const s = listaServicios.find((x) => x.id === servicioId);
    const hacen = recursosSucursal.filter(
      (r) => r.servicioIds.includes(servicioId) || s?.recursoIds.includes(r.id),
    );
    return hacen.length ? hacen : recursosSucursal;
  }

  // Buscar al cliente por teléfono mientras se teclea. Si el negocio no tiene
  // la ficha de clientes (403), la búsqueda calla y se sigue con el nombre.
  const digitos = telefono.replace(/\D/g, "");
  useEffect(() => {
    if (cliente || digitos.length < 4) {
      setSugerencias([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      apiAgenda
        .buscarClientes(digitos)
        .then((lista) => {
          if (!vivo) return;
          const exacto = lista.find((c) => telNormal(c.telefono) === telNormal(digitos));
          if (exacto) elegirCliente(exacto);
          else setSugerencias(lista.slice(0, 5));
        })
        .catch(() => vivo && setSugerencias([]));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [digitos, cliente]);

  function elegirCliente(c: ClienteFicha) {
    setCliente(c);
    setNombre(c.nombre);
    if (c.telefono) setTelefono(c.telefono);
    setSugerencias([]);
  }

  // Pedir los huecos cada vez que cambia lo que se pide. Es la única fuente:
  // la pantalla no calcula disponibilidad.
  const pedido =
    !sobreTurno && lineas.length > 0 && lineas.every((l) => l.servicioId)
      ? JSON.stringify({
          fecha,
          sucursalId,
          lineas: lineas.map((l) => ({ servicioId: l.servicioId, recursoId: l.recursoId })),
        })
      : null;
  const horaPreferida = precarga?.hora && precarga.fecha === fecha ? precarga.hora : null;

  useEffect(() => {
    if (!pedido) {
      setHuecos(null);
      return;
    }
    let vivo = true;
    setCargandoHuecos(true);
    setConflicto("");
    apiAgenda
      .huecos(JSON.parse(pedido))
      .then((r) => {
        if (!vivo) return;
        setHuecos(r.huecos);
        const i = horaPreferida ? r.huecos.findIndex((h) => horaNegocio(h.inicio) === horaPreferida) : -1;
        setElegida(i >= 0 ? i : 0);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setHuecos([]);
        setError(mensajeDe(e, "No se pudieron buscar los horarios"));
      })
      .finally(() => vivo && setCargandoHuecos(false));
    return () => {
      vivo = false;
    };
  }, [pedido, horaPreferida]);

  function cambiarLinea(clave: number, cambio: Partial<LineaForm>) {
    setLineas((ls) =>
      ls.map((l) => {
        if (l.clave !== clave) return l;
        const nueva = { ...l, ...cambio };
        // Cambió el servicio y el profesional elegido no lo hace: a "cualquiera".
        if (cambio.servicioId !== undefined && nueva.recursoId != null) {
          const ok = opcionesRecurso(nueva.servicioId).some((r) => r.id === nueva.recursoId);
          if (!ok) nueva.recursoId = null;
        }
        return nueva;
      }),
    );
  }

  /** El cliente para el POST: el elegido, uno recién creado o, sin ficha, en línea. */
  async function resolverCliente(): Promise<Pick<CrearCitaInput, "clienteId" | "cliente">> {
    if (cliente) return { clienteId: cliente.id };
    const datos = { nombre: nombre.trim(), telefono: digitos };
    try {
      const creado = await apiAgenda.crearCliente(datos);
      setCliente(creado);
      return { clienteId: creado.id };
    } catch (e) {
      const existente = clienteDelConflicto(e);
      if (existente) {
        setCliente(existente);
        return { clienteId: existente.id };
      }
      // Sin la feature de clientes (403) o sin el endpoint todavía: la cita
      // crea al cliente por su cuenta, que el contrato también acepta.
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
        return { cliente: datos };
      }
      throw e;
    }
  }

  async function confirmar(firma?: { usuario: string; pin: string }) {
    setError("");
    if (!cliente && nombre.trim().length < 2) return setError("Poné el nombre del cliente.");
    if (!cliente && digitos.length < 7)
      return setError("Poné el teléfono del cliente: es para avisarle de su cita.");
    if (!lineas.every((l) => l.servicioId)) return setError("Elegí el servicio de cada línea.");

    let lineasCita;
    if (sobreTurno) {
      if (!lineas.every((l) => l.recursoId))
        return setError("En un sobre-turno elegí el profesional de cada servicio.");
      // La hora libre del sobre-turno también cae en la grilla del negocio
      // (QA M-07): una cita a las 12:07 se dibujaba desalineada.
      if (granularidad && aMinutos(horaManual) % granularidad !== 0)
        return setError(
          `Elegí una hora en la grilla de ${granularidad} min (por ejemplo ${horaManual.slice(0, 2)}:00 o ${horaManual.slice(0, 2)}:${String(granularidad).padStart(2, "0")}).`,
        );
      lineasCita = lineasManuales(
        fecha,
        horaManual,
        lineas.map((l) => ({ servicioId: l.servicioId!, recursoId: l.recursoId! })),
        listaServicios,
      );
      // Sin cupo se avisa antes de pedirle la firma a nadie: el encargado
      // firmaría para nada.
      if (!hayLugar()) return setError(SIN_CUPO_CITAS);
      // El cajero necesita la firma de un encargado, como al anular (§4).
      if (!esEncargado && !firma) {
        setPidiendoPin(true);
        return;
      }
    } else {
      const p = huecos?.[elegida];
      if (!p) return setError("Elegí un horario de la lista.");
      lineasCita = lineasDePropuesta(p);
    }

    // Sin lugar en el cupo ni créditos no se manda nada (§5.1): se abre la
    // hoja de compra y el formulario queda como está para confirmar después.
    if (!hayLugar()) return setError(SIN_CUPO_CITAS);
    setEnviando(true);
    try {
      const quien = await resolverCliente();
      const cita = await apiAgenda.crearCita({
        sucursalId,
        ...quien,
        lineas: lineasCita,
        ...(nota.trim() ? { nota: nota.trim() } : {}),
        confirmada,
        ...(sobreTurno
          ? {
              sobreTurno: true,
              ...(firma ? { pin: firma.pin, autorizadorUsername: firma.usuario } : {}),
            }
          : {}),
        clienteRequestId: requestId.current,
      });
      registrarConsumo(cita);
      onCreada(cita);
    } catch (e) {
      citaEnDuda.current = quedoEnDuda(e);
      // Otro equipo agendó la última del día (403 CUPO_AGOTADO): se abre la
      // hoja y no se borra nada. La cita no se creó, así que el mismo
      // `clienteRequestId` sirve para reintentar después de comprar.
      if (rechazoPorCupo(e)) return setError(SIN_CUPO_CITAS);
      const nuevos = huecosDelConflicto(e);
      if (nuevos) {
        // §7.2: otro lo tomó primero. Lista nueva, todo lo demás queda.
        setHuecos(nuevos);
        setElegida(0);
        setConflicto(
          mensajeSinEspacio(e) ??
            (nuevos.length
              ? "Ese horario se acaba de ocupar. Elegí otro de la lista: lo demás quedó como estaba."
              : "Ese horario se acaba de ocupar y no quedan otros ese día. Probá otra fecha."),
        );
        // El intento fallido no creó nada: el próximo es otra petición.
        requestId.current = nuevoRequestId();
      } else {
        setError(mensajeDe(e, "No se pudo crear la cita"));
      }
    } finally {
      setEnviando(false);
    }
  }

  const cargandoDatos = servicios.cargando || recursos.cargando;

  return (
    <Modal
      abierto
      titulo="Nueva cita"
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={() => confirmar()} disabled={enviando || cargandoDatos}>
            {enviando ? "Agendando…" : "Confirmar cita"}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <ErrorMsg onReintentar={servicios.error ? servicios.recargar : undefined}>
          {servicios.error || recursos.error}
        </ErrorMsg>

        <section className="space-y-3">
          <Campo label="Teléfono del cliente">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={telefono}
              onChange={(e) => {
                setTelefono(e.target.value);
                if (cliente) setCliente(null);
              }}
              placeholder="70012345"
              autoFocus
            />
          </Campo>
          {sugerencias.length > 0 && (
            <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
              {sugerencias.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => elegirCliente(c)}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-semibold text-texto">{c.nombre}</span>
                    <span className="text-texto-3">{c.telefono}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cliente ? (
            <FichaElegida
              cliente={cliente}
              onCambiar={() => {
                // Se limpia el teléfono también: con el mismo número la
                // búsqueda volvería a elegir al mismo cliente.
                setCliente(null);
                setTelefono("");
                setNombre("");
              }}
            />
          ) : (
            <Campo label="Nombre" hint="Si es la primera vez, queda guardado como cliente nuevo.">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Campo>
          )}
        </section>

        <section className="space-y-3">
          <p className="text-[13px] font-semibold text-texto-2">Servicios, en orden</p>
          {lineas.map((l, i) => (
            <div key={l.clave} className="grid grid-cols-1 gap-2 rounded-xl border border-borde-soft p-3 sm:grid-cols-2">
              <Campo label={`Servicio ${i + 1}`}>
                <Select
                  value={l.servicioId ?? ""}
                  onChange={(e) =>
                    cambiarLinea(l.clave, { servicioId: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">Elegí…</option>
                  {listaServicios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {etiquetaServicio(s, esProfesional)}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Con">
                <Select
                  value={l.recursoId ?? ""}
                  onChange={(e) =>
                    cambiarLinea(l.clave, { recursoId: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  {!soloRecursoIds && <option value="">Cualquiera</option>}
                  {opcionesRecurso(l.servicioId).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
              {lineas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                  className="justify-self-start text-[13px] font-semibold text-danger-text hover:underline"
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
          <Boton
            variante="soft"
            icono="plus"
            type="button"
            onClick={() =>
              setLineas((ls) => [
                ...ls,
                // El siguiente servicio arranca con el mismo profesional: es lo
                // más común (corte y después lavado con la misma persona).
                { clave: claves.current++, servicioId: null, recursoId: ls[ls.length - 1]?.recursoId ?? null },
              ])
            }
          >
            Agregar servicio
          </Boton>
        </section>

        <section className="space-y-3">
          <Campo label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
          </Campo>

          {sobreTurno ? (
            <Campo label="Hora del sobre-turno" hint="Se superpone a propósito con lo que ya hay.">
              <Input
                type="time"
                value={horaManual}
                step={granularidad ? granularidad * 60 : undefined}
                onChange={(e) => setHoraManual(e.target.value)}
              />
            </Campo>
          ) : (
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Horario</p>
              <SelectorHuecos
                huecos={huecos}
                elegida={elegida}
                onElegir={setElegida}
                cargando={cargandoHuecos}
                nombreServicio={nombreServicio}
                nombreRecurso={nombreRecurso}
              />
            </div>
          )}

          {conflicto && (
            <p role="alert" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm font-semibold text-warning-text">
              {conflicto}
            </p>
          )}

          {!esProfesional && (
            <label className="flex items-start gap-2 text-[13px] text-texto-2">
              <input
                type="checkbox"
                checked={sobreTurno}
                onChange={(e) => setSobreTurno(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-primary-boton)]"
              />
              <span>
                Sobre-turno: superponer a otra cita a propósito
                {!esEncargado && " (pide el PIN de un encargado)"}
              </span>
            </label>
          )}
        </section>

        <section className="space-y-3">
          <Campo label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. fórmula del tinte, pidió no cortar las puntas" />
          </Campo>
          <label className="flex items-start gap-2 text-[13px] text-texto-2">
            <input
              type="checkbox"
              checked={confirmada}
              onChange={(e) => setConfirmada(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-primary-boton)]"
            />
            <span>El cliente ya confirmó (está acá o al teléfono)</span>
          </label>
        </section>

        <ErrorMsg>{error}</ErrorMsg>
      </div>

      {pidiendoPin && (
        <PedirPinCredito
          subtitulo="El sobre-turno superpone esta cita a otra"
          onCancelar={() => setPidiendoPin(false)}
          onFirmar={(u, pin) => {
            setPidiendoPin(false);
            confirmar({ usuario: u, pin });
          }}
        />
      )}
    </Modal>
  );
}

function etiquetaServicio(s: Servicio, esProfesional: boolean): string {
  const partes = [s.nombre];
  if (s.duracionMin) partes.push(duracionTexto(s.duracionMin));
  // El profesional no ve precios acá: elegir el servicio no los necesita, y
  // así no depende de si su rol trae `ventas.ver_precios`.
  if (!esProfesional) partes.push(fmtMoney(s.precio));
  return partes.join(" · ");
}

function FichaElegida({ cliente, onCambiar }: { cliente: ClienteFicha; onCambiar: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-texto">{cliente.nombre}</p>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[12px]">
          {cliente.ultimaVisita ? (
            <span className="rounded-lg bg-primary-50 px-2 py-0.5 font-semibold text-primary-700">Recurrente</span>
          ) : (
            <span className="rounded-lg bg-info-bg px-2 py-0.5 font-semibold text-info-text">Cliente nuevo</span>
          )}
          {cliente.noShows > 0 && (
            <span className="rounded-lg bg-danger-bg px-2 py-0.5 font-semibold text-danger-text">
              {cliente.noShows} {cliente.noShows === 1 ? "inasistencia" : "inasistencias"}
            </span>
          )}
          {cliente.alergias && (
            <span className="rounded-lg bg-danger-bg px-2 py-0.5 font-semibold text-danger-text">
              Alergia: {cliente.alergias}
            </span>
          )}
        </div>
      </div>
      <button type="button" onClick={onCambiar} className="text-[13px] font-semibold text-primary-700 hover:underline">
        Cambiar
      </button>
    </div>
  );
}
