/* =========================================================
   Avisos do Treino Junto (Google Apps Script)
   Este arquivo NÃO roda no site: o conteúdo vai em script.google.com,
   publicado como "App da Web" na sua conta Google PESSOAL
   (a mesma dona do projeto Firebase treino-junto).

   Não usa nenhuma chave secreta: o script age com a permissão
   da conta dona do projeto para ler o banco e mandar as notificações.

   Segurança: o app só diz "aconteceu tal coisa". O script confere no
   Firebase quem está pedindo e descobre sozinho, pelas conexões do
   banco, quem deve receber. Ninguém consegue mandar aviso para um
   estranho ou fingir ser outra pessoa.
   ========================================================= */

const PROJETO = 'treino-junto-4857e';
const FIREBASE_API_KEY = 'AIzaSyBLQ20gBSI6As5FekEBFdwGJrHBXA2CtjA'; // a mesma do firebase-config.js (é pública)
const SITE_URL = 'https://zi0nn.github.io/treino-junto/';
const FUSO = 'America/Sao_Paulo';
const HORA_LEMBRETE = 19; // aviso de "ainda não treinou hoje"

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/' + PROJETO + '/databases/(default)/documents';
const REACOES = ['💪', '🔥', '❤️', '👏'];

// ---------- Chamado pelo app ----------
// { idToken, evento: 'checkin', checkinId }
// { idToken, evento: 'reacao', atleta, checkinId }
// { idToken, evento: 'recado', conexaoId, texto }

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    const uid = loginDe(dados.idToken);
    if (!uid) return responder({ ok: false, erro: 'Login inválido' });

    if (dados.evento === 'checkin') avisarCheckin(uid, String(dados.checkinId || ''));
    else if (dados.evento === 'reacao') avisarReacao(uid, String(dados.atleta || ''), String(dados.checkinId || ''));
    else if (dados.evento === 'recado') avisarRecado(uid, String(dados.conexaoId || ''), String(dados.texto || ''));
    else return responder({ ok: false, erro: 'Evento desconhecido' });

    return responder({ ok: true });
  } catch (err) {
    console.error(err);
    return responder({ ok: false, erro: String(err) });
  }
}

// Pergunta ao Firebase quem é o login que enviou o pedido
function loginDe(idToken) {
  if (!idToken) return null;
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) return null;
  const usuario = (JSON.parse(r.getContentText()).users || [])[0];
  return usuario ? usuario.localId : null;
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Os avisos ----------

// Ela fez check-in → avisa quem acompanha e pode ver check-ins
function avisarCheckin(atleta, checkinId) {
  const ck = lerDoc('users/' + atleta + '/checkins/' + checkinId);
  if (!ck || ck.data !== hojeISO()) return; // só check-in de verdade, feito hoje
  const nome = nomeDe(atleta);
  conexoesDe('atleta', atleta)
    .filter(c => c.status === 'aceita' && c.perm && c.perm.checkins)
    .forEach(c => {
      if (!querAviso(c.viewer, 'checkin')) return;
      notificar(c.viewer, nome + ' fez check-in! 💪', ck.legenda || 'Chegou na academia às ' + ck.hora + '.',
        SITE_URL + '#acompanhar', 'checkin-' + atleta);
    });
}

// Alguém reagiu ao check-in dela → avisa a dona do check-in
function avisarReacao(viewer, atleta, checkinId) {
  const c = lerDoc('conexoes/' + atleta + '_' + viewer);
  if (!c || c.status !== 'aceita') return;
  const ck = lerDoc('users/' + atleta + '/checkins/' + checkinId);
  const emoji = ck && ck.reacoes ? ck.reacoes[viewer] : null;
  if (!emoji || REACOES.indexOf(emoji) < 0) return; // a reação precisa estar mesmo salva
  if (!querAviso(atleta, 'reacoes')) return;
  notificar(atleta, nomeDe(viewer) + ' reagiu ' + emoji, 'ao seu check-in de ' + (ck.data === hojeISO() ? 'hoje' : dataBR(ck.data)),
    SITE_URL, 'reacao-' + checkinId);
}

