/* =============================================================
   app.js \ufffd?" Sistema Or\u00e7ament\u00e1rio Amigos do Bem
   ============================================================= */

// \ufffd"?\ufffd"? Inicializa\u00e7\u00e3o do Supabase \ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// \ufffd"?\ufffd"? Estado global \ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?
const App = {
  state: {
    user: null,
    perfil: null,
    exercicio: new Date().getFullYear(),
    mes: new Date().getMonth() + 1,
    config: null,
  },
  cache: {
    centros: [],
    naturezas: [],
    aplicacoes: [],
  },

  // \ufffd"?\ufffd"? Inicializar \ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?
  async init() {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) {
      await App.setupUser(session.user);
    } else {
      App.showLogin();
    }
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await App.setupUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        App.showLogin();
      }
    });
    window.addEventListener('hashchange', App.route);
  },

  async setupUser(user) {
    // Vincula auth_user_id se necess\u00e1rio
    await sb.from('usuarios_responsaveis')
      .update({ auth_user_id: user.id })
      .eq('email', user.email)
      .is('auth_user_id', null);

    const { data: perfil } = await sb
      .from('usuarios_responsaveis')
      .select('*, centros_custo(nome)')
      .eq('email', user.email)
      .single();

    if (!perfil) {
      App.toast('E-mail n\u00e3o cadastrado. Solicite acesso ao administrador.', 'error');
      await sb.auth.signOut();
      return;
    }

    App.state.user = user;
    App.state.perfil = perfil;

    // Carrega config
    const { data: cfg } = await sb.from('config_sistema').select('*').eq('id', 1).single();
    App.state.config = cfg;
    if (cfg?.exercicio_atual) App.state.exercicio = cfg.exercicio_atual;

    // Cache
    const [{ data: centros }, { data: nats }, { data: apls }] = await Promise.all([
      sb.from('centros_custo').select('*').eq('ativo', true).order('pilar').order('grupo').order('nome'),
      sb.from('naturezas').select('*').eq('ativo', true).order('nl_classificacao'),
      sb.from('aplicacoes').select('*').eq('ativo', true).order('nome'),
    ]);
    App.cache.centros = centros || [];
    App.cache.naturezas = nats || [];
    App.cache.aplicacoes = apls || [];

    App.showApp();
    App.route();
  },

  showLogin() {
    document.getElementById('screen-login').classList.remove('hidden');
    document.getElementById('screen-app').classList.add('hidden');
  },

  showApp() {
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');

    const p = App.state.perfil;
    document.getElementById('user-name').textContent  = p.nome || p.email;
    document.getElementById('user-cc').textContent    = p.centros_custo?.nome || (p.nivel_acesso !== 'GESTOR' ? 'Acesso Total' : '');
    document.getElementById('user-nivel').textContent = p.nivel_acesso;
    document.getElementById('exercicio-label').textContent = `Or\u00e7amento ${App.state.exercicio}`;
    document.getElementById('sel-exercicio').value = App.state.exercicio;

    if (p.nivel_acesso === 'MASTER') {
      document.getElementById('admin-menu').classList.remove('hidden');
    }

    // Banner de trava de edi\u00e7\u00e3o
    const cfg = App.state.config;
    if (cfg?.data_limite_edicao && p.nivel_acesso !== 'MASTER') {
      const limite = new Date(cfg.data_limite_edicao + 'T00:00:00');
      if (new Date() > limite) {
        document.getElementById('banner-trava').classList.remove('hidden');
      }
    }

    // Preenche selects de pilar no dash para MASTER/DIRETORIA
    if (p.nivel_acesso !== 'GESTOR') {
      document.getElementById('dash-pilar').classList.remove('hidden');
    }
  },

  // \ufffd"?\ufffd"? Roteamento \ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?
  route() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.add('hidden'));

    const target = document.getElementById('screen-' + hash);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.screen === hash);
    });

    const titles = {
      'dashboard': 'Dashboard', 'input': 'Input Or\u00e7ament\u00e1rio',
      'realizado': 'Lan\u00e7ar Realizado', 'apresentacao': 'Apresenta\u00e7\u00e3o',
      'projecoes': 'Proje\u00e7\u00f5es (24 meses)', 'revisao': 'Solicitar Revis\u00e3o',
      'minhas-sol': 'Minhas Solicita\u00e7\u00f5es', 'aprovacoes': 'Aprova\u00e7\u00f5es de Revis\u00e3o',
      'usuarios': 'Gest\u00e3o de Usu\u00e1rios', 'configuracoes': 'Configura\u00e7\u00f5es',
    };
    document.getElementById('page-title').textContent = titles[hash] || hash;

    const loaders = {
      'dashboard':   () => App.Dash.load(),
      'input':       () => App.Input.init(),
      'realizado':   () => App.Realizado.init(),
      'apresentacao':() => App.Apres.load(),
      'projecoes':   () => App.Projecoes.init(),
      'revisao':     () => App.Revisao.init(),
      'minhas-sol':  () => App.MinhasSol.load(),
      'aprovacoes':  () => App.Aprovacoes.load(),
      'usuarios':    () => App.Usuarios.load(),
      'configuracoes':() => App.Config.load(),
    };
    if (loaders[hash]) loaders[hash]();
  },

  changeExercicio(val) {
    App.state.exercicio = parseInt(val);
    App.route();
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('hidden');
  },

  // \ufffd"?\ufffd"? Auth \ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?
  async login() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const btn   = document.getElementById('btn-login');
    const msgEl = document.getElementById('login-msg');
    if (!email) { msgEl.textContent = 'Informe seu e-mail.'; msgEl.classList.remove('hidden'); return; }
    btn.disabled = true; btn.textContent = 'Aguarde...'; msgEl.classList.add('hidden');
    if (senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) {
        msgEl.textContent = error.message.includes('Invalid') ? 'E-mail ou senha incorretos.' : error.message;
        msgEl.classList.remove('hidden');
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    } else {
      const { error } = await sb.auth.signInWithOtp({ email });
      if (error) {
        msgEl.textContent = error.message;
        msgEl.classList.remove('hidden');
        btn.disabled = false; btn.textContent = 'Entrar';
      } else {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('login-sent').classList.remove('hidden');
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    }
  },

  async logout() {
    await sb.auth.signOut();
  },

  // \ufffd"?\ufffd"? Toast \ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?
  toast(msg, type = 'info') {
    const t = document.getElementById('toast');
    const ti = document.getElementById('toast-inner');
    ti.textContent = msg;
    ti.className = `rounded-lg shadow-lg px-4 py-3 text-sm text-white ${type}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3500);
  },

  // \ufffd"?\ufffd"? Helpers \ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?
  brl(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  },
  pct(v, t) {
    if (!t || t === 0) return '0%';
    return ((v / t) * 100).toFixed(1) + '%';
  },
  pctNum(v, t) {
    if (!t || t === 0) return 0;
    return (v / t) * 100;
  },
  usoCor(pct) {
    if (pct >= 100) return 'uso-vermelho';
    if (pct >= 80)  return 'uso-amarelo';
    return 'uso-verde';
  },
  usoRowCor(pct) {
    if (pct >= 100) return 'row-alerta-vermelho';
    if (pct >= 80)  return 'row-alerta-amarelo';
    return '';
  },
  meses: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
  mesesFull: ['Janeiro','Fevereiro','Mar\u00e7o','Abril','Maio','Junho',
              'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],

  isEdicaoBloqueada() {
    const cfg = App.state.config;
    const nivel = App.state.perfil?.nivel_acesso;
    if (nivel === 'MASTER') return false;
    if (!cfg?.data_limite_edicao) return false;
    return new Date() > new Date(cfg.data_limite_edicao + 'T00:00:00');
  },

  // \ufffd"?\ufffd"? Filtro de CCs por perfil \ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?\ufffd"?
  meusCCs() {
    const p = App.state.perfil;
    if (p.nivel_acesso === 'GESTOR') {
      return App.cache.centros.filter(c => c.id === p.centro_custo_id);
    }
    if (p.nivel_acesso === 'DIRETORIA') {
      return App.cache.centros.filter(c => c.diretoria === p.diretoria);
    }
    return App.cache.centros;
  },

  fillCCSelect(selId, includeAll = false) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '';
    if (includeAll) sel.innerHTML = '<option value="">\ufffd?" Todos \ufffd?"</option>';
    App.meusCCs().forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = `[${c.codigo}] ${c.nome}`;
      sel.appendChild(o);
    });
  },

  fillNatSelect(selId, tipo = null) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">\ufffd?" Selecione \ufffd?"</option>';
    const contas = App.cache.naturezas.filter(n =>
      n.eh_conta && (!tipo || n.tipo === tipo)
    );
    contas.forEach(n => {
      const o = document.createElement('option');
      o.value = n.id;
      o.textContent = `[${n.nl_classificacao}] ${n.descricao}`;
      sel.appendChild(o);
    });
  },

  fillAplSelect(selId) {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const base = sel.querySelector('option[value=""]') ? '' : '<option value="">\ufffd?" Nenhuma \ufffd?"</option>';
    sel.innerHTML = base;
    App.cache.aplicacoes.forEach(a => {
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = `[${a.codigo}] ${a.nome}`;
      sel.appendChild(o);
    });
  },
};

// =============================================================
// DASHBOARD
// =============================================================
App.Dash = {
  chartInst: null,

  async load() {
    const mes = parseInt(document.getElementById('dash-mes')?.value || 0);
    const pilar = document.getElementById('dash-pilar')?.value || '';
    const exercicio = App.state.exercicio;
    const p = App.state.perfil;

    // Busca or\u00e7amentos e realizados do exerc\u00edcio
    let qOrc = sb.from('orcamentos').select('*, centros_custo(pilar,grupo,nome,diretoria,codigo)')
      .eq('exercicio', exercicio);
    let qReal = sb.from('realizado').select('*, centros_custo(pilar,grupo,nome,diretoria,codigo)')
      .eq('exercicio', exercicio);

    if (mes > 0) { qOrc = qOrc.eq('mes', mes); qReal = qReal.eq('mes', mes); }
    else {
      const mesAtual = new Date().getMonth() + 1;
      qOrc = qOrc.lte('mes', mesAtual); qReal = qReal.lte('mes', mesAtual);
    }

    if (p.nivel_acesso === 'GESTOR') {
      qOrc = qOrc.eq('centro_custo_id', p.centro_custo_id);
      qReal = qReal.eq('centro_custo_id', p.centro_custo_id);
    }

    const [{ data: orcs }, { data: reals }] = await Promise.all([qOrc, qReal]);

    // Agrega
    const ccMap = {};
    const addCC = (cc) => {
      if (!cc) return;
      const key = cc.codigo;
      if (!ccMap[key]) ccMap[key] = { ...cc, orc: 0, real: 0 };
    };

    (orcs || []).forEach(r => {
      addCC(r.centros_custo);
      if (r.centros_custo) ccMap[r.centros_custo.codigo].orc += parseFloat(r.valor_planejado || 0);
    });
    (reals || []).forEach(r => {
      addCC(r.centros_custo);
      if (r.centros_custo) ccMap[r.centros_custo.codigo].real += parseFloat(r.valor_realizado || 0);
    });

    let ccs = Object.values(ccMap);
    if (pilar) ccs = ccs.filter(c => c.pilar === pilar);
    if (p.nivel_acesso === 'DIRETORIA') ccs = ccs.filter(c => c.diretoria === p.diretoria);

    const totOrc  = ccs.reduce((s, c) => s + c.orc, 0);
    const totReal = ccs.reduce((s, c) => s + c.real, 0);
    const pctUso  = App.pctNum(totReal, totOrc);

    document.getElementById('kpi-orcado').textContent    = App.brl(totOrc);
    document.getElementById('kpi-realizado').textContent = App.brl(totReal);
    document.getElementById('kpi-uso').textContent       = pctUso.toFixed(1) + '%';
    document.getElementById('kpi-uso').className         = 'kpi-value ' + App.usoCor(pctUso);
    document.getElementById('kpi-saldo').textContent     = App.brl(totOrc - totReal);

    App.Dash.renderTable(ccs);
    App.Dash.renderChart(exercicio, p);
  },

  renderTable(ccs) {
    const tbody = document.getElementById('dash-table-body');
    tbody.innerHTML = '';

    // Agrupa: pilar \ufffd?' grupo \ufffd?' cc
    const pilares = {};
    ccs.forEach(c => {
      if (!pilares[c.pilar]) pilares[c.pilar] = {};
      if (!pilares[c.pilar][c.grupo]) pilares[c.pilar][c.grupo] = [];
      pilares[c.pilar][c.grupo].push(c);
    });

    Object.entries(pilares).forEach(([pilar, grupos]) => {
      const orcPilar  = Object.values(grupos).flat().reduce((s, c) => s + c.orc, 0);
      const realPilar = Object.values(grupos).flat().reduce((s, c) => s + c.real, 0);
      const pPilar    = App.pctNum(realPilar, orcPilar);
      const pilarId   = 'p_' + pilar.replace(/\s/g,'_');

      const trPilar = document.createElement('tr');
      trPilar.className = `drill-row-l1 ${App.usoRowCor(pPilar)}`;
      trPilar.innerHTML = `
        <td class="py-2 px-2"><span class="drill-toggle" onclick="App.Dash.toggle('${pilarId}')">\ufffd-\ufffd</span></td>
        <td class="py-2 font-semibold text-gray-800">${pilar}</td>
        <td class="py-2 text-right text-gray-700">${App.brl(orcPilar)}</td>
        <td class="py-2 text-right text-gray-700">${App.brl(realPilar)}</td>
        <td class="py-2 text-right"><span class="${App.usoCor(pPilar)}">${pPilar.toFixed(1)}%</span></td>
        <td class="py-2 text-right text-gray-700">${App.brl(orcPilar - realPilar)}</td>
      `;
      tbody.appendChild(trPilar);

      Object.entries(grupos).forEach(([grupo, items]) => {
        const orcG  = items.reduce((s, c) => s + c.orc, 0);
        const realG = items.reduce((s, c) => s + c.real, 0);
        const pG    = App.pctNum(realG, orcG);
        const grupoId = 'g_' + grupo.replace(/\s/g,'_');

        const trG = document.createElement('tr');
        trG.className = `drill-row-l2 ${App.usoRowCor(pG)} drill-child-${pilarId} hidden`;
        trG.innerHTML = `
          <td class="py-1.5 px-2 pl-5"><span class="drill-toggle" onclick="App.Dash.toggle('${grupoId}')">\ufffd-\ufffd</span></td>
          <td class="py-1.5 text-gray-600 font-medium">${grupo}</td>
          <td class="py-1.5 text-right text-gray-600">${App.brl(orcG)}</td>
          <td class="py-1.5 text-right text-gray-600">${App.brl(realG)}</td>
          <td class="py-1.5 text-right"><span class="${App.usoCor(pG)}">${pG.toFixed(1)}%</span></td>
          <td class="py-1.5 text-right text-gray-600">${App.brl(orcG - realG)}</td>
        `;
        tbody.appendChild(trG);

        items.forEach(cc => {
          const pCC = App.pctNum(cc.real, cc.orc);
          const trCC = document.createElement('tr');
          trCC.className = `drill-row-l3 ${App.usoRowCor(pCC)} drill-child-${grupoId} hidden`;
          trCC.innerHTML = `
            <td class="py-1 px-2"></td>
            <td class="py-1 pl-10 text-gray-500">
              <span class="cursor-pointer hover:text-red-600 hover:underline"
                onclick="App.Dash.openModal(${cc.id || 0}, '${cc.nome}')">${cc.nome}</span>
            </td>
            <td class="py-1 text-right text-gray-500 text-xs">${App.brl(cc.orc)}</td>
            <td class="py-1 text-right text-gray-500 text-xs">${App.brl(cc.real)}</td>
            <td class="py-1 text-right text-xs"><span class="${App.usoCor(pCC)}">${pCC.toFixed(1)}%</span></td>
            <td class="py-1 text-right text-gray-500 text-xs">${App.brl(cc.orc - cc.real)}</td>
          `;
          tbody.appendChild(trCC);
        });
      });
    });
  },

  toggle(id) {
    const children = document.querySelectorAll(`.drill-child-${id}`);
    children.forEach(el => el.classList.toggle('hidden'));
    // Atualiza \u00edcone
    const toggles = document.querySelectorAll(`[onclick="App.Dash.toggle('${id}')"]`);
    toggles.forEach(t => { t.textContent = t.textContent === '\ufffd-\ufffd' ? '\ufffd-\ufffd' : '\ufffd-\ufffd'; });
  },

  async renderChart(exercicio, p) {
    const mesAtual = new Date().getMonth() + 1;
    let qOrc = sb.from('orcamentos').select('mes, valor_planejado').eq('exercicio', exercicio).lte('mes', 12);
    let qReal = sb.from('realizado').select('mes, valor_realizado').eq('exercicio', exercicio).lte('mes', 12);
    if (p.nivel_acesso === 'GESTOR') {
      qOrc = qOrc.eq('centro_custo_id', p.centro_custo_id);
      qReal = qReal.eq('centro_custo_id', p.centro_custo_id);
    }
    const [{ data: orcs }, { data: reals }] = await Promise.all([qOrc, qReal]);

    const orcByMes  = Array(12).fill(0);
    const realByMes = Array(12).fill(0);
    (orcs || []).forEach(r => { orcByMes[r.mes - 1] += parseFloat(r.valor_planejado || 0); });
    (reals || []).forEach(r => { realByMes[r.mes - 1] += parseFloat(r.valor_realizado || 0); });

    const ctx = document.getElementById('chart-dash').getContext('2d');
    if (App.Dash.chartInst) App.Dash.chartInst.destroy();
    App.Dash.chartInst = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: App.meses,
        datasets: [
          { label: 'Or\u00e7ado',    data: orcByMes,  backgroundColor: '#E63329aa' },
          { label: 'Realizado', data: realByMes, backgroundColor: '#F5A623aa' },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { y: { ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } } },
      },
    });
  },

  async openModal(ccId, ccNome) {
    document.getElementById('modal-cc-title').textContent = ccNome;
    document.getElementById('modal-cc').classList.remove('hidden');
    const exercicio = App.state.exercicio;

    const [{ data: orcs }, { data: reals }] = await Promise.all([
      sb.from('orcamentos').select('mes, valor_planejado, naturezas(descricao)').eq('exercicio', exercicio).eq('centro_custo_id', ccId),
      sb.from('realizado').select('mes, valor_realizado, naturezas(descricao)').eq('exercicio', exercicio).eq('centro_custo_id', ccId),
    ]);

    // Gr\u00e1fico mensal
    const orcByMes = Array(12).fill(0);
    const realByMes = Array(12).fill(0);
    (orcs || []).forEach(r => { orcByMes[r.mes - 1] += parseFloat(r.valor_planejado || 0); });
    (reals || []).forEach(r => { realByMes[r.mes - 1] += parseFloat(r.valor_realizado || 0); });

    const ctx = document.getElementById('chart-modal').getContext('2d');
    if (App.Dash._modalChart) App.Dash._modalChart.destroy();
    App.Dash._modalChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: App.meses,
        datasets: [
          { label: 'Or\u00e7ado',    data: orcByMes,  backgroundColor: '#E63329aa' },
          { label: 'Realizado', data: realByMes, backgroundColor: '#F5A623aa' },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } },
    });

    // Tabela por natureza
    const natMap = {};
    (orcs || []).forEach(r => {
      const k = r.naturezas?.descricao || 'Sem natureza';
      if (!natMap[k]) natMap[k] = { orc: 0, real: 0 };
      natMap[k].orc += parseFloat(r.valor_planejado || 0);
    });
    (reals || []).forEach(r => {
      const k = r.naturezas?.descricao || 'Sem natureza';
      if (!natMap[k]) natMap[k] = { orc: 0, real: 0 };
      natMap[k].real += parseFloat(r.valor_realizado || 0);
    });

    let html = `<table class="w-full text-sm"><thead><tr class="text-left text-gray-500 border-b">
      <th class="pb-2">Natureza</th><th class="pb-2 text-right">Or\u00e7ado</th>
      <th class="pb-2 text-right">Realizado</th><th class="pb-2 text-right">% Uso</th></tr></thead><tbody>`;
    Object.entries(natMap).forEach(([k, v]) => {
      const pct = App.pctNum(v.real, v.orc);
      html += `<tr class="${App.usoRowCor(pct)}">
        <td class="py-1">${k}</td>
        <td class="py-1 text-right">${App.brl(v.orc)}</td>
        <td class="py-1 text-right">${App.brl(v.real)}</td>
        <td class="py-1 text-right"><span class="${App.usoCor(pct)}">${pct.toFixed(1)}%</span></td>
      </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('modal-cc-body').innerHTML = html;
  },
};

