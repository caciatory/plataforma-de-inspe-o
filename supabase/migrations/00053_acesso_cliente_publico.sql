-- supabase/migrations/00053_acesso_cliente_publico.sql
-- Fase 7 (acesso do cliente): docs/superpowers/specs/2026-08-14-acesso-cliente-design.md
-- RF-54 a RF-56. email deixa de ser obrigatorio (decisao do usuario: so a
-- origem e capturada). client_access_logs tinha RLS ligada desde a
-- migration 00010 sem nenhuma policy (bloqueio total) -- essas sao as
-- policies prometidas la. get_relatorio_publico e o unico ponto de acesso
-- anonimo aos dados do relatorio: nenhuma outra tabela ganha policy pro
-- papel anon. security definer + search_path vazio (mesmo padrao das
-- outras funcoes do projeto) + toda referencia de tabela/coluna totalmente
-- qualificada. Nunca seleciona client_data -- garantia estrutural do RF-50
-- aplicada aqui na origem dos dados, nao so na camada de apresentacao.

alter table public.client_access_logs alter column email drop not null;

create policy client_access_logs_insert on public.client_access_logs
  for insert to anon, authenticated
  with check (true);

create policy client_access_logs_select on public.client_access_logs
  for select to authenticated
  using (public.is_admin());

create function public.get_relatorio_publico(p_codigo text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_result jsonb;
begin
  select id into v_id
  from public.inspections
  where codigo_certificado = upper(p_codigo) and status = 'aprovada';

  if v_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'inspection_id', v_id,
    'inspection', (
      select jsonb_build_object(
        'codigo_certificado', i.codigo_certificado,
        'certificado_emitido_em', i.certificado_emitido_em,
        'parceiro_nome', i.parceiro_nome,
        'parceiro_logo_url', i.parceiro_logo_url,
        'parceiro_telefone', i.parceiro_telefone,
        'data_finalizacao', i.data_finalizacao,
        'data_abertura', i.data_abertura,
        'tecnico_nome', u.nome,
        'tecnico_credencial', u.credencial_interna
      )
      from public.inspections i
      join public.users u on u.id = i.tecnico_id
      where i.id = v_id
    ),
    'vehicle', (
      select to_jsonb(vd) - 'inspection_id'
      from public.vehicle_data vd
      where vd.inspection_id = v_id
    ),
    'score', (
      select jsonb_build_object('nota_geral', s.nota_geral, 'classificacao', s.classificacao)
      from public.inspection_score s
      where s.inspection_id = v_id
    ),
    'fotos_capa', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url) order by p.ordem, p.criado_em), '[]'::jsonb)
      from public.photos p
      where p.inspection_id = v_id and p.contexto = 'capa'
    ),
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'ordem', g.ordem, 'nome', g.nome)), '[]'::jsonb)
      from public.checklist_group_templates g
      where g.ativo = true
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', it.id, 'group_id', it.group_id, 'subcategoria', it.subcategoria,
        'nome', it.nome, 'tipo', it.tipo, 'conjunto_opcao_id', it.conjunto_opcao_id
      )), '[]'::jsonb)
      from public.checklist_item_templates it
    ),
    'responses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'item_template_id', r.item_template_id, 'opcao_id', r.opcao_id,
        'resposta_texto', r.resposta_texto, 'resposta_data', r.resposta_data, 'observacao', r.observacao
      )), '[]'::jsonb)
      from public.checklist_item_responses r
      where r.inspection_id = v_id
    ),
    'opcoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'conjunto_id', o.conjunto_id, 'label', o.label, 'ordem', o.ordem, 'exige_foto', o.exige_foto
      )), '[]'::jsonb)
      from public.opcoes o
    ),
    'medicao_resultados', (
      select coalesce(jsonb_agg(jsonb_build_object('item_response_id', mr.item_response_id, 'resultado', mr.resultado)), '[]'::jsonb)
      from public.medicoes_resultado mr
      join public.checklist_item_responses r on r.id = mr.item_response_id
      where r.inspection_id = v_id
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url, 'item_response_id', p.item_response_id)), '[]'::jsonb)
      from public.photos p
      join public.checklist_item_responses r on r.id = p.item_response_id
      where r.inspection_id = v_id and p.contexto = 'item'
    ),
    'equipamentos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'categoria', e.categoria, 'nome_equipamento', e.nome_equipamento,
        'condicao', e.condicao, 'comentario', e.comentario, 'ordem', e.ordem
      ) order by e.ordem), '[]'::jsonb)
      from public.equipamento_inspecao e
      where e.inspection_id = v_id
    ),
    'equipamento_fotos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', ef.id, 'url', ef.url, 'equipamento_inspecao_id', ef.equipamento_inspecao_id)), '[]'::jsonb)
      from public.equipamento_fotos ef
      where ef.inspection_id = v_id
    )
  ) into v_result;

  return v_result;
end;
$$;