// Recado novo → avisa a outra pessoa da conexão
function avisarRecado(remetente, conexaoId, texto) {
  const c = lerDoc('conexoes/' + conexaoId);
  if (!c || c.status !== 'aceita') return;
  if (c.atleta !== remetente && c.viewer !== remetente) return;
  const destino = c.atleta === remetente ? c.viewer : c.atleta;
  if (!querAviso(destino, 'recados')) return;
  notificar(destino, 'Recado de ' + nomeDe(remetente), texto.slice(0, 140),
    SITE_URL + (destino === c.viewer ? '#acompanhar' : ''), 'recado-' + conexaoId);
}

// ---------- Lembrete diário (roda sozinho às 19h) ----------
// Para cada pessoa que tem treino planejado hoje e ainda não treinou:
//  - ela mesma recebe "Hoje é dia de ..."
//  - quem acompanha recebe "Fulana ainda não treinou hoje"

function lembreteDiario() {
  const hoje = hojeISO();
  const diaSemana = Number(Utilities.formatDate(new Date(), FUSO, 'u')) % 7; // 1=segunda ... 7→0=domingo
  const conexoes = listar('conexoes').filter(c => c.status === 'aceita');

  listar('users').forEach(u => {
    try {
      const plano = lerDoc('users/' + u.id + '/plano/' + diaSemana);
      if (!plano || !(plano.exercicios || []).length) return; // descanso
      if (treinouHoje(u.id, hoje)) return;

      const titulo = plano.titulo || 'treino';
      if (querAviso(u.id, 'meuLembrete', u)) {
        notificar(u.id, 'Hoje é dia de ' + titulo, 'Ainda dá tempo! Bora? 💪', SITE_URL, 'lembrete');
      }
      conexoes
        .filter(c => c.atleta === u.id && c.perm && (c.perm.treinos || c.perm.checkins))
        .forEach(c => {
          if (!querAviso(c.viewer, 'lembrete')) return;
          notificar(c.viewer, (u.nome || 'Ela') + ' ainda não treinou hoje',
            'Era dia de ' + titulo + '. Que tal mandar um incentivo?', SITE_URL + '#acompanhar', 'lembrete-' + u.id);
        });
    } catch (err) {
      console.error('Lembrete de ' + u.id + ': ' + err); // um erro não impede os outros
    }
  });
}

function treinouHoje(uid, hoje) {
  const reg = lerDoc('users/' + uid + '/registros/' + hoje);
  if (reg && (reg.feitos || []).length) return true;
  return buscar('users/' + uid, 'checkins', 'data', hoje).length > 0;
}

// ---------- Rode UMA vez pelo editor ----------
// Autoriza o script e liga o lembrete diário das 19h
function instalarRotinas() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lembreteDiario').timeBased().atHour(HORA_LEMBRETE).everyDays(1).inTimezone(FUSO).create();
  console.log('Pronto: lembrete diário ligado para as ' + HORA_LEMBRETE + 'h.');
}

// Para testar: manda um aviso de teste para todos os aparelhos de uma conta (troque o e-mail e rode)
function testarAviso() {
  const email = 'COLE_UM_EMAIL_AQUI';
  const u = listar('users').filter(x => String(x.email).toLowerCase() === email.toLowerCase())[0];
  if (!u) throw new Error('Não achei conta com o e-mail ' + email);
  const n = notificar(u.id, 'Teste do Treino Junto', 'Se você está vendo isso, os avisos funcionam! 🎉', SITE_URL, 'teste');
  console.log('Enviado para ' + n + ' aparelho(s).');
}

// ---------- Preferências ----------
// No app, cada pessoa liga/desliga cada tipo de aviso. Sem escolha = ligado.
function querAviso(uid, tipo, perfil) {
  const p = perfil || lerDoc('users/' + uid);
  return !(p && p.avisos && p.avisos[tipo] === false);
}