App.Modal = {
  close() { document.getElementById('modal-cc').classList.add('hidden'); },
};

// =============================================================
// INPUT OR\ufffd?AMENT\u00c1RIO
// =============================================================
App.Input = {
  init() {
    App.fillCCSelect('inp-cc');
    App.fillNatSelect('inp-nat');
    App.fillAplSelect('inp-apl');
    App.Input.loadTable();
  },

  async loadTable() {
    const ccId   = parseInt(document.getElementById('inp-cc')?.value);
    const natId  = parseInt(document.getElementById('inp-nat')?.value);
    const aplId  = document.getElementById('inp-apl')?.value || null;
    const exercicio = App.state.exercicio;
    const bloqueado = App.isEdicaoBloqueada();

    if (!ccId || !natId) return;

    let q = sb.from('orcamentos').select('*')
      .eq('exercicio', exercicio).eq('centro_custo_id', ccId).eq('natureza_id', natId);
    if (aplId) q = q.eq('aplicacao_id', aplId); else q = q.is('aplicacao_id', null);
    const { data: rows } = await q;

    const rowMap = {};
    (rows || []).forEach(r => { rowMap[r.mes] = r; });

    const tbody = document.getElementById('inp-table-body');
    tbody.innerHTML = '';
    let total = 0;

    App.mesesFull.forEach((m, i) => {
      const mes = i + 1;
      const val = parseFloat(rowMap[mes]?.valor_planejado || 0);
      const obs = rowMap[mes]?.observacao || '';
      total += val;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-1.5 pr-4 text-gray-700">${m}</td>
        <td class="py-1.5 pr-4">
          <input type="number" step="0.01" value="${val || ''}" placeholder="0,00"
            class="form-input w-40 inp-val" data-mes="${mes}" ${bloqueado ? 'disabled' : ''}
            oninput="App.Input.updateTotal()">
        </td>
        <td class="py-1.5">
          <input type="text" value="${obs}"
            class="form-input w-64 inp-obs" data-mes="${mes}" ${bloqueado ? 'disabled' : ''}
            placeholder="Observa\u00e7\u00e3o">
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('inp-total').textContent = App.brl(total);
  },

  updateTotal() {
    const vals = document.querySelectorAll('.inp-val');
    let t = 0;
    vals.forEach(v => { t += parseFloat(v.value || 0); });
    document.getElementById('inp-total').textContent = App.brl(t);
  },

  async saveAll() {
    if (App.isEdicaoBloqueada()) { App.toast('Edi\u00e7\u00e3o encerrada.', 'error'); return; }
    const ccId  = parseInt(document.getElementById('inp-cc').value);
    const natId = parseInt(document.getElementById('inp-nat').value);
    const aplId = document.getElementById('inp-apl').value || null;
    const exercicio = App.state.exercicio;
    if (!ccId || !natId) { App.toast('Selecione CC e Natureza.', 'error'); return; }

    const vals = document.querySelectorAll('.inp-val');
    const obss = document.querySelectorAll('.inp-obs');
    const upserts = [];
    vals.forEach((v, i) => {
      const mes = parseInt(v.dataset.mes);
      const val = parseFloat(v.value || 0);
      upserts.push({
        exercicio, mes, centro_custo_id: ccId, natureza_id: natId,
        aplicacao_id: aplId ? parseInt(aplId) : null,
        valor_planejado: val,
        observacao: obss[i]?.value || null,
        atualizado_por: App.state.user?.email,
      });
    });

    const { error } = await sb.from('orcamentos').upsert(upserts, {
      onConflict: 'exercicio,mes,centro_custo_id,natureza_id,aplicacao_id',
    });
    if (error) App.toast('Erro ao salvar: ' + error.message, 'error');
    else App.toast('Or\u00e7amento salvo com sucesso!', 'success');
  },

  async importAnterior() {
    if (App.isEdicaoBloqueada()) { App.toast('Edi\u00e7\u00e3o encerrada.', 'error'); return; }
    const ccId  = parseInt(document.getElementById('inp-cc').value);
    const natId = parseInt(document.getElementById('inp-nat').value);
    const aplId = document.getElementById('inp-apl').value || null;
    const exercicio = App.state.exercicio;
    if (!ccId || !natId) { App.toast('Selecione CC e Natureza.', 'error'); return; }

    let q = sb.from('orcamentos').select('mes, valor_planejado')
      .eq('exercicio', exercicio - 1).eq('centro_custo_id', ccId).eq('natureza_id', natId);
    if (aplId) q = q.eq('aplicacao_id', aplId); else q = q.is('aplicacao_id', null);
    const { data } = await q;
    if (!data?.length) { App.toast('Nenhum dado no exerc\u00edcio anterior.', 'info'); return; }

    const rowMap = {};
    data.forEach(r => { rowMap[r.mes] = r.valor_planejado; });
    document.querySelectorAll('.inp-val').forEach(v => {
      const mes = parseInt(v.dataset.mes);
      if (rowMap[mes] !== undefined) v.value = rowMap[mes];
    });
    App.Input.updateTotal();
    App.toast('Valores importados do exerc\u00edcio anterior.', 'info');
  },
};

// =============================================================
// LAN\ufffd?AR REALIZADO
// =============================================================
App.Realizado = {
  init() {
    App.fillCCSelect('real-cc');
    App.fillNatSelect('real-nat');
    App.fillAplSelect('real-apl');
    // M\u00eas atual
    document.getElementById('real-mes').value = App.state.mes;
  },

  async saveAll() {
    const ccId  = parseInt(document.getElementById('real-cc').value);
    const natId = parseInt(document.getElementById('real-nat').value);
    const aplId = document.getElementById('real-apl').value || null;
    const mes   = parseInt(document.getElementById('real-mes').value);
    const valor = parseFloat(document.getElementById('real-valor').value || 0);
    const doc   = document.getElementById('real-doc').value;
    const desc  = document.getElementById('real-desc').value;
    const exercicio = App.state.exercicio;

    if (!ccId || !natId || !valor) { App.toast('Preencha CC, Natureza e Valor.', 'error'); return; }

    const { error } = await sb.from('realizado').insert({
      exercicio, mes, centro_custo_id: ccId, natureza_id: natId,
      aplicacao_id: aplId ? parseInt(aplId) : null,
      valor_realizado: valor, documento: doc, descricao: desc,
      criado_por: App.state.user?.email,
    });
    if (error) App.toast('Erro: ' + error.message, 'error');
    else {
      App.toast('Lan\u00e7amento registrado!', 'success');
      document.getElementById('real-valor').value = '';
      document.getElementById('real-doc').value   = '';
      document.getElementById('real-desc').value  = '';
    }
  },
};


// =============================================================
// APRESENTA\ufffd?\ufffdfO
// =============================================================
App.Apres = {
  chartPizza: null,
  chartLinha: null,

  async load() {
    const exercicio = App.state.exercicio;
    const p = App.state.perfil;
    const mesAtual = new Date().getMonth() + 1;

    let qOrc = sb.from('orcamentos').select('*, centros_custo(pilar,diretoria,id)').eq('exercicio', exercicio);
    let qReal = sb.from('realizado').select('*, centros_custo(pilar,diretoria,id)').eq('exercicio', exercicio);

    if (p.nivel_acesso === 'GESTOR') {
      qOrc = qOrc.eq('centro_custo_id', p.centro_custo_id);
      qReal = qReal.eq('centro_custo_id', p.centro_custo_id);
    }

    const [{ data: orcs }, { data: reals }] = await Promise.all([qOrc, qReal]);

    // Agrupa por pilar
    const pilares = {};
    const addPilar = (pilar) => { if (!pilares[pilar]) pilares[pilar] = { orc: 0, real: 0 }; };
    (orcs || []).forEach(r => {
      if (!r.centros_custo) return;
      if (p.nivel_acesso === 'DIRETORIA' && r.centros_custo.diretoria !== p.diretoria) return;
      addPilar(r.centros_custo.pilar);
      pilares[r.centros_custo.pilar].orc += parseFloat(r.valor_planejado || 0);
    });
    (reals || []).forEach(r => {
      if (!r.centros_custo) return;
      if (p.nivel_acesso === 'DIRETORIA' && r.centros_custo.diretoria !== p.diretoria) return;
      addPilar(r.centros_custo.pilar);
      pilares[r.centros_custo.pilar].real += parseFloat(r.valor_realizado || 0);
    });

    // Pizza
    const ctxPizza = document.getElementById('chart-pizza').getContext('2d');
    if (App.Apres.chartPizza) App.Apres.chartPizza.destroy();
    App.Apres.chartPizza = new Chart(ctxPizza, {
      type: 'doughnut',
      data: {
        labels: Object.keys(pilares),
        datasets: [{ data: Object.values(pilares).map(v => v.orc), backgroundColor: ['#E63329','#F5A623','#3b82f6','#10b981'] }],
      },
      options: { responsive: true, plugins: { legend: { position: 'right' } } },
    });

    // Linha mensal acumulado
    const orcByMes  = Array(12).fill(0);
    const realByMes = Array(12).fill(0);
    (orcs || []).forEach(r => {
      if (p.nivel_acesso === 'DIRETORIA' && r.centros_custo?.diretoria !== p.diretoria) return;
      orcByMes[r.mes - 1] += parseFloat(r.valor_planejado || 0);
    });
    (reals || []).forEach(r => {
      if (p.nivel_acesso === 'DIRETORIA' && r.centros_custo?.diretoria !== p.diretoria) return;
      realByMes[r.mes - 1] += parseFloat(r.valor_realizado || 0);
    });

    const ctxLinha = document.getElementById('chart-linha').getContext('2d');
    if (App.Apres.chartLinha) App.Apres.chartLinha.destroy();
    App.Apres.chartLinha = new Chart(ctxLinha, {
      type: 'line',
      data: {
        labels: App.meses,
        datasets: [
          { label: 'Or\u00e7ado',    data: orcByMes,  borderColor: '#E63329', fill: false, tension: 0.3 },
          { label: 'Realizado', data: realByMes, borderColor: '#F5A623', fill: false, tension: 0.3 },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } },
    });

    // Tabela resumo
    const tbody = document.getElementById('apres-table-body');
    tbody.innerHTML = '';
    Object.entries(pilares).forEach(([pilar, v]) => {
      const pct = App.pctNum(v.real, v.orc);
      const proj = v.orc > 0 && mesAtual > 0 ? (v.real / mesAtual) * 12 : 0;
      const tr = document.createElement('tr');
      tr.className = 'border-b ' + App.usoRowCor(pct);
      tr.innerHTML = `
        <td class="py-2">${pilar}</td>
        <td class="py-2 text-right">${App.brl(v.orc)}</td>
        <td class="py-2 text-right">${App.brl(v.real)}</td>
        <td class="py-2 text-right"><span class="${App.usoCor(pct)}">${pct.toFixed(1)}%</span></td>
        <td class="py-2 text-right">${App.brl(proj)}</td>
      `;
      tbody.appendChild(tr);
    });

    // Top 5 desvios
    const ccMap = {};
    (orcs || []).forEach(r => {
      if (!r.centro_custo_id) return;
      if (!ccMap[r.centro_custo_id]) ccMap[r.centro_custo_id] = { nome: r.centros_custo?.nome || '', orc: 0, real: 0 };
      ccMap[r.centro_custo_id].orc += parseFloat(r.valor_planejado || 0);
    });
    (reals || []).forEach(r => {
      if (!r.centro_custo_id) return;
      if (!ccMap[r.centro_custo_id]) ccMap[r.centro_custo_id] = { nome: r.centros_custo?.nome || '', orc: 0, real: 0 };
      ccMap[r.centro_custo_id].real += parseFloat(r.valor_realizado || 0);
    });
    const top5 = Object.values(ccMap)
      .filter(c => c.real > c.orc)
      .sort((a, b) => (b.real - b.orc) - (a.real - a.orc))
      .slice(0, 5);

    const top5div = document.getElementById('top5-body');
    if (!top5.length) { top5div.innerHTML = '<p class="text-sm text-gray-500">Nenhum centro com desvio positivo.</p>'; return; }
    top5div.innerHTML = top5.map(c => `
      <div class="flex justify-between items-center py-2 border-b last:border-0">
        <span class="text-sm text-gray-700">${c.nome}</span>
        <span class="text-sm text-red-600 font-semibold">+${App.brl(c.real - c.orc)}</span>
      </div>
    `).join('');
  },
};

// =============================================================
// PROJE\ufffd?\ufffd.ES
// =============================================================
App.Projecoes = {
  chartInst: null,

  init() {
    App.fillCCSelect('proj-cc', true);
    App.Projecoes.calcular();
  },

  async calcular() {
    const ccId = document.getElementById('proj-cc')?.value;
    const ajuste = parseFloat(document.getElementById('proj-ajuste')?.value || 5) / 100;
    const exercicio = App.state.exercicio;
    const mesAtual = new Date().getMonth() + 1;

    let qOrc = sb.from('orcamentos').select('mes, valor_planejado, naturezas(descricao)').eq('exercicio', exercicio);
    let qReal = sb.from('realizado').select('mes, valor_realizado').eq('exercicio', exercicio);
    if (ccId) { qOrc = qOrc.eq('centro_custo_id', ccId); qReal = qReal.eq('centro_custo_id', ccId); }

    const [{ data: orcs }, { data: reals }] = await Promise.all([qOrc, qReal]);

    const orcByMes = Array(12).fill(0);
    const realByMes = Array(12).fill(0);
    (orcs || []).forEach(r => { orcByMes[r.mes - 1] += parseFloat(r.valor_planejado || 0); });
    (reals || []).forEach(r => { realByMes[r.mes - 1] += parseFloat(r.valor_realizado || 0); });

    // Calcula m\u00e9dia dos \u00faltimos 3 meses com realizado
    const ultimos3 = realByMes.slice(Math.max(0, mesAtual - 3), mesAtual).filter(v => v > 0);
    const media3 = ultimos3.length ? ultimos3.reduce((a,b)=>a+b,0)/ultimos3.length : 0;

    // Monta 24 meses
    const labels = [];
    const proj1  = [];
    const proj2  = [];
    const realHist = [];
    const orcHist  = [];

    for (let i = 0; i < 24; i++) {
      const mesIdx = i % 12;
      const ano    = exercicio + Math.floor(i / 12);
      labels.push(`${App.meses[mesIdx]}/${ano}`);

      if (i < 12) {
        // Ano 1
        if (i < mesAtual - 1) {
          // Passou \ufffd?" usa realizado
          proj1.push(realByMes[mesIdx]);
          realHist.push(realByMes[mesIdx]);
          orcHist.push(orcByMes[mesIdx]);
        } else {
          // Futuro \ufffd?" usa or\u00e7ado ou m\u00e9dia
          const v = orcByMes[mesIdx] > 0 ? orcByMes[mesIdx] : media3;
          proj1.push(v);
          realHist.push(null);
          orcHist.push(orcByMes[mesIdx]);
        }
        proj2.push(null);
      } else {
        // Ano 2 \ufffd?" usa or\u00e7ado do mesmo m\u00eas * (1 + ajuste)
        const baseVal = orcByMes[mesIdx] > 0 ? orcByMes[mesIdx] : media3;
        proj2.push(parseFloat((baseVal * (1 + ajuste)).toFixed(2)));
        proj1.push(null);
        realHist.push(null);
        orcHist.push(null);
      }
    }

    // Tabela
    const thead = document.getElementById('proj-thead');
    const tbody = document.getElementById('proj-tbody');
    thead.innerHTML = `<tr><th class="text-left sticky left-0 bg-gray-50">Per\u00edodo</th>
      <th>Or\u00e7ado</th><th>Realizado</th><th>Proje\u00e7\u00e3o Ano 1</th><th>Proje\u00e7\u00e3o Ano 2</th></tr>`;
    tbody.innerHTML = '';
    labels.forEach((l, i) => {
      const tr = document.createElement('tr');
      const isPassado = i < (new Date().getMonth() + 1) && i < 12;
      tr.className = isPassado ? 'proj-historico' : (i >= 12 ? 'proj-ano2' : 'proj-futuro');
      tr.innerHTML = `
        <td class="sticky left-0 bg-white font-medium">${l}</td>
        <td class="text-right">${orcHist[i] != null ? App.brl(orcHist[i]) : '\ufffd?"'}</td>
        <td class="text-right">${realHist[i] != null ? App.brl(realHist[i]) : '\ufffd?"'}</td>
        <td class="text-right">${proj1[i] != null ? App.brl(proj1[i]) : '\ufffd?"'}</td>
        <td class="text-right">${proj2[i] != null ? App.brl(proj2[i]) : '\ufffd?"'}</td>
      `;
      tbody.appendChild(tr);
    });

    // Gr\u00e1fico
    const ctx = document.getElementById('chart-proj').getContext('2d');
    if (App.Projecoes.chartInst) App.Projecoes.chartInst.destroy();
    App.Projecoes.chartInst = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Realizado Hist\u00f3rico', data: realHist, borderColor: '#F5A623', spanGaps: false, tension: 0.3 },
          { label: 'Or\u00e7ado',             data: orcHist,  borderColor: '#E63329', spanGaps: false, borderDash:[5,5], tension: 0.3 },
          { label: 'Proje\u00e7\u00e3o Ano 1',     data: proj1,    borderColor: '#6b7280', spanGaps: false, tension: 0.3 },
          { label: 'Proje\u00e7\u00e3o Ano 2',     data: proj2,    borderColor: '#2563eb', spanGaps: false, tension: 0.3 },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } },
    });

    App.Projecoes._labels = labels;
    App.Projecoes._orcHist = orcHist;
    App.Projecoes._realHist = realHist;
    App.Projecoes._proj1 = proj1;
    App.Projecoes._proj2 = proj2;
  },

  exportCsv() {
    const rows = [['Per\u00edodo','Or\u00e7ado','Realizado','Proje\u00e7\u00e3o Ano 1','Proje\u00e7\u00e3o Ano 2']];
    (App.Projecoes._labels || []).forEach((l, i) => {
      rows.push([l,
        App.Projecoes._orcHist[i] ?? '',
        App.Projecoes._realHist[i] ?? '',
        App.Projecoes._proj1[i] ?? '',
        App.Projecoes._proj2[i] ?? '',
      ]);
    });
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `projecao_${App.state.exercicio}.csv`; a.click();
    URL.revokeObjectURL(url);
  },
};

