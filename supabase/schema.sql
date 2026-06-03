-- =============================================================
-- SCHEMA COMPLETO — Sistema Orçamentário Amigos do Bem
-- Execute este arquivo no SQL Editor do Supabase
-- =============================================================

-- ========================
-- TABELAS BASE (lookup)
-- ========================

CREATE TABLE IF NOT EXISTS centros_custo (
  id           SERIAL PRIMARY KEY,
  codigo       TEXT NOT NULL UNIQUE,
  unidade      TEXT,
  pilar        TEXT,
  grupo        TEXT,
  nome         TEXT NOT NULL,
  responsavel  TEXT,
  diretoria    TEXT,
  objetivo     TEXT,
  ativo        BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS naturezas (
  id               SERIAL PRIMARY KEY,
  nl_classificacao TEXT NOT NULL UNIQUE,
  nivel            INT GENERATED ALWAYS AS (
                     array_length(string_to_array(
                       replace(nl_classificacao, '-CTA',''), '.'), 1)
                   ) STORED,
  eh_conta         BOOLEAN GENERATED ALWAYS AS (
                     nl_classificacao LIKE '%-CTA'
                   ) STORED,
  descricao        TEXT NOT NULL,
  codigo           TEXT,
  descricao2       TEXT,
  objetivo         TEXT,
  tipo             TEXT CHECK (tipo IN ('RECEITA','DESPESA')),
  ativo            BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS aplicacoes (
  id      SERIAL PRIMARY KEY,
  nome    TEXT NOT NULL,
  codigo  TEXT UNIQUE,
  ativo   BOOLEAN DEFAULT TRUE
);

-- ========================
-- USUÁRIOS E CONFIGURAÇÃO
-- ========================

CREATE TABLE IF NOT EXISTS usuarios_responsaveis (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  nome            TEXT,
  nivel_acesso    TEXT NOT NULL CHECK (nivel_acesso IN ('MASTER','DIRETORIA','GESTOR')),
  centro_custo_id INT REFERENCES centros_custo(id),
  diretoria       TEXT,
  auth_user_id    UUID REFERENCES auth.users(id),
  ativo           BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS config_sistema (
  id                   INT PRIMARY KEY DEFAULT 1,
  data_limite_edicao   DATE,
  exercicio_atual      INT DEFAULT 2025,
  perc_alerta_amarelo  INT DEFAULT 80,
  perc_alerta_vermelho INT DEFAULT 100
);

INSERT INTO config_sistema (id, exercicio_atual)
VALUES (1, 2025)
ON CONFLICT (id) DO NOTHING;

-- ========================
-- TABELAS TRANSACIONAIS
-- ========================

CREATE TABLE IF NOT EXISTS orcamentos (
  id              SERIAL PRIMARY KEY,
  exercicio       INT NOT NULL,
  mes             INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  centro_custo_id INT NOT NULL REFERENCES centros_custo(id),
  natureza_id     INT NOT NULL REFERENCES naturezas(id),
  aplicacao_id    INT REFERENCES aplicacoes(id),
  valor_planejado NUMERIC(15,2) DEFAULT 0,
  valor_revisado  NUMERIC(15,2),
  observacao      TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_por  TEXT,
  UNIQUE (exercicio, mes, centro_custo_id, natureza_id, aplicacao_id)
);

CREATE TABLE IF NOT EXISTS realizado (
  id              SERIAL PRIMARY KEY,
  exercicio       INT NOT NULL,
  mes             INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  centro_custo_id INT NOT NULL REFERENCES centros_custo(id),
  natureza_id     INT NOT NULL REFERENCES naturezas(id),
  aplicacao_id    INT REFERENCES aplicacoes(id),
  valor_realizado NUMERIC(15,2) NOT NULL DEFAULT 0,
  documento       TEXT,
  descricao       TEXT,
  fonte           TEXT DEFAULT 'MANUAL' CHECK (fonte IN ('MANUAL','ERP','IMPORT')),
  erp_id          TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  criado_por      TEXT
);

CREATE TABLE IF NOT EXISTS solicitacoes_revisao (
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

-- ========================
-- TRIGGER atualizado_em
-- ========================

CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orcamentos_updated ON orcamentos;
CREATE TRIGGER trg_orcamentos_updated
  BEFORE UPDATE ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ========================
-- FUNÇÃO AUXILIAR DE ACESSO
-- ========================

CREATE OR REPLACE FUNCTION get_my_access()
RETURNS TABLE(nivel TEXT, centro_custo_id INT, diretoria TEXT) AS $$
  SELECT nivel_acesso, centro_custo_id, diretoria
  FROM usuarios_responsaveis
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ========================
-- ROW LEVEL SECURITY
-- ========================

ALTER TABLE centros_custo         ENABLE ROW LEVEL SECURITY;
ALTER TABLE naturezas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE aplicacoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_sistema        ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE realizado             ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_revisao  ENABLE ROW LEVEL SECURITY;

-- Lookup tables: leitura para todos autenticados, escrita só MASTER
CREATE POLICY "cc_select"   ON centros_custo FOR SELECT TO authenticated USING (true);
CREATE POLICY "nat_select"  ON naturezas     FOR SELECT TO authenticated USING (true);
CREATE POLICY "apl_select"  ON aplicacoes    FOR SELECT TO authenticated USING (true);
CREATE POLICY "cfg_select"  ON config_sistema FOR SELECT TO authenticated USING (true);

CREATE POLICY "cc_write" ON centros_custo FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel = 'MASTER')
);
CREATE POLICY "nat_write" ON naturezas FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel = 'MASTER')
);
CREATE POLICY "apl_write" ON aplicacoes FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel = 'MASTER')
);
CREATE POLICY "cfg_write" ON config_sistema FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel = 'MASTER')
);

