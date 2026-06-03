# Prompt Mestre — Sistema de Acompanhamento e Controle Orçamentário (Amigos do Bem)


## Contexto Geral

Você é um desenvolvedor Full Stack Sênior contratado para construir do zero um **Sistema Web de Controle Orçamentário** para a organização Amigos do Bem. A ferramenta é uma **Single Page Application (SPA)** em HTML + Vanilla JavaScript, hospedada no **GitHub Pages**, com banco de dados e autenticação via **Supabase**. Toda a comunicação com o banco de dados usa o **Supabase JS Client v2 via CDN** — sem build tools, sem npm, sem Node.js. O estilo visual é feito com **Tailwind CSS via CDN** e os gráficos com **Chart.js via CDN**.

Este documento é a especificação completa. Leia tudo antes de escrever qualquer código. Siga cada detalhe à risca.

---

## 1. Estrutura de Pastas do Repositório

```
orcamento-adb/
├── index.html          ← SPA principal (toda a aplicação)
├── config.js           ← Credenciais do Supabase (SUPABASE_URL e SUPABASE_ANON_KEY)
├── app.js              ← Toda a lógica JavaScript
├── style.css           ← Estilos customizados (complementa Tailwind)
├── supabase/
│   └── schema.sql      ← Script completo de criação das tabelas, RLS e funções
├── README.md           ← Instruções de setup (Supabase + GitHub Pages)
└── .gitignore
```

---

## 2. Banco de Dados — Supabase (PostgreSQL)

### 2.1 Tabelas

Execute todo o `schema.sql` no **SQL Editor do Supabase** antes de publicar a aplicação. O script deve criar as tabelas a seguir, habilitar RLS em todas elas e criar todas as políticas de acesso.

---

#### Tabela `centros_custo`
Importada da planilha `CTR 001.085 - Centros de custos.xlsx`, aba **CENTRO DE CUSTO**.

```sql
CREATE TABLE centros_custo (
  id            SERIAL PRIMARY KEY,
  codigo        TEXT NOT NULL UNIQUE,       -- ex: "3", "7", "200"
  unidade       TEXT,                       -- ex: "SP", "CEARA", "ATIMBA"
  pilar         TEXT,                       -- ex: "ADMINISTRAÇÃO", "PROGRAMAS SOCIAIS"
  grupo         TEXT,                       -- ex: "ADMINISTRAÇÃO CENTRAL", "FINANCEIRO", "MARKETING", "CENTRO DE TRANSFORMAÇÃO", "CENTRO EDUCACIONAL"
  nome          TEXT NOT NULL,              -- ex: "Administração Central - SP"
  responsavel   TEXT,                       -- ex: "Ubiratan Pais"
  diretoria     TEXT,                       -- ex: "Fernando Medeiros"
  objetivo      TEXT,
  ativo         BOOLEAN DEFAULT TRUE
);
```

**Hierarquia de agrupamento (drill-down no dashboard):**
Nível 1 → `pilar` | Nível 2 → `grupo` | Nível 3 → `nome` (centro de custo individual)

---

#### Tabela `naturezas`
Importada da planilha `CTR 001.085 - Centros de custos.xlsx`, aba **NATUREZAS**.

```sql
CREATE TABLE naturezas (
  id                SERIAL PRIMARY KEY,
  nl_classificacao  TEXT NOT NULL UNIQUE,  -- ex: "001", "001.001", "001.001.001-CTA"
  nivel             INT GENERATED ALWAYS AS (
                      array_length(string_to_array(
                        replace(nl_classificacao, '-CTA',''), '.'), 1)
                    ) STORED,              -- 1=grupo, 2=subgrupo, 3=conta
  eh_conta          BOOLEAN GENERATED ALWAYS AS (
                      nl_classificacao LIKE '%-CTA'
                    ) STORED,
  descricao         TEXT NOT NULL,         -- ex: "COLABORAÇÃO MENSAL"
  codigo            TEXT,                  -- ex: "000227"
  descricao2        TEXT,
  objetivo          TEXT,
  tipo              TEXT CHECK (tipo IN ('RECEITA','DESPESA')),
  ativo             BOOLEAN DEFAULT TRUE
);
```