// =============================================================
// SOLICITAR REVIS\ufffdfO
// =============================================================
App.Revisao = {
  init() {
    App.fillCCSelect('rev-cc');
    App.fillNatSelect('rev-nat');
    App.fillAplSelect('rev-apl');
    document.getElementById('rev-mes').value = App.state.mes;
    document.getElementById('rev-justificativa').addEventListener('input', function() {
      document.getElementById('rev-char-count').textContent =
        `${this.value.length} / m\u00ednimo 50 caracteres`;
    });
  },

  async enviar() {
    const ccId  = parseInt(document.getElementById('rev-cc').value);
    const natId = parseInt(document.getElementById('rev-nat').value);
    const aplId = document.getElementById('rev-apl').value || null;
    const mes   = parseInt(document.getElementById('rev-mes').value);
    const solicitado = parseFloat(document.getElementById('rev-solicitado').value || 0);
    const justi = document.getElementById('rev-justificativa').value.trim();
    const exercicio = App.state.exercicio;

    if (!ccId || !natId) { App.toast('Selecione CC e Natureza.', 'error'); return; }
    if (!solicitado)      { App.toast('Informe o valor solicitado.', 'error'); return; }
    if (justi.length < 50){ App.toast('Justificativa deve ter ao menos 50 caracteres.', 'error'); return; }

    // Busca valor atual
    let q = sb.from('orcamentos').select('valor_planejado')
      .eq('exercicio', exercicio).eq('mes', mes)
      .eq('centro_custo_id', ccId).eq('natureza_id', natId);
    if (aplId) q = q.eq('aplicacao_id', aplId); else q = q.is('aplicacao_id', null);
    const { data: row } = await q.single();
    const valorAtual = parseFloat(row?.valor_planejado || 0);

    const { error } = await sb.from('solicitacoes_revisao').insert({
      centro_custo_id: ccId, natureza_id: natId,
      aplicacao_id: aplId ? parseInt(aplId) : null,
      exercicio, mes, valor_atual: valorAtual,
      valor_solicitado: solicitado, justificativa: justi,
      solicitado_por: App.state.user?.email,
    });

    if (error) { App.toast('Erro: ' + error.message, 'error'); return; }
    App.toast('Solicita\u00e7\u00e3o enviada com sucesso!', 'success');
    document.getElementById('rev-solicitado').value = '';
    document.getElementById('rev-justificativa').value = '';
    document.getElementById('rev-char-count').textContent = '0 / m\u00ednimo 50 caracteres';
  },
};