const nomes = {};
function nomeDe(uid) {
  if (!(uid in nomes)) { const p = lerDoc('users/' + uid); nomes[uid] = (p && p.nome) || 'Alguém'; }
  return nomes[uid];
}

// ---------- Notificações ----------

// Manda para todos os aparelhos da pessoa. Devolve quantos receberam.
function notificar(uid, titulo, corpo, url, tag) {
  let enviados = 0;
  const erros = [];
  buscar('', 'dispositivos', 'uid', uid).forEach(d => {
    const token = d.id;
    const r = googleApi('https://fcm.googleapis.com/v1/projects/' + PROJETO + '/messages:send', {
      message: {
        token: token,
        data: { titulo: String(titulo), corpo: String(corpo || ''), url: url || SITE_URL, tag: tag || '' },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } },
      },
    });
    if (r.codigo === 200) enviados++;
    // Aparelho que desinstalou o app ou bloqueou os avisos: sai da lista
    else if (r.codigo === 404 || (r.codigo === 400 && r.texto.indexOf('registration token') >= 0)) {
      googleApi(FIRESTORE + '/dispositivos/' + encodeURIComponent(token), null, 'delete');
    } else erros.push('FCM ' + r.codigo + ': ' + r.texto);
  });
  if (erros.length) throw new Error(erros.join(' | '));
  return enviados;
}

// ---------- Acesso ao banco (Firestore) ----------

// Chama uma API do Google com a permissão da conta dona do projeto
function googleApi(url, corpo, metodo) {
  const r = UrlFetchApp.fetch(url, {
    method: metodo || 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJETO },
    payload: corpo ? JSON.stringify(corpo) : undefined,
    muteHttpExceptions: true,
  });
  return { codigo: r.getResponseCode(), texto: r.getContentText() };
}

function lerDoc(caminho) {
  const r = googleApi(FIRESTORE + '/' + caminho, null, 'get');
  if (r.codigo === 404) return null;
  if (r.codigo !== 200) throw new Error('Firestore ' + r.codigo + ': ' + r.texto);
  return comoObjeto(JSON.parse(r.texto));
}

// Documentos de uma coleção com filtro "campo == valor". pai = '' (raiz) ou 'users/uid'
function buscar(pai, colecao, campo, valor) {
  const r = googleApi(FIRESTORE + (pai ? '/' + pai : '') + ':runQuery', {
    structuredQuery: {
      from: [{ collectionId: colecao }],
      where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } } },
    },
  });
  if (r.codigo !== 200) throw new Error('Firestore ' + r.codigo + ': ' + r.texto);
  return JSON.parse(r.texto).filter(x => x.document).map(x => comoObjeto(x.document));
}

const conexoesDe = (campo, uid) => buscar('', 'conexoes', campo, uid);

function listar(colecao) {
  let docs = [], pagina = '';
  do {
    const r = googleApi(FIRESTORE + '/' + colecao + '?pageSize=300' + (pagina ? '&pageToken=' + pagina : ''), null, 'get');
    if (r.codigo !== 200) throw new Error('Firestore ' + r.codigo + ': ' + r.texto);
    const resp = JSON.parse(r.texto);
    docs = docs.concat(resp.documents || []);
    pagina = resp.nextPageToken || '';
  } while (pagina);
  return docs.map(comoObjeto);
}

// O Firestore devolve { stringValue }, { booleanValue }... Aqui vira um objeto comum.
function comoObjeto(documento) {
  return Object.assign({ id: decodeURIComponent(documento.name.split('/').pop()) }, camposDe(documento.fields));
}
function camposDe(campos) {
  const o = {};
  Object.keys(campos || {}).forEach(k => { o[k] = valorDe(campos[k]); });
  return o;
}
function valorDe(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('mapValue' in v) return camposDe(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valorDe);
  return null;
}

const hojeISO = () => Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
const dataBR = iso => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');
