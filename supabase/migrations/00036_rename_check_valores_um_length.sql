-- supabase/migrations/00036_rename_check_valores_um_length.sql
-- Fix pos-review (final): a migration 00030 renomeou tudo do vocabulario
-- paint-era pra medicoes (paint_measurements->medicoes, valores_um->valores,
-- trigger medicoes_valores_length), mas a funcao por tras do trigger ficou
-- com o nome antigo check_valores_um_length. RENAME nao muda o OID da
-- funcao, entao o trigger medicoes_valores_length (que referencia a funcao
-- por OID, nao por nome) continua funcionando sem precisar ser recriado.

alter function public.check_valores_um_length() rename to check_medicoes_valores_length;
