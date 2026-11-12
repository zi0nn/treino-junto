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
const HORA_PADRAO = 19; // horário do lembrete de quem não escolheu outro no app
const HORA_RESUMO = 20; // domingo, resumo da semana

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/' + PROJETO + '/databases/(default)/documents';
const REACOES = ['💪', '🔥', '❤️', '👏'];

// ---------- Chamado pelo app ----------
// { idToken, evento: 'checkin', checkinId }
// { idToken, evento: 'reacao', atleta, checkinId }
// (recados foram tirados do app; o evento 'recado' é ignorado)

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    const uid = loginDe(dados.idToken);
    if (!uid) return responder({ ok: false, erro: 'Login inválido' });

    if (dados.evento === 'checkin') avisarCheckin(uid, String(dados.checkinId || ''));
    else if (dados.evento === 'reacao') avisarReacao(uid, String(dados.atleta || ''), String(dados.checkinId || ''));
    else if (dados.evento === 'recado') return responder({ ok: true }); // recados foram tirados do app
    else if (dados.evento === 'conquista') avisarConquista(uid, String(dados.id || ''), String(dados.nome || '').slice(0, 40));
    else if (dados.evento === 'metaBatida') avisarMetaBatida(uid, String(dados.conexaoId || ''));
    else if (dados.evento === 'sugestao') avisarSugestao(uid, String(dados.tipo || ''));
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
  return usuario && usuario.emailVerified ? usuario.localId : null; // só contas com e-mail confirmado
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
        SITE_URL + '#mural', 'checkin-' + atleta);
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
    SITE_URL + '#mural', 'reacao-' + checkinId);
}

// Recado novo → avisa a outra pessoa da conexão
function avisarRecado(remetente, conexaoId, texto) {
  const c = lerDoc('conexoes/' + conexaoId);
  if (!c || c.status !== 'aceita') return;
  if (c.atleta !== remetente && c.viewer !== remetente) return;
  const destino = c.atleta === remetente ? c.viewer : c.atleta;
  if (!querAviso(destino, 'recados')) return;
  notificar(destino, 'Recado de ' + nomeDe(remetente), texto.slice(0, 140),
    SITE_URL + '#recados', 'recado-' + conexaoId);
}

// Conquista nova → avisa quem acompanha (só se ela foi mesmo registrada hoje no perfil)
function avisarConquista(atleta, id, nome) {
  const p = lerDoc('users/' + atleta);
  if (!p || !p.conquistas || p.conquistas[id] !== hojeISO()) return;
  conexoesDe('atleta', atleta)
    .filter(c => c.status === 'aceita' && c.perm && (c.perm.treinos || c.perm.checkins))
    .forEach(c => {
      if (!querAviso(c.viewer, 'conquistas')) return;
      notificar(c.viewer, '🏆 ' + (p.nome || 'Ela') + ' ganhou uma conquista', nome || 'Nova conquista no Treino Junto',
        SITE_URL + '#acompanhar', 'conquista-' + atleta + '-' + id);
    });
}

// Meta do casal batida → avisa quem acompanha (o script reconta os treinos do mês)
function avisarMetaBatida(atleta, conexaoId) {
  const c = lerDoc('conexoes/' + conexaoId);
  if (!c || c.status !== 'aceita' || c.atleta !== atleta || !c.meta || !c.meta.batida) return;
  const mes = hojeISO().slice(0, 7);
  if (c.meta.mes !== mes || treinosNoMes(atleta, mes) < c.meta.treinos) return;
  if (!querAviso(c.viewer, 'conquistas')) return;
  notificar(c.viewer, '🎉 ' + nomeDe(atleta) + ' bateu a meta do mês!',
    c.meta.treinos + ' treinos' + (c.meta.recompensa ? '. Recompensa: ' + c.meta.recompensa : '') + '. Hora de cumprir! 😄',
    SITE_URL + '#mural', 'meta-' + conexaoId);
}

// Sugestão nova → avisa quem mantém o app (a conta dona do script, pelo e-mail dela)
function avisarSugestao(uid, tipo) {
  const dono = listar('users').filter(u => String(u.email).toLowerCase() === Session.getEffectiveUser().getEmail().toLowerCase())[0];
  if (!dono) return;
  notificar(dono.id, (tipo === 'problema' ? '🐞 Problema relatado por ' : '💡 Sugestão de ') + nomeDe(uid),
    'Veja na aba Sugestões do backup ou no Firestore (coleção sugestoes).', SITE_URL, 'sugestao');
}

