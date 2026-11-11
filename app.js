/* =========================================================
   Treino Junto: interface
   Etapa 1: login, perfil, plano da semana e checklist do dia.
   ========================================================= */

import * as Store from './store.js';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_NOME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const SUGESTOES = ['Agachamento livre', 'Leg press 45°', 'Cadeira extensora', 'Cadeira flexora', 'Stiff', 'Elevação pélvica',
  'Abdutora', 'Panturrilha em pé', 'Supino reto', 'Puxada frontal', 'Remada baixa', 'Desenvolvimento com halter',
  'Elevação lateral', 'Rosca direta', 'Tríceps corda', 'Prancha', 'Abdominal infra', 'Esteira', 'Bicicleta', 'Escada', 'Elíptico'];

const ERROS = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-email': 'Digite o e-mail.',
  'auth/missing-password': 'Digite a senha.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não existe conta com esse e-mail.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem internet. Confira a conexão e tente de novo.',
  'permission-denied': 'Sem permissão para isso. Confira se as regras do Firestore foram publicadas.',
};
const mensagemErro = err => ERROS[err?.code] || err?.message || 'Algo deu errado. Tente de novo.';

// ---------- Datas (sempre no fuso do aparelho) ----------
const pad = n => String(n).padStart(2, '0');
const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => new Date();
function semanaAtual() { // segunda a domingo
  const d = hoje(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => crypto.randomUUID().slice(0, 8);
const $ = s => document.querySelector(s);
const app = $('#app');

function toast(texto) {
  const el = $('#toast');
  el.textContent = texto; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- Estado ----------
const S = {
  user: undefined,   // undefined = ainda carregando; null = sem login
  perfil: undefined,
  plano: {},
  registros: {},
  aba: 'hoje',
  diaSel: hoje().getDay(),
  modoLogin: 'entrar',
  conexoes: [],      // todas as conexões em que eu apareço (dos dois lados)
  acompId: null,     // id da conexão que estou vendo na aba Acompanhar
  acomp: null,       // { chave, plano, registros, carregado, bloqueado } da pessoa acompanhada
  confirmar: null,   // id da conexão esperando o segundo toque em "Remover"
};
let pararEscutas = [];
let pararAcomp = [];
let cadastrando = false;

// ---------- Ícones ----------
const ICONE = {
  hoje: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>',
  semana: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  perfil: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  acompanhar: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
};
const ABAS = [['hoje', 'Hoje'], ['semana', 'Semana'], ['acompanhar', 'Acompanhar'], ['perfil', 'Perfil']];

function mostrarNav(visivel) {
  $('#nav').hidden = !visivel;
  const pedidos = pedidosRecebidos().length;
  if (visivel) $('#navin').innerHTML = ABAS.map(([k, l]) => `<button class="${S.aba === k ? 'on' : ''}" data-aba="${k}">${ICONE[k]}${l}${k === 'perfil' && pedidos ? ` <span class="badge">${pedidos}</span>` : ''}</button>`).join('');
}

// ---------- Conexões ----------
const meuUid = () => S.user?.uid;
const pedidosRecebidos = () => S.conexoes.filter(c => c.atleta === meuUid() && c.status === 'pendente');
const meusAcompanhantes = () => S.conexoes.filter(c => c.atleta === meuUid() && c.status === 'aceita');
const quemAcompanho = () => S.conexoes.filter(c => c.viewer === meuUid());
const nomeDe = (c, lado) => (lado === 'atleta' ? c.atletaNome : c.viewerNome) || 'Alguém';

// ---------- Regras do dia ----------
function statusDia(d, planoSemana = S.plano, registros = S.registros) {
  const data = isoDe(d);
  const plano = planoSemana[d.getDay()];
  const temTreino = plano && plano.exercicios?.length;
  const feitos = registros[data]?.feitos?.length || 0;
  if (feitos) return 'done';
  if (!temTreino) return 'rest';
  const hojeIso = isoDe(hoje());
  if (data < hojeIso) return 'missed';
  return 'future';
}
function resumoSemana(planoSemana = S.plano, registros = S.registros) {
  const semana = semanaAtual();
  return {
    feitos: semana.filter(d => statusDia(d, planoSemana, registros) === 'done').length,
    planejados: semana.filter(d => planoSemana[d.getDay()]?.exercicios?.length).length,
    faltas: semana.filter(d => statusDia(d, planoSemana, registros) === 'missed').length,
  };
}

// ---------- Telas ----------
function telaSemConfig() {
  mostrarNav(false);
  app.innerHTML = `<div class="hero"><span class="label">Falta um passo</span><h1>Treino Junto</h1>
    <p class="muted">O app ainda não está ligado ao Firebase. Abra o arquivo <b>firebase-config.js</b> e cole os dados do seu projeto, como explicado no <b>COMO-CONFIGURAR.md</b>.</p></div>`;
}

function telaLogin() {
  mostrarNav(false);
  const criar = S.modoLogin === 'criar';
  app.innerHTML = `
  <div class="hero"><h1>Treino Junto</h1>
    <p class="muted">Monte seus treinos da semana, marque o que já fez e treine junto com quem te incentiva.</p></div>
  <div class="seg" role="tablist">
    <button type="button" data-modo="entrar" class="${criar ? '' : 'on'}">Entrar</button>
    <button type="button" data-modo="criar" class="${criar ? 'on' : ''}">Criar conta</button>
  </div>
  <form class="stack" id="formLogin" style="margin-top:14px" novalidate>
    ${criar ? `<div class="field"><label class="label" for="lnome">Nome</label><input id="lnome" autocomplete="given-name" placeholder="Como quer ser chamada(o)" required maxlength="40"></div>` : ''}
    <div class="field"><label class="label" for="lemail">E-mail</label>
      <input id="lemail" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="nome@email.com" required></div>
    <div class="field"><label class="label" for="lsenha">Senha</label>
      <input id="lsenha" type="password" autocomplete="${criar ? 'new-password' : 'current-password'}" placeholder="${criar ? 'Pelo menos 6 caracteres' : '••••••••'}" required></div>
    <p class="erro" id="loginErro" hidden></p>
    <button class="btn" type="submit" id="loginBtn">${criar ? 'Criar conta' : 'Entrar'}</button>
    ${criar ? '' : '<button class="link" type="button" data-acao="esqueci">Esqueci minha senha</button>'}
  </form>`;
}

function cabecalho() {
  const d = hoje();
  const nome = S.perfil?.nome || S.user?.nome || '';
  return `<div class="top"><div class="grow"><span class="label">${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
    <h1>Oi, ${esc(nome.split(' ')[0])}</h1></div></div>`;
}

function cartaoTreino(dia, data, planoSemana = S.plano, registros = S.registros, editavel = true) {
  const plano = planoSemana[dia];
  if (!plano?.exercicios?.length) {
    return `<div class="card stack"><h3>Dia de descanso</h3><p class="muted small">Nenhum treino planejado para ${DIAS_NOME[dia].toLowerCase()}.</p>
      ${editavel ? `<button class="btn sm ghost" data-aba="semana" data-dia="${dia}">Montar treino deste dia</button>` : ''}</div>`;
  }
  const feitos = registros[data]?.feitos || [];
  const qtd = plano.exercicios.filter(e => feitos.includes(e.id)).length;
  const pct = Math.round(100 * qtd / plano.exercicios.length);
  return `<div class="card stack">
    <div class="row between"><h2 class="grow">${esc(plano.titulo || 'Treino de ' + DIAS_NOME[dia].toLowerCase())}</h2><span class="small muted tabular">${qtd}/${plano.exercicios.length}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div>${plano.exercicios.map(e => {
      const ok = feitos.includes(e.id);
      return `<div class="ex ${ok ? 'ok' : ''}">
        ${editavel ? `<button class="chk" data-marcar="${e.id}" aria-pressed="${ok}" aria-label="${ok ? 'Desmarcar' : 'Marcar'} ${esc(e.nome)}">${ok ? '✓' : ''}</button>`
          : `<span class="chk" aria-label="${ok ? 'Feito' : 'Não feito'}">${ok ? '✓' : ''}</span>`}
        <div class="grow"><div class="ex-nome">${esc(e.nome)}</div><div class="small muted tabular">${descricaoEx(e)}</div></div></div>`;
    }).join('')}</div></div>`;
}
const descricaoEx = e => [e.series && `${e.series} × ${esc(e.reps || '—')}`, e.carga && esc(e.carga)].filter(Boolean).join(' · ');

function telaHoje() {
  const d = hoje();
  const r = resumoSemana();
  const plano = S.plano[d.getDay()];
  const feitos = S.registros[isoDe(d)]?.feitos?.length || 0;
  const total = plano?.exercicios?.length || 0;
  const pill = !total ? '<span class="pill ok">Descanso</span>'
    : feitos >= total ? '<span class="pill ok">Treino completo</span>'
    : feitos ? '<span class="pill wait">Em andamento</span>' : '<span class="pill wait">Ainda não começou</span>';
  const pedidos = pedidosRecebidos();
  return `${cabecalho()}
  ${pedidos.length ? `<section class="block"><div class="card stack aviso">
    <h3>${pedidos.length === 1 ? `${esc(nomeDe(pedidos[0], 'viewer'))} quer te acompanhar` : `${pedidos.length} pessoas querem te acompanhar`}</h3>
    <button class="btn sm" data-aba="perfil">Ver pedido</button></div></section>` : ''}
  <section class="block">
    <div class="grid3">
      <div class="stat"><span class="label">Semana</span><b class="tabular">${r.feitos}/${r.planejados}</b><span class="small muted">treinos</span></div>
      <div class="stat"><span class="label">Hoje</span><b class="tabular">${feitos}/${total}</b><span class="small muted">exercícios</span></div>
      <div class="stat"><span class="label">Meta</span><b class="tabular">${S.perfil?.metaPeso ?? '—'}</b><span class="small muted">kg</span></div>
    </div>
  </section>
  <section class="block">
    <div class="row between"><span class="label">Treino de hoje</span>${pill}</div>
    ${cartaoTreino(d.getDay(), isoDe(d))}
  </section>
  ${Object.keys(S.plano).length ? '' : `<section class="block"><div class="card stack"><h3>Comece montando sua semana</h3>
    <p class="muted small">Na aba Semana você escolhe os exercícios de cada dia. Depois é só marcar aqui o que já fez.</p>
    <button class="btn" data-aba="semana">Montar minha semana</button></div></section>`}`;
}

function legenda() {
  return `<div class="legend"><span><i style="background:var(--accent)"></i>Treinou</span><span><i style="background:var(--hot)"></i>Faltou</span>
    <span><i style="background:var(--line)"></i>Planejado</span><span><i style="border:1px dashed var(--muted)"></i>Descanso</span></div>`;
}

function telaSemana() {
  const semana = semanaAtual();
  const dia = S.diaSel;
  const plano = S.plano[dia] || { titulo: '', exercicios: [] };
  const hojeIso = isoDe(hoje());
  return `${cabecalho()}
  <section class="block"><span class="label">Esta semana</span>
    <div class="week">${semana.map(d => `<button class="day ${statusDia(d)} ${d.getDay() === dia ? 'sel' : ''} ${isoDe(d) === hojeIso ? 'today' : ''}" data-dia="${d.getDay()}" aria-label="${DIAS_NOME[d.getDay()]}">
      <span>${DIAS[d.getDay()]}</span><b class="tabular">${d.getDate()}</b><span class="dot"></span></button>`).join('')}</div>
    ${legenda()}
  </section>
  <section class="block">
    <h2>${DIAS_NOME[dia]}</h2>
    <div class="field"><label class="label" for="titulo">Nome do treino</label>
      <input id="titulo" maxlength="60" value="${esc(plano.titulo)}" placeholder="Ex.: Treino A · Inferiores"></div>
    <div class="card">${plano.exercicios.length ? plano.exercicios.map((e, i) => `<div class="ex">
        <div class="grow"><div class="ex-nome">${esc(e.nome)}</div><div class="small muted tabular">${descricaoEx(e)}</div></div>
        <button class="icone" data-subir="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${esc(e.nome)}">↑</button>
        <button class="icone" data-remover="${e.id}" aria-label="Remover ${esc(e.nome)}">×</button></div>`).join('')
      : '<p class="muted small">Nenhum exercício. Sem exercícios, o dia conta como descanso.</p>'}</div>
  </section>
  <section class="block"><span class="label">Adicionar exercício</span>
    <form id="formEx" class="stack">
      <div class="field"><label class="label" for="exnome">Exercício</label>
        <input id="exnome" list="sugestoes" placeholder="Ex.: Supino reto" required maxlength="60">
        <datalist id="sugestoes">${SUGESTOES.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist></div>
      <div class="grid3">
        <div class="field"><label class="label" for="exseries">Séries</label><input id="exseries" type="number" inputmode="numeric" min="1" max="20" value="3"></div>
        <div class="field"><label class="label" for="exreps">Reps</label><input id="exreps" value="12" maxlength="12"></div>
        <div class="field"><label class="label" for="excarga">Carga</label><input id="excarga" placeholder="20 kg" maxlength="16"></div>
      </div>
      <button class="btn" type="submit">Adicionar em ${DIAS_NOME[dia].toLowerCase()}</button>
    </form>
    ${plano.exercicios.length ? `<div class="row"><span class="small muted grow">Copiar este treino para outro dia:</span>
      <select id="copiarPara" class="input" style="width:auto"><option value="">Escolher dia</option>${[1, 2, 3, 4, 5, 6, 0].filter(x => x !== dia).map(x => `<option value="${x}">${DIAS_NOME[x]}</option>`).join('')}</select></div>` : ''}
  </section>`;
}

function telaPerfil() {
  const p = S.perfil || {};
  return `${cabecalho()}
  <section class="block"><span class="label">Seus dados</span>
    <form id="formPerfil" class="card stack">
      <div class="field"><label class="label" for="pnome">Nome</label><input id="pnome" value="${esc(p.nome)}" maxlength="40" required></div>
      <div class="field"><label class="label" for="pmeta">Meta de peso (kg)</label><input id="pmeta" type="number" step="0.1" min="30" max="250" inputmode="decimal" value="${p.metaPeso ?? ''}" placeholder="Opcional"></div>
      <p class="small muted">${esc(p.email || S.user.email)}</p>
      <button class="btn" type="submit">Salvar</button>
    </form>
  </section>
  ${pedidosRecebidos().length ? `<section class="block"><span class="label">Pedidos para te acompanhar</span>
    ${pedidosRecebidos().map(c => `<div class="card stack aviso">
      <div><h3>${esc(nomeDe(c, 'viewer'))}</h3><p class="small muted">Quer ver seus treinos. Você escolhe o que mostrar depois de aceitar.</p></div>
      <div class="row"><button class="btn ghost" data-recusar="${c.id}">Recusar</button><button class="btn" data-aceitar="${c.id}">Aceitar</button></div>
    </div>`).join('')}</section>` : ''}
  <section class="block"><span class="label">Quem te acompanha</span>
    ${meusAcompanhantes().length ? meusAcompanhantes().map(c => `<div class="card stack">
      <div class="row between"><h3 class="grow">${esc(nomeDe(c, 'viewer'))}</h3><span class="pill ok">Conectado</span></div>
      ${[['treinos', 'Ver meus treinos e faltas'], ['checkins', 'Ver meus check-ins e fotos'], ['peso', 'Ver meu peso']].map(([k, t]) => `
        <label class="row between" for="perm-${c.id}-${k}"><span>${t}</span>
          <span class="switch"><input type="checkbox" id="perm-${c.id}-${k}" data-perm="${k}" data-con="${c.id}" ${c.perm?.[k] ? 'checked' : ''}><span></span></span></label>`).join('')}
      <button class="btn sm ghost" data-remover-con="${c.id}">${S.confirmar === c.id ? 'Tocar de novo para remover' : 'Remover'}</button>
    </div>`).join('') : '<p class="small muted">Ninguém ainda. Passe o código abaixo para quem vai te incentivar.</p>'}
  </section>
  <section class="block"><span class="label">Seu código de conexão</span>
    <div class="card stack"><div class="code">${esc(p.codigo || '—')}</div>
      <p class="small muted">A pessoa digita esse código na aba Acompanhar. Você recebe o pedido aqui e decide se aceita.</p>
      <button class="btn sm ghost" data-acao="copiar">Copiar código</button></div>
  </section>
  <section class="block"><button class="btn ghost" data-acao="sair">Sair da conta</button></section>`;
}

function formConectar() {
  return `<form id="formConexao" class="stack">
    <div class="field"><label class="label" for="codigoIn">Código da pessoa</label>
      <input id="codigoIn" placeholder="FIT-AB12" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="10" required></div>
    <p class="erro" id="conexaoErro" hidden></p>
    <button class="btn" type="submit" id="conexaoBtn">Pedir para acompanhar</button>
  </form>`;
}

function telaAcompanhar() {
  const lista = quemAcompanho();
  const aceitas = lista.filter(c => c.status === 'aceita');
  const pendentes = lista.filter(c => c.status === 'pendente');
  const atual = aceitas.find(c => c.id === S.acompId) || aceitas[0];
  const aguardando = pendentes.map(c => `<div class="card row between"><div class="grow"><h3>Código ${esc(c.codigo)}</h3>
    <p class="small muted">Esperando a pessoa aceitar</p></div><button class="btn sm ghost" data-remover-con="${c.id}">${S.confirmar === c.id ? 'Confirmar' : 'Cancelar'}</button></div>`).join('');

  if (!atual) {
    return `<div class="top"><div class="grow"><span class="label">Acompanhar</span><h1>Treine junto</h1></div></div>
    <section class="block"><p class="muted">Digite o código de quem você quer incentivar. Ele aparece na aba Perfil da pessoa.</p>${formConectar()}</section>
    ${aguardando ? `<section class="block"><span class="label">Pedidos enviados</span>${aguardando}</section>` : ''}`;
  }

  const nome = nomeDe(atual, 'atleta');
  const A = S.acomp && S.acomp.chave === chaveAcomp(atual) ? S.acomp : null;
  const semana = semanaAtual();
  const hojeIso = isoDe(hoje());
  let corpo;
  if (!atual.perm?.treinos || A?.bloqueado) {
    corpo = `<section class="block"><div class="card stack"><h3>Treinos privados</h3>
      <p class="small muted">${esc(nome)} ainda não liberou ver os treinos. Quando liberar, eles aparecem aqui.</p></div></section>`;
  } else if (!A?.carregado) {
    corpo = '<section class="block"><p class="muted">Carregando…</p></section>';
  } else {
    const r = resumoSemana(A.plano, A.registros);
    const d = hoje();
    const planoHoje = A.plano[d.getDay()];
    const total = planoHoje?.exercicios?.length || 0;
    const feitos = A.registros[hojeIso]?.feitos?.length || 0;
    const pill = !total ? (feitos ? '<span class="pill ok">Treinou</span>' : '<span class="pill ok">Descanso</span>')
      : feitos >= total ? '<span class="pill ok">Treino completo</span>'
      : feitos ? '<span class="pill wait">Treinando agora</span>' : '<span class="pill wait">Ainda não treinou</span>';
    corpo = `
    <section class="block"><div class="row between"><span class="label">Hoje</span>${pill}</div>
      ${cartaoTreino(d.getDay(), hojeIso, A.plano, A.registros, false)}</section>
    <section class="block"><div class="row between"><span class="label">Semana</span><span class="small muted tabular">${r.feitos} de ${r.planejados} treinos</span></div>
      <div class="week">${semana.map(x => `<div class="day ${statusDia(x, A.plano, A.registros)} ${isoDe(x) === hojeIso ? 'today' : ''}" aria-label="${DIAS_NOME[x.getDay()]}">
        <span>${DIAS[x.getDay()]}</span><b class="tabular">${x.getDate()}</b><span class="dot"></span></div>`).join('')}</div>
      ${legenda()}
      <div class="grid3">
        <div class="stat"><span class="label">Treinou</span><b class="tabular">${r.feitos}</b><span class="small muted">nesta semana</span></div>
        <div class="stat"><span class="label">Faltou</span><b class="tabular">${r.faltas}</b><span class="small muted">nesta semana</span></div>
        <div class="stat"><span class="label">Planejado</span><b class="tabular">${r.planejados}</b><span class="small muted">treinos</span></div>
      </div></section>`;
  }

  return `<div class="top"><div class="grow"><span class="label">Acompanhando</span><h1>${esc(nome)}</h1></div></div>
  ${aceitas.length > 1 ? `<div class="chips">${aceitas.map(c => `<button class="chip ${c.id === atual.id ? 'on' : ''}" data-acomp="${c.id}">${esc(nomeDe(c, 'atleta'))}</button>`).join('')}</div>` : ''}
  ${corpo}
  <section class="block"><span class="label">Acompanhar outra pessoa</span>${formConectar()}</section>
  ${aguardando ? `<section class="block"><span class="label">Pedidos enviados</span>${aguardando}</section>` : ''}
  <section class="block"><button class="btn ghost" data-remover-con="${atual.id}">${S.confirmar === atual.id ? `Tocar de novo para parar de acompanhar ${esc(nome)}` : `Parar de acompanhar ${esc(nome)}`}</button></section>`;
}

function render() {
  if (!Store.configurado) return telaSemConfig();
  if (S.user === undefined || (S.user && S.perfil === undefined)) {
    mostrarNav(false);
    app.innerHTML = '<p class="muted carregando">Carregando…</p>';
    return;
  }
  if (!S.user) return telaLogin();
  mostrarNav(true);
  // Mantém o que estava sendo digitado quando os dados mudam no banco
  const foco = document.activeElement?.id;
  const rascunho = {};
  app.querySelectorAll('input[id]').forEach(i => { rascunho[i.id] = i.value; });
  app.innerHTML = S.aba === 'semana' ? telaSemana() : S.aba === 'perfil' ? telaPerfil()
    : S.aba === 'acompanhar' ? telaAcompanhar() : telaHoje();
  for (const [id, valor] of Object.entries(rascunho)) {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  }
  if (foco) document.getElementById(foco)?.focus();
}

function irPara(aba) {
  S.aba = aba;
  app.innerHTML = ''; // troca de aba começa limpa, sem levar o rascunho da outra
  render();
  window.scrollTo(0, 0);
}

// ---------- Login e escutas ----------
function comecarEscutas(user) {
  pararEscutas.forEach(f => f()); pararEscutas = [];
  const erro = err => { console.error(err); toast(mensagemErro(err)); };
  const desde = isoDe(semanaAtual()[0]);
  pararEscutas.push(
    Store.escutarPerfil(user.uid, async perfil => {
      if (!perfil) { // conta criada sem perfil (ex.: falhou a internet no cadastro)
        if (cadastrando) return; // o cadastro já está criando o perfil com o nome digitado
        try { await Store.criarPerfil(user.uid, user.nome || user.email.split('@')[0], user.email); } catch (e) { erro(e); }
        return;
      }
      S.perfil = perfil; render();
    }, erro),
    Store.escutarPlano(user.uid, plano => { S.plano = plano; render(); }, erro),
    Store.escutarRegistros(user.uid, desde, registros => { S.registros = registros; render(); }, erro),
    Store.escutarConexoes(user.uid, conexoes => {
      S.conexoes = conexoes;
      if (S.confirmar && !conexoes.some(c => c.id === S.confirmar)) S.confirmar = null;
      sincronizarAcomp();
      render();
    }, erro),
  );
}

// Escuta os treinos da pessoa que estou acompanhando. Refaz a escuta quando a
// pessoa muda, aceita o pedido ou liga/desliga a permissão de ver os treinos.
const chaveAcomp = c => `${c.id}:${c.status}:${!!c.perm?.treinos}`;
function pararDeAcompanhar() { pararAcomp.forEach(f => f()); pararAcomp = []; }
function sincronizarAcomp() {
  const aceitas = quemAcompanho().filter(c => c.status === 'aceita');
  const atual = aceitas.find(c => c.id === S.acompId) || aceitas[0];
  const chave = atual?.perm?.treinos ? chaveAcomp(atual) : null;
  if ((S.acomp?.chave ?? null) === chave) return;
  pararDeAcompanhar();
  if (!chave) { S.acomp = null; return; }
  const alvo = S.acomp = { chave, plano: {}, registros: {}, temPlano: false, temRegistros: false, carregado: false, bloqueado: false };
  const atualizar = () => { alvo.carregado = alvo.temPlano && alvo.temRegistros; if (S.acomp === alvo) render(); };
  const falhou = err => {
    if (err.code !== 'permission-denied') { console.error(err); toast(mensagemErro(err)); }
    alvo.bloqueado = true; if (S.acomp === alvo) render();
  };
  const desde = isoDe(semanaAtual()[0]);
  pararAcomp.push(
    Store.escutarPlano(atual.atleta, plano => { alvo.plano = plano; alvo.temPlano = true; atualizar(); }, falhou),
    Store.escutarRegistros(atual.atleta, desde, reg => { alvo.registros = reg; alvo.temRegistros = true; atualizar(); }, falhou),
  );
}

if (Store.configurado) {
  Store.onAuthChange(user => {
    S.user = user;
    S.perfil = undefined; S.plano = {}; S.registros = {};
    S.conexoes = []; S.acomp = null; S.acompId = null; S.confirmar = null;
    pararDeAcompanhar();
    if (user) comecarEscutas(user); else { pararEscutas.forEach(f => f()); pararEscutas = []; }
    S.aba = 'hoje';
    app.innerHTML = '';
    render();
  });
}

// ---------- Ações ----------
const uid = () => S.user.uid;
const planoDoDia = dia => structuredClone(S.plano[dia] || { titulo: '', exercicios: [] });

async function salvar(promessa, sucesso) {
  try { await promessa; if (sucesso) toast(sucesso); } catch (err) { console.error(err); toast(mensagemErro(err)); }
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.modo) { S.modoLogin = b.dataset.modo; render(); return; }
  if (b.dataset.dia !== undefined && !b.dataset.aba) { S.diaSel = +b.dataset.dia; app.innerHTML = ''; render(); return; }
  if (b.dataset.aba) { if (b.dataset.dia !== undefined) S.diaSel = +b.dataset.dia; irPara(b.dataset.aba); return; }

  // Conexões
  if (b.dataset.aceitar) {
    salvar(Store.aceitarConexao(b.dataset.aceitar, S.perfil?.nome || ''), 'Pedido aceito. Escolha abaixo o que a pessoa pode ver.');
    return;
  }
  if (b.dataset.recusar) { salvar(Store.removerConexao(b.dataset.recusar), 'Pedido recusado'); return; }
  if (b.dataset.removerCon) {
    const id = b.dataset.removerCon;
    if (S.confirmar !== id) { S.confirmar = id; render(); return; } // primeiro toque só pede confirmação
    S.confirmar = null;
    if (S.acompId === id) S.acompId = null;
    salvar(Store.removerConexao(id), 'Conexão removida');
    return;
  }
  if (b.dataset.acomp) { S.acompId = b.dataset.acomp; sincronizarAcomp(); render(); return; }
  if (S.confirmar) { S.confirmar = null; render(); } // tocar em outra coisa cancela a confirmação

  if (b.dataset.marcar) {
    const id = b.dataset.marcar, data = isoDe(hoje());
    const feito = !(S.registros[data]?.feitos || []).includes(id);
    salvar(Store.marcarExercicio(uid(), data, id, feito));
    const plano = S.plano[hoje().getDay()];
    const depois = new Set(S.registros[data]?.feitos || []); feito ? depois.add(id) : depois.delete(id);
    if (feito && plano && plano.exercicios.every(x => depois.has(x.id))) toast('Treino completo! Arrasou 💪');
    return;
  }
  if (b.dataset.remover) {
    const p = planoDoDia(S.diaSel);
    p.exercicios = p.exercicios.filter(x => x.id !== b.dataset.remover);
    salvar(Store.salvarDia(uid(), S.diaSel, p));
    return;
  }
  if (b.dataset.subir) {
    const i = +b.dataset.subir, p = planoDoDia(S.diaSel);
    [p.exercicios[i - 1], p.exercicios[i]] = [p.exercicios[i], p.exercicios[i - 1]];
    salvar(Store.salvarDia(uid(), S.diaSel, p));
    return;
  }

  const acao = b.dataset.acao;
  if (acao === 'sair') salvar(Store.sair());
  if (acao === 'copiar') {
    const c = S.perfil?.codigo;
    navigator.clipboard?.writeText(c).then(() => toast('Código copiado'), () => toast('Seu código: ' + c));
  }
  if (acao === 'esqueci') {
    const email = $('#lemail').value;
    if (!email) { mostrarErroLogin('Digite seu e-mail acima e toque de novo em "Esqueci minha senha".'); return; }
    Store.esqueciSenha(email).then(() => toast('Enviamos um e-mail para criar nova senha. Olhe também no spam.'),
      err => mostrarErroLogin(mensagemErro(err)));
  }
});

function mostrarErroLogin(texto) { const el = $('#loginErro'); if (el) { el.textContent = texto; el.hidden = false; } }

document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.perm) {
    const c = S.conexoes.find(x => x.id === t.dataset.con);
    if (!c) return;
    const perm = { treinos: false, checkins: false, peso: false, ...c.perm, [t.dataset.perm]: t.checked };
    salvar(Store.salvarPermissoes(c.id, perm), t.checked ? 'Liberado' : 'Não aparece mais para essa pessoa');
    return;
  }
  if (t.id === 'titulo') {
    const p = planoDoDia(S.diaSel); p.titulo = t.value.trim();
    salvar(Store.salvarDia(uid(), S.diaSel, p), 'Nome do treino salvo');
  }
  if (t.id === 'copiarPara' && t.value !== '') {
    const destino = +t.value, origem = planoDoDia(S.diaSel);
    const copia = { titulo: origem.titulo, exercicios: origem.exercicios.map(x => ({ ...x, id: novoId() })) };
    salvar(Store.salvarDia(uid(), destino, copia), `Treino copiado para ${DIAS_NOME[destino].toLowerCase()}`);
    t.value = '';
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;

  if (f.id === 'formLogin') {
    const criar = S.modoLogin === 'criar';
    const email = $('#lemail').value, senha = $('#lsenha').value, nome = $('#lnome')?.value.trim();
    if (criar && !nome) return mostrarErroLogin('Digite seu nome.');
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = criar ? 'Criando conta…' : 'Entrando…';
    cadastrando = criar;
    try {
      if (criar) await Store.criarConta(nome, email, senha); else await Store.entrar(email, senha);
    } catch (err) {
      cadastrando = false;
      if (S.user) { // a conta foi criada, só o perfil falhou: tenta de novo
        Store.criarPerfil(S.user.uid, nome || S.user.email.split('@')[0], S.user.email).catch(e => toast(mensagemErro(e)));
        return;
      }
      mostrarErroLogin(mensagemErro(err));
      btn.disabled = false; btn.textContent = criar ? 'Criar conta' : 'Entrar';
    }
    cadastrando = false;
  }

  if (f.id === 'formEx') {
    const nome = $('#exnome').value.trim();
    if (!nome) return;
    const p = planoDoDia(S.diaSel);
    if (!p.titulo) p.titulo = $('#titulo').value.trim();
    p.exercicios.push({
      id: novoId(), nome: nome.slice(0, 60),
      series: Math.min(20, Math.max(1, parseInt($('#exseries').value, 10) || 1)),
      reps: $('#exreps').value.trim().slice(0, 12), carga: $('#excarga').value.trim().slice(0, 16),
    });
    $('#exnome').value = ''; $('#excarga').value = '';
    await salvar(Store.salvarDia(uid(), S.diaSel, p), 'Exercício adicionado');
    $('#exnome')?.focus();
  }

  if (f.id === 'formConexao') {
    $('#conexaoBtn').disabled = true; $('#conexaoErro').hidden = true;
    try {
      await Store.pedirConexao(uid(), S.perfil?.nome || '', $('#codigoIn').value);
      if ($('#codigoIn')) $('#codigoIn').value = '';
      toast('Pedido enviado. Agora é só a pessoa aceitar.');
    } catch (err) {
      const el = $('#conexaoErro'); // a tela pode ter sido redesenhada enquanto esperava
      if (el) { el.textContent = mensagemErro(err); el.hidden = false; }
    }
    if ($('#conexaoBtn')) $('#conexaoBtn').disabled = false;
    return;
  }

  if (f.id === 'formPerfil') {
    const nome = $('#pnome').value.trim();
    const meta = parseFloat($('#pmeta').value.replace(',', '.'));
    if (!nome) return toast('Digite seu nome.');
    salvar(Store.salvarPerfil(uid(), { nome: nome.slice(0, 40), metaPeso: Number.isFinite(meta) ? meta : null }), 'Dados salvos');
  }
});

// ---------- App instalável e offline ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}

render();