**Hierarquia:** Nível 1 → grupo (ex: `001` RECEITAS) | Nível 2 → subgrupo | Nível 3 → conta (sufixo `-CTA`)

---

#### Tabela `aplicacoes`
Importada da aba **APLICAÇÕES**.

```sql
CREATE TABLE aplicacoes (
  id      SERIAL PRIMARY KEY,
  nome    TEXT NOT NULL,   -- ex: "OBRAS - Casa do Mel - CAT"
  codigo  TEXT UNIQUE,     -- ex: "00208"
  ativo   BOOLEAN DEFAULT TRUE
);
```

---

#### Tabela `usuarios_responsaveis`
Vincula o e-mail (autenticado pelo Supabase Auth) ao centro de custo e ao nível de acesso.

```sql
CREATE TABLE usuarios_responsaveis (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  nome             TEXT,
  nivel_acesso     TEXT NOT NULL CHECK (nivel_acesso IN ('MASTER','DIRETORIA','GESTOR')),
  centro_custo_id  INT REFERENCES centros_custo(id),  -- NULL para MASTER e DIRETORIA
  diretoria        TEXT,                               -- preenchido para DIRETORIA (filtra por diretoria)
  auth_user_id     UUID REFERENCES auth.users(id)     -- preenchido após primeiro login
);
```

**Regras de acesso:**
- `MASTER`: vê e edita tudo, sem restrição de tempo
- `DIRETORIA`: vê todos os centros de custo onde `centros_custo.diretoria = usuarios_responsaveis.diretoria`
- `GESTOR`: vê apenas o seu `centro_custo_id`

---

#### Tabela `config_sistema`
Configurações globais editáveis pelo MASTER.

```sql
CREATE TABLE config_sistema (
  id                    INT PRIMARY KEY DEFAULT 1,
  data_limite_edicao    DATE,           -- gestores não podem editar após esta data
  exercicio_atual       INT,            -- ex: 2025
  perc_alerta_amarelo   INT DEFAULT 80, -- % de uso que dispara alerta amarelo
  perc_alerta_vermelho  INT DEFAULT 100 -- % de uso que dispara alerta vermelho
);

INSERT INTO config_sistema (id, exercicio_atual) VALUES (1, 2025);
```

---

#### Tabela `orcamentos`
Coração do sistema. Um registro por centro de custo + natureza + aplicação + mês.

```sql
CREATE TABLE orcamentos (
  id               SERIAL PRIMARY KEY,
  exercicio        INT NOT NULL,          -- ex: 2025
  mes              INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  centro_custo_id  INT NOT NULL REFERENCES centros_custo(id),
  natureza_id      INT NOT NULL REFERENCES naturezas(id),
  aplicacao_id     INT REFERENCES aplicacoes(id),
  valor_planejado  NUMERIC(15,2) DEFAULT 0,
  valor_revisado   NUMERIC(15,2),         -- revisão aprovada pelo MASTER
  observacao       TEXT,
  criado_em        TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ DEFAULT NOW(),
  atualizado_por   TEXT,
  UNIQUE (exercicio, mes, centro_custo_id, natureza_id, aplicacao_id)
);
```

---

#### Tabela `realizado`
Valores efetivamente realizados. Alimentados manualmente ou via API do ERP no futuro.

```sql
CREATE TABLE realizado (
  id               SERIAL PRIMARY KEY,
  exercicio        INT NOT NULL,
  mes              INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  centro_custo_id  INT NOT NULL REFERENCES centros_custo(id),
  natureza_id      INT NOT NULL REFERENCES naturezas(id),
  aplicacao_id     INT REFERENCES aplicacoes(id),
  valor_realizado  NUMERIC(15,2) NOT NULL DEFAULT 0,
  documento        TEXT,            -- número do documento/NF/ERP
  descricao        TEXT,
  fonte            TEXT DEFAULT 'MANUAL' CHECK (fonte IN ('MANUAL','ERP','IMPORT')),
  erp_id           TEXT,            -- ID da transação no ERP (para futura integração)
  criado_em        TIMESTAMPTZ DEFAULT NOW(),
  criado_por       TEXT
);
```