// Dias com treino (exercício marcado ou check-in) num mês 'AAAA-MM'
function treinosNoMes(uid, mes) {
  const dias = {};
  buscar('users/' + uid, 'checkins', 'data', mes + '-01', 'GREATER_THAN_OR_EQUAL')
    .filter(c => String(c.data).indexOf(mes) === 0).forEach(c => { dias[c.data] = true; });
  listar('users/' + uid + '/registros')
    .filter(r => r.id.indexOf(mes) === 0 && (r.feitos || []).length).forEach(r => { dias[r.id] = true; });
  return Object.keys(dias).length;
}

// ---------- Resumo da semana (domingo às 20h) ----------
function resumoSemanal(pessoas, conexoes) {
  const agora = new Date();
  const dia = k => Utilities.formatDate(new Date(agora.getTime() - k * 86400000), FUSO, 'yyyy-MM-dd');
  const semana = [6, 5, 4, 3, 2, 1, 0].map(dia); // segunda ... domingo (hoje)
  const porId = {};
  pessoas.forEach(u => { porId[u.id] = u; });

  pessoas.forEach(u => {
    try {
      const plano = {};
      listar('users/' + u.id + '/plano').forEach(p => { plano[p.id] = { tem: (p.exercicios || []).length > 0, desde: p.desde || '' }; });
      // segunda = 1 ... domingo = 0; dias antes de o treino ser montado não contam
      const planejados = semana.filter((d, i) => {
        const p = plano[String((i + 1) % 7)];
        return p && p.tem && (!p.desde || d >= p.desde);
      }).length;
      const treinou = {};
      buscar('users/' + u.id, 'checkins', 'data', semana[0], 'GREATER_THAN_OR_EQUAL').forEach(c => { treinou[c.data] = true; });
      semana.forEach(d => { const r = lerDoc('users/' + u.id + '/registros/' + d); if (r && (r.feitos || []).length) treinou[d] = true; });
      const feitos = semana.filter(d => treinou[d]).length;
      if (!planejados && !feitos) return; // não usou o app esta semana

      // Peso: último da semana comparado com o último antes dela
      const pesos = listar('users/' + u.id + '/pesos').sort((a, b) => (a.id < b.id ? -1 : 1));
      const antes = pesos.filter(p => p.id < semana[0]).pop();
      const depois = pesos.filter(p => p.id >= semana[0]).pop();
      const dif = antes && depois ? depois.kg - antes.kg : null;
      const pesoTxt = dif === null ? '' : ' · Peso: ' + (Math.abs(dif) < 0.05 ? 'estável' : (dif < 0 ? '−' : '+') + Math.abs(dif).toFixed(1).replace('.', ',') + ' kg');
      const treinosTxt = feitos + ' de ' + planejados + ' treinos' + (planejados && feitos >= planejados ? ' 🏆' : ' 💪');

      if (querAviso(u.id, 'resumo', u)) {
        notificar(u.id, 'Sua semana: ' + treinosTxt, (feitos >= planejados ? 'Semana completa! ' : 'Bora pra próxima! ') + pesoTxt.replace(' · ', ''),
          SITE_URL + '#progresso', 'resumo');
      }
      conexoes.filter(c => c.atleta === u.id && c.perm && (c.perm.treinos || c.perm.checkins)).forEach(c => {
        if (!querAviso(c.viewer, 'resumo', porId[c.viewer])) return;
        notificar(c.viewer, 'Semana de ' + (u.nome || 'quem você acompanha') + ': ' + treinosTxt,
          (c.perm.peso ? pesoTxt.replace(' · ', '') : '') || 'Reaja ao próximo check-in para dar força!',
          SITE_URL + '#acompanhar', 'resumo-' + u.id);
      });
    } catch (err) {
      console.error('Resumo de ' + u.id + ': ' + err);
    }
  });
}

// ---------- Lembrete diário (roda sozinho de hora em hora) ----------
// Cada pessoa escolhe no app o horário do lembrete (sem escolha: 19h). Nesse horário:
//  - se ela tem treino planejado hoje e ainda não treinou, recebe "Hoje é dia de ..."
//  - recebe também "Fulana ainda não treinou hoje" sobre quem ela acompanha

