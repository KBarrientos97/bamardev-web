import type { ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { EXPEDIDOS } from "../../lib/academia/formato";
import {
  edadEn,
  fmtNumero,
  hoyIso,
  imcDeLoEscrito,
  rangoDe,
  tablaQueToca,
  textoAlSalir,
  textoEdadCorporal,
  UNIDAD_TALLA,
  valorDe,
  type CampoNumerico,
} from "../../lib/nutricion/calculo";
import { edadDelControl, type FormControl, type FormFicha } from "../../lib/nutricion/formulario";
import { ATAJOS } from "../../lib/nutricion/respuestas";
import type { Catalogo, MedidaConTabla, Sexo } from "../../lib/nutricion/tipos";
import { Tarjeta } from "../academia/piezas";
import CampoConAtajos from "./CampoConAtajos";
import MedidorImc from "./MedidorImc";
import { TONO } from "../../lib/nutricion/tonos";
import { AreaTexto, BotonesSexo, CampoNumero, CampoTexto, ChipGrado, Rotulo } from "./piezas";
import TablaGrados from "./TablaGrados";

/**
 * Las cuatro etapas de la evaluación (CONTRATO-nutricion-evaluacion-22nov
 * §4.2), en el orden y con los rótulos de la hoja de papel. El estado y el
 * guardado viven en `Evaluacion.tsx`; acá sólo se dibuja y se avisa.
 */

/** Los campos que pueden mostrar un error. */
export type CampoForm =
  | "nombre"
  | "edad"
  | "fechaNacimiento"
  | "tallaCm"
  | "hijos"
  | "pesoKg"
  | "fecha"
  | "cinturaCm"
  | "caderaCm"
  | "pechoCm"
  | "grasaPct"
  | "musculoPct"
  | "edadCorporal"
  | "grasaVisceral";

export interface PropsEtapa {
  ficha: FormFicha;
  control: FormControl;
  catalogo: Catalogo | null;
  cambiarFicha: <K extends keyof FormFicha>(campo: K, valor: FormFicha[K]) => void;
  /**
   * Cambia UNA enfermedad sobre lo último guardado en el estado (no sobre lo
   * de este dibujo): dos toques seguidos no se pisan. `null` = sin preguntar.
   */
  cambiarEnfermedad: (codigo: string, siguiente: (actual: EnfermedadForm | undefined) => EnfermedadForm | null) => void;
  cambiarControl: <K extends keyof FormControl>(campo: K, valor: FormControl[K]) => void;
  elegirGrado: (medida: MedidaConTabla, grado: string | null) => void;
  /** El error de un campo, si ya hay que mostrarlo. */
  error: (campo: CampoForm) => string | null;
  /** Salió del campo: desde ahí se le muestran los errores. */
  tocar: (campo: CampoForm) => void;
  irAFicha: () => void;
  /** «Revisá la talla y el peso: el IMC da 198,4», si ya hay que mostrarlo (no bloquea). */
  avisoImc?: string | null;
}

/** El aviso del IMC imposible, junto al campo: en ámbar, como lo que hay que mirar. */
function AvisoImc({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-start gap-1.5 font-semibold text-warning-text" role="status">
      <Icon name="alert" size={14} className="mt-px shrink-0" />
      {texto}
    </span>
  );
}

const sexoDe = (f: FormFicha): Sexo | null => f.sexo || null;

/** Una enfermedad contestada, como está en los campos. */
type EnfermedadForm = FormFicha["enfermedades"][string];

/**
 * Un campo de número con su rótulo. Al salir, lo escrito se muestra con coma
 * y sin ceros de más («82.40» → «82,4»).
 */
export function Numero({
  id,
  campo,
  label,
  unidad,
  valor,
  onCambiar,
  p,
  extra,
  ayuda,
  disabled,
  onFocus,
  onBlur,
  className,
}: {
  id: string;
  campo: CampoNumerico & CampoForm;
  label: ReactNode;
  unidad?: string;
  valor: string;
  onCambiar: (v: string) => void;
  p: Pick<PropsEtapa, "error" | "tocar">;
  extra?: ReactNode;
  ayuda?: ReactNode;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
}) {
  const error = p.error(campo);
  return (
    <Rotulo htmlFor={id} label={label} extra={extra} error={error} ayuda={ayuda} className={className}>
      <CampoNumero
        id={id}
        value={valor}
        unidad={unidad}
        invalido={!!error}
        disabled={disabled}
        onChange={onCambiar}
        onFocus={onFocus}
        onBlur={() => {
          const t = textoAlSalir(campo, valor);
          if (t !== valor) onCambiar(t);
          p.tocar(campo);
          onBlur?.();
        }}
      />
    </Rotulo>
  );
}

// ── 1 · Ficha ───────────────────────────────────────────────────────────────

export function EtapaFicha(
  p: PropsEtapa & {
    /** El aviso del carnet que ya es de un paciente (o null), a todo lo ancho. */
    avisoCarnet: ReactNode;
    onSalirCarnet: () => void;
    /** Qué campo tiene el foco al abrir: el carnet (lo primero, §4.2) o el nombre. */
    enfocar: "ci" | "nombre" | null;
  },
) {
  const { ficha, control, cambiarFicha, cambiarControl } = p;
  const hoy = hoyIso();
  const edadCalculada = ficha.fechaNacimiento ? edadEn(ficha.fechaNacimiento, hoy) : null;
  const enfermedades = p.catalogo?.enfermedades ?? [];

  // Tocar de nuevo la marcada la desmarca: vuelve a «sin preguntar».
  const responder = (codigo: string, tiene: boolean) =>
    p.cambiarEnfermedad(codigo, (actual) => (actual?.tiene === tiene ? null : { tiene, nota: actual?.nota ?? "" }));

  return (
    <div className="space-y-5">
      <Tarjeta titulo="Datos del paciente">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {/* El carnet va primero (Kevin, 22-nov): con él se sabe enseguida si el paciente ya vino. */}
          <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_92px] gap-2 sm:col-span-1">
            <Rotulo htmlFor="ev-ci" label="Carnet de identidad" extra="opcional">
              {/* El CI es texto: nunca «6.642E+09». */}
              <CampoTexto
                id="ev-ci"
                value={ficha.ci}
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                autoFocus={p.enfocar === "ci"}
                onChange={(e) => cambiarFicha("ci", e.target.value)}
                onBlur={p.onSalirCarnet}
              />
            </Rotulo>
            <Rotulo htmlFor="ev-exp" label="Exp.">
              <select
                id="ev-exp"
                value={ficha.ciExpedido}
                onChange={(e) => cambiarFicha("ciExpedido", e.target.value)}
                className="w-full cursor-pointer rounded-xl border border-borde bg-white px-3 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
              >
                <option value="">—</option>
                {EXPEDIDOS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </Rotulo>
          </div>

          <Rotulo
            htmlFor="ev-nombre"
            className="col-span-2 sm:col-span-1"
            label={
              <>
                Nombre del paciente <span className="text-danger-text">*</span>
              </>
            }
            error={p.error("nombre")}
          >
            <CampoTexto
              id="ev-nombre"
              value={ficha.nombre}
              maxLength={120}
              autoComplete="off"
              autoFocus={p.enfocar === "nombre"}
              invalido={!!p.error("nombre")}
              onChange={(e) => cambiarFicha("nombre", e.target.value)}
              onBlur={() => p.tocar("nombre")}
            />
          </Rotulo>

          {p.avisoCarnet && <div className="col-span-2">{p.avisoCarnet}</div>}

          <div className="col-span-2 sm:col-span-1">
            <span id="ev-sexo" className="mb-1.5 block text-[13px] font-semibold text-texto-2">
              Sexo
            </span>
            <BotonesSexo valor={ficha.sexo} onElegir={(s) => cambiarFicha("sexo", s)} />
          </div>

          {/* Rótulo, campo y ayuda en tres filas compartidas: cuando «opcional» baja a
              otro renglón (tablet y celular) los dos campos siguen a la misma altura. */}
          <div className="col-span-2 grid grid-cols-2 gap-x-4 sm:col-span-1">
            <Numero
              id="ev-edad"
              className="row-span-3 grid grid-rows-subgrid"
              campo="edad"
              label="Edad (años)"
              valor={edadCalculada != null ? String(edadCalculada) : ficha.edad}
              disabled={!!ficha.fechaNacimiento && edadCalculada != null}
              ayuda={ficha.fechaNacimiento && edadCalculada != null ? "Sale de la fecha de nacimiento" : undefined}
              onCambiar={(v) => cambiarFicha("edad", v)}
              p={p}
            />
            <Rotulo
              htmlFor="ev-nacimiento"
              label="Fecha de nacimiento"
              extra="opcional"
              error={p.error("fechaNacimiento")}
              className="row-span-3 grid grid-rows-subgrid"
            >
              <CampoTexto
                id="ev-nacimiento"
                type="date"
                value={ficha.fechaNacimiento}
                min="1900-01-01"
                max={hoy}
                invalido={!!p.error("fechaNacimiento")}
                onChange={(e) => cambiarFicha("fechaNacimiento", e.target.value)}
                onBlur={() => p.tocar("fechaNacimiento")}
              />
            </Rotulo>
          </div>

          <Numero
            id="ev-talla"
            campo="tallaCm"
            label="Talla"
            unidad={UNIDAD_TALLA}
            valor={ficha.tallaCm}
            onCambiar={(v) => cambiarFicha("tallaCm", v)}
            ayuda={p.avisoImc ? <AvisoImc texto={p.avisoImc} /> : undefined}
            p={p}
          />
          <Numero id="ev-peso" campo="pesoKg" label="Peso" unidad="kg" valor={control.pesoKg} onCambiar={(v) => cambiarControl("pesoKg", v)} p={p} />

          <Numero id="ev-hijos" campo="hijos" label="Hijos" valor={ficha.hijos} onCambiar={(v) => cambiarFicha("hijos", v)} p={p} />
          <Rotulo htmlFor="ev-telefono" label="Número de teléfono">
            <CampoTexto
              id="ev-telefono"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={30}
              value={ficha.telefono}
              onChange={(e) => cambiarFicha("telefono", e.target.value)}
            />
          </Rotulo>

          <Rotulo htmlFor="ev-observaciones" label="Observaciones" className="col-span-2">
            <AreaTexto
              id="ev-observaciones"
              rows={2}
              maxLength={2000}
              value={ficha.observaciones}
              onChange={(e) => cambiarFicha("observaciones", e.target.value)}
            />
          </Rotulo>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Enfermedades de base" bajada="Tocá «Sí» o «No»; tocá otra vez para dejarla sin preguntar.">
        <div className="space-y-4">
          <CampoConAtajos
            id="ev-analisis"
            label="Últimos análisis clínicos"
            opciones={ATAJOS.ultimosAnalisis}
            multilinea
            placeholder="Fecha, laboratorio y valores que llamen la atención"
            valor={ficha.ultimosAnalisis}
            onCambiar={(v) => cambiarFicha("ultimosAnalisis", v)}
          />

          <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
            {enfermedades.map((e) => {
              const r = ficha.enfermedades[e.codigo];
              return (
                <li
                  key={e.codigo}
                  // Con «Sí», el renglón entero se tiñe: se ve la lista y se sabe qué tiene.
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)] ${
                    r?.tiene ? "bg-warning-suave" : ""
                  }`}
                >
                  <span id={`ev-enf-${e.codigo}`} className={`text-sm text-texto ${r?.tiene ? "font-semibold" : "font-medium"}`}>
                    {e.nombre}
                  </span>
                  <div role="group" aria-labelledby={`ev-enf-${e.codigo}`} className="flex gap-1.5">
                    <BotonSiNo marcado={r?.tiene === true} tono="si" onClick={() => responder(e.codigo, true)}>
                      Sí
                    </BotonSiNo>
                    <BotonSiNo marcado={r?.tiene === false} tono="no" onClick={() => responder(e.codigo, false)}>
                      No
                    </BotonSiNo>
                  </div>
                  <input
                    aria-label={`Nota de ${e.nombre}`}
                    value={r?.nota ?? ""}
                    disabled={!r}
                    maxLength={200}
                    placeholder={r ? "Nota (opcional)" : "Marcá Sí o No para anotar"}
                    onChange={(ev) => {
                      const nota = ev.target.value;
                      // Sin contestar no hay dónde guardar la nota (el campo está apagado).
                      p.cambiarEnfermedad(e.codigo, (actual) => (actual ? { ...actual, nota } : null));
                    }}
                    className="col-span-2 w-full rounded-lg border border-borde bg-white px-3 py-2 text-[13px] text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:bg-muted md:col-span-1"
                  />
                </li>
              );
            })}
          </ul>

          <Rotulo htmlFor="ev-otras" label="Otras">
            <CampoTexto
              id="ev-otras"
              maxLength={2000}
              value={ficha.otrasEnfermedades}
              onChange={(e) => cambiarFicha("otrasEnfermedades", e.target.value)}
            />
          </Rotulo>
        </div>
      </Tarjeta>

      {/* En el orden de la hoja de papel de la doctora. Los tres hábitos van en tres
          columnas sólo si la TARJETA es ancha (no la ventana: el menú lateral cambia
          el ancho útil); ahí cada fila de atajos entra en un renglón y las tres
          notas quedan a la misma altura. */}
      <Tarjeta titulo="Cirugías y hábitos">
        <div className="@container space-y-4">
          <CampoConAtajos
            id="ev-cirugias"
            label="Cirugías"
            opciones={ATAJOS.cirugias}
            multilinea
            placeholder="¿Cuál y cuándo?"
            valor={ficha.cirugias}
            onCambiar={(v) => cambiarFicha("cirugias", v)}
          />
          <Rotulo htmlFor="ev-alimentaria" label="Conducta alimentaria">
            <AreaTexto
              id="ev-alimentaria"
              rows={3}
              maxLength={2000}
              value={ficha.conductaAlimentaria}
              onChange={(e) => cambiarFicha("conductaAlimentaria", e.target.value)}
            />
          </Rotulo>
          <div className="grid items-start gap-4 @2xl:grid-cols-3">
            <CampoConAtajos
              id="ev-sueno"
              label="Conducta del sueño"
              opciones={ATAJOS.conductaSueno}
              placeholder="Horas y si se despierta"
              valor={ficha.conductaSueno}
              onCambiar={(v) => cambiarFicha("conductaSueno", v)}
            />
            <CampoConAtajos
              id="ev-actividad"
              label="Actividad física"
              opciones={ATAJOS.actividadFisica}
              placeholder="¿Qué hace y cuántas veces?"
              valor={ficha.actividadFisica}
              onCambiar={(v) => cambiarFicha("actividadFisica", v)}
            />
            <CampoConAtajos
              id="ev-agua"
              label="Consumo de agua"
              opciones={ATAJOS.consumoAgua}
              placeholder="Nota (opcional)"
              valor={ficha.consumoAgua}
              onCambiar={(v) => cambiarFicha("consumoAgua", v)}
            />
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}

/**
 * «Sí» o «No», de un toque. Los tres estados se distinguen de un vistazo: sin
 * contestar es blanco con borde; «Sí» va lleno en ámbar oscuro (hay algo que
 * mirar) y «No», lleno en gris oscuro; los dos marcados llevan su tilde.
 */
function BotonSiNo({ marcado, tono, onClick, children }: { marcado: boolean; tono: "si" | "no"; onClick: () => void; children: ReactNode }) {
  const on = tono === "si" ? "border-warning-text bg-warning-text text-white" : "border-slate-600 bg-slate-600 text-white";
  return (
    <button
      type="button"
      aria-pressed={marcado}
      onClick={onClick}
      // Ancho fijo: con la tilde el botón no crece ni corre al de al lado.
      className={`inline-flex min-h-10 w-16 items-center justify-center gap-1 rounded-lg border px-2 text-[13px] font-semibold transition-colors sm:min-h-9 ${
        marcado ? on : "border-borde bg-white text-texto-3 hover:border-slate-300 hover:bg-muted"
      }`}
    >
      {marcado && <Icon name="check" size={14} strokeWidth={3} />}
      {children}
    </button>
  );
}

// ── 2 · Medidas: en `EtapaMedidas.tsx` ──────────────────────────────────────

// ── Una medida con su tabla de grados (etapas 3 y 4) ───────────────────────

function BloqueConTabla({
  medida,
  campo,
  label,
  unidad,
  p,
  etiquetaTabla,
}: {
  medida: MedidaConTabla;
  campo: "grasaPct" | "musculoPct" | "grasaVisceral";
  label: string;
  unidad?: string;
  p: PropsEtapa;
  etiquetaTabla: string;
}) {
  const { ficha, control } = p;
  return (
    <section className="grid gap-x-8 gap-y-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
      <Numero
        id={`ev-${campo}`}
        campo={campo}
        label={label}
        unidad={unidad}
        valor={control[campo]}
        onCambiar={(v) => p.cambiarControl(campo, v)}
        p={p}
      />
      <TablaGrados
        tablas={p.catalogo?.tablas[medida]}
        sexo={sexoDe(ficha)}
        edad={edadDelControl(ficha, control.fecha)}
        valor={valorDe(campo, control[campo])}
        elegido={control.grados[medida]}
        onElegir={(g) => p.elegirGrado(medida, g)}
        etiqueta={etiquetaTabla}
        onCompletarFicha={p.irAFicha}
      />
    </section>
  );
}

// ── 3 · Composición corporal ────────────────────────────────────────────────

export function EtapaComposicion(p: PropsEtapa) {
  // Se compara con la edad que tenía el día del control.
  const edad = edadDelControl(p.ficha, p.control.fecha);
  const comparada = textoEdadCorporal(valorDe("edadCorporal", p.control.edadCorporal), edad);
  return (
    <Tarjeta titulo="Composición corporal" bajada="Lo que marca la balanza de composición corporal.">
      <div className="divide-y divide-borde-soft">
        <BloqueConTabla medida="musculo" campo="musculoPct" label="% de músculo esquelético" unidad="%" etiquetaTabla="Grados del músculo esquelético" p={p} />

        <section className="grid gap-x-8 gap-y-3 py-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <Numero
            id="ev-edadCorporal"
            campo="edadCorporal"
            label="Edad corporal"
            unidad="años"
            valor={p.control.edadCorporal}
            onCambiar={(v) => p.cambiarControl("edadCorporal", v)}
            p={p}
          />
          <div className="md:pt-7">
            {comparada ? (
              <p className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold ${TONO[comparada.tono].suave} ${TONO[comparada.tono].texto}`}>
                <Icon name={comparada.tono === "bien" ? "check" : "alert"} size={16} />
                {comparada.texto}
                {edad != null && <span className="font-normal opacity-80">({edad}&nbsp;años)</span>}
              </p>
            ) : edad == null ? (
              <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-texto-3">
                Falta la edad para compararla
                <button type="button" onClick={p.irAFicha} className="font-semibold text-primary-700 underline-offset-2 hover:underline">
                  Completar en la ficha
                </button>
              </p>
            ) : (
              <p className="text-[13px] text-texto-4">Se compara con su edad ({edad}&nbsp;años).</p>
            )}
          </div>
        </section>

        <BloqueConTabla medida="visceral" campo="grasaVisceral" label="Nivel de grasa visceral" etiquetaTabla="Grados de la grasa visceral" p={p} />
      </div>
    </Tarjeta>
  );
}

