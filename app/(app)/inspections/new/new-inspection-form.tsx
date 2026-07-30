"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  resolveObjetivo,
  tipoClienteValues,
  objetivoValues,
  type TipoCliente,
  type Objetivo,
} from "@/lib/inspection/schema";
import { createInspectionAction, type CreateInspectionState } from "./actions";
import { StandAutocomplete, type StandContact } from "./stand-autocomplete";
import { TAB_IDS, resolveTabForField, type TabId } from "@/lib/inspection/tabs";
import { TextareaWithCounter } from "./textarea-with-counter";

const initialState: CreateInspectionState = { status: "idle" };

const TAB_LABELS: Record<TabId, string> = {
  cliente: "Cliente",
  identificacao: "Identificação",
  historico: "Histórico",
  especificacoes: "Especificações",
  equipamentos: "Equipamentos",
};

export function NewInspectionForm() {
  const [activeTab, setActiveTab] = useState<TabId>("cliente");
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("particular");
  const [objetivo, setObjetivo] = useState<Objetivo>("compra");
  const [nomeSolicitante, setNomeSolicitante] = useState("");
  const [contacto, setContacto] = useState("");
  const [email, setEmail] = useState("");
  const [responsavelPresente, setResponsavelPresente] = useState("");
  const [matricula, setMatricula] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [quilometragem, setQuilometragem] = useState("");
  const [versaoTrim, setVersaoTrim] = useState("");
  const [anoFabrico, setAnoFabrico] = useState("");
  const [anoModelo, setAnoModelo] = useState("");
  const [cor, setCor] = useState("");
  const [vin, setVin] = useState("");
  const [numeroMotor, setNumeroMotor] = useState("");
  const [numeroPortas, setNumeroPortas] = useState("");
  const [combustivel, setCombustivel] = useState("");
  const [caixaVelocidades, setCaixaVelocidades] = useState("");
  const [tracao, setTracao] = useState("");
  const [potenciaCv, setPotenciaCv] = useState("");
  const [torqueNm, setTorqueNm] = useState("");
  const [indiciosAdulteracaoKm, setIndiciosAdulteracaoKm] = useState("");
  const [numeroProprietariosAnteriores, setNumeroProprietariosAnteriores] = useState("");
  const [registoAcidentesAnteriores, setRegistoAcidentesAnteriores] = useState("");
  const [historicoManutencao, setHistoricoManutencao] = useState("");
  const [inspecoesPeriodicasIpoNotas, setInspecoesPeriodicasIpoNotas] = useState("");
  const [inspecoesPeriodicasIpoData, setInspecoesPeriodicasIpoData] = useState("");
  const [situacaoFiscalRegular, setSituacaoFiscalRegular] = useState(false);
  const [situacaoFiscalObservacoes, setSituacaoFiscalObservacoes] = useState("");
  const [state, formAction] = useActionState(createInspectionAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

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

  return (
    <form ref={formRef} action={formAction} className="stack">
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

            <TextareaWithCounter
              id="indiciosAdulteracaoKm"
              name="indiciosAdulteracaoKm"
              label="Indícios de adulteração de quilometragem"
              value={indiciosAdulteracaoKm}
              onChange={setIndiciosAdulteracaoKm}
              maxSoft={500}
            />

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

            <div className="field">
              <label className="label">
                <input
                  type="checkbox"
                  name="situacaoFiscalRegular"
                  checked={situacaoFiscalRegular}
                  onChange={(e) => setSituacaoFiscalRegular(e.target.checked)}
                />{" "}
                Situação fiscal regular (ex.: IUC em dia)
              </label>
            </div>

            <TextareaWithCounter
              id="situacaoFiscalObservacoes"
              name="situacaoFiscalObservacoes"
              label="Observações sobre a situação fiscal"
              value={situacaoFiscalObservacoes}
              onChange={setSituacaoFiscalObservacoes}
              maxSoft={500}
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
        <p className="hint">Nenhum dado ainda.</p>
      </div>

      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}
      {activeTab === TAB_IDS[TAB_IDS.length - 1] ? (
        <button type="submit" className="btn btn-primary">
          Guardar
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={handleNext}>
          Próximo
        </button>
      )}
    </form>
  );
}
