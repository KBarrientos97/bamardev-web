import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Boton, Confirmar, Modal } from "../../components/ui";
import { apiNutricion } from "../../lib/nutricion/api";
import { ctrlEnter, pasarAlSiguiente, useTeclas } from "../../lib/nutricion/atajos";
import {
  avisoImc,
  calcularImc,
  cambio,
  edadEnFecha,
  errorDeTope,
  fechaLarga,
  fmtCambio,
  fmtNumero,
  hoyIso,
  rangoDe,
  tablaQueToca,
  textoAlSalir,
  textoEdadCorporal,
  ultimoValor,
  valorDe,
  type CampoControl,
} from "../../lib/nutricion/calculo";
import {
  cambiosDeControl,
  controlAInput,
  controlConDatos,
  controlDesde,
  controlVacio,
  hayCambios,
  soloConValor,
  type FormControl,
} from "../../lib/nutricion/formulario";
import { pesoAnteriorDeLaSerie } from "../../lib/nutricion/pesos";
import { diaYMes } from "../../lib/nutricion/seguimiento/formato";
import type { Catalogo, Control, MedidaConTabla, Paciente } from "../../lib/nutricion/tipos";
import { TONO } from "../../lib/nutricion/tonos";
import { AreaTexto, CampoNumero, CampoTexto, ChipGrado, Rotulo, SeccionHoja, Tecla } from "./piezas";
import TablaGrados from "./TablaGrados";

type CampoHoja = Exclude<CampoControl, "imc">;

const UNIDAD: Record<CampoHoja, string> = {
  pesoKg: "kg",
  cinturaCm: "cm",
  caderaCm: "cm",
  pechoCm: "cm",
  grasaPct: "%",
  musculoPct: "%",
  edadCorporal: "años",
  grasaVisceral: "",
};

/**
 * La hoja «Nuevo control» y «Editar control» (CONTRATO-nutricion-evaluacion-22nov
 * §4.3): todo arranca vacío y, al lado de cada campo, en gris, lo de la vez
 * anterior («anterior: 82,4») y, al escribir, el cambio («−1,2»). El IMC sale
 * solo con la talla de la ficha y los grados se eligen con la misma tabla, en
 * chico. Se guarda sólo lo escrito. `Ctrl+Enter` guarda y `Esc` cierra.
 */
