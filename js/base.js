/* =========================================================
   Treino Junto · js/base.js
   O que todas as telas usam: textos fixos, datas, o estado (S),
   a navegação (abas e subabas), conexões e as regras do dia.
   ========================================================= */
export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIAS_NOME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const SUGESTOES = ['Agachamento livre', 'Leg press 45°', 'Cadeira extensora', 'Cadeira flexora', 'Stiff', 'Elevação pélvica',
  'Abdutora', 'Panturrilha em pé', 'Supino reto', 'Puxada frontal', 'Remada baixa', 'Desenvolvimento com halter',
  'Elevação lateral', 'Rosca direta', 'Tríceps corda', 'Prancha', 'Abdominal infra', 'Esteira', 'Bicicleta', 'Escada', 'Elíptico'];

export const ERROS = {
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
  'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de terminar.',
  'auth/requires-recent-login': 'Por segurança, saia e entre de novo antes de fazer isso.',
  'auth/unauthorized-domain': 'Este endereço ainda não foi liberado para entrar com o Google (Firebase › Authentication › Configurações › Domínios autorizados).',
  'auth/operation-not-allowed': 'Esse jeito de entrar ainda não foi ativado no Firebase.',
  'auth/account-exists-with-different-credential': 'Esse e-mail já tem conta com senha. Entre com e-mail e senha.',
};
export const mensagemErro = err => ERROS[err?.code] || err?.message || 'Algo deu errado. Tente de novo.';

// ---------- Datas (sempre no fuso do aparelho) ----------
export const pad = n => String(n).padStart(2, '0');
export const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoje = () => new Date();
export function semanaAtual() { // segunda a domingo
  const d = hoje(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; });
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const novoId = () => crypto.randomUUID().slice(0, 8);
export const $ = s => document.querySelector(s);
export const app = $('#app');