function lembreteDiario() {
  const hoje = hojeISO();
  const horaAgora = Number(Utilities.formatDate(new Date(), FUSO, 'H'));
  const diaSemana = Number(Utilities.formatDate(new Date(), FUSO, 'u')) % 7; // 1=segunda ... 7→0=domingo
  const pessoas = listar('users');
  const porId = {};
  pessoas.forEach(u => { porId[u.id] = u; });
  const horaDe = u => Number.isFinite(u && u.horaLembrete) ? u.horaLembrete : HORA_PADRAO;
  const conexoes = listar('conexoes').filter(c => c.status === 'aceita');

  // Domingo às 20h: resumo da semana
  if (diaSemana === 0 && horaAgora === HORA_RESUMO) {
    try { resumoSemanal(pessoas, conexoes); } catch (err) { console.error('Resumo: ' + err); }
  }

  // Só interessa quem treina e tem alguém para avisar nesta hora (ela mesma ou quem acompanha)
  pessoas.forEach(u => {
    try {
      const viewers = conexoes.filter(c => c.atleta === u.id && c.perm && (c.perm.treinos || c.perm.checkins)
        && horaDe(porId[c.viewer]) === horaAgora);
      const eu = horaDe(u) === horaAgora;
      if (!eu && !viewers.length) return;

      const plano = lerDoc('users/' + u.id + '/plano/' + diaSemana);
      if (!plano || !(plano.exercicios || []).length) return; // descanso
      if (treinouHoje(u.id, hoje)) return;

      const titulo = plano.titulo || 'treino';
      if (eu && querAviso(u.id, 'meuLembrete', u)) {
        notificar(u.id, 'Hoje é dia de ' + titulo, 'Ainda dá tempo! Bora? 💪', SITE_URL, 'lembrete');
      }
      viewers.forEach(c => {
        if (!querAviso(c.viewer, 'lembrete', porId[c.viewer])) return;
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

// ---------- Backup semanal no Google Drive (toda segunda às 7h) ----------
// Cria uma planilha com todos os dados na pasta "Treino Junto - Backups" do seu Drive.
// As fotos não vão (pesariam demais): ficam guardadas no Firebase.

const PASTA_BACKUP = 'Treino Junto - Backups';

function fazerBackup() {
  const hoje = hojeISO();
  const pessoas = listar('users').sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const nome = {};
  pessoas.forEach(p => { nome[p.id] = p.nome; });
  const linhas = { treinos: [], cargas: [], checkins: [], pesos: [], medidas: [], plano: [] };

  pessoas.forEach(p => {
    const n = p.nome || p.id;
    listar('users/' + p.id + '/registros').forEach(r => {
      linhas.treinos.push([n, r.id, (r.feitos || []).length]);
      Object.keys(r.cargas || {}).forEach(k => linhas.cargas.push([n, r.id, r.cargas[k].nome, r.cargas[k].kg]));
    });
    listar('users/' + p.id + '/checkins').forEach(c => linhas.checkins.push([n, c.data, c.hora, c.legenda || '', c.temFoto ? 'sim' : 'não',
      Object.keys(c.reacoes || {}).map(u => c.reacoes[u] + ' ' + (nome[u] || '')).join(' ')]));
    listar('users/' + p.id + '/pesos').forEach(x => linhas.pesos.push([n, x.id, x.kg]));
    listar('users/' + p.id + '/medidas').forEach(x => linhas.medidas.push([n, x.id, x.cintura || '', x.quadril || '', x.braco || '']));
    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    listar('users/' + p.id + '/plano').forEach(d => (d.exercicios || []).forEach(e =>
      linhas.plano.push([n, DIAS[Number(d.id)] || d.id, d.titulo || '', e.nome, e.series || '', e.reps || '', e.carga || ''])));
  });

  const conexoes = listar('conexoes');
  const recados = [];
  conexoes.filter(c => c.status === 'aceita').forEach(c => {
    listar('conexoes/' + c.id + '/mensagens').forEach(m => recados.push([quando(m.criadoEm), nome[m.de] || '', m.texto]));
  });

  const porData = (a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1);
  const planilha = SpreadsheetApp.create('Treino Junto - backup ' + hoje);
  escreverAba(planilha.getSheets()[0].setName('Pessoas'), ['Nome', 'E-mail', 'Altura (cm)', 'Meta (kg)', 'Lembrete', 'Conquistas'],
    pessoas.map(p => [p.nome, p.email, p.alturaCm || '', p.metaPeso || '', (p.horaLembrete || HORA_PADRAO) + 'h', Object.keys(p.conquistas || {}).length]));
  escreverAba(planilha.insertSheet('Treinos'), ['Pessoa', 'Dia', 'Exercícios feitos'], linhas.treinos.sort(porData));
  escreverAba(planilha.insertSheet('Cargas'), ['Pessoa', 'Dia', 'Exercício', 'Carga (kg)'], linhas.cargas.sort(porData));
  escreverAba(planilha.insertSheet('Check-ins'), ['Pessoa', 'Dia', 'Hora', 'Legenda', 'Foto', 'Reações'], linhas.checkins.sort(porData));
  escreverAba(planilha.insertSheet('Peso'), ['Pessoa', 'Dia', 'Peso (kg)'], linhas.pesos.sort(porData));
  escreverAba(planilha.insertSheet('Medidas'), ['Pessoa', 'Dia', 'Cintura', 'Quadril', 'Braço'], linhas.medidas.sort(porData));
  escreverAba(planilha.insertSheet('Plano da semana'), ['Pessoa', 'Dia', 'Treino', 'Exercício', 'Séries', 'Reps', 'Carga'], linhas.plano);
  escreverAba(planilha.insertSheet('Conexões'), ['Quem treina', 'Quem acompanha', 'Situação', 'Vê treinos', 'Vê check-ins', 'Vê peso', 'Meta do mês'],
    conexoes.map(c => [nome[c.atleta] || c.atletaNome, nome[c.viewer] || c.viewerNome, c.status,
      c.perm && c.perm.treinos ? 'sim' : 'não', c.perm && c.perm.checkins ? 'sim' : 'não', c.perm && c.perm.peso ? 'sim' : 'não',
      c.meta ? c.meta.mes + ': ' + c.meta.treinos + ' treinos (' + (c.meta.recompensa || '') + ')' : '']));
  escreverAba(planilha.insertSheet('Recados'), ['Quando', 'De', 'Texto'], recados.sort());
  escreverAba(planilha.insertSheet('Sugestões'), ['Quando', 'Pessoa', 'E-mail', 'Tipo', 'Texto', 'Versão'],
    listar('sugestoes').sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0))
      .map(s => [quando(s.criadoEm), s.nome || '', s.email || '', s.tipo || '', s.texto || '', s.versao || '']));
  // Erros do app: os 300 mais recentes
  escreverAba(planilha.insertSheet('Erros'), ['Quando', 'Pessoa', 'Tela', 'Mensagem', 'Detalhe', 'Versão', 'Aparelho'],
    listar('erros').sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0)).slice(0, 300)
      .map(e => [quando(e.criadoEm), nome[e.uid] || e.uid || '', e.tela || '', e.mensagem || '', String(e.detalhe || '').slice(0, 500), e.versao || '', e.aparelho || '']));

  const pasta = pastaDeBackup();
  DriveApp.getFileById(planilha.getId()).moveTo(pasta);
  // Guarda só as últimas 4 semanas (combinado na página de privacidade): as mais antigas vão para a lixeira
  const limite = Date.now() - 29 * 86400000;
  const arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    const f = arquivos.next();
    if (f.getDateCreated().getTime() < limite) f.setTrashed(true);
  }
  console.log('Backup criado: ' + planilha.getUrl());
  return planilha.getUrl();
}

const quando = d => (d instanceof Date ? Utilities.formatDate(d, FUSO, 'yyyy-MM-dd HH:mm') : '');

function escreverAba(aba, cabecalho, linhas) {
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
    .setFontWeight('bold').setBackground('#1E7A58').setFontColor('#FFFFFF');
  if (linhas.length) aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, cabecalho.length);
}