---

#### Tabela `solicitacoes_revisao`
Fluxo de pedido de aumento orçamentário pelo gestor.

```sql
CREATE TABLE solicitacoes_revisao (
  id               SERIAL PRIMARY KEY,
  centro_custo_id  INT NOT NULL REFERENCES centros_custo(id),
  natureza_id      INT NOT NULL REFERENCES naturezas(id),
  aplicacao_id     INT REFERENCES aplicacoes(id),
  exercicio        INT NOT NULL,
  mes              INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_atual      NUMERIC(15,2),
  valor_solicitado NUMERIC(15,2) NOT NULL,
  justificativa    TEXT NOT NULL,
  status           TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','APROVADA','REJEITADA')),
  solicitado_por   TEXT,
  solicitado_em    TIMESTAMPTZ DEFAULT NOW(),
  analisado_por    TEXT,
  analisado_em     TIMESTAMPTZ,
  comentario_resp  TEXT
);
```

---

### 2.2 Row Level Security (RLS)

Habilite RLS em todas as tabelas. Crie as políticas a seguir.

```sql
-- Habilitar RLS
ALTER TABLE orcamentos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE realizado           ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_revisao ENABLE ROW LEVEL SECURITY;
ALTER TABLE centros_custo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE naturezas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE aplicacoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_sistema      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_responsaveis ENABLE ROW LEVEL SECURITY;
```

**Função auxiliar (crie uma function no Supabase):**
```sql
CREATE OR REPLACE FUNCTION get_my_access()
RETURNS TABLE(nivel TEXT, centro_custo_id INT, diretoria TEXT) AS $$
  SELECT nivel_acesso, centro_custo_id, diretoria
  FROM usuarios_responsaveis
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;
```

**Políticas para `orcamentos` (SELECT):**
```sql
CREATE POLICY "orcamento_select" ON orcamentos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM get_my_access() a WHERE
      a.nivel = 'MASTER' OR
      a.nivel = 'DIRETORIA' OR
      (a.nivel = 'GESTOR' AND orcamentos.centro_custo_id = a.centro_custo_id)
  )
);
```

**Políticas para `orcamentos` (INSERT/UPDATE):**
```sql
CREATE POLICY "orcamento_write" ON orcamentos FOR ALL USING (
  EXISTS (
    SELECT 1 FROM get_my_access() a
    JOIN config_sistema c ON c.id = 1
    WHERE
      a.nivel = 'MASTER' OR
      (
        (a.nivel IN ('DIRETORIA','GESTOR')) AND
        (c.data_limite_edicao IS NULL OR CURRENT_DATE <= c.data_limite_edicao)
      )
  )
);
```

Aplique políticas semelhantes nas tabelas `realizado` e `solicitacoes_revisao` seguindo o mesmo padrão de filtragem por nível de acesso.

**Tabelas de lookup (`centros_custo`, `naturezas`, `aplicacoes`, `config_sistema`):** SELECT público para usuários autenticados; INSERT/UPDATE/DELETE apenas para MASTER.

---

### 2.3 Trigger de atualização automática

```sql
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orcamentos_updated
  BEFORE UPDATE ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
```

---

## 3. Autenticação

Use **Supabase Auth com Magic Link (e-mail)**. Não use senha. O fluxo é:

1. Usuário informa o e-mail na tela de login.
2. Sistema chama `supabase.auth.signInWithOtp({ email })`.
3. Usuário recebe link mágico por e-mail e clica para autenticar.
4. Após autenticação, o sistema busca o perfil na tabela `usuarios_responsaveis` usando `auth.uid()`.
5. Se não encontrar o perfil, exibe mensagem: *"Seu e-mail não está cadastrado. Solicite acesso ao administrador."*
6. Se encontrar, salva o perfil no `localStorage` e redireciona para a tela inicial.

**No primeiro login de cada usuário:** execute um `UPDATE usuarios_responsaveis SET auth_user_id = auth.uid() WHERE email = user.email` para vincular o `auth_user_id`.

