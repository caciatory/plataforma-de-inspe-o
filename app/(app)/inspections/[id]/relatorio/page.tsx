// app/(app)/inspections/[id]/relatorio/page.tsx
import { notFound } from "next/navigation";
import { DM_Sans } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AnaliseTecnica } from "./analise-tecnica";
import "./relatorio.css";

// Fonte exclusiva desta rota (identidade visual dark-glassmorphism) -- nao
// entra em app/layout.tsx, que so carrega Space Grotesk/Inter para o resto da app.
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export default async function RelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) notFound();

  const supabase = await createClient();

  // Select amplo (`*`) na tabela base por necessidade: sem um Database type
  // gerado, um column-list explicito na tabela base faz o postgrest-js
  // inferir os embeds vehicle_data/users como array em vez de objeto unico
  // (~24 erros TS2339) -- mesmo padrao ja usado em
  // app/(app)/inspections/[id]/page.tsx:40. RF-50 continua garantido porque
  // client_data e uma tabela fisicamente separada, nunca embutida aqui.
  const { data: inspection } = await supabase
    .from("inspections")
    .select("*, vehicle_data(*), users(nome, credencial_interna)")
    .eq("id", id)
    .single();

  if (!inspection || inspection.status !== "aprovada") notFound();

  const [
    { data: score },
    { data: fotosCapa },
    { data: groups },
    { data: items },
    { data: responses },
  ] = await Promise.all([
    supabase.from("inspection_score").select("nota_geral, classificacao").eq("inspection_id", id).maybeSingle(),
    supabase
      .from("photos")
      .select("id, url, ordem")
      .eq("inspection_id", id)
      .eq("contexto", "capa")
      .order("ordem")
      .order("criado_em"),
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase
      .from("checklist_item_templates")
      .select("id, group_id, subcategoria, nome, tipo, conjunto_opcao_id"),
    supabase
      .from("checklist_item_responses")
      .select("id, item_template_id, opcao_id, resposta_texto, resposta_data, observacao")
      .eq("inspection_id", id),
  ]);

  const conjuntoIds = Array.from(
    new Set((items ?? []).map((i) => i.conjunto_opcao_id).filter((v): v is string => v !== null))
  );
  const responseIds = (responses ?? []).map((r) => r.id);

  const [{ data: opcoes }, { data: medicaoResultados }, { data: photos }] = await Promise.all([
    conjuntoIds.length > 0
      ? supabase.from("opcoes").select("id, conjunto_id, label, ordem, exige_foto").in("conjunto_id", conjuntoIds)
      : Promise.resolve({ data: [] }),
    responseIds.length > 0
      ? supabase.from("medicoes_resultado").select("item_response_id, resultado").in("item_response_id", responseIds)
      : Promise.resolve({ data: [] }),
    responseIds.length > 0
      ? supabase.from("photos").select("id, url, item_response_id").eq("contexto", "item").in("item_response_id", responseIds)
      : Promise.resolve({ data: [] }),
  ]);

  const vehicle = inspection.vehicle_data;
  const capaUrl = fotosCapa?.[0]?.url ?? null;

  return (
    <main className={`relatorio-page ${dmSans.className}`}>
      <section className="relatorio-hero" style={capaUrl ? { backgroundImage: `url(${capaUrl})` } : undefined}>
        <div className="relatorio-hero__overlay">
          <p className="relatorio-hero__matricula">{vehicle?.matricula}</p>
          <h1 className="relatorio-hero__titulo">
            {vehicle?.marca} {vehicle?.modelo}
          </h1>
          {score && (
            <div className="relatorio-gauge" data-classificacao={score.classificacao}>
              <span className="relatorio-gauge__nota">{score.nota_geral.toFixed(1)}</span>
              <span className="relatorio-gauge__classificacao">Classe {score.classificacao}</span>
            </div>
          )}
          <p className="relatorio-hero__status">Inspeção aprovada</p>
        </div>
      </section>

      <section className="relatorio-section">
        <h2>Especificações do veículo</h2>
        <div className="relatorio-specs-grid">
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Matrícula</span>
            <span className="relatorio-spec-card__valor">{vehicle?.matricula ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Marca</span>
            <span className="relatorio-spec-card__valor">{vehicle?.marca ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Modelo</span>
            <span className="relatorio-spec-card__valor">{vehicle?.modelo ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Versão</span>
            <span className="relatorio-spec-card__valor">{vehicle?.versao_trim ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Ano de fabrico</span>
            <span className="relatorio-spec-card__valor">{vehicle?.ano_fabrico ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Ano do modelo</span>
            <span className="relatorio-spec-card__valor">{vehicle?.ano_modelo ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Cor</span>
            <span className="relatorio-spec-card__valor">{vehicle?.cor ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">VIN</span>
            <span className="relatorio-spec-card__valor">{vehicle?.vin ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Motor</span>
            <span className="relatorio-spec-card__valor">{vehicle?.numero_motor ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Portas</span>
            <span className="relatorio-spec-card__valor">{vehicle?.numero_portas ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Combustível / Caixa</span>
            <span className="relatorio-spec-card__valor">
              {vehicle?.combustivel ?? "—"} / {vehicle?.caixa_velocidades ?? "—"}
            </span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Quilometragem</span>
            <span className="relatorio-spec-card__valor">
              {vehicle?.quilometragem != null ? `${vehicle.quilometragem} km` : "—"}
            </span>
          </div>
        </div>
      </section>

      {inspection.parceiro_nome && (
        <section className="relatorio-section relatorio-parceiro">
          {inspection.parceiro_logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inspection.parceiro_logo_url} alt={inspection.parceiro_nome} className="relatorio-parceiro__logo" />
          )}
          <span className="relatorio-parceiro__nome">{inspection.parceiro_nome}</span>
          {inspection.parceiro_telefone && (
            <a
              href={`https://wa.me/${inspection.parceiro_telefone.replace(/\D/g, "")}`}
              className="relatorio-parceiro__whatsapp"
              target="_blank"
              rel="noreferrer"
            >
              Falar no WhatsApp
            </a>
          )}
        </section>
      )}

      <AnaliseTecnica
        groups={groups ?? []}
        items={items ?? []}
        responses={responses ?? []}
        opcoes={opcoes ?? []}
        medicaoResultados={medicaoResultados ?? []}
        photos={photos ?? []}
      />

      <section className="relatorio-section relatorio-veredito">
        <h2>Selo de Qualidade Check Auto</h2>
        {score && (
          <div className="relatorio-veredito__gauge" data-classificacao={score.classificacao}>
            <span className="relatorio-veredito__nota">{score.nota_geral.toFixed(1)}</span>
            <span>Pontuação final</span>
          </div>
        )}
        <div className="relatorio-veredito__badges">
          <span className="relatorio-badge relatorio-badge--selo">Estado avaliado</span>
          <span className="relatorio-badge relatorio-badge--garantia">Elegível para Garantia</span>
        </div>
        <p className="relatorio-veredito__assinatura">
          {inspection.users?.nome}
          {inspection.users?.credencial_interna ? `, ${inspection.users.credencial_interna}` : ""}
        </p>
      </section>

      <footer className="relatorio-footer">
        <p>
          Técnico responsável: {inspection.users?.nome}
          {inspection.users?.credencial_interna ? ` (${inspection.users.credencial_interna})` : ""}
        </p>
        {inspection.codigo_certificado && (
          <p>
            Certificado {inspection.codigo_certificado}
            {inspection.certificado_emitido_em &&
              ` — emitido em ${new Date(inspection.certificado_emitido_em).toLocaleDateString("pt-PT")}`}
          </p>
        )}
      </footer>
    </main>
  );
}
