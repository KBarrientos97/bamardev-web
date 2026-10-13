import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Boton, Campo, Cargando, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { ApiError } from "../../lib/api";
import {
  apiAgenda,
  clienteDelConflicto,
  huecosDelConflicto,
  mensajeDe,
  mensajeSinEspacio,
} from "../../lib/agenda/apiAgenda";
import { useSpa } from "../../lib/agenda/spa";
import { aMinutos, duracionTexto, fechaNegocio, horaNegocio, sumarDias } from "../../lib/agenda/horaAgenda";
import { lineasDePropuesta, lineasManuales } from "../../lib/agenda/lineasCita";
import { modoDe } from "../../lib/agenda/modoAgenda";
import type {
  Cita,
  ClienteFicha,
  CrearCitaInput,
  ModoAgenda,
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

/**
 * ¿Lo tecleado en "Nombre o teléfono" es un teléfono? Con una sola letra ya
 * es un nombre ("Ana 2" no es un número): el mismo criterio que la búsqueda
 * de clientes del backend.
 */
function pareceTelefono(t: string): boolean {
  return /\d/.test(t) && !/[a-zñáéíóúü]/i.test(t);
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
 * En modo simple (IDEAS/7-AGENDA-SIMPLE, propuesta A) es la hoja corta: un
 * solo campo "Nombre o teléfono", servicios y horas en chips (la primera hora
 * libre ya marcada) y Guardar. La cita nace confirmada; sobre-turno y nota
 * quedan en "Más opciones". El teléfono es opcional en los dos modos
 * (decisión del 12-oct): sin él no hay recordatorio, pero no frena la cita.
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
  modo: modoDado,
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
  /** El modo de la agenda. Si no viene, sale de las mismas reglas. */
  modo?: ModoAgenda;
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
  const faltaRegla = !granularidadDada || !modoDado;
  const reglas = useApi(
    () =>
      !faltaRegla
        ? Promise.resolve(null)
        : Promise.resolve()
            .then(() => apiAgenda.reglas(sucursalId))
            .catch(() => null),
    [sucursalId, faltaRegla],
  );
  const granularidad = granularidadDada ?? reglas.datos?.granularidadMin ?? null;
  const simple = (modoDado ?? modoDe(reglas.datos)) === "SIMPLE";
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
  // Con una sola persona no hay nada que elegir: ni "Con" ni "Cualquiera"
  // (IDEAS/7 §3, en los dos modos).
  const unico = recursosSucursal.length === 1 ? recursosSucursal[0] : null;

  // ── Cliente ──
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  // Modo simple: un solo campo. Si es un número es el teléfono y se pide el
  // nombre al lado; si es un nombre, el teléfono queda opcional al lado.
  const [busqueda, setBusqueda] = useState("");
  const [complemento, setComplemento] = useState("");
  const q = busqueda.trim();
  const qEsTelefono = pareceTelefono(q);
  const nombreDado = simple ? (qEsTelefono ? complemento : busqueda) : nombre;
  const telefonoDado = simple ? (qEsTelefono ? busqueda : complemento) : telefono;
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
  const [masOpciones, setMasOpciones] = useState(false);
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

  // Buscar al cliente mientras se teclea: por teléfono (el número exacto lo
  // elige solo) y, en el modo simple, también por nombre (ahí sólo sugiere:
  // dos "Juan" no se eligen solos). Si el negocio no tiene la ficha de
  // clientes (403), la búsqueda calla y se sigue con el nombre.
  const digitos = telefonoDado.replace(/\D/g, "");
  const consulta = simple && !qEsTelefono ? (q.length >= 2 ? q : "") : digitos.length >= 4 ? digitos : "";
  const porTelefono = consulta !== "" && consulta === digitos;
  useEffect(() => {
    if (cliente || !consulta) {
      setSugerencias([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      apiAgenda
        .buscarClientes(consulta)
        .then((lista) => {
          if (!vivo) return;
          const exacto = porTelefono ? lista.find((c) => telNormal(c.telefono) === telNormal(consulta)) : undefined;
          if (exacto) elegirCliente(exacto);
          else setSugerencias(lista.slice(0, 5));
        })
        .catch(() => vivo && setSugerencias([]));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [consulta, porTelefono, cliente]);

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

  /** Modo simple: tocar un servicio lo suma a la cita (en ese orden); tocarlo otra vez lo saca. */
  function alternarServicio(id: number) {
    setLineas((ls) => {
      const elegidas = ls.filter((l) => l.servicioId != null);
      const con = ls[0]?.recursoId ?? null;
      if (elegidas.some((l) => l.servicioId === id)) {
        const quedan = elegidas.filter((l) => l.servicioId !== id);
        return quedan.length ? quedan : [{ clave: claves.current++, servicioId: null, recursoId: con }];
      }
      return [...elegidas, { clave: claves.current++, servicioId: id, recursoId: con }];
    });
  }

  /** El cliente para el POST: el elegido, uno recién creado o, sin ficha, en línea. */
  async function resolverCliente(): Promise<Pick<CrearCitaInput, "clienteId" | "cliente">> {
    if (cliente) return { clienteId: cliente.id };
    // Sin teléfono no hay ficha (el backend la da de alta con teléfono): la
    // cita lleva el nombre y listo.
    if (!digitos) return { cliente: { nombre: nombreDado.trim() } };
    const datos = { nombre: nombreDado.trim(), telefono: digitos };
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
    if (!cliente && nombreDado.trim().length < 2) return setError("Poné el nombre del cliente.");
    // El teléfono es opcional, pero si se escribe tiene que ser uno (si igual
    // no lo es, el backend responde TELEFONO_INVALIDO con su mensaje).
    if (!cliente && digitos.length > 0 && digitos.length < 7)
      return setError("Ese teléfono está incompleto: escribí los 7 u 8 dígitos o dejalo vacío.");
    if (!lineas.every((l) => l.servicioId))
      return setError(simple ? "Elegí el servicio." : "Elegí el servicio de cada línea.");

    let lineasCita;
    if (sobreTurno) {
      // Con una sola persona, el sobre-turno es con ella: no hay "Con" que elegir.
      const conQuien = lineas.map((l) => l.recursoId ?? unico?.id ?? null);
      if (!conQuien.every((r) => r != null))
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
        lineas.map((l, i) => ({ servicioId: l.servicioId!, recursoId: conQuien[i]! })),
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
        // Modo simple: nace confirmada (no hay un paso "Confirmar" después).
        confirmada: simple || confirmada,
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

  // Sin el modo dado, se espera a saberlo: armar un formulario y cambiarlo por
  // el otro en medio de la carga confunde.
  const esperandoModo = !modoDado && reglas.cargando;
  const cargandoDatos = servicios.cargando || recursos.cargando || esperandoModo;

  // ── Piezas que comparten los dos modos ──

  const listaSugerencias = sugerencias.length > 0 && (
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
  );

  const bloqueHorario = sobreTurno ? (
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
  );

  const avisoConflicto = conflicto && (
    <p role="alert" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm font-semibold text-warning-text">
      {conflicto}
    </p>
  );

  const casillaSobreTurno = !esProfesional && (
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
  );

  const campoNota = (
    <Campo label="Nota (opcional)">
      <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. fórmula del tinte, pidió no cortar las puntas" />
    </Campo>
  );

  /** "Con" de toda la cita en el modo simple; sólo si hay más de una persona. */
  const selectorConSimple = !unico && recursosSucursal.length > 0 && (
    <Campo label="Con">
      <Select
        value={lineas[0]?.recursoId ?? ""}
        onChange={(e) => {
          const recursoId = e.target.value ? Number(e.target.value) : null;
          setLineas((ls) => ls.map((l) => ({ ...l, recursoId })));
        }}
      >
        {!soloRecursoIds && <option value="">Cualquiera</option>}
        {opcionesRecurso(lineas[0]?.servicioId ?? null).map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
          </option>
        ))}
      </Select>
    </Campo>
  );

  const hoy = fechaNegocio();
  const manana = sumarDias(hoy, 1);

  let cuerpo: ReactNode;
  if (esperandoModo) {
    cuerpo = <Cargando />;
  } else if (simple) {
    cuerpo = (
      <div className="space-y-5">
        <ErrorMsg onReintentar={servicios.error ? servicios.recargar : undefined}>
          {servicios.error || recursos.error}
        </ErrorMsg>

        <section className="space-y-3">
          {cliente ? (
            <FichaElegida
              cliente={cliente}
              onCambiar={() => {
                // Se limpia lo escrito: con el mismo número la búsqueda
                // volvería a elegir al mismo cliente.
                setCliente(null);
                setBusqueda("");
                setComplemento("");
                setTelefono("");
                setNombre("");
              }}
            />
          ) : (
            <>
              <Campo label="Cliente">
                <Input
                  autoComplete="off"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Nombre o teléfono"
                  autoFocus
                />
              </Campo>
              {listaSugerencias}
              {q !== "" &&
                (qEsTelefono ? (
                  <Campo label="Nombre" hint="Si es la primera vez, queda guardado como cliente nuevo.">
                    <Input value={complemento} onChange={(e) => setComplemento(e.target.value)} />
                  </Campo>
                ) : (
                  <Campo label="Teléfono (opcional, para recordarle)">
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      value={complemento}
                      onChange={(e) => setComplemento(e.target.value)}
                      placeholder="70012345"
                    />
                  </Campo>
                ))}
            </>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <p id="servicios-simple" className="mb-1.5 text-[13px] font-semibold text-texto-2">
              Servicio
            </p>
            <div role="group" aria-labelledby="servicios-simple" className="flex flex-wrap gap-2">
              {listaServicios.map((s) => {
                const marcado = lineas.some((l) => l.servicioId === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() => alternarServicio(s.id)}
                    className={`rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      marcado
                        ? "bg-primary-boton text-white"
                        : "border border-borde bg-white text-texto-2 hover:bg-muted"
                    }`}
                  >
                    <span className="block font-semibold">{s.nombre}</span>
                    <span className={`block text-[12px] ${marcado ? "text-white/85" : "text-texto-3"}`}>
                      {detalleServicio(s, esProfesional)}
                    </span>
                  </button>
                );
              })}
              {!servicios.cargando && listaServicios.length === 0 && (
                <p className="text-[13px] text-texto-3">No hay servicios cargados: se agregan en Configuración de la agenda.</p>
              )}
            </div>
          </div>
          {selectorConSimple}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                [hoy, "Hoy"],
                [manana, "Mañana"],
              ] as const
            ).map(([f, texto]) => (
              <button
                key={f}
                type="button"
                aria-pressed={fecha === f}
                onClick={() => setFecha(f)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                  fecha === f ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {texto}
              </button>
            ))}
            <div className="w-40">
              <Input
                type="date"
                aria-label="Otro día"
                value={fecha}
                onChange={(e) => e.target.value && setFecha(e.target.value)}
                className="py-1.5"
              />
            </div>
          </div>
          {bloqueHorario}
          {avisoConflicto}
        </section>

        <div className="rounded-xl border border-borde-soft">
          <button
            type="button"
            aria-expanded={masOpciones}
            onClick={() => setMasOpciones((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2"
          >
            Más opciones
            <span aria-hidden="true" className={`transition-transform ${masOpciones ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {masOpciones && (
            <div className="space-y-3 border-t border-borde-soft px-3.5 py-3">
              {casillaSobreTurno}
              {campoNota}
            </div>
          )}
        </div>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    );
  } else {
    cuerpo = (
      <div className="space-y-5">
        <ErrorMsg onReintentar={servicios.error ? servicios.recargar : undefined}>
          {servicios.error || recursos.error}
        </ErrorMsg>

        <section className="space-y-3">
          <Campo label="Teléfono (opcional, para recordarle)">
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
          {listaSugerencias}
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
            <Campo label="Nombre" hint="Si es la primera vez y deja su teléfono, queda guardado como cliente nuevo.">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Campo>
          )}
        </section>

        <section className="space-y-3">
          <p className="text-[13px] font-semibold text-texto-2">Servicios, en orden</p>
          {lineas.map((l, i) => (
            <div
              key={l.clave}
              className={`grid grid-cols-1 gap-2 rounded-xl border border-borde-soft p-3 ${unico ? "" : "sm:grid-cols-2"}`}
            >
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
              {!unico && (
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
              )}
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
          {bloqueHorario}
          {avisoConflicto}
          {casillaSobreTurno}
        </section>

        <section className="space-y-3">
          {campoNota}
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
    );
  }

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
            {simple ? (enviando ? "Guardando…" : "Guardar") : enviando ? "Agendando…" : "Confirmar cita"}
          </Boton>
        </>
      }
    >
      {cuerpo}

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

/** "45 min · Bs 80,00": lo que va debajo del nombre en el chip del modo simple. */
function detalleServicio(s: Servicio, esProfesional: boolean): string {
  const partes: string[] = [];
  if (s.duracionMin) partes.push(duracionTexto(s.duracionMin));
  // El profesional no ve precios acá (ver `etiquetaServicio`).
  if (!esProfesional) partes.push(fmtMoney(s.precio));
  return partes.join(" · ");
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
            <span className="rounded-lg bg-primary-100 px-2 py-0.5 font-semibold text-primary-700">Cliente nuevo</span>
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