-- Usuários: cada um vê o próprio perfil; MASTER vê todos
CREATE POLICY "usr_select" ON usuarios_responsaveis FOR SELECT TO authenticated USING (
  auth_user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel = 'MASTER')
);
CREATE POLICY "usr_write" ON usuarios_responsaveis FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel = 'MASTER')
);
-- permite UPDATE do próprio auth_user_id no primeiro login
CREATE POLICY "usr_self_link" ON usuarios_responsaveis FOR UPDATE TO authenticated USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Orçamentos: SELECT filtrado por nível
CREATE POLICY "orc_select" ON orcamentos FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM get_my_access() a
    JOIN centros_custo cc ON cc.id = orcamentos.centro_custo_id
    WHERE
      a.nivel = 'MASTER' OR
      (a.nivel = 'DIRETORIA' AND cc.diretoria = a.diretoria) OR
      (a.nivel = 'GESTOR' AND orcamentos.centro_custo_id = a.centro_custo_id)
  )
);

-- Orçamentos: INSERT/UPDATE respeitando data_limite_edicao
CREATE POLICY "orc_write" ON orcamentos FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM get_my_access() a
    JOIN config_sistema c ON c.id = 1
    JOIN centros_custo cc ON cc.id = orcamentos.centro_custo_id
    WHERE
      a.nivel = 'MASTER' OR
      (
        (a.nivel IN ('DIRETORIA','GESTOR')) AND
        (c.data_limite_edicao IS NULL OR CURRENT_DATE <= c.data_limite_edicao) AND
        (
          (a.nivel = 'DIRETORIA' AND cc.diretoria = a.diretoria) OR
          (a.nivel = 'GESTOR' AND orcamentos.centro_custo_id = a.centro_custo_id)
        )
      )
  )
);
CREATE POLICY "orc_update" ON orcamentos FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM get_my_access() a
    JOIN config_sistema c ON c.id = 1
    JOIN centros_custo cc ON cc.id = orcamentos.centro_custo_id
    WHERE
      a.nivel = 'MASTER' OR
      (
        (a.nivel IN ('DIRETORIA','GESTOR')) AND
        (c.data_limite_edicao IS NULL OR CURRENT_DATE <= c.data_limite_edicao) AND
        (
          (a.nivel = 'DIRETORIA' AND cc.diretoria = a.diretoria) OR
          (a.nivel = 'GESTOR' AND orcamentos.centro_custo_id = a.centro_custo_id)
        )
      )
  )
);

-- Realizado: leitura para todos; escrita só MASTER e DIRETORIA
CREATE POLICY "real_select" ON realizado FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM get_my_access() a
    JOIN centros_custo cc ON cc.id = realizado.centro_custo_id
    WHERE
      a.nivel = 'MASTER' OR
      (a.nivel = 'DIRETORIA' AND cc.diretoria = a.diretoria) OR
      (a.nivel = 'GESTOR' AND realizado.centro_custo_id = a.centro_custo_id)
  )
);
CREATE POLICY "real_write" ON realizado FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel IN ('MASTER','DIRETORIA'))
);