// =============================================================
// MINHAS SOLICITA\ufffd?\ufffd.ES
// =============================================================
App.MinhasSol = {
  async load() {
    const { data } = await sb.from('solicitacoes_revisao')
      .select('*, centros_custo(nome), naturezas(descricao)')
      .eq('solicitado_por', App.state.user?.email)
      .order('solicitado_em', { ascending: false });

    const tbody = document.getElementById('minhassol-body');
    if (!data?.length) { tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-gray-400">Nenhuma solicita\u00e7\u00e3o.</td></tr>'; return; }

    tbody.innerHTML = data.map(r => `
      <tr class="border-b text-sm">
        <td class="py-2">${new Date(r.solicitado_em).toLocaleDateString('pt-BR')}</td>
        <td class="py-2">${r.centros_custo?.nome || ''} / ${r.naturezas?.descricao || ''}</td>
        <td class="py-2 text-right">${App.brl(r.valor_atual)}</td>
        <td class="py-2 text-right">${App.brl(r.valor_solicitado)}</td>
        <td class="py-2"><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
        <td class="py-2 text-gray-500 text-xs">${r.comentario_resp || '\ufffd?"'}</td>
      </tr>
    `).join('');
  },
};

// =============================================================
// APROVA\ufffd?\ufffd.ES (MASTER)
// =============================================================
App.Aprovacoes = {
  async load() {
    const { data } = await sb.from('solicitacoes_revisao')
      .select('*, centros_custo(nome), naturezas(descricao)')
      .eq('status', 'PENDENTE')
      .order('solicitado_em', { ascending: false });

    const body = document.getElementById('aprovacoes-body');
    if (!data?.length) { body.innerHTML = '<p class="text-sm text-gray-500">Nenhuma solicita\u00e7\u00e3o pendente.</p>'; return; }

    body.innerHTML = data.map(r => `
      <div class="aprovacao-card" id="sol-${r.id}">
        <div class="flex justify-between flex-wrap gap-2 mb-2">
          <div>
            <p class="font-semibold text-gray-800">${r.centros_custo?.nome || ''}</p>
            <p class="text-sm text-gray-500">${r.naturezas?.descricao || ''} \ufffd?" M\u00eas ${r.mes}/${r.exercicio}</p>
            <p class="text-xs text-gray-400 mt-1">Solicitado por: ${r.solicitado_por} em ${new Date(r.solicitado_em).toLocaleDateString('pt-BR')}</p>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-500">Atual: <strong>${App.brl(r.valor_atual)}</strong></p>
            <p class="text-sm text-gray-700">Solicitado: <strong class="text-blue-600">${App.brl(r.valor_solicitado)}</strong></p>
          </div>
        </div>
        <p class="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded"><em>"${r.justificativa}"</em></p>
        <div class="flex flex-wrap gap-2 items-center">
          <input id="coment-${r.id}" type="text" placeholder="Coment\u00e1rio (obrigat\u00f3rio)"
            class="form-input flex-1 min-w-48">
          <button onclick="App.Aprovacoes.decidir(${r.id},'APROVADA')" class="btn-success">\ufffdo. Aprovar</button>
          <button onclick="App.Aprovacoes.decidir(${r.id},'REJEITADA')" class="btn-danger">\ufffdO Rejeitar</button>
        </div>
      </div>
    `).join('');
    App.Aprovacoes._data = data;
  },

  async decidir(id, status) {
    const coment = document.getElementById('coment-' + id)?.value?.trim();
    if (!coment) { App.toast('Informe um coment\u00e1rio.', 'error'); return; }

    const sol = App.Aprovacoes._data?.find(r => r.id === id);
    if (!sol) return;

    const { error } = await sb.from('solicitacoes_revisao').update({
      status, comentario_resp: coment,
      analisado_por: App.state.user?.email,
      analisado_em: new Date().toISOString(),
    }).eq('id', id);

    if (error) { App.toast('Erro: ' + error.message, 'error'); return; }

    // Se aprovado, atualiza or\u00e7amento
    if (status === 'APROVADA') {
      await sb.from('orcamentos').upsert({
        exercicio: sol.exercicio, mes: sol.mes,
        centro_custo_id: sol.centro_custo_id, natureza_id: sol.natureza_id,
        aplicacao_id: sol.aplicacao_id,
        valor_planejado: sol.valor_solicitado,
        atualizado_por: App.state.user?.email,
      }, { onConflict: 'exercicio,mes,centro_custo_id,natureza_id,aplicacao_id' });
    }

    App.toast(`Solicita\u00e7\u00e3o ${status.toLowerCase()}!`, 'success');
    document.getElementById('sol-' + id)?.remove();
  },
};

// =============================================================
// GEST\ufffdfO DE USU\u00c1RIOS (MASTER)
// =============================================================
App.Usuarios = {
  async load() {
    const { data } = await sb.from('usuarios_responsaveis')
      .select('*, centros_custo(nome)').order('nome');

    const tbody = document.getElementById('usuarios-body');
    if (!data?.length) { tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-gray-400">Nenhum usu\u00e1rio.</td></tr>'; return; }

    tbody.innerHTML = data.map(u => `
      <tr class="border-b text-sm ${u.ativo ? '' : 'opacity-50'}">
        <td class="py-2">${u.nome || '\ufffd?"'}</td>
        <td class="py-2 text-gray-500">${u.email}</td>
        <td class="py-2"><span class="badge badge-${u.nivel_acesso.toLowerCase()}">${u.nivel_acesso}</span></td>
        <td class="py-2">${u.centros_custo?.nome || (u.nivel_acesso === 'GESTOR' ? '\ufffd?"' : 'Acesso Total')}</td>
        <td class="py-2">${u.ativo ? '\ufffdo. Ativo' : '\ufffd>" Inativo'}</td>
        <td class="py-2 flex gap-1">
          <button onclick="App.Usuarios.openForm(${u.id})" class="btn-secondary text-xs">Editar</button>
          <button onclick="App.Usuarios.toggleAtivo(${u.id},${!u.ativo})" class="btn-secondary text-xs">
            ${u.ativo ? 'Desativar' : 'Ativar'}
          </button>
        </td>
      </tr>
    `).join('');
    App.Usuarios._data = data;
  },

  openForm(id) {
    const card = document.getElementById('usuario-form-card');
    card.classList.remove('hidden');
    document.getElementById('usu-id').value = id || '';
    document.getElementById('usuario-form-title').textContent = id ? 'Editar Usu\u00e1rio' : 'Novo Usu\u00e1rio';

    // Preenche select de CCs
    const sel = document.getElementById('usu-cc');
    sel.innerHTML = '<option value="">\ufffd?" Selecione \ufffd?"</option>';
    App.cache.centros.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.nome;
      sel.appendChild(o);
    });

    if (id) {
      const u = App.Usuarios._data?.find(u => u.id === id);
      if (u) {
        document.getElementById('usu-nome').value  = u.nome || '';
        document.getElementById('usu-email').value = u.email;
        document.getElementById('usu-nivel').value = u.nivel_acesso;
        document.getElementById('usu-cc').value    = u.centro_custo_id || '';
        document.getElementById('usu-dir').value   = u.diretoria || '';
        App.Usuarios.toggleCCField();
      }
    } else {
      document.getElementById('usu-nome').value  = '';
      document.getElementById('usu-email').value = '';
      document.getElementById('usu-nivel').value = 'GESTOR';
      App.Usuarios.toggleCCField();
    }
  },

  closeForm() { document.getElementById('usuario-form-card').classList.add('hidden'); },

  toggleCCField() {
    const nivel = document.getElementById('usu-nivel').value;
    document.getElementById('usu-cc-field').classList.toggle('hidden', nivel !== 'GESTOR');
    document.getElementById('usu-dir-field').classList.toggle('hidden', nivel !== 'DIRETORIA');
  },

  async save() {
    const id    = document.getElementById('usu-id').value;
    const nome  = document.getElementById('usu-nome').value.trim();
    const email = document.getElementById('usu-email').value.trim();
    const nivel = document.getElementById('usu-nivel').value;
    const ccId  = document.getElementById('usu-cc').value || null;
    const dir   = document.getElementById('usu-dir').value.trim() || null;

    if (!email || !nivel) { App.toast('E-mail e n\u00edvel s\u00e3o obrigat\u00f3rios.', 'error'); return; }

    const payload = {
      nome, email, nivel_acesso: nivel,
      centro_custo_id: (nivel === 'GESTOR' && ccId) ? parseInt(ccId) : null,
      diretoria: nivel === 'DIRETORIA' ? dir : null,
    };

    let error;
    if (id) {
      ({ error } = await sb.from('usuarios_responsaveis').update(payload).eq('id', parseInt(id)));
    } else {
      ({ error } = await sb.from('usuarios_responsaveis').insert(payload));
    }

    if (error) App.toast('Erro: ' + error.message, 'error');
    else {
      App.toast('Usu\u00e1rio salvo!', 'success');
      App.Usuarios.closeForm();
      App.Usuarios.load();
    }
  },

  async toggleAtivo(id, ativo) {
    await sb.from('usuarios_responsaveis').update({ ativo }).eq('id', id);
    App.Usuarios.load();
  },
};

