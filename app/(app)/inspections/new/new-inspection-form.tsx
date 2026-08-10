"use client";

import { useActionState, useEffect, useRef, useState, type MouseEvent } from "react";
import {
  resolveObjetivo,
  tipoClienteValues,
  objetivoValues,
  type TipoCliente,
  type Objetivo,
} from "@/lib/inspection/schema";
import { createInspectionAction, type CreateInspectionState } from "./actions";
import { updateInspectionAction, type UpdateInspectionState } from "../[id]/editar/actions";
import { StandAutocomplete, type StandContact } from "./stand-autocomplete";
import { TAB_IDS, resolveTabForField, type TabId } from "@/lib/inspection/tabs";
import { TextareaWithCounter } from "./textarea-with-counter";
import { EquipamentoCategoria } from "./equipamento-categoria";
import { EquipamentoPersonalizadoDialog } from "./equipamento-personalizado-dialog";
import { EQUIPAMENTO_CATEGORIAS } from "@/lib/equipamento/catalog";
import { SimNaoRadio } from "./sim-nao-radio";
import { PaisOrigemSelect } from "./pais-origem-select";
import { ValorMoedaInput } from "./valor-moeda-input";

export type InspectionFormInitialData = Partial<{
  tipoCliente: TipoCliente;
  objetivo: Objetivo;
  nomeSolicitante: string;
  contacto: string;
  email: string;
  responsavelPresente: string;
  matricula: string;
  marca: string;
  modelo: string;
  quilometragem: string;
  versaoTrim: string;
  anoFabrico: string;
  anoModelo: string;
  cor: string;
  vin: string;
  numeroMotor: string;
  numeroPortas: string;
  combustivel: string;
  caixaVelocidades: string;
  tracao: string;
  potenciaCv: string;
  torqueNm: string;
  indiciosAdulteracaoKm: string;
  numeroProprietariosAnteriores: string;
  registoAcidentesAnteriores: string;
  historicoManutencao: string;
  inspecoesPeriodicasIpoNotas: string;
  inspecoesPeriodicasIpoData: string;
  situacaoFiscalRegular: string;
  indiciosAdulteracaoPresentes: "" | "sim" | "nao";
  veiculoImportado: "" | "sim" | "nao";
  paisOrigem: string;
  matriculaOrigem: string;
  dataImportacao: string;
  possuiCoc: "" | "sim" | "nao";
  isencaoIsvAplicada: "" | "sim" | "nao";
  numeroDav: string;
  dataPrimeiraMatricula: string;
  valorBaseIucAnual: string;
}>;

const initialState: CreateInspectionState = { status: "idle" };

const TAB_LABELS: Record<TabId, string> = {
  cliente: "Cliente",
  identificacao: "Identificação",
  historico: "Histórico",
  especificacoes: "Especificações",
  equipamentos: "Equipamentos",
};