---

## 4. Interface — Estrutura Geral

A aplicação é uma SPA com um **menu lateral fixo** (sidebar) e uma **área de conteúdo principal** à direita. No mobile, o menu vira um drawer com hamburger button.

### 4.1 Header

- Logo Amigos do Bem (PNG na pasta `/assets/`)
- Nome do usuário logado e seu centro de custo
- Botão de logout
- Indicador do exercício atual (ex: "Orçamento 2025")

### 4.2 Menu Lateral

```
[ícone] Dashboard               ← tela inicial (padrão ao entrar)
[ícone] Input Orçamentário      ← inserir/editar orçamento planejado
[ícone] Lançar Realizado        ← registrar valores realizados
[ícone] Apresentação            ← resumo executivo com gráficos
[ícone] Projeções               ← projeção 24 meses

── Ações ──
[ícone] Solicitar Revisão       ← botão secundário (menor, cor diferente)
[ícone] Minhas Solicitações     ← histórico de pedidos do gestor

── Admin (visível apenas para MASTER) ──
[ícone] Gestão de Usuários
[ícone] Configurações
[ícone] Aprovação de Revisões
```

---

## 5. Tela 1 — Dashboard (Acompanhamento)

**Esta é a tela inicial após o login.** O princípio é: **do macro para o micro** (drill-down progressivo).

### 5.1 Cabeçalho da tela

- Filtros rápidos: **Exercício** (ano), **Período** (mês ou acumulado Jan–mês atual)
- Para MASTER/DIRETORIA: filtro adicional de **Pilar** e **Unidade**

### 5.2 Cartões de KPI (topo)

Quatro cartões horizontais:
1. **Total Orçado** (soma do planejado no período)
2. **Total Realizado** (soma do realizado no período)
3. **% de Uso** (realizado / orçado × 100) com cor: verde < 80%, amarelo 80–99%, vermelho ≥ 100%
4. **Saldo Disponível** (orçado − realizado)

### 5.3 Tabela de Drill-Down

A tabela começa **colapsada no Nível 1** (Pilares). Cada linha tem um botão `▶` para expandir.

**Nível 1 — Pilares** (ex: ADMINISTRAÇÃO, PROGRAMAS SOCIAIS)
- Colunas: Pilar | Orçado | Realizado | % Uso | Saldo | [▶ expandir]

**Nível 2 — Grupos** (ex: FINANCEIRO, MARKETING, CENTRO DE TRANSFORMAÇÃO)
- Indentado 1 nível. Mesmo conjunto de colunas.

**Nível 3 — Centros de Custo individuais**
- Indentado 2 níveis. Link clicável que abre o painel lateral de detalhes do CC.

**Painel de detalhes do CC** (abre como um drawer lateral ou modal):
- Tabela de Naturezas do CC com Orçado × Realizado × % Uso
- Gráfico de barras mensal (evolução do ano)
- Botão "Editar Orçamento" (se dentro do prazo e for o responsável)

### 5.4 Gráfico de Barras Agrupadas

Abaixo da tabela: gráfico Chart.js mostrando **Orçado vs Realizado** por mês (Jan–Dez). Para GESTOR mostra apenas seu CC; para MASTER/DIRETORIA mostra o consolidado filtrado.

### 5.5 Alertas Visuais

Linhas da tabela com `% Uso ≥ 100%` ficam com fundo vermelho claro. Entre 80–99%, fundo amarelo claro. Tooltip com o valor absoluto do desvio.

---

## 6. Tela 2 — Input Orçamentário

### 6.1 Controle de Acesso

- Se `CURRENT_DATE > config_sistema.data_limite_edicao` AND `nivel != 'MASTER'`: exibe banner vermelho *"Período de edição encerrado em [data]. Contate o administrador."* e desabilita todos os campos.
- MASTER sempre pode editar.

### 6.2 Formulário

**Filtros de contexto** (topo):
- Exercício | Centro de Custo (pré-selecionado para GESTOR; dropdown para MASTER/DIRETORIA) | Natureza (hierarquia, filtrada por tipo: RECEITA ou DESPESA) | Aplicação (opcional) | Mês

