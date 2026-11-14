# Arquivo X - Frontend

Frontend independente para hospedagem estática conectado ao Supabase.

## Desenvolvimento e build

1. Copie `.env.example` para `.env` e preencha a URL do projeto Supabase e a chave publishable.
2. Execute `npm install` e `npm run dev` para desenvolvimento local.
3. Execute `npm run build`; publique o conteúdo de `dist/` em uma hospedagem estática.

Configure no Supabase Authentication as URLs do domínio publicado. Nunca coloque neste projeto a chave service role/secret. O frontend usa a chave publishable; proteja os dados com RLS e a allowlist configurada no Supabase.