function pastaDeBackup() {
  const pastas = DriveApp.getFoldersByName(PASTA_BACKUP);
  return pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA_BACKUP);
}

// ---------- Rode UMA vez pelo editor ----------
// Autoriza o script, liga o lembrete (de hora em hora) e o backup semanal (segunda, 7h)
function instalarRotinas() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lembreteDiario').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('fazerBackup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).inTimezone(FUSO).create();
  const url = fazerBackup(); // já deixa o primeiro backup pronto
  console.log('Pronto: lembrete ligado (padrão ' + HORA_PADRAO + 'h) e backup toda segunda às 7h. Primeiro backup: ' + url);
}

// Para testar o resumo de domingo em qualquer dia: escolha esta função e clique em Executar
// (manda o resumo dos últimos 7 dias para todo mundo que usou o app)
function testarResumo() {
  resumoSemanal(listar('users'), listar('conexoes').filter(c => c.status === 'aceita'));
  console.log('Resumo enviado.');
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

// Documentos de uma coleção com filtro "campo == valor" (ou outro operador). pai = '' (raiz) ou 'users/uid'
function buscar(pai, colecao, campo, valor, operador) {
  const r = googleApi(FIRESTORE + (pai ? '/' + pai : '') + ':runQuery', {
    structuredQuery: {
      from: [{ collectionId: colecao }],
      where: { fieldFilter: { field: { fieldPath: campo }, op: operador || 'EQUAL', value: { stringValue: valor } } },
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