**Tabela de lançamento:**

| Mês | Valor Planejado | Observação | Ações |
|-----|----------------|------------|-------|
| Janeiro | [campo numérico] | [texto livre] | [Salvar] [Limpar] |
| Fevereiro | ... | ... | ... |
| ... | | | |
| **Total** | **[soma automática]** | | |

- Ao digitar num campo, o total é atualizado em tempo real (JavaScript puro, sem chamar o banco).
- Botão **"Salvar Todos"** faz um `upsert` em massa na tabela `orcamentos`.
- Botão **"Importar do Exercício Anterior"** copia os valores do exercício (ano − 1) para o exercício atual como rascunho.

---

## 7. Tela 3 — Lançar Realizado

Idêntica em estrutura ao Input Orçamentário, mas grava na tabela `realizado`. Campos adicionais: **Documento** (NF/protocolo), **Fonte** (MANUAL por padrão). Visível para MASTER e DIRETORIA; o GESTOR pode ver mas não editar (o realizado é gerenciado pela Controladoria).

---

## 8. Tela 4 — Apresentação

Resumo executivo. Focado em visualização, sem edição.

- **Gráfico de Pizza**: distribuição do orçado por Pilar
- **Gráfico de Linha**: evolução mensal do realizado vs orçado (acumulado)
- **Tabela Resumo por Pilar**: Orçado Anual | Realizado Até Agora | % Executado | Projeção de Encerramento
- **Top 5 Centros de Custo** com maior desvio (realizado > orçado)
- Botão **"Exportar PDF"** (usa `window.print()` com CSS de impressão dedicado)

Para GESTOR: exibe apenas os dados do seu CC. Para DIRETORIA: apenas a sua diretoria. Para MASTER: visão geral consolidada.

---

## 9. Tela 5 — Projeções (24 Meses)

### 9.1 Lógica de Cálculo

A projeção para os meses futuros é calculada assim:

1. **Meses passados com realizado**: usa o valor realizado.
2. **Mês atual**: usa o realizado disponível + projeção do saldo.
3. **Meses futuros (sem orçamento cadastrado)**: usa a **média dos últimos 3 meses realizados** como base.
4. **Meses futuros com orçamento cadastrado**: usa o valor orçado.
5. **Aplicação de fator de ajuste**: o usuário pode informar um **% de crescimento anual** (campo editável) que é aplicado ao Ano 2 da projeção.

### 9.2 Interface

- Seletor de **Centro de Custo** (MASTER/DIRETORIA veem todos; GESTOR só o seu)
- Campo **"% ajuste Ano 2"** com valor padrão de IPCA (editável)
- Tabela com 24 colunas de meses (scrollável horizontalmente)
- Linha de total por natureza + linha de total geral
- Gráfico de linha sobrepondo **Realizado Histórico**, **Orçado**, **Projeção Ano 1** e **Projeção Ano 2**
- Botão **"Exportar Excel"** (gera CSV para download)

---

## 10. Tela 6 — Solicitar Revisão Orçamentária

Acessada pelo botão secundário no menu lateral.

### 10.1 Formulário de Solicitação

- Centro de Custo (pré-selecionado para GESTOR)
- Natureza
- Aplicação (opcional)
- Mês e Exercício
- Valor Atual (buscado automaticamente do banco)
- **Valor Solicitado** (novo valor desejado)
- **Justificativa** (obrigatório, mínimo 50 caracteres)
- Botão **"Enviar Solicitação"** → grava em `solicitacoes_revisao` com status `PENDENTE`

Após envio, o sistema dispara um e-mail de notificação via **Supabase Edge Function** (veja seção 12).

### 10.2 Painel "Minhas Solicitações"

Tabela com histórico de todas as solicitações do usuário logado, com badge de status colorido (PENDENTE=amarelo, APROVADA=verde, REJEITADA=vermelho).

---

## 11. Tela 7 — Aprovação de Revisões (apenas MASTER)

