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
  confirmar: null,   // id esperando o segundo toque (remover conexão, apagar check-in)
  checkins: [],      // meus check-ins desta semana
  fotos: {},         // fotos já carregadas: 'uid/idDoCheckin' → dataUrl | null | 'carregando'
  mensagens: {},     // recados por conexão
  checkin: { aberto: false, foto: null, processando: false, enviando: false },
};
let pararEscutas = [];
let pararAcomp = [];
let pararMsgs = {};  // escuta de recados por conexão
const tentativasMsgs = {};
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
// Treinou = marcou algum exercício OU fez check-in naquele dia
function statusDia(d, planoSemana = S.plano, registros = S.registros, checkins = S.checkins) {
  const data = isoDe(d);
  const plano = planoSemana[d.getDay()];
  const temTreino = plano && plano.exercicios?.length;
  const feitos = registros[data]?.feitos?.length || 0;
  if (feitos || checkins.some(c => c.data === data)) return 'done';
  if (!temTreino) return 'rest';
  const hojeIso = isoDe(hoje());
  if (data < hojeIso) return 'missed';
  return 'future';
}
function resumoSemana(planoSemana = S.plano, registros = S.registros, checkins = S.checkins) {
  const semana = semanaAtual();
  return {
    feitos: semana.filter(d => statusDia(d, planoSemana, registros, checkins) === 'done').length,
    planejados: semana.filter(d => planoSemana[d.getDay()]?.exercicios?.length).length,
    faltas: semana.filter(d => statusDia(d, planoSemana, registros, checkins) === 'missed').length,
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

// ---------- Check-in ----------
function fotoHtml(dono, c) {
  if (!c.temFoto) return '';
  const k = `${dono}/${c.id}`, v = S.fotos[k];
  if (v === undefined) {
    S.fotos[k] = 'carregando';
    Store.lerFoto(dono, c.id).then(img => { S.fotos[k] = img; render(); }, () => { S.fotos[k] = null; render(); });
  }
  if (typeof v === 'string' && v.startsWith('data:')) return `<img class="foto" src="${v}" alt="Foto do check-in">`;
  return `<div class="foto vazia">${v === null ? 'Foto indisponível' : 'Carregando foto…'}</div>`;
}

function quandoCheckin(c) {
  const hojeIso = isoDe(hoje());
  if (c.data === hojeIso) return `Hoje às ${esc(c.hora)}`;
  const d = new Date(c.data + 'T12:00');
  return `${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${esc(c.hora)}`;
}

// dono = uid de quem fez o check-in; podeReagir = estou vendo o check-in de outra pessoa
function cartaoCheckin(dono, c, podeReagir) {
  const reacoes = Object.entries(c.reacoes || {});
  const minha = c.reacoes?.[meuUid()];
  const nomeViewer = uid => nomeDe(S.conexoes.find(x => x.viewer === uid && x.atleta === meuUid()) || {}, 'viewer');
  return `<div class="card stack">
    <div class="row between"><h3 class="grow">Check-in · ${quandoCheckin(c)}</h3>
      ${podeReagir ? '' : `<button class="link" data-apagar-ck="${c.id}">${S.confirmar === 'ck:' + c.id ? 'Confirmar' : 'Apagar'}</button>`}</div>
    ${fotoHtml(dono, c)}
    ${c.legenda ? `<p>${esc(c.legenda)}</p>` : ''}
    ${podeReagir
      ? `<div class="reacoes">${Store.REACOES.map(e => `<button class="${minha === e ? 'on' : ''}" data-reagir="${c.id}" data-emoji="${e}" aria-pressed="${minha === e}">${e}</button>`).join('')}</div>`
      : reacoes.length ? `<div class="reacoes">${reacoes.map(([uid, e]) => `<span class="pill ok">${e} ${esc(nomeViewer(uid))}</span>`).join('')}</div>` : ''}
  </div>`;
}

function secaoCheckinHoje() {
  const hojeIso = isoDe(hoje());
  const feitosHoje = S.checkins.filter(c => c.data === hojeIso);
  const ck = S.checkin;
  if (ck.aberto) {
    return `<section class="block"><span class="label">Check-in</span>
      <div class="card stack">
        <label class="drop" for="fotoIn">${ck.foto ? `<img class="foto" src="${ck.foto}" alt="Prévia da foto">`
          : ck.processando ? '<b>Preparando a foto…</b>' : '<b>Tirar ou escolher foto</b><span class="small muted">Uma selfie no espelho da academia já vale</span>'}</label>
        <input id="fotoIn" type="file" accept="image/*" hidden>
        <div class="field"><label class="label" for="legendaIn">Legenda (opcional)</label><input id="legendaIn" maxlength="140" placeholder="Ex.: Hoje é dia de perna!"></div>
        <div class="row"><button class="btn ghost" data-acao="cancelar-checkin">Cancelar</button>
          <button class="btn" data-acao="enviar-checkin" ${ck.enviando || ck.processando ? 'disabled' : ''}>${ck.enviando ? 'Enviando…' : 'Enviar check-in'}</button></div>
      </div></section>`;
  }
  if (feitosHoje.length) {
    return `<section class="block"><span class="label">Check-in de hoje</span>${feitosHoje.map(c => cartaoCheckin(meuUid(), c, false)).join('')}</section>`;
  }
  return `<section class="block"><button class="btn grande" data-acao="abrir-checkin">Cheguei na academia · fazer check-in</button></section>`;
}

// Reduz a foto no próprio aparelho (lado maior até 1080 px) para caber no banco
function prepararFoto(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let lado = 1080, qualidade = 0.75, dataUrl;
      do {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        dataUrl = c.toDataURL('image/jpeg', qualidade);
        lado = Math.round(lado * 0.8); qualidade = Math.max(0.5, qualidade - 0.1);
      } while (dataUrl.length > 600000 && lado > 300);
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir essa foto. Tente outra.')); };
    img.src = url;
  });
}