export function NewInspectionForm({
  sugestoesPorCategoria = {},
  inspectionId,
  initialData = {},
}: {
  // Fix 2 (final-review): custom "Outros Equipamentos" items entered by any
  // técnico become suggestions for everyone (§4.2/§5 of the design spec) —
  // seeded here as the initial value of personalizadosPorCategoria, reusing
  // the exact rendering path itensPersonalizados already has.
  sugestoesPorCategoria?: Record<string, string[]>;
  inspectionId?: string;
  initialData?: InspectionFormInitialData;
} = {}) {
  const [activeTab, setActiveTab] = useState<TabId>("cliente");
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>(initialData.tipoCliente ?? "particular");
  const [objetivo, setObjetivo] = useState<Objetivo>(initialData.objetivo ?? "compra");
  const [nomeSolicitante, setNomeSolicitante] = useState(initialData.nomeSolicitante ?? "");
  const [contacto, setContacto] = useState(initialData.contacto ?? "");
  const [email, setEmail] = useState(initialData.email ?? "");
  const [responsavelPresente, setResponsavelPresente] = useState(initialData.responsavelPresente ?? "");
  const [matricula, setMatricula] = useState(initialData.matricula ?? "");
  const [marca, setMarca] = useState(initialData.marca ?? "");
  const [modelo, setModelo] = useState(initialData.modelo ?? "");
  const [quilometragem, setQuilometragem] = useState(initialData.quilometragem ?? "");
  const [versaoTrim, setVersaoTrim] = useState(initialData.versaoTrim ?? "");
  const [anoFabrico, setAnoFabrico] = useState(initialData.anoFabrico ?? "");
  const [anoModelo, setAnoModelo] = useState(initialData.anoModelo ?? "");
  const [cor, setCor] = useState(initialData.cor ?? "");
  const [vin, setVin] = useState(initialData.vin ?? "");
  const [numeroMotor, setNumeroMotor] = useState(initialData.numeroMotor ?? "");
  const [numeroPortas, setNumeroPortas] = useState(initialData.numeroPortas ?? "");
  const [combustivel, setCombustivel] = useState(initialData.combustivel ?? "");
  const [caixaVelocidades, setCaixaVelocidades] = useState(initialData.caixaVelocidades ?? "");
  const [tracao, setTracao] = useState(initialData.tracao ?? "");
  const [potenciaCv, setPotenciaCv] = useState(initialData.potenciaCv ?? "");
  const [torqueNm, setTorqueNm] = useState(initialData.torqueNm ?? "");
  const [indiciosAdulteracaoKm, setIndiciosAdulteracaoKm] = useState(initialData.indiciosAdulteracaoKm ?? "");
  const [numeroProprietariosAnteriores, setNumeroProprietariosAnteriores] = useState(
    initialData.numeroProprietariosAnteriores ?? ""
  );
  const [registoAcidentesAnteriores, setRegistoAcidentesAnteriores] = useState(
    initialData.registoAcidentesAnteriores ?? ""
  );
  const [historicoManutencao, setHistoricoManutencao] = useState(initialData.historicoManutencao ?? "");
  const [inspecoesPeriodicasIpoNotas, setInspecoesPeriodicasIpoNotas] = useState(
    initialData.inspecoesPeriodicasIpoNotas ?? ""
  );
  const [inspecoesPeriodicasIpoData, setInspecoesPeriodicasIpoData] = useState(
    initialData.inspecoesPeriodicasIpoData ?? ""
  );
  const [situacaoFiscalRegular, setSituacaoFiscalRegular] = useState(initialData.situacaoFiscalRegular ?? "");
  const [indiciosAdulteracaoPresentes, setIndiciosAdulteracaoPresentes] = useState<"" | "sim" | "nao">(
    initialData.indiciosAdulteracaoPresentes ?? ""
  );
  const [veiculoImportado, setVeiculoImportado] = useState<"" | "sim" | "nao">(initialData.veiculoImportado ?? "");
  const [paisOrigem, setPaisOrigem] = useState(initialData.paisOrigem ?? "");
  const [matriculaOrigem, setMatriculaOrigem] = useState(initialData.matriculaOrigem ?? "");
  const [dataImportacao, setDataImportacao] = useState(initialData.dataImportacao ?? "");
  const [possuiCoc, setPossuiCoc] = useState<"" | "sim" | "nao">(initialData.possuiCoc ?? "");
  const [isencaoIsvAplicada, setIsencaoIsvAplicada] = useState<"" | "sim" | "nao">(initialData.isencaoIsvAplicada ?? "");
  const [numeroDav, setNumeroDav] = useState(initialData.numeroDav ?? "");
  const [dataPrimeiraMatricula, setDataPrimeiraMatricula] = useState(initialData.dataPrimeiraMatricula ?? "");
  const [valorBaseIucAnual, setValorBaseIucAnual] = useState(initialData.valorBaseIucAnual ?? "");
  const [personalizadosPorCategoria, setPersonalizadosPorCategoria] =
    useState<Record<string, string[]>>(sugestoesPorCategoria);
  const [categoriaAbrindoDialog, setCategoriaAbrindoDialog] = useState<{ id: string; label: string } | null>(null);
  const initialActionState: CreateInspectionState | UpdateInspectionState = { status: "idle" };
  const [state, formAction] = useActionState(
    inspectionId ? updateInspectionAction : createInspectionAction,
    initialActionState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const personalizadoDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state.status !== "error") return;
    const tab = resolveTabForField(state.field);
    if (tab) setActiveTab(tab);
  }, [state]);

  function handleTipoClienteChange(value: TipoCliente) {
    setTipoCliente(value);
    setObjetivo(resolveObjetivo(value, objetivo));
  }

  function handleStandSelect(contact: StandContact) {
    setNomeSolicitante(contact.nome_solicitante);
    setContacto(contact.contacto ?? "");
    setEmail(contact.email ?? "");
  }

  function handleNext() {
    // Scoped to the active panel rather than formRef.current.reportValidity() on the
    // whole form: required fields on other (hidden) tabs shouldn't block navigation.
    // Real browsers already exclude `hidden` elements from constraint validation, but
    // scoping explicitly here keeps behavior identical under jsdom (which doesn't).
    const activePanel = formRef.current?.querySelector('[role="tabpanel"]:not([hidden])');
    const invalidField = activePanel?.querySelector<HTMLInputElement | HTMLSelectElement>(":invalid");
    if (invalidField) {
      invalidField.reportValidity();
      return;
    }
    const currentIndex = TAB_IDS.indexOf(activeTab);
    const nextTab = TAB_IDS[currentIndex + 1];
    if (nextTab) setActiveTab(nextTab);
  }

  // "Guardar" previously relied on the browser's own, silent native
  // validation to block submission when a field is invalid — e.g. a selected
  // equipamento item with no condição set (required). Unlike handleNext,
  // nothing told the técnico WHY the click did nothing. Same active-panel
  // scoping as handleNext, and same reasoning: fields on other tabs are
  // excluded from constraint validation by real browsers.
  function handleGuardarClick(e: MouseEvent<HTMLButtonElement>) {
    const activePanel = formRef.current?.querySelector('[role="tabpanel"]:not([hidden])');
    const invalidField = activePanel?.querySelector<HTMLInputElement | HTMLSelectElement>(":invalid");
    if (!invalidField) return;
    e.preventDefault();
    invalidField.closest("details")?.setAttribute("open", "");
    invalidField.reportValidity();
  }

  // ponytail: dev-only manual test helper, gated out of prod builds by the
  // NODE_ENV check below. Equipamento items own selecionado/condição as
  // local state (not lifted here), so those are filled via real .click()
  // calls instead of setters — same reason handleNext/handleGuardarClick
  // already reach into the DOM instead of tracking everything in state.
  function handleFillTestData() {
    setNomeSolicitante(`Cliente Teste ${Math.floor(Math.random() * 1000)}`);
    setContacto("912345678");
    setEmail("teste@example.com");
    setResponsavelPresente("Técnico Teste");
    setMatricula(`AA-${Math.floor(10 + Math.random() * 89)}-BB`);
    setMarca("Toyota");
    setModelo("Corolla");
    setVersaoTrim("Comfort");
    setAnoFabrico("2020");
    setAnoModelo("2021");
    setCor("Preto");
    setVin(`9BWZZZ377VT${Math.floor(100000 + Math.random() * 900000)}`);
    setNumeroMotor(`MOT${Math.floor(Math.random() * 10000)}`);
    setNumeroPortas("5");
    setCombustivel("Gasolina");
    setCaixaVelocidades("Manual");
    setTracao("Dianteira");
    setPotenciaCv("120");
    setTorqueNm("200");
    setQuilometragem(String(Math.floor(Math.random() * 200000)));
    setIndiciosAdulteracaoPresentes("nao");
    setNumeroProprietariosAnteriores("1");
    setRegistoAcidentesAnteriores("Sem registo relevante.");
    setHistoricoManutencao("Revisões em dia, sem intervenções fora do previsto.");
    setInspecoesPeriodicasIpoNotas("Sem observações.");
    setInspecoesPeriodicasIpoData("2026-01-15");
    setSituacaoFiscalRegular("IUC em dia");
    setVeiculoImportado("nao");
    setDataPrimeiraMatricula("2020-03-01");
    setValorBaseIucAnual("120");

    setTimeout(() => {
      const checkboxes = Array.from(
        formRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name$="__selecionado"]') ?? []
      )
        .sort(() => Math.random() - 0.5)
        .slice(0, 8);
      checkboxes.forEach((c) => c.click());

      setTimeout(() => {
        checkboxes.forEach((c) => {
          const prefix = c.name.replace(/__selecionado$/, "");
          formRef.current?.querySelector<HTMLInputElement>(`input[name="${prefix}__condicao"][value="bom"]`)?.click();
        });
      }, 0);
    }, 0);
  }

  return (
    <form ref={formRef} action={formAction} className="stack">
      {!inspectionId && process.env.NODE_ENV !== "production" && (
        <button type="button" className="btn btn-secondary" onClick={handleFillTestData}>
          Preencher com dados de teste
        </button>
      )}
      {inspectionId && <input type="hidden" name="inspectionId" value={inspectionId} />}
      <div className="form-tabs" role="tablist">
        {TAB_IDS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`form-tabs__button${activeTab === tab ? " form-tabs__button--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "cliente"}>
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Cliente</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="tipoCliente" className="label">
                Tipo de cliente
              </label>
              <select
                id="tipoCliente"
                name="tipoCliente"
                className="input"
                value={tipoCliente}
                onChange={(e) => handleTipoClienteChange(e.target.value as TipoCliente)}
              >
                {tipoClienteValues.map((v) => (
                  <option key={v} value={v}>
                    {v === "particular" ? "Particular" : "Stand"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="objetivo" className="label">
                Objetivo
              </label>
              <select
                id="objetivo"
                name="objetivo"
                className="input"
                value={objetivo}
                disabled={tipoCliente === "stand"}
                onChange={(e) => setObjetivo(e.target.value as Objetivo)}
              >
                {objetivoValues.map((v) => (
                  <option key={v} value={v}>
                    {v === "compra" ? "Compra" : "Venda"}
                  </option>
                ))}
              </select>
              {tipoCliente === "stand" && <input type="hidden" name="objetivo" value={objetivo} />}
            </div>

            <div className="field">
              <label htmlFor="nomeSolicitante" className="label">
                Nome do solicitante
              </label>
              <input
                id="nomeSolicitante"
                name="nomeSolicitante"
                className="input"
                required
                value={nomeSolicitante}
                onChange={(e) => setNomeSolicitante(e.target.value)}
              />
            </div>

            {tipoCliente === "stand" && <StandAutocomplete onSelect={handleStandSelect} />}

            <div className="field">
              <label htmlFor="contacto" className="label">
                Contacto
              </label>
              <input
                id="contacto"
                name="contacto"
                className="input"
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="responsavelPresente" className="label">
                Responsável presente
              </label>
              <input
                id="responsavelPresente"
                name="responsavelPresente"
                className="input"
                value={responsavelPresente}
                onChange={(e) => setResponsavelPresente(e.target.value)}
              />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "identificacao"}>
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Identificação</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="matricula" className="label">
                Matrícula
              </label>
              <input
                id="matricula"
                name="matricula"
                className="input"
                required
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="marca" className="label">
                Marca
              </label>
              <input
                id="marca"
                name="marca"
                className="input"
                required
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="modelo" className="label">
                Modelo
              </label>
              <input
                id="modelo"
                name="modelo"
                className="input"
                required
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="versaoTrim" className="label">
                Versão
              </label>
              <input
                id="versaoTrim"
                name="versaoTrim"
                className="input"
                value={versaoTrim}
                onChange={(e) => setVersaoTrim(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="anoFabrico" className="label">
                Ano de fabrico
              </label>
              <input
                id="anoFabrico"
                name="anoFabrico"
                type="number"
                className="input"
                value={anoFabrico}
                onChange={(e) => setAnoFabrico(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="anoModelo" className="label">
                Ano do modelo
              </label>
              <input
                id="anoModelo"
                name="anoModelo"
                type="number"
                className="input"
                value={anoModelo}
                onChange={(e) => setAnoModelo(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="cor" className="label">
                Cor
              </label>
              <input id="cor" name="cor" className="input" value={cor} onChange={(e) => setCor(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="vin" className="label">
                VIN
              </label>
              <input id="vin" name="vin" className="input" value={vin} onChange={(e) => setVin(e.target.value)} />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "historico"}>
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Histórico</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="quilometragem" className="label">
                Quilometragem atual
              </label>
              <input
                id="quilometragem"
                name="quilometragem"
                type="number"
                className="input"
                required
                min={0}
                value={quilometragem}
                onChange={(e) => setQuilometragem(e.target.value)}
              />
            </div>

            <SimNaoRadio
              name="indiciosAdulteracaoPresentes"
              label="Indícios de adulteração de quilometragem?"
              value={indiciosAdulteracaoPresentes}
              onChange={setIndiciosAdulteracaoPresentes}
            />

            <div hidden={indiciosAdulteracaoPresentes !== "sim"}>
              <TextareaWithCounter
                id="indiciosAdulteracaoKm"
                name="indiciosAdulteracaoKm"
                label="Anotações / Detalhes dos indícios de adulteração"
                value={indiciosAdulteracaoKm}
                onChange={setIndiciosAdulteracaoKm}
                maxSoft={500}
              />
            </div>

            <div className="field">
              <label htmlFor="numeroProprietariosAnteriores" className="label">
                Número de proprietários anteriores
              </label>
              <input
                id="numeroProprietariosAnteriores"
                name="numeroProprietariosAnteriores"
                type="number"
                className="input"
                min={0}
                value={numeroProprietariosAnteriores}
                onChange={(e) => setNumeroProprietariosAnteriores(e.target.value)}
              />
            </div>

            <TextareaWithCounter
              id="registoAcidentesAnteriores"
              name="registoAcidentesAnteriores"
              label="Registo de acidentes anteriores"
              value={registoAcidentesAnteriores}
              onChange={setRegistoAcidentesAnteriores}
              maxSoft={500}
            />

            <TextareaWithCounter
              id="historicoManutencao"
              name="historicoManutencao"
              label="Histórico de manutenção"
              value={historicoManutencao}
              onChange={setHistoricoManutencao}
              maxSoft={500}
            />

            <TextareaWithCounter
              id="inspecoesPeriodicasIpoNotas"
              name="inspecoesPeriodicasIpoNotas"
              label="Inspeções periódicas (IPO) — notas"
              value={inspecoesPeriodicasIpoNotas}
              onChange={setInspecoesPeriodicasIpoNotas}
              maxSoft={500}
            />

            <div className="field">
              <label htmlFor="inspecoesPeriodicasIpoData" className="label">
                Data da última IPO
              </label>
              <input
                id="inspecoesPeriodicasIpoData"
                name="inspecoesPeriodicasIpoData"
                type="date"
                className="input"
                value={inspecoesPeriodicasIpoData}
                onChange={(e) => setInspecoesPeriodicasIpoData(e.target.value)}
              />
            </div>

            <TextareaWithCounter
              id="situacaoFiscalRegular"
              name="situacaoFiscalRegular"
              label="Situação fiscal (ex.: IUC em dia)"
              value={situacaoFiscalRegular}
              onChange={setSituacaoFiscalRegular}
              maxSoft={200}
            />

            <SimNaoRadio
              name="veiculoImportado"
              label="Veículo importado?"
              value={veiculoImportado}
              onChange={setVeiculoImportado}
            />

            <div className="form-grid" hidden={veiculoImportado !== "sim"}>
              <PaisOrigemSelect id="paisOrigem" value={paisOrigem} onChange={setPaisOrigem} />

              <div className="field">
                <label htmlFor="matriculaOrigem" className="label">
                  Matrícula de origem (estrangeira)
                </label>
                <input
                  id="matriculaOrigem"
                  name="matriculaOrigem"
                  className="input"
                  value={matriculaOrigem}
                  onChange={(e) => setMatriculaOrigem(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="dataImportacao" className="label">
                  Data de importação
                </label>
                <input
                  id="dataImportacao"
                  name="dataImportacao"
                  type="date"
                  className="input"
                  value={dataImportacao}
                  onChange={(e) => setDataImportacao(e.target.value)}
                />
              </div>

              <SimNaoRadio
                name="possuiCoc"
                label="Possui Certificado de Conformidade (COC)?"
                value={possuiCoc}
                onChange={setPossuiCoc}
              />

              <SimNaoRadio
                name="isencaoIsvAplicada"
                label="Isenção de ISV aplicada?"
                value={isencaoIsvAplicada}
                onChange={setIsencaoIsvAplicada}
              />

              <div className="field">
                <label htmlFor="numeroDav" className="label">
                  Número da DAV / Registo de Legalização
                </label>
                <input
                  id="numeroDav"
                  name="numeroDav"
                  className="input"
                  value={numeroDav}
                  onChange={(e) => setNumeroDav(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="dataPrimeiraMatricula" className="label">
                Data da primeira matrícula
              </label>
              <input
                id="dataPrimeiraMatricula"
                name="dataPrimeiraMatricula"
                type="date"
                className="input"
                value={dataPrimeiraMatricula}
                onChange={(e) => setDataPrimeiraMatricula(e.target.value)}
              />
            </div>

            <ValorMoedaInput
              id="valorBaseIucAnual"
              name="valorBaseIucAnual"
              label="Valor base IUC anual (€)"
              value={valorBaseIucAnual}
              onChange={setValorBaseIucAnual}
            />
          </div>
        </fieldset>
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "especificacoes"}>
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Especificações</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="numeroMotor" className="label">
                Número do motor
              </label>
              <input
                id="numeroMotor"
                name="numeroMotor"
                className="input"
                value={numeroMotor}
                onChange={(e) => setNumeroMotor(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="numeroPortas" className="label">
                Número de portas
              </label>
              <input
                id="numeroPortas"
                name="numeroPortas"
                type="number"
                className="input"
                value={numeroPortas}
                onChange={(e) => setNumeroPortas(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="combustivel" className="label">
                Combustível
              </label>
              <input
                id="combustivel"
                name="combustivel"
                className="input"
                value={combustivel}
                onChange={(e) => setCombustivel(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="caixaVelocidades" className="label">
                Caixa de velocidades
              </label>
              <input
                id="caixaVelocidades"
                name="caixaVelocidades"
                className="input"
                value={caixaVelocidades}
                onChange={(e) => setCaixaVelocidades(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="tracao" className="label">
                Tração
              </label>
              <input
                id="tracao"
                name="tracao"
                className="input"
                value={tracao}
                onChange={(e) => setTracao(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="potenciaCv" className="label">
                Potência (cv)
              </label>
              <input
                id="potenciaCv"
                name="potenciaCv"
                type="number"
                className="input"
                value={potenciaCv}
                onChange={(e) => setPotenciaCv(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="torqueNm" className="label">
                Torque (Nm)
              </label>
              <input
                id="torqueNm"
                name="torqueNm"
                type="number"
                step="0.01"
                className="input"
                value={torqueNm}
                onChange={(e) => setTorqueNm(e.target.value)}
              />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "equipamentos"}>
        {EQUIPAMENTO_CATEGORIAS.map((categoria) => (
          <EquipamentoCategoria
            key={categoria.id}
            categoriaId={categoria.id}
            label={categoria.label}
            itensPreDefinidos={categoria.itens}
            itensPersonalizados={personalizadosPorCategoria[categoria.id] ?? []}
            onAddPersonalizado={() => {
              setCategoriaAbrindoDialog({ id: categoria.id, label: categoria.label });
              personalizadoDialogRef.current?.showModal();
            }}
          />
        ))}
      </div>

      <dialog
        ref={personalizadoDialogRef}
        className="dialog-panel"
        // Fix 5 (final-review): Escape/backdrop dismissal doesn't go through
        // onCancel/onConfirm, so without this categoriaAbrindoDialog never
        // resets on those paths, leaving stale dialog state for next open.
        // The manual resets below stay too — jsdom's <dialog> polyfill (see
        // vitest.setup.ts) doesn't dispatch a close event, so this handler
        // alone isn't exercised by the existing reset-between-openings test.
        onClose={() => setCategoriaAbrindoDialog(null)}
      >
        {categoriaAbrindoDialog && (
          <EquipamentoPersonalizadoDialog
            categoriaLabel={categoriaAbrindoDialog.label}
            onCancel={() => {
              personalizadoDialogRef.current?.close();
              setCategoriaAbrindoDialog(null);
            }}
            onConfirm={(nome) => {
              setPersonalizadosPorCategoria((prev) => ({
                ...prev,
                [categoriaAbrindoDialog.id]: [...(prev[categoriaAbrindoDialog.id] ?? []), nome],
              }));
              personalizadoDialogRef.current?.close();
              setCategoriaAbrindoDialog(null);
            }}
          />
        )}
      </dialog>

      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}
      {activeTab === TAB_IDS[TAB_IDS.length - 1] ? (
        <button type="submit" className="btn btn-primary" onClick={handleGuardarClick}>
          {inspectionId ? "Guardar alterações" : "Guardar"}
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={handleNext}>
          Próximo
        </button>
      )}
    </form>
  );
}