Lista todas as solicitações `PENDENTE`. Para cada uma:
- Ver o contexto (CC, natureza, valor atual vs solicitado, justificativa)
- Botões **"Aprovar"** e **"Rejeitar"** com campo de comentário obrigatório
- Ao aprovar: atualiza `solicitacoes_revisao.status = 'APROVADA'` E faz o `upsert` no valor do orçamento correspondente na tabela `orcamentos`
- Ao rejeitar: só atualiza o status e salva o comentário
- Dispara e-mail de retorno ao solicitante via Edge Function

---

## 12. Tela 8 — Gestão de Usuários (apenas MASTER)

CRUD completo da tabela `usuarios_responsaveis`:
- Listar todos os usuários com badge de nível de acesso
- Criar novo usuário (e-mail, nome, nível, centro de custo)
- Editar usuário existente
- Desativar (não deletar)

---

## 13. Tela 9 — Configurações do Sistema (apenas MASTER)

Formulário para editar `config_sistema`:
- **Data Limite de Edição**: date picker — ao salvar, exibe preview da mensagem que gestores verão
- **Exercício Atual**: número do ano
- **% Alerta Amarelo**: campo numérico (padrão 80)
- **% Alerta Vermelho**: campo numérico (padrão 100)

---

## 14. Automação de E-mails — Supabase Edge Functions

Crie **duas Edge Functions** no Supabase (TypeScript) integradas com o serviço **Resend** (`https://api.resend.com`):

### 14.1 `notify-alerta-orcamento`

**Trigger:** chamada via `pg_cron` a cada dia às 8h (ou via Database Webhook ao inserir em `realizado`).

**Lógica:**
```
Para cada CC ativo:
  calcular % uso = SUM(realizado) / SUM(orcado) no mês atual
  SE % uso >= perc_alerta_vermelho:
    enviar e-mail para o responsável do CC com assunto "🔴 Orçamento Estourado"
  SENÃO SE % uso >= perc_alerta_amarelo:
    enviar e-mail para o responsável com assunto "🟡 Orçamento em Alerta"
```

**Corpo do e-mail deve conter:**
- Nome do responsável
- Nome do Centro de Custo
- Mês/Exercício de referência
- Valor Orçado no mês
- Valor Realizado no mês
- % de uso em destaque
- Link direto para o sistema

### 14.2 `notify-solicitacao`

**Trigger:** chamada pelo front-end após INSERT em `solicitacoes_revisao`.

**Envia dois e-mails:**
1. Para o MASTER (todos com `nivel_acesso = 'MASTER'`): nova solicitação pendente de aprovação
2. Para o solicitante: confirmação de recebimento

Ao aprovar/rejeitar, chame essa mesma function com um tipo diferente para notificar o resultado ao gestor.

---

## 15. Integração Futura com ERP

A tabela `realizado` já possui os campos `erp_id` e `fonte` preparados para receber dados via API externa. Documente no `README.md` o endpoint necessário:

```
POST /functions/v1/import-erp-realizado
Body: {
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

O sistema deve mapear `centro_custo_codigo` e `natureza_codigo` para os IDs internos via SELECT antes de inserir.

---

## 16. Detalhes de Implementação Frontend

### 16.1 Roteamento

Use `window.location.hash` para navegação entre telas:
- `#dashboard`, `#input`, `#realizado`, `#apresentacao`, `#projecoes`, `#revisao`, `#minhas-solicitacoes`, `#aprovacoes`, `#usuarios`, `#configuracoes`

### 16.2 Estado Global

Mantenha um objeto global `App.state` com:
```js
{
  user: null,           // dados do usuário logado
  perfil: null,         // linha de usuarios_responsaveis
  exercicio: 2025,      // exercício selecionado
  mes: new Date().getMonth() + 1,
  config: null          // linha de config_sistema
}
```

### 16.3 Cache

Após o login, carregue e armazene em memória (`App.cache`):
- Lista de `centros_custo`
- Lista de `naturezas`
- Lista de `aplicacoes`

Esses dados não mudam com frequência e evitam queries repetidas.

### 16.4 Formatação