-- Solicitações: GESTOR cria e vê as próprias; MASTER vê todas
CREATE POLICY "sol_select" ON solicitacoes_revisao FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM get_my_access() a
    WHERE
      a.nivel = 'MASTER' OR
      (a.nivel IN ('DIRETORIA','GESTOR') AND
       solicitacoes_revisao.centro_custo_id = a.centro_custo_id)
  )
);
CREATE POLICY "sol_insert" ON solicitacoes_revisao FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel IN ('MASTER','DIRETORIA','GESTOR'))
);
CREATE POLICY "sol_update" ON solicitacoes_revisao FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM get_my_access() a WHERE a.nivel = 'MASTER')
);

-- ========================
-- DADOS INICIAIS
-- ========================

INSERT INTO centros_custo (codigo, unidade, pilar, grupo, nome, responsavel, diretoria) VALUES
('3',   'SP',      'ADMINISTRAÇÃO',    'ADMINISTRAÇÃO CENTRAL',   'Administração Central - SP',        'Ubiratan Pais',     'Fernando Medeiros'),
('7',   'SP',      'ADMINISTRAÇÃO',    'ADMINISTRAÇÃO CENTRAL',   'Recursos Humanos',                  'Gisele Carneiro',   'Fernando Medeiros'),
('200', 'SP',      'ADMINISTRAÇÃO',    'ADMINISTRAÇÃO CENTRAL',   'Administração Suprimentos',         'Roberto Zambeli',   'Fernando Medeiros'),
('281', 'SP',      'ADMINISTRAÇÃO',    'ADMINISTRAÇÃO CENTRAL',   'Administração Facilities',          'Roberto Zambeli',   'Fernando Medeiros'),
('307', 'SP',      'ADMINISTRAÇÃO',    'ADMINISTRAÇÃO CENTRAL',   'Gestão Institucional Matriz',       'Daniel Benedetti',  'Fernando Medeiros'),
('336', 'SP',      'ADMINISTRAÇÃO',    'ADMINISTRAÇÃO CENTRAL',   'Departamento Pessoal',              NULL,                'Fernando Medeiros'),
('4',   'SP',      'ADMINISTRAÇÃO',    'FINANCEIRO',              'Financeiro - SP',                   'Daniel Benedetti',  'Fernando Medeiros'),
('282', 'SP',      'ADMINISTRAÇÃO',    'FINANCEIRO',              'Controladoria',                     'Daniel Benedetti',  'Fernando Medeiros'),
('6',   'SP',      'ADMINISTRAÇÃO',    'INFORMÁTICA',             'Informática',                       'Alexandre Carrega', 'Fernando Medeiros'),
('9',   'SP',      'ADMINISTRAÇÃO',    'MARKETING',               'Marketing',                         'Thaís Aiala',       'André de Luca'),
('13',  'ATIMBA',  'PROGRAMAS SOCIAIS','CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - CAT',     'Alceu Caldeira',    'Alceu Caldeira'),
('15',  'CEARA',   'PROGRAMAS SOCIAIS','CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - CE',      'Alceu Caldeira',    'Alceu Caldeira'),
('20',  'TORROE',  'PROGRAMAS SOCIAIS','CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - TORF',    'Alceu Caldeira',    'Alceu Caldeira'),
('17',  'INAJA',   'PROGRAMAS SOCIAIS','CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - INAJ',    'Alceu Caldeira',    'Alceu Caldeira'),
('344', 'DOMINGOS','PROGRAMAS SOCIAIS','CENTRO DE TRANSFORMAÇÃO', 'Centro de Transformação - SD',      'Alceu Caldeira',    'Alceu Caldeira'),
('14',  'CEARA',   'PROGRAMAS SOCIAIS','CENTRO EDUCACIONAL',      'Centro Educacional - CE',           'Alceu Caldeira',    'Alceu Caldeira'),
('16',  'INAJA',   'PROGRAMAS SOCIAIS','CENTRO EDUCACIONAL',      'Centro Educacional - INAJA',        'Alceu Caldeira',    'Alceu Caldeira'),
('18',  'TORROE',  'PROGRAMAS SOCIAIS','CENTRO EDUCACIONAL',      'Centro Educacional - TORRÕES',      'Alceu Caldeira',    'Alceu Caldeira'),
('11',  'SP',      'PROGRAMAS SOCIAIS','CENTRO EDUCACIONAL',      'Gestão Educacional',                'Alceu Caldeira',    'Alceu Caldeira'),
('12',  'ATIMBA',  'PROGRAMAS SOCIAIS','CENTRO EDUCACIONAL',      'Centro Educacional - CAT',          'Alceu Caldeira',    'Alceu Caldeira'),
('343', 'DOMINGOS','PROGRAMAS SOCIAIS','CENTRO EDUCACIONAL',      'Centro Educacional - SD',           'Alceu Caldeira',    'Alceu Caldeira')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO naturezas (nl_classificacao, descricao, codigo, tipo) VALUES
('001',              'RECEITAS',                            '000224', 'RECEITA'),
('001.001',          'RECEITAS LIVRES - ÁREA SOCIAL',       '000225', 'RECEITA'),
('001.001.001-CTA',  'COLABORAÇÃO MENSAL',                  '000227', 'RECEITA'),
('001.001.002-CTA',  'COLABORAÇÃO PONTUAL',                 '000228', 'RECEITA'),
('001.001.003-CTA',  'EMPRESA AMIGA (COLABORAÇÃO MENSAL)',  '000229', 'RECEITA'),
('001.001.007-CTA',  'PARCERIAS (COLABORAÇÃO PONTUAL)',     '000436', 'RECEITA'),
('001.001.008-CTA',  'VENDAS DE DOAÇÕES',                   '000450', 'RECEITA'),
('001.001.009-CTA',  'AÇÃO DE ARRECADAÇÃO (COLABORAÇÃO PONTUAL)', '000451', 'RECEITA'),
('001.001.010-CTA',  'CAMPANHA INICIATIVA DI PF',           '000452', 'RECEITA'),
('001.001.011-CTA',  'OUTRAS RECEITAS',                     '000453', 'RECEITA'),
('001.001.012-CTA',  'EMPRESA AMIGA (COLABORAÇÃO PONTUAL)', '000466', 'RECEITA'),
('001.001.013-CTA',  'PARCERIAS (COLABORAÇÃO MENSAL)',      '000467', 'RECEITA'),
('001.001.014-CTA',  'AÇÃO DE ARRECADAÇÃO (COLABORAÇÃO MENSAL)', '000468', 'RECEITA'),
('002',              'DESPESAS',                            NULL,     'DESPESA'),
('002.001',          'PESSOAL',                             NULL,     'DESPESA'),
('002.001.001-CTA',  'SALÁRIOS E ORDENADOS',                NULL,     'DESPESA'),
('002.001.002-CTA',  'ENCARGOS SOCIAIS',                    NULL,     'DESPESA'),
('002.001.003-CTA',  'BENEFÍCIOS',                          NULL,     'DESPESA'),
('002.001.004-CTA',  'TREINAMENTO E CAPACITAÇÃO',           NULL,     'DESPESA'),
('002.002',          'SERVIÇOS DE TERCEIROS',               NULL,     'DESPESA'),
('002.002.001-CTA',  'SERVIÇOS PROFISSIONAIS',              NULL,     'DESPESA'),
('002.002.002-CTA',  'LOCAÇÃO E MANUTENÇÃO',                NULL,     'DESPESA'),
('002.002.003-CTA',  'UTILIDADES E SERVIÇOS PÚBLICOS',      NULL,     'DESPESA'),
('002.003',          'MATERIAIS E INSUMOS',                 NULL,     'DESPESA'),
('002.003.001-CTA',  'MATERIAIS DE CONSUMO',                NULL,     'DESPESA'),
('002.003.002-CTA',  'MATERIAIS PEDAGÓGICOS',               NULL,     'DESPESA'),
('002.003.003-CTA',  'ALIMENTAÇÃO',                         NULL,     'DESPESA'),
('002.004',          'OBRAS E REFORMAS',                    NULL,     'DESPESA'),
('002.004.001-CTA',  'OBRAS CIVIS',                         NULL,     'DESPESA'),
('002.004.002-CTA',  'REFORMAS E MANUTENÇÃO PREDIAL',       NULL,     'DESPESA'),
('002.005',          'ADMINISTRATIVO E GERAL',              NULL,     'DESPESA'),
('002.005.001-CTA',  'VIAGENS E DESLOCAMENTOS',             NULL,     'DESPESA'),
('002.005.002-CTA',  'COMUNICAÇÕES',                        NULL,     'DESPESA'),
('002.005.003-CTA',  'SEGUROS',                             NULL,     'DESPESA'),
('002.005.004-CTA',  'OUTROS ADMINISTRATIVOS',              NULL,     'DESPESA')
ON CONFLICT (nl_classificacao) DO NOTHING;

-- Primeiro usuário MASTER (substitua pelo e-mail real do administrador)
INSERT INTO usuarios_responsaveis (email, nome, nivel_acesso)
VALUES ('daniel.benedetti@amigosdobem.org', 'Daniel Benedetti', 'MASTER')
ON CONFLICT (email) DO NOTHING;