// ---------- Recados ----------
function horaMsg(m) {
  const d = m.criadoEm?.toDate ? m.criadoEm.toDate() : new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return isoDe(d) === isoDe(hoje()) ? hm : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}`;
}

function secaoRecados(c, outroNome, quantos, rapidos) {
  const msgs = (S.mensagens[c.id] || []).slice(-quantos);
  return `<section class="block"><span class="label">Recados com ${esc(outroNome)}</span>
    ${msgs.length ? `<div class="conversa">${msgs.map(m => `<div class="msg ${m.de === meuUid() ? 'eu' : ''}">${esc(m.texto)}<span class="small muted">${horaMsg(m)}</span></div>`).join('')}</div>`
      : '<p class="small muted">Nenhum recado ainda.</p>'}
    <div class="rapidos">${rapidos.map(t => `<button data-rapido="${esc(t)}" data-con="${c.id}">${esc(t)}</button>`).join('')}</div>
    <form class="row" data-recado="${c.id}">
      <input id="recadoIn-${c.id}" class="input grow" maxlength="300" placeholder="Escreva um recado" autocomplete="off">
      <button class="btn sm" type="submit">Enviar</button></form>
  </section>`;
}

function telaHoje() {
  const d = hoje();
  const r = resumoSemana();
  const plano = S.plano[d.getDay()];
  const feitos = S.registros[isoDe(d)]?.feitos?.length || 0;
  const total = plano?.exercicios?.length || 0;
  const fezCheckin = S.checkins.some(c => c.data === isoDe(d));
  const pill = !total ? '<span class="pill ok">Descanso</span>'
    : feitos >= total ? '<span class="pill ok">Treino completo</span>'
    : feitos ? '<span class="pill wait">Em andamento</span>'
    : fezCheckin ? '<span class="pill ok">Na academia</span>' : '<span class="pill wait">Ainda não começou</span>';
  const pedidos = pedidosRecebidos();
  return `${cabecalho()}
  ${pedidos.length ? `<section class="block"><div class="card stack aviso">
    <h3>${pedidos.length === 1 ? `${esc(nomeDe(pedidos[0], 'viewer'))} quer te acompanhar` : `${pedidos.length} pessoas querem te acompanhar`}</h3>
    <button class="btn sm" data-aba="perfil">Ver pedido</button></div></section>` : ''}
  ${secaoCheckinHoje()}
  ${convitAvisos()}
  ${meusAcompanhantes().map(c => secaoRecados(c, nomeDe(c, 'viewer'), 3, ['Valeu! ❤️', 'Tô indo!', 'Hoje não deu 😕'])).join('')}
  <section class="block">
    <div class="grid3">
      <div class="stat"><span class="label">Semana</span><b class="tabular">${r.feitos}</b><span class="small muted">${r.planejados ? `de ${r.planejados} treinos` : (r.feitos === 1 ? 'treino' : 'treinos')}</span></div>
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
  ${secaoAvisos()}
  <section class="block"><span class="label">Seu código de conexão</span>
    <div class="card stack"><div class="code">${esc(p.codigo || '—')}</div>
      <p class="small muted">A pessoa digita esse código na aba Acompanhar. Você recebe o pedido aqui e decide se aceita.</p>
      <button class="btn sm ghost" data-acao="copiar">Copiar código</button></div>
  </section>
  <section class="block"><button class="btn ghost" data-acao="sair">Sair da conta</button></section>`;
}

// ---------- Avisos no celular ----------
const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const permissao = () => globalThis.Notification?.permission; // 'default' | 'granted' | 'denied' | undefined

const TIPOS_AVISO = [
  ['checkin', 'Quando quem eu acompanho fizer check-in'],
  ['lembrete', 'Às 19h, se quem eu acompanho ainda não treinou'],
  ['meuLembrete', 'Às 19h, se eu ainda não treinei no dia de treino'],
  ['recados', 'Recados novos'],
  ['reacoes', 'Reações aos meus check-ins'],
];

// Situação dos avisos neste aparelho, em texto para a pessoa
function estadoAvisos() {
  if (!Store.avisosConfigurados) return { pode: false, texto: 'Os avisos ainda não foram configurados no app.' };
  if (ehIphone && !instalado()) return { pode: false, texto: 'No iPhone, os avisos só funcionam com o app na Tela de Início: no Safari, toque em Compartilhar ⬆ e em "Adicionar à Tela de Início". Depois abra por lá.' };
  if (!globalThis.Notification) return { pode: false, texto: 'Este navegador não recebe avisos. No Android, use o Chrome.' };
  if (permissao() === 'denied') return { pode: false, texto: 'Os avisos estão bloqueados para este app. Libere nas configurações de notificação do celular e abra o app de novo.' };
  if (permissao() === 'granted') return { pode: true, ativo: true, texto: 'Avisos ligados neste aparelho.' };
  return { pode: true, ativo: false, texto: 'Receba um aviso quando alguém fizer check-in, reagir ou mandar recado.' };
}

function secaoAvisos() {
  const e = estadoAvisos();
  const prefs = S.perfil?.avisos || {};
  return `<section class="block"><span class="label">Avisos no celular</span>
    <div class="card stack">
      <div class="row between"><p class="small grow ${e.ativo ? '' : 'muted'}">${esc(e.texto)}</p>${e.ativo ? '<span class="pill ok">Ligados</span>' : ''}</div>
      ${e.pode && !e.ativo ? '<button class="btn" data-acao="ativar-avisos">Ativar avisos neste aparelho</button>' : ''}
      ${TIPOS_AVISO.map(([k, t]) => `<label class="row between" for="aviso-${k}"><span>${t}</span>
        <span class="switch"><input type="checkbox" id="aviso-${k}" data-aviso="${k}" ${prefs[k] === false ? '' : 'checked'}><span></span></span></label>`).join('')}
    </div></section>`;
}

function convitAvisos() {
  const e = estadoAvisos();
  let dispensado = false;
  try { dispensado = localStorage.getItem('avisos-dispensado') === '1'; } catch { /* sem armazenamento */ }
  if (!e.pode || e.ativo || dispensado) return '';
  return `<section class="block"><div class="card stack aviso"><h3>Ative os avisos</h3>
    <p class="small">Saiba na hora quando alguém reagir ou mandar recado, e receba o lembrete do treino.</p>
    <div class="row"><button class="btn ghost" data-acao="dispensar-avisos">Agora não</button><button class="btn" data-acao="ativar-avisos">Ativar</button></div></div></section>`;
}

async function ativarAvisos() {
  try {
    const resultado = await Notification.requestPermission();
    if (resultado !== 'granted') { toast('Sem permissão, o app não consegue mandar avisos.'); render(); return; }
    const ok = await Store.registrarAparelho(uid());
    toast(ok ? 'Avisos ligados neste aparelho 🔔' : 'Este aparelho não suporta avisos.');
  } catch (err) {
    console.error(err);
    toast('Não deu para ligar os avisos: ' + (err.message || err));
  }
  render();
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
  const verCheckins = atual.perm?.checkins && A && !A.bloqCheckins;
  const checkins = verCheckins ? A.checkins : [];

  // Check-ins: o de hoje com reações, ou o último que ela fez
  let secaoCheckins = '';
  if (!atual.perm?.checkins || A?.bloqCheckins) {
    secaoCheckins = `<section class="block"><div class="card stack"><h3>Check-ins privados</h3>
      <p class="small muted">${esc(nome)} ainda não liberou ver os check-ins e fotos.</p></div></section>`;
  } else if (!A?.temCheckins) {
    secaoCheckins = '<section class="block"><p class="muted">Carregando check-ins…</p></section>';
  } else {
    const deHoje = checkins.filter(c => c.data === hojeIso);
    secaoCheckins = deHoje.length
      ? `<section class="block"><span class="label">Check-in de hoje</span>${deHoje.map(c => cartaoCheckin(atual.atleta, c, true)).join('')}</section>`
      : `<section class="block"><span class="label">Check-in de hoje</span><div class="card stack"><h3>Ainda não fez check-in hoje</h3>
          <p class="small muted">Que tal mandar um recado de incentivo aí embaixo?</p></div>
          ${checkins[0] ? `<span class="label">Último check-in</span>${cartaoCheckin(atual.atleta, checkins[0], true)}` : ''}</section>`;
  }

  let corpo;
  if (!atual.perm?.treinos || A?.bloqTreinos) {
    corpo = `<section class="block"><div class="card stack"><h3>Treinos privados</h3>
      <p class="small muted">${esc(nome)} ainda não liberou ver os treinos. Quando liberar, eles aparecem aqui.</p></div></section>`;
  } else if (!(A?.temPlano && A?.temRegistros)) {
    corpo = '<section class="block"><p class="muted">Carregando…</p></section>';
  } else {
    const r = resumoSemana(A.plano, A.registros, checkins);
    const d = hoje();
    const planoHoje = A.plano[d.getDay()];
    const total = planoHoje?.exercicios?.length || 0;
    const feitos = A.registros[hojeIso]?.feitos?.length || 0;
    const fezCheckin = checkins.some(c => c.data === hojeIso);
    const pill = !total ? (feitos || fezCheckin ? '<span class="pill ok">Treinou</span>' : '<span class="pill ok">Descanso</span>')
      : feitos >= total ? '<span class="pill ok">Treino completo</span>'
      : feitos ? '<span class="pill wait">Treinando agora</span>'
      : fezCheckin ? '<span class="pill ok">Na academia</span>' : '<span class="pill wait">Ainda não treinou</span>';
    corpo = `
    <section class="block"><div class="row between"><span class="label">Treino de hoje</span>${pill}</div>
      ${cartaoTreino(d.getDay(), hojeIso, A.plano, A.registros, false)}</section>
    <section class="block"><div class="row between"><span class="label">Semana</span><span class="small muted tabular">${r.planejados ? `${r.feitos} de ${r.planejados} treinos` : `${r.feitos} ${r.feitos === 1 ? 'treino' : 'treinos'}`}</span></div>
      <div class="week">${semana.map(x => `<div class="day ${statusDia(x, A.plano, A.registros, checkins)} ${isoDe(x) === hojeIso ? 'today' : ''}" aria-label="${DIAS_NOME[x.getDay()]}">
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
  ${secaoCheckins}
  ${secaoRecados(atual, nome, 10, ['Bora treinar! 💪', 'Tô orgulhoso de você', 'Só 1 hora e tá feito', 'Arrasou hoje!'])}
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
  app.querySelectorAll('input[id]:not([type=file]):not([type=checkbox])').forEach(i => { rascunho[i.id] = i.value; });
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
    Store.escutarCheckins(user.uid, desde, lista => { S.checkins = lista; render(); }, erro),
    Store.escutarConexoes(user.uid, conexoes => {
      S.conexoes = conexoes;
      if (S.confirmar && !S.confirmar.startsWith('ck:') && !conexoes.some(c => c.id === S.confirmar)) S.confirmar = null;
      sincronizarAcomp();
      sincronizarMensagens();
      render();
    }, erro),
  );
}

// Escuta os dados da pessoa que estou acompanhando. Refaz a escuta quando a pessoa
// muda, aceita o pedido ou liga/desliga as permissões de treinos e check-ins.
const chaveAcomp = c => `${c.id}:${c.status}:${!!c.perm?.treinos}:${!!c.perm?.checkins}`;
function pararDeAcompanhar() { pararAcomp.forEach(f => f()); pararAcomp = []; }
function acompAtual() {
  const aceitas = quemAcompanho().filter(c => c.status === 'aceita');
  return aceitas.find(c => c.id === S.acompId) || aceitas[0];
}
function sincronizarAcomp() {
  const atual = acompAtual();
  const chave = atual && (atual.perm?.treinos || atual.perm?.checkins) ? chaveAcomp(atual) : null;
  if ((S.acomp?.chave ?? null) === chave) return;
  pararDeAcompanhar();
  if (!chave) { S.acomp = null; return; }
  const alvo = S.acomp = {
    chave, plano: {}, registros: {}, checkins: [],
    temPlano: false, temRegistros: false, temCheckins: false, bloqTreinos: false, bloqCheckins: false,
  };
  const atualizar = () => { if (S.acomp === alvo) render(); };
  const falhou = campo => err => {
    if (err.code !== 'permission-denied') { console.error(err); toast(mensagemErro(err)); }
    alvo[campo] = true; atualizar();
  };
  const desde = isoDe(semanaAtual()[0]);
  if (atual.perm?.treinos) pararAcomp.push(
    Store.escutarPlano(atual.atleta, plano => { alvo.plano = plano; alvo.temPlano = true; atualizar(); }, falhou('bloqTreinos')),
    Store.escutarRegistros(atual.atleta, desde, reg => { alvo.registros = reg; alvo.temRegistros = true; atualizar(); }, falhou('bloqTreinos')),
  );
  // Check-ins: semana atual e a anterior, para mostrar o último mesmo numa segunda-feira
  const duasSemanas = new Date(semanaAtual()[0]); duasSemanas.setDate(duasSemanas.getDate() - 7);
  if (atual.perm?.checkins) pararAcomp.push(
    Store.escutarCheckins(atual.atleta, isoDe(duasSemanas), lista => { alvo.checkins = lista; alvo.temCheckins = true; atualizar(); }, falhou('bloqCheckins')),
  );
}

// Uma escuta de recados para cada conexão aceita
function sincronizarMensagens() {
  const ids = new Set(S.conexoes.filter(c => c.status === 'aceita').map(c => c.id));
  for (const id of Object.keys(pararMsgs)) {
    if (!ids.has(id)) { pararMsgs[id](); delete pararMsgs[id]; delete S.mensagens[id]; }
  }
  for (const id of ids) {
    if (pararMsgs[id]) continue;
    pararMsgs[id] = Store.escutarMensagens(id, msgs => { S.mensagens[id] = msgs; render(); }, err => {
      // Logo depois de aceitar, o banco pode ainda não ter liberado: tenta de novo em instantes
      console.warn('Recados indisponíveis', err);
      tentativasMsgs[id] = (tentativasMsgs[id] || 0) + 1;
      if (tentativasMsgs[id] > 5) return; // desiste: provavelmente as regras não foram publicadas
      delete pararMsgs[id];
      setTimeout(() => { if (S.user) sincronizarMensagens(); }, 3000);
    });
  }
}
function pararMensagens() { Object.values(pararMsgs).forEach(f => f()); pararMsgs = {}; S.mensagens = {}; }

if (Store.configurado) {
  Store.onAuthChange(user => {
    S.user = user;
    S.perfil = undefined; S.plano = {}; S.registros = {}; S.checkins = []; S.fotos = {};
    S.conexoes = []; S.acomp = null; S.acompId = null; S.confirmar = null;
    S.checkin = { aberto: false, foto: null, processando: false, enviando: false };
    pararDeAcompanhar(); pararMensagens();
    if (user) comecarEscutas(user); else { pararEscutas.forEach(f => f()); pararEscutas = []; }
    // Mantém o registro do aparelho atualizado (o código do aparelho pode mudar com o tempo)
    if (user && Store.avisosConfigurados && permissao() === 'granted') Store.registrarAparelho(user.uid).catch(console.warn);
    S.aba = abaDoEndereco(location.hash) || 'hoje';
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

  // Check-ins e recados
  if (b.dataset.apagarCk) {
    const chave = 'ck:' + b.dataset.apagarCk;
    if (S.confirmar !== chave) { S.confirmar = chave; render(); return; }
    S.confirmar = null;
    salvar(Store.apagarCheckin(uid(), b.dataset.apagarCk), 'Check-in apagado');
    return;
  }
  if (S.confirmar) { S.confirmar = null; render(); } // tocar em outra coisa cancela a confirmação
  if (b.dataset.reagir) {
    const atual = acompAtual();
    const ck = S.acomp?.checkins.find(c => c.id === b.dataset.reagir);
    if (!atual || !ck) return;
    const emoji = ck.reacoes?.[uid()] === b.dataset.emoji ? null : b.dataset.emoji;
    Store.reagir(atual.atleta, ck.id, uid(), emoji).then(() => {
      if (emoji) Store.avisar({ evento: 'reacao', atleta: atual.atleta, checkinId: ck.id });
    }, err => toast(mensagemErro(err)));
    return;
  }
  if (b.dataset.rapido) { enviarRecado(b.dataset.con, b.dataset.rapido); return; }

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
  if (acao === 'abrir-checkin') { S.checkin = { aberto: true, foto: null, processando: false, enviando: false }; render(); return; }
  if (acao === 'cancelar-checkin') { S.checkin.aberto = false; S.checkin.foto = null; render(); return; }
  if (acao === 'enviar-checkin') { enviarCheckin(); return; }
  if (acao === 'ativar-avisos') { ativarAvisos(); return; }
  if (acao === 'dispensar-avisos') { try { localStorage.setItem('avisos-dispensado', '1'); } catch { /* ok */ } render(); return; }
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

async function enviarRecado(conexaoId, texto, mostrarToast = true) {
  try {
    await Store.enviarMensagem(conexaoId, uid(), texto);
    if (mostrarToast) toast('Recado enviado');
    Store.avisar({ evento: 'recado', conexaoId, texto });
  } catch (err) { console.error(err); toast(mensagemErro(err)); }
}

async function enviarCheckin() {
  const ck = S.checkin;
  if (ck.enviando || ck.processando) return;
  ck.enviando = true; render();
  const agora = new Date();
  try {
    const id = await Store.criarCheckin(uid(), {
      data: isoDe(agora), hora: `${pad(agora.getHours())}:${pad(agora.getMinutes())}`, legenda: $('#legendaIn')?.value.trim() || '',
    }, ck.foto);
    if (ck.foto) S.fotos[`${uid()}/${id}`] = ck.foto; // já mostra a foto sem baixar de novo
    Store.avisar({ evento: 'checkin', checkinId: id });
    S.checkin = { aberto: false, foto: null, processando: false, enviando: false };
    render();
    toast('Check-in feito! Quem te acompanha vai ver 💪');
  } catch (err) {
    console.error(err);
    ck.enviando = false; render();
    toast(mensagemErro(err));
  }
}

function mostrarErroLogin(texto) { const el = $('#loginErro'); if (el) { el.textContent = texto; el.hidden = false; } }

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fotoIn' && t.files?.[0]) {
    S.checkin.processando = true; S.checkin.foto = null; render();
    prepararFoto(t.files[0]).then(foto => { S.checkin.foto = foto; }, err => toast(err.message))
      .finally(() => { S.checkin.processando = false; render(); });
    return;
  }
  if (t.dataset.aviso) {
    const avisos = { ...(S.perfil?.avisos || {}), [t.dataset.aviso]: t.checked };
    salvar(Store.salvarAvisos(uid(), avisos), t.checked ? 'Aviso ligado' : 'Aviso desligado');
    return;
  }
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

  if (f.dataset.recado) {
    const input = document.getElementById(`recadoIn-${f.dataset.recado}`);
    const texto = input?.value.trim();
    if (!texto) return;
    input.value = '';
    await enviarRecado(f.dataset.recado, texto, false);
    return;
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

// ---------- Abrir na aba certa (ex.: tocar no aviso "fez check-in" abre o Acompanhar) ----------
function abaDoEndereco(endereco) {
  const aba = String(endereco || '').split('#')[1];
  return ABAS.some(([k]) => k === aba) ? aba : null;
}
navigator.serviceWorker?.addEventListener('message', e => {
  const aba = abaDoEndereco(e.data?.abrir);
  if (aba && S.user) irPara(aba);
});

// ---------- App instalável e offline ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}

render();