- Todos os valores monetários: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- Datas: `toLocaleDateString('pt-BR')`
- Percentuais: `(valor).toFixed(1) + '%'`

### 16.5 Responsividade

A aplicação deve funcionar em telas a partir de 1024px (desktop/tablet landscape). Mobile não é prioridade, mas o layout não deve quebrar em telas menores — use scroll horizontal onde necessário.

---

## 17. Cores e Visual

Siga a identidade visual da Amigos do Bem:
- **Cor primária**: `#E63329` (vermelho ADB)
- **Cor secundária**: `#F5A623` (laranja/amarelo)
- **Fundo sidebar**: `#1F2937` (cinza escuro / Tailwind gray-800)
- **Fundo conteúdo**: `#F9FAFB` (cinza claro / Tailwind gray-50)
- **Texto principal**: `#111827` (Tailwind gray-900)
- **Cards**: branco com `shadow-sm` e `rounded-lg`
- **Fonte**: Inter (Google Fonts via CDN)

---

## 18. README.md — Instruções de Setup

O README deve guiar passo a passo:

1. **Criar projeto no Supabase** (free tier)
2. **Executar o `supabase/schema.sql`** no SQL Editor
3. **Habilitar Magic Link** em Authentication → Providers → Email
4. **Copiar URL e Anon Key** do projeto para `config.js`
5. **Habilitar a Edge Function** `notify-alerta-orcamento` e configurar o Resend API Key
6. **Criar o repositório no GitHub** e habilitar GitHub Pages (branch `main`, pasta `/`)
7. **Criar o primeiro usuário MASTER** diretamente via SQL:
   ```sql
   INSERT INTO usuarios_responsaveis (email, nome, nivel_acesso)
   VALUES ('admin@amigosdobem.org', 'Administrador', 'MASTER');
   ```
8. **Popular as tabelas** `centros_custo`, `naturezas` e `aplicacoes` via CSV import no Supabase

---

## 19. Dados Iniciais para Importação

Ao criar o `schema.sql`, inclua também um bloco de `INSERT` com os centros de custo e naturezas extraídos da planilha. Os dados principais são:

### Pilares dos Centros de Custo
- **ADMINISTRAÇÃO**: grupos → ADMINISTRAÇÃO CENTRAL, FINANCEIRO, INFORMÁTICA, MARKETING
- **PROGRAMAS SOCIAIS**: grupos → CENTRO DE TRANSFORMAÇÃO, CENTRO EDUCACIONAL

### Exemplo de Centros de Custo
```sql
INSERT INTO centros_custo (codigo, unidade, pilar, grupo, nome, responsavel, diretoria) VALUES
('3',   'SP',     'ADMINISTRAÇÃO', 'ADMINISTRAÇÃO CENTRAL', 'Administração Central - SP',  'Ubiratan Pais',     'Fernando Medeiros'),
('7',   'SP',     'ADMINISTRAÇÃO', 'ADMINISTRAÇÃO CENTRAL', 'Recursos Humanos',             'Gisele Carneiro',   'Fernando Medeiros'),
('200', 'SP',     'ADMINISTRAÇÃO', 'ADMINISTRAÇÃO CENTRAL', 'Administração Suprimentos',    'Roberto Zambeli',   'Fernando Medeiros'),
('281', 'SP',     'ADMINISTRAÇÃO', 'ADMINISTRAÇÃO CENTRAL', 'Administração Facilities',     'Roberto Zambeli',   'Fernando Medeiros'),
('307', 'SP',     'ADMINISTRAÇÃO', 'ADMINISTRAÇÃO CENTRAL', 'Gestão Institucional Matriz',  'Daniel Benedetti',  'Fernando Medeiros'),
('4',   'SP',     'ADMINISTRAÇÃO', 'FINANCEIRO',            'Financeiro - SP',              'Daniel Benedetti',  'Fernando Medeiros'),
('282', 'SP',     'ADMINISTRAÇÃO', 'FINANCEIRO',            'Controladoria',                'Daniel Benedetti',  'Fernando Medeiros'),
('6',   'SP',     'ADMINISTRAÇÃO', 'INFORMÁTICA',           'Informática',                  'Alexandre Carrega', 'Fernando Medeiros'),
('9',   'SP',     'ADMINISTRAÇÃO', 'MARKETING',             'Marketing',                    'Thaís Aiala',       'André de Luca'),
('13',  'ATIMBA', 'PROGRAMAS SOCIAIS', 'CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - CAT', 'Alceu Caldeira', 'Alceu Caldeira'),
('15',  'CEARA',  'PROGRAMAS SOCIAIS', 'CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - CE',  'Alceu Caldeira', 'Alceu Caldeira'),
('20',  'TORROE', 'PROGRAMAS SOCIAIS', 'CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - TORF','Alceu Caldeira', 'Alceu Caldeira'),
('17',  'INAJA',  'PROGRAMAS SOCIAIS', 'CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - INAJ','Alceu Caldeira', 'Alceu Caldeira'),
('14',  'CEARA',  'PROGRAMAS SOCIAIS', 'CENTRO EDUCACIONAL',      'Centro Educacional - CE',       'Alceu Caldeira', 'Alceu Caldeira'),
('11',  'SP',     'PROGRAMAS SOCIAIS', 'CENTRO EDUCACIONAL',      'Gestão Educacional',            'Alceu Caldeira', 'Alceu Caldeira');
```