export default function HojaControl({
  paciente,
  catalogo,
  control,
  onCerrar,
  onGuardado,
}: {
  paciente: Paciente;
  catalogo: Catalogo | null;
  /** El control a corregir; null = uno nuevo. */
  control: Control | null;
  onCerrar: () => void;
  onGuardado: (p: Paciente, aviso: string) => void;
}) {
  const navigate = useNavigate();
  const ctx = {
    catalogo,
    sexo: paciente.sexo,
    edad: paciente.edad,
    fechaNacimiento: paciente.fechaNacimiento,
    edadDeclarada: paciente.edadDeclarada,
    edadDeclaradaEn: paciente.edadDeclaradaEn,
  };
  const [inicial] = useState<FormControl>(() => (control ? controlDesde(control, ctx) : controlVacio()));
  const [form, setForm] = useState<FormControl>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // El error está al final de la hoja y quien guardó suele estar arriba: al
  // aparecer (o cambiar) se trae a la vista.
  const avisoError = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) avisoError.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  const [intento, setIntento] = useState(false);
  const [borrando, setBorrando] = useState(false);
  // `Esc` (o la ✕) con algo escrito pregunta antes de perderlo; sin nada escrito, cierra.
  const [preguntaCerrar, setPreguntaCerrar] = useState(false);
  const conCambios = hayCambios(controlAInput(inicial), controlAInput(form));
  const pedirCerrar = () => (conCambios ? setPreguntaCerrar(true) : onCerrar());
  const hoy = hoyIso();
  // La tabla de los grados es la de la edad que tenía el día de ESTE control (§3.4).
  const edadControl = edadEnFecha(paciente, form.fecha, hoy);

  // Lo «anterior» es lo de antes de este control (al corregir) o lo último que hay (al cargar uno nuevo).
  const indice = control ? paciente.controles.findIndex((c) => c.id === control.id) : undefined;
  // El peso de antes sale de la serie al día (§4.4 del seguimiento): puede ser
  // el de una semana del seguimiento. Sin la serie, el del control anterior.
  const pesoDeLaSerie = pesoAnteriorDeLaSerie(paciente.pesos, control);
  const anterior = (campo: CampoControl): { valor: number; fecha: string; delSeguimiento?: boolean } | null => {
    if (campo === "pesoKg" && pesoDeLaSerie !== undefined) {
      return pesoDeLaSerie ? { valor: pesoDeLaSerie.pesoKg, fecha: pesoDeLaSerie.fecha, delSeguimiento: pesoDeLaSerie.origen === "SEGUIMIENTO" } : null;
    }
    return ultimoValor(paciente.controles, campo, indice != null && indice >= 0 ? indice : undefined);
  };

  const cambiar = (campo: keyof FormControl, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));
  const elegirGrado = (m: MedidaConTabla, g: string | null) => setForm((f) => ({ ...f, grados: { ...f.grados, [m]: g } }));

  const errores: Partial<Record<CampoHoja | "fecha", string | null>> = {
    fecha: !form.fecha ? "Elegí la fecha" : form.fecha > hoy ? "No puede ser después de hoy" : null,
  };
  for (const c of Object.keys(UNIDAD) as CampoHoja[]) errores[c] = errorDeTope(c, form[c]);
  const hayError = Object.values(errores).some(Boolean);

  async function guardar() {
    if (guardando) return;
    setIntento(true);
    if (hayError) {
      setError("Hay un dato para revisar.");
      return;
    }
    const ahora = controlAInput(form);
    setError("");
    try {
      setGuardando(true);
      if (!control) {
        if (!controlConDatos(form)) {
          setError("Escribí al menos una medida o la nota.");
          return;
        }
        const p = await apiNutricion.crearControl(paciente.id, soloConValor(ahora));
        onGuardado(p, `Control del ${fechaLarga(ahora.fecha)} guardado.`);
      } else {
        const c = cambiosDeControl(inicial, form);
        if (!Object.keys(c).length) {
          onCerrar();
          return;
        }
        const p = await apiNutricion.editarControl(control.id, c);
        onGuardado(p, `Control del ${fechaLarga(ahora.fecha)} corregido.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!control) return;
    setGuardando(true);
    try {
      const p = await apiNutricion.borrarControl(control.id);
      setBorrando(false);
      onGuardado(p, `Control del ${fechaLarga(control.fecha)} borrado.`);
    } catch (e) {
      setBorrando(false);
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    } finally {
      setGuardando(false);
    }
  }

  useTeclas((e) => {
    if (borrando || preguntaCerrar || !ctrlEnter(e)) return;
    e.preventDefault();
    void guardar();
  });

  /** «anterior: 82,4 · −1,2». */
  const referencia = (campo: CampoHoja): ReactNode => {
    const a = anterior(campo);
    if (!a) return null;
    const decimales = campo === "pesoKg" ? 2 : campo === "edadCorporal" ? 0 : 1;
    const d = cambio(valorDe(campo, form[campo]), a.valor);
    return (
      <span title={`El ${fechaLarga(a.fecha)}${a.delSeguimiento ? ", en el seguimiento" : ""}`}>
        anterior: {fmtNumero(a.valor, decimales)}
        {a.delSeguimiento && <> · seguimiento {diaYMes(a.fecha)}</>}
        {d != null && <span className="font-semibold text-texto-2"> · {fmtCambio(d, decimales)}</span>}
      </span>
    );
  };

  const numero = (campo: CampoHoja, label: string, abajo?: ReactNode) => {
    const err = intento || form[campo] ? errores[campo] : null;
    return (
      <div className="space-y-2">
        <Rotulo htmlFor={`hc-${campo}`} label={label} extra={referencia(campo)} error={err}>
          <CampoNumero
            id={`hc-${campo}`}
            value={form[campo]}
            unidad={UNIDAD[campo]}
            invalido={!!err}
            // En un control nuevo se empieza por el peso: la fecha ya es hoy.
            autoFocus={!control && campo === "pesoKg"}
            onChange={(v) => cambiar(campo, v)}
            onBlur={() => {
              const t = textoAlSalir(campo, form[campo]);
              if (t !== form[campo]) cambiar(campo, t);
            }}
          />
        </Rotulo>
        {abajo}
      </div>
    );
  };

  const sinDatosEscritos = !controlConDatos(form);
  const tabla = (medida: MedidaConTabla, campo: "grasaPct" | "musculoPct" | "grasaVisceral" | null, valor: number | null, etiqueta: string) => (
    <TablaGrados
      compacto
      tablas={catalogo?.tablas[medida]}
      sexo={paciente.sexo}
      edad={edadControl}
      valor={campo ? valorDe(campo, form[campo]) : valor}
      elegido={form.grados[medida]}
      onElegir={(g) => elegirGrado(medida, g)}
      etiqueta={etiqueta}
      textoCompletar="Editar ficha"
      // Ir a la ficha sin guardar perdería lo escrito: sólo con la hoja vacía.
      onCompletarFicha={sinDatosEscritos ? () => navigate(`/evaluacion/${paciente.id}/editar`) : undefined}
    />
  );

  // Con el peso en error no hay IMC; uno imposible (la talla de la ficha mal escrita) se avisa.
  const imc = errores.pesoKg ? null : calcularImc(valorDe("pesoKg", form.pesoKg), paciente.tallaCm);
  const imcImposible = avisoImc(imc);
  const tablaImc = tablaQueToca(catalogo?.tablas.imc, null, null).tabla;
  const rangoImc = form.grados.imc ? (tablaImc?.rangos.find((r) => r.grado === form.grados.imc) ?? null) : rangoDe(tablaImc, imc);
  const edadCorp = textoEdadCorporal(valorDe("edadCorporal", form.edadCorporal), edadControl);

  return (
    <>
      <Modal
        abierto
        titulo={control ? "Editar control" : "Nuevo control"}
        subtitulo={control ? `Del ${fechaLarga(control.fecha)}${control.inicial ? " · el inicial" : ""}` : paciente.nombre}
        // Con «¿Borrar este control?» (o «¿Cerrar sin guardar?») encima, `Esc` es
        // de esa pregunta: cerraba también la hoja y se perdía lo corregido.
        onClose={borrando || preguntaCerrar ? sinCerrar : pedirCerrar}
        ancho="max-w-2xl"
        cerrarAlClicAfuera={false}
        acciones={
          <>
            {control && (
              <Boton variante="ghost" className="mr-auto text-danger-text!" onClick={() => setBorrando(true)} disabled={guardando}>
                Borrar control
              </Boton>
            )}
            <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton onClick={() => void guardar()} disabled={guardando} title="Guardar (Ctrl+Enter)">
              {guardando ? "Guardando…" : "Guardar"}
              <Tecla sobreColor>Ctrl+Enter</Tecla>
            </Boton>
          </>
        }
      >
        <div
          className="space-y-5"
          onKeyDown={(e) => {
            // `Enter` en un campo de una línea pasa al siguiente, como en la evaluación.
            const el = e.target as HTMLElement;
            if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || el.tagName !== "INPUT") return;
            e.preventDefault();
            pasarAlSiguiente(e.currentTarget, el);
          }}
        >
          <Rotulo htmlFor="hc-fecha" label="Fecha" error={intento ? errores.fecha : null} className="max-w-[220px]">
            <CampoTexto
              id="hc-fecha"
              type="date"
              value={form.fecha}
              max={hoy}
              invalido={intento && !!errores.fecha}
              onChange={(e) => cambiar("fecha", e.target.value)}
            />
          </Rotulo>

          <Seccion titulo="Peso e IMC">
            <div className="grid gap-4 sm:grid-cols-2">
              {numero("pesoKg", "Peso")}
              <div className="rounded-xl bg-muted px-4 py-3" aria-live="polite">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">IMC</p>
                {imc != null ? (
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-xl font-bold tabular-nums text-texto">{fmtNumero(imc)}</span>
                    <ChipGrado rango={rangoImc} />
                    {imcImposible && (
                      <span className="flex w-full items-start gap-1.5 text-[12px] font-semibold text-warning-text" role="status">
                        <Icon name="alert" size={14} className="mt-px shrink-0" />
                        {imcImposible}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-[13px] text-texto-3">
                    {paciente.tallaCm ? "Sale solo con el peso." : "Falta la talla en la ficha."}
                  </p>
                )}
              </div>
            </div>
            {tabla("imc", null, imc, "Grados del IMC")}
          </Seccion>

          <Seccion titulo="Medidas">
            <div className="grid gap-4 sm:grid-cols-3">
              {numero("cinturaCm", "Cintura")}
              {numero("caderaCm", "Cadera")}
              {numero("pechoCm", "Pecho")}
            </div>
          </Seccion>

          <Seccion titulo="Composición corporal">
            <div className="space-y-5">
              {numero("grasaPct", "% de grasa corporal", tabla("grasa", "grasaPct", null, "Grados de la grasa corporal"))}
              {numero("musculoPct", "% de músculo esquelético", tabla("musculo", "musculoPct", null, "Grados del músculo esquelético"))}
              {numero(
                "edadCorporal",
                "Edad corporal",
                edadCorp ? (
                  <p className={`inline-flex rounded-lg px-2.5 py-1 text-[13px] font-semibold ${TONO[edadCorp.tono].suave} ${TONO[edadCorp.tono].texto}`}>
                    {edadCorp.texto}
                  </p>
                ) : null,
              )}
              {numero("grasaVisceral", "Nivel de grasa visceral", tabla("visceral", "grasaVisceral", null, "Grados de la grasa visceral"))}
            </div>
          </Seccion>

          <Rotulo htmlFor="hc-nota" label="Nota">
            <AreaTexto id="hc-nota" rows={3} maxLength={2000} value={form.nota} onChange={(e) => cambiar("nota", e.target.value)} />
          </Rotulo>

          {error && (
            <p ref={avisoError} className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
      <Confirmar
        abierto={borrando}
        titulo="¿Borrar este control?"
        texto={control ? `Se borran las medidas del ${fechaLarga(control.fecha)}. Los demás controles no cambian.` : ""}
        etiquetaOk="Borrar control"
        peligroso
        procesando={guardando}
        onCancel={() => setBorrando(false)}
        onOk={() => void borrar()}
      />
      <Confirmar
        abierto={preguntaCerrar}
        titulo="¿Cerrar sin guardar?"
        texto="Lo que escribiste en este control se pierde."
        etiquetaOk="Cerrar sin guardar"
        peligroso
        onCancel={() => setPreguntaCerrar(false)}
        onOk={onCerrar}
      />
    </>
  );
}

const sinCerrar = () => {};

const Seccion = SeccionHoja;
