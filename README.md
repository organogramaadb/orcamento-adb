# Sistema de Controle Orçamentário — Amigos do Bem

SPA em HTML + Vanilla JS com Supabase (banco + auth) e GitHub Pages (hospedagem).

---

## Setup Completo

### 1. Supabase

1. Acesse [app.supabase.com](https://app.supabase.com) e crie um novo projeto
2. Anote a **Project URL** e a **anon/public key** (Settings → API)
3. Vá em **SQL Editor** e execute todo o conteúdo de `supabase/schema.sql`
4. Vá em **Authentication → Providers → Email** e certifique-se que **Enable Email provider** e **Enable Magic Links** estão ativos

### 2. Configurar credenciais locais

Edite o arquivo `config.js` (NÃO commitá-lo):

```js
const SUPABASE_URL = 'https://SEUPROJETO.supabase.co';
const SUPABASE_KEY = 'sua_anon_key_aqui';
```

### 3. Primeiro usuário MASTER

Execute no SQL Editor do Supabase (substitua o e-mail):

```sql
INSERT INTO usuarios_responsaveis (email, nome, nivel_acesso)
VALUES ('seu@email.com', 'Seu Nome', 'MASTER')
ON CONFLICT (email) DO NOTHING;
```

### 4. Importar dados

Importe os CSVs de centros de custo e naturezas via **Table Editor → Import data** no Supabase,
ou use os INSERTs já incluídos no `schema.sql`.

### 5. GitHub Pages

1. Crie um repositório no GitHub (pode ser privado)
2. Faça push de todos os arquivos **exceto `config.js`** (ele está no `.gitignore`)
3. Settings → Pages → Source: `main` branch, pasta `/`
4. O site estará em `https://SEU_USER.github.io/SEU_REPO/`

> **Atenção:** Para hospedar com `config.js` no GitHub Pages (repositório privado não serve),
> substitua os valores em `config.js` diretamente e não exponha o arquivo em repositório público.

---

## Níveis de Acesso

| Nível     | O que vê                  | Pode editar        |
|-----------|---------------------------|--------------------|
| MASTER    | Tudo                      | Sempre             |
| DIRETORIA | Apenas sua diretoria      | Dentro do prazo    |
| GESTOR    | Apenas seu centro de custo| Dentro do prazo    |

---

## Integração futura com ERP

A tabela `realizado` possui os campos `erp_id` e `fonte` prontos para receber dados via API:

```
POST /functions/v1/import-erp-realizado
{
  "erp_id": "TXN-001",
  "exercicio": 2025,
  "mes": 6,
  "centro_custo_codigo": "3",
  "natureza_codigo": "000060",
  "valor": 1500.00,
  "documento": "NF-123",
  "descricao": "Fornecedor XYZ"
}
```

---

## E-mails automáticos (Supabase Edge Functions)

Após o deploy inicial, configure as Edge Functions `notify-alerta-orcamento` e `notify-solicitacao`
integradas ao serviço [Resend](https://resend.com) para envio automático de alertas orçamentários.

---

*Projeto: Amigos do Bem — Controladoria Gerencial | 2025*