export function toast(texto) {
  const el = $('#toast');
  el.textContent = texto; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- Estado ----------
export const S = {
  user: undefined,   // undefined = ainda carregando; null = sem login
  perfil: undefined,
  plano: {},
  registros: {},
  aba: 'treino',
  sub: { treino: 'hoje', corpo: 'peso', juntos: 'mural', evolucao: 'conquistas', perfil: 'dados' },
  diaSel: hoje().getDay(),
  modoLogin: 'entrar',
  conexoes: [],      // todas as conexões em que eu apareço (dos dois lados)
  acompId: null,     // id da conexão que estou vendo na aba Acompanhar
  acomp: null,       // { chave, plano, registros, carregado, bloqueado } da pessoa acompanhada
  confirmar: null,   // id esperando o segundo toque (remover conexão, apagar check-in)
  checkins: [],      // meus check-ins desta semana
  fotos: {},         // fotos já carregadas: 'uid/idDoCheckin' → dataUrl | null | 'carregando'

  checkin: { aberto: false, foto: null, processando: false, enviando: false },
  pesos: [],         // meus registros de peso [{ data, kg }], do mais antigo ao mais novo
  medidas: [],       // minhas medidas [{ data, cintura, quadril, braco }]
  medidaSel: 'cintura',
  carregado: {},     // quais escutas já responderam (conquistas só são calculadas com tudo carregado)
  editandoMeta: null,
  dica: {},          // ponto/barra tocado em cada gráfico: { idDoGrafico: índice }
};
export const SEMANAS_HISTORICO = 8;

// ---------- Navegação: 5 abas, cada uma com subabas ----------
export const ICONE = {
  treino: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>',
  corpo: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8 9a4 4 0 0 1 8 0"/><path d="M12 9l1.5-2"/></svg>',
  juntos: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01"/></svg>',
  evolucao: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  perfil: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};
export const ABAS = [
  ['treino', 'Treino', [['hoje', 'Hoje'], ['semana', 'Semana'], ['historico', 'Histórico']]],
  ['corpo', 'Corpo', [['peso', 'Peso e IMC'], ['medidas', 'Medidas'], ['fotos', 'Fotos']]],
  ['juntos', 'Juntos', [['mural', 'Check-in'], ['acompanhar', 'Acompanhar']]],
  ['evolucao', 'Evolução', [['conquistas', 'Conquistas'], ['frequencia', 'Frequência'], ['cargas', 'Cargas']]],
  ['perfil', 'Perfil', [['dados', 'Dados'], ['conexoes', 'Conexões'], ['avisos', 'Avisos']]],
];
// Endereço (#nome) → [aba, subaba]. Também aceita os nomes antigos usados nos avisos.
// (recados foram tirados do app: avisos antigos que apontam para eles abrem o Check-in)
export const ROTAS = { progresso: ['evolucao', 'conquistas'], checkin: ['juntos', 'mural'], recados: ['juntos', 'mural'] };
ABAS.forEach(([aba, , subs]) => { ROTAS[aba] = [aba, null]; subs.forEach(([s]) => { ROTAS[s] = [aba, s]; }); });

export const contagens = () => ({ conexoes: pedidosRecebidos().length });
export const BADGE_DA_ABA = { perfil: 'conexoes' };

export function mostrarNav(visivel) {
  $('#nav').hidden = !visivel;
  if (!visivel) return;
  const n = contagens();
  $('#navin').innerHTML = ABAS.map(([k, l]) => {
    const qtd = n[BADGE_DA_ABA[k]] || 0;
    return `<button class="${S.aba === k ? 'on' : ''}" data-aba="${k}" aria-label="${l}${qtd ? `, ${qtd} novidade(s)` : ''}">${ICONE[k]}${l}${qtd ? `<span class="badge">${qtd}</span>` : ''}</button>`;
  }).join('');
}

// Subabas logo abaixo do título
export function subnav() {
  const subs = ABAS.find(a => a[0] === S.aba)[2];
  const n = contagens();
  return `<div class="subnav" role="tablist">${subs.map(([k, l]) => `<button role="tab" aria-selected="${S.sub[S.aba] === k}"
    class="${S.sub[S.aba] === k ? 'on' : ''}" data-aba="${k}">${l}${n[k] ? `<span class="badge-in">${n[k]}</span>` : ''}</button>`).join('')}</div>`;
}

// ---------- Conexões ----------
export const meuUid = () => S.user?.uid;
export const pedidosRecebidos = () => S.conexoes.filter(c => c.atleta === meuUid() && c.status === 'pendente');
export const meusAcompanhantes = () => S.conexoes.filter(c => c.atleta === meuUid() && c.status === 'aceita');
export const quemAcompanho = () => S.conexoes.filter(c => c.viewer === meuUid());
export const nomeDe = (c, lado) => (lado === 'atleta' ? c.atletaNome : c.viewerNome) || 'Alguém';

// ---------- Regras do dia ----------
// Treinou = marcou algum exercício OU fez check-in naquele dia
// Tinha treino planejado nesse dia? (dias antes de o treino ser montado não contam)
export function temTreinoNoDia(planoSemana, d) {
  const plano = planoSemana[d.getDay()];
  return !!(plano?.exercicios?.length && (!plano.desde || isoDe(d) >= plano.desde));
}

export function statusDia(d, planoSemana = S.plano, registros = S.registros, checkins = S.checkins) {
  const data = isoDe(d);
  const temTreino = temTreinoNoDia(planoSemana, d);
  const feitos = registros[data]?.feitos?.length || 0;
  if (feitos || checkins.some(c => c.data === data)) return 'done';
  if (!temTreino) return 'rest';
  const hojeIso = isoDe(hoje());
  if (data < hojeIso) return 'missed';
  return 'future';
}
export function resumoSemana(planoSemana = S.plano, registros = S.registros, checkins = S.checkins) {
  const semana = semanaAtual();
  return {
    feitos: semana.filter(d => statusDia(d, planoSemana, registros, checkins) === 'done').length,
    planejados: semana.filter(d => temTreinoNoDia(planoSemana, d)).length,
    faltas: semana.filter(d => statusDia(d, planoSemana, registros, checkins) === 'missed').length,
  };
}