// ── 4 · Peso e IMC ──────────────────────────────────────────────────────────

export function EtapaPesoImc(p: PropsEtapa) {
  const { ficha, control } = p;
  const imc = imcDeLoEscrito(control.pesoKg, ficha.tallaCm);
  const tablaImc = tablaQueToca(p.catalogo?.tablas.imc, null, null).tabla;
  const rango = control.grados.imc
    ? (tablaImc?.rangos.find((r) => r.grado === control.grados.imc) ?? null)
    : rangoDe(tablaImc, imc);
  return (
    <Tarjeta titulo="Peso e IMC">
      <div className="divide-y divide-borde-soft">
        <section className="grid gap-x-8 gap-y-4 pb-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          {/* `self-start`: la columna no se estira al alto del medidor y la tabla. */}
          <div className="grid grid-cols-2 content-start gap-3 self-start md:grid-cols-1 md:gap-4">
            <Numero id="ev-peso4" campo="pesoKg" label="Peso" unidad="kg" valor={control.pesoKg} onCambiar={(v) => p.cambiarControl("pesoKg", v)} p={p} />
            <Numero id="ev-talla4" campo="tallaCm" label="Talla" unidad={UNIDAD_TALLA} valor={ficha.tallaCm} onCambiar={(v) => p.cambiarFicha("tallaCm", v)} p={p} />
            <div className="col-span-2 rounded-xl bg-muted px-4 py-3 md:col-span-1" aria-live="polite">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">IMC</p>
              {imc != null ? (
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-2xl font-bold tabular-nums text-texto">{fmtNumero(imc)}</span>
                  <span className="text-[12px] text-texto-3">kg/m²</span>
                  <ChipGrado rango={rango} />
                  {p.avisoImc && (
                    <p className="w-full text-[12px]">
                      <AvisoImc texto={p.avisoImc} />
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-[13px] text-texto-3">Sale solo con el peso y la talla.</p>
              )}
            </div>
          </div>
          <div className="min-w-0 space-y-4">
            {/* El medidor de la hoja: tocar un sector elige el grado, igual que la tabla. */}
            <MedidorImc rangos={tablaImc?.rangos} valor={imc} elegido={control.grados.imc} onElegir={(g) => p.elegirGrado("imc", g)} />
            <TablaGrados
              tablas={p.catalogo?.tablas.imc}
              sexo={sexoDe(ficha)}
              edad={edadDelControl(ficha, control.fecha)}
              valor={imc}
              elegido={control.grados.imc}
              onElegir={(g) => p.elegirGrado("imc", g)}
              etiqueta="Grados del IMC"
              onCompletarFicha={p.irAFicha}
            />
          </div>
        </section>
        <BloqueConTabla medida="grasa" campo="grasaPct" label="% de grasa corporal" unidad="%" etiquetaTabla="Grados de la grasa corporal" p={p} />
      </div>
    </Tarjeta>
  );
}
