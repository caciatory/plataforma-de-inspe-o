"use client";

import { useState } from "react";
import { registrarAcessoAction, type OrigemAcesso } from "./actions";
import { RelatorioConteudo, dmSans, type RelatorioDados } from "@/components/relatorio/relatorio-conteudo";

const OPCOES_ORIGEM: { value: OrigemAcesso; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "stand", label: "Stand / Loja física" },
  { value: "indicacao", label: "Indicação" },
  { value: "redes_sociais", label: "Redes sociais" },
  { value: "outro", label: "Outro" },
];

export function RelatorioGate({ codigo }: { codigo: string }) {
  const [estado, setEstado] = useState<"gate" | "carregando" | "erro">("gate");
  const [dados, setDados] = useState<RelatorioDados | null>(null);

  async function onEscolherOrigem(origem: OrigemAcesso) {
    setEstado("carregando");
    const resultado = await registrarAcessoAction(codigo, origem);
    if (resultado.status === "erro") {
      setEstado("erro");
      return;
    }
    setDados(resultado.dados);
  }

  if (dados) return <RelatorioConteudo dados={dados} />;

  return (
    <main className={`relatorio-page relatorio-gate-page ${dmSans.className}`}>
      <div className="relatorio-gate glass">
        <h1>Ver relatório</h1>
        {estado === "erro" ? (
          <p role="alert" className="relatorio-gate__erro">
            Relatório não encontrado.
          </p>
        ) : (
          <>
            <p>De onde você está vindo?</p>
            <div className="relatorio-gate__opcoes">
              {OPCOES_ORIGEM.map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  className="relatorio-gate__opcao"
                  disabled={estado === "carregando"}
                  onClick={() => onEscolherOrigem(opcao.value)}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