// =============================================================
// CONFIGURA\ufffd?\ufffd.ES (MASTER)
// =============================================================
App.Config = {
  async load() {
    const cfg = App.state.config;
    if (!cfg) return;
    document.getElementById('cfg-exercicio').value    = cfg.exercicio_atual || 2025;
    document.getElementById('cfg-data-limite').value  = cfg.data_limite_edicao || '';
    document.getElementById('cfg-amarelo').value      = cfg.perc_alerta_amarelo || 80;
    document.getElementById('cfg-vermelho').value     = cfg.perc_alerta_vermelho || 100;
  },

  async save() {
    const exercicio    = parseInt(document.getElementById('cfg-exercicio').value);
    const dataLimite   = document.getElementById('cfg-data-limite').value || null;
    const amarelo      = parseInt(document.getElementById('cfg-amarelo').value);
    const vermelho     = parseInt(document.getElementById('cfg-vermelho').value);

    const { error } = await sb.from('config_sistema').update({
      exercicio_atual: exercicio,
      data_limite_edicao: dataLimite,
      perc_alerta_amarelo: amarelo,
      perc_alerta_vermelho: vermelho,
    }).eq('id', 1);

    if (error) { App.toast('Erro: ' + error.message, 'error'); return; }

    App.state.config.exercicio_atual     = exercicio;
    App.state.config.data_limite_edicao  = dataLimite;
    App.state.config.perc_alerta_amarelo = amarelo;
    App.state.config.perc_alerta_vermelho = vermelho;
    App.state.exercicio = exercicio;
    document.getElementById('sel-exercicio').value = exercicio;
    document.getElementById('exercicio-label').textContent = `Or\u00e7amento ${exercicio}`;

    const msg = document.getElementById('cfg-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
    App.toast('Configura\u00e7\u00f5es salvas!', 'success');
  },
};

// =============================================================
// INICIALIZA
// =============================================================
document.addEventListener('DOMContentLoaded', () => App.init());