### Hierarquia de Naturezas (exemplos para incluir no INSERT)
```sql
INSERT INTO naturezas (nl_classificacao, descricao, codigo, tipo) VALUES
('001',             'RECEITAS',                          '000224', 'RECEITA'),
('001.001',         'RECEITAS LIVRES - ÁREA SOCIAL',     '000225', 'RECEITA'),
('001.001.001-CTA', 'COLABORAÇÃO MENSAL',                '000227', 'RECEITA'),
('001.001.002-CTA', 'COLABORAÇÃO PONTUAL',               '000228', 'RECEITA'),
('001.001.003-CTA', 'EMPRESA AMIGA (COLABORAÇÃO MENSAL)','000229', 'RECEITA'),
('001.001.007-CTA', 'PARCERIAS (COLABORAÇÃO PONTUAL)',   '000436', 'RECEITA'),
('002',             'DESPESAS',                          NULL,     'DESPESA'),
('002.001',         'PESSOAL',                           NULL,     'DESPESA'),
('002.002',         'SERVIÇOS',                          NULL,     'DESPESA'),
('002.003',         'MATERIAIS E INSUMOS',               NULL,     'DESPESA');
```

> **Atenção:** O conjunto completo de naturezas e centros de custo deve ser importado via CSV no Supabase após a criação das tabelas. O arquivo CSV de referência está em `CTR 001.085 - Centros de custos.xlsx`.

---

## 20. Checklist Final para a IA de Codificação

Antes de declarar o projeto concluído, verifique:

- [ ] Login com Magic Link funciona end-to-end
- [ ] Redirecionamento pós-login vai para o Dashboard
- [ ] RLS bloqueia GESTOR de ver dados de outro CC (teste com 2 usuários)
- [ ] Trava de edição funciona: gestor não consegue salvar após data_limite_edicao
- [ ] MASTER consegue editar mesmo após a data_limite_edicao
- [ ] Drill-down do dashboard expande corretamente Pilar → Grupo → CC
- [ ] Cores de alerta aparecem na tabela (verde/amarelo/vermelho)
- [ ] Projeção de 24 meses calcula corretamente a média dos últimos 3 meses
- [ ] Fluxo completo de solicitação de revisão (criar, aprovar, rejeitar)
- [ ] E-mail de alerta é disparado quando % uso ≥ limite configurado
- [ ] Exportar PDF (print) funciona e oculta o menu lateral
- [ ] Exportar CSV da projeção faz download do arquivo
- [ ] Layout não quebra em 1024px de largura
- [ ] `config.js` está no `.gitignore` (para não expor chaves no GitHub público)

---

*Documento gerado em 2026-06-03 por Daniel Benedetti — Amigos do Bem / Controladoria Gerencial*
