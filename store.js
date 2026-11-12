/* =========================================================
   Store: camada de dados (Firebase)
   A interface (app.js) só conversa com as funções exportadas aqui.

   Coleções no Firestore:
     users/{uid}                  → { nome, email, codigo, metaPeso, criadoEm }
     users/{uid}/plano/{dia}      → { titulo, exercicios: [{ id, nome, series, reps, carga }] }
                                    dia = 0 (domingo) a 6 (sábado)
     users/{uid}/registros/{data} → { feitos: [ids dos exercícios], cargas: { exId: { kg, nome } }, atualizadoEm }
                                    data = 'AAAA-MM-DD'
     users/{uid}/checkins/{id}    → { data, hora, legenda, temFoto, criadoEm, reacoes: { uidDeQuemReagiu: emoji } }
     users/{uid}/fotos/{id}       → { img }   foto do check-in (JPEG reduzido, em texto). Fica separada
                                    para a lista de check-ins carregar rápido e a foto só quando aparece.
     conexoes/{id}/mensagens/{id} → recados antigos (o chat foi tirado do app; só são apagados com a conta)
     users/{uid}/pesos/{data}     → { kg, criadoEm }   um registro de peso por dia
     users/{uid}/medidas/{data}   → { cintura, quadril, braco, criadoEm }   em cm (privado, só a dona vê)
     users/{uid}.alturaCm         → altura para o IMC (também copiada nas conexões em que ela é atleta)
     users/{uid}.horaLembrete     → hora do lembrete diário (6 a 22; sem valor = 19)
     codigos/{codigo}             → { uid }   código de conexão
     dispositivos/{token}         → { uid, atualizadoEm }   aparelhos que recebem avisos
     users/{uid}.avisos           → { checkin, lembrete, meuLembrete, recados, reacoes } (false = desligado)
     sugestoes/{id}               → { uid, nome, email, tipo, texto, versao, criadoEm }   só quem mantém o app lê
     users/{uid}.boasVindas       → 'AAAA-MM-DD' em que terminou o primeiro acesso guiado
     conexoes/{atleta}_{viewer}   → { atleta, viewer, codigo, atletaNome, viewerNome, status, perm, criadoEm }
                                    atleta = quem treina; viewer = quem acompanha
                                    status = 'pendente' | 'aceita'
                                    perm = { treinos, checkins, peso } (o que o viewer pode ver)
   ========================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile, sendEmailVerification,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, deleteUser,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, where, documentId, onSnapshot, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, addDoc, writeBatch, deleteField,
  runTransaction, serverTimestamp, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getMessaging, getToken, deleteToken, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { firebaseConfig, VAPID_KEY, AVISOS_URL, RECAPTCHA_KEY, VERSAO } from './firebase-config.js';

const preenchido = v => !!v && !v.startsWith('COLE');
export const configurado = preenchido(firebaseConfig.apiKey);
export const avisosConfigurados = preenchido(VAPID_KEY) && preenchido(AVISOS_URL);

const app = configurado ? initializeApp(firebaseConfig) : null;

// Proteção contra abuso (App Check): prova para o Firebase que o pedido veio do site de verdade.
// No computador de teste (localhost) usa um código de depuração, cadastrado no Console do Firebase.
if (app && preenchido(RECAPTCHA_KEY)) {
  if (location.hostname === 'localhost') self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  try {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(RECAPTCHA_KEY), isTokenAutoRefreshEnabled: true });
  } catch (err) { console.warn('App Check não iniciou', err); }
}
const auth = app && getAuth(app);
const db = app && abrirBanco(app);
if (auth) auth.languageCode = 'pt-BR';

// Cópia dos dados no aparelho: abre na hora e funciona sem internet na academia
function abrirBanco(firebaseApp) {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn('Sem cópia local dos dados', err);
    return getFirestore(firebaseApp);
  }
}

const normalizarEmail = email => email.trim().toLowerCase();

// ---------- Login ----------

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, user => callback(user
    ? { uid: user.uid, email: user.email, nome: user.displayName, verificado: user.emailVerified } : null));
}

// ---------- Entrar com Google ----------
// No celular com o app instalado, a janelinha (popup) às vezes é bloqueada: aí vai pelo redirecionamento.
export async function entrarComGoogle() {
  const provedor = new GoogleAuthProvider();
  provedor.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provedor);
  } catch (err) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(err.code)) {
      await signInWithRedirect(auth, provedor);
      return;
    }
    throw err;
  }
}
// Volta do redirecionamento do Google: só para mostrar erro, se houver (o login em si chega pelo onAuthChange)
export const resultadoGoogle = () => (auth ? getRedirectResult(auth) : Promise.resolve(null));

// Como a pessoa entra: 'password' (e-mail e senha) ou 'google.com'
export const provedorAtual = () => auth.currentUser?.providerData?.[0]?.providerId || 'password';

// ---------- Confirmação do e-mail ----------
// A conta só funciona depois que a pessoa toca no link que chega no e-mail.
export async function reenviarVerificacao() {
  await sendEmailVerification(auth.currentUser);
  marcarEnvio();
}

// Confere de novo no Firebase se o e-mail já foi confirmado (e atualiza o login para as regras do banco)
export async function conferirVerificacao() {
  const u = auth.currentUser;
  if (!u) return false;
  await u.reload();
  if (u.emailVerified) await u.getIdToken(true);
  return u.emailVerified;
}

export const entrar = (email, senha) => signInWithEmailAndPassword(auth, normalizarEmail(email), senha);
export const sair = async () => { await esquecerAparelho(); await signOut(auth); };
export const esqueciSenha = email => sendPasswordResetEmail(auth, normalizarEmail(email));

// O e-mail de confirmação sai LOGO depois de criar o login, antes de qualquer outra coisa:
// se o perfil falhar depois (internet, por exemplo), o e-mail já foi.
// Devolve { user, erroEmail } para a tela avisar se o envio falhou.
export async function criarConta(nome, email, senha) {
  const { user } = await createUserWithEmailAndPassword(auth, normalizarEmail(email), senha);
  let erroEmail = null;
  try { await sendEmailVerification(user); } catch (err) { erroEmail = err; console.error('E-mail de confirmação não enviado', err); }
  marcarEnvio();
  await updateProfile(user, { displayName: nome });
  await criarPerfil(user.uid, nome, user.email);
  return { user, erroEmail };
}

// Quando foi o último envio do link (para a tela mostrar e evitar cliques repetidos)
function marcarEnvio() { try { localStorage.setItem('verificacao-enviada', String(Date.now())); } catch { /* ok */ } }
export function ultimoEnvio() { try { return +localStorage.getItem('verificacao-enviada') || 0; } catch { return 0; } }

// Código de conexão curto (ex.: FIT-4K7Q). Sem letras parecidas (0/O, 1/I).
function novoCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return 'FIT-' + [...bytes].map(b => letras[b % letras.length]).join('');
}

// Cria o perfil e reserva um código único. Também serve para contas antigas sem perfil.
export async function criarPerfil(uid, nome, email) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = novoCodigo();
    const ok = await runTransaction(db, async tx => {
      const refCodigo = doc(db, 'codigos', codigo);
      const refPerfil = doc(db, 'users', uid);
      if ((await tx.get(refPerfil)).exists()) return true; // já existe: não cria de novo
      if ((await tx.get(refCodigo)).exists()) return false;
      tx.set(refCodigo, { uid });
      tx.set(doc(db, 'users', uid), { nome, email, codigo, metaPeso: null, criadoEm: serverTimestamp() });
      return true;
    });
    if (ok) return codigo;
  }
  throw new Error('Não foi possível gerar o código de conexão. Tente de novo.');
}

// ---------- Perfil ----------

export function escutarPerfil(uid, callback, onError) {
  return onSnapshot(doc(db, 'users', uid), snap => callback(snap.exists() ? snap.data() : null), onError);
}

export const salvarPerfil = (uid, dados) => updateDoc(doc(db, 'users', uid), dados);

// ---------- Plano da semana ----------

export function escutarPlano(uid, callback, onError) {
  return onSnapshot(collection(db, 'users', uid, 'plano'), snap => {
    const plano = {};
    snap.docs.forEach(d => { plano[d.id] = d.data(); });
    callback(plano);
  }, onError);
}

// desde = 'AAAA-MM-DD' do dia em que esse dia da semana passou a ter treino.
// Dias anteriores não contam como falta (ex.: montou a semana numa quinta).
export const salvarDia = (uid, dia, dados) =>
  setDoc(doc(db, 'users', uid, 'plano', String(dia)), {
    titulo: String(dados.titulo || '').slice(0, 60),
    exercicios: dados.exercicios || [],
    ...(dados.desde ? { desde: dados.desde } : {}),
  });

// Mantém meu nome igual em todas as conexões quando eu troco no Perfil
export async function atualizarNomeNasConexoes(meuUid, conexoes, nome) {
  await Promise.all(conexoes.map(c => updateDoc(doc(db, 'conexoes', c.id),
    c.atleta === meuUid ? { atletaNome: nome } : { viewerNome: nome })));
}

// ---------- Registros (o que foi feito em cada dia) ----------

export function escutarRegistros(uid, desde, callback, onError) {
  const q = query(collection(db, 'users', uid, 'registros'), where(documentId(), '>=', desde));
  return onSnapshot(q, snap => {
    const registros = {};
    snap.docs.forEach(d => { registros[d.id] = d.data(); });
    callback(registros);
  }, onError);
}

// ---------- Conexões (quem acompanha quem) ----------

const erroComCodigo = (code, message) => Object.assign(new Error(message), { code });

// Quem acompanha digita o código de quem treina e manda um pedido
export async function pedirConexao(meuUid, meuNome, codigoDigitado) {
  // Aceita "fit-ab12", "FIT AB12" ou só "AB12"
  const codigo = 'FIT-' + codigoDigitado.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^FIT/, '');
  if (!/^FIT-[A-Z0-9]{4}$/.test(codigo)) throw erroComCodigo('codigo/formato', 'O código tem este formato: FIT-AB12.');
  const snap = await getDoc(doc(db, 'codigos', codigo));
  if (!snap.exists()) throw erroComCodigo('codigo/nao-existe', 'Não achamos esse código. Confira com a pessoa.');
  const atleta = snap.data().uid;
  if (atleta === meuUid) throw erroComCodigo('codigo/proprio', 'Esse é o seu próprio código.');
  const ref = doc(db, 'conexoes', `${atleta}_${meuUid}`);
  try {
    await setDoc(ref, {
      atleta, viewer: meuUid, codigo, atletaNome: '', viewerNome: meuNome, status: 'pendente',
      perm: { treinos: true, checkins: true, peso: false }, criadoEm: serverTimestamp(),
    });
  } catch (err) {
    // Já existe pedido ou conexão com essa pessoa (as regras não deixam sobrescrever)
    if (err.code === 'permission-denied') throw erroComCodigo('codigo/repetido', 'Você já tem um pedido ou conexão com essa pessoa.');
    throw err;
  }
}

// Todas as conexões em que eu apareço, dos dois lados
export function escutarConexoes(uid, callback, onError) {
  const lados = { atleta: [], viewer: [] };
  const juntar = () => callback([...lados.atleta, ...lados.viewer]);
  const ouvir = campo => onSnapshot(query(collection(db, 'conexoes'), where(campo, '==', uid)), snap => {
    lados[campo] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    juntar();
  }, onError);
  const parar = [ouvir('atleta'), ouvir('viewer')];
  return () => parar.forEach(f => f());
}

export const aceitarConexao = (id, meuNome, alturaCm) =>
  updateDoc(doc(db, 'conexoes', id), { status: 'aceita', atletaNome: meuNome, ...(alturaCm ? { alturaCm } : {}) });
export const salvarPermissoes = (id, perm) => updateDoc(doc(db, 'conexoes', id), { perm });
export const removerConexao = id => deleteDoc(doc(db, 'conexoes', id));

// ---------- Check-ins ----------

export const REACOES = ['💪', '🔥', '❤️', '👏'];

// Salva o check-in e a foto juntos: ou os dois entram, ou nenhum
export async function criarCheckin(uid, { data, hora, legenda }, foto) {
  const ref = doc(collection(db, 'users', uid, 'checkins'));
  const batch = writeBatch(db);
  batch.set(ref, { data, hora, legenda: String(legenda || '').slice(0, 140), temFoto: !!foto, criadoEm: serverTimestamp(), reacoes: {} });
  if (foto) batch.set(doc(db, 'users', uid, 'fotos', ref.id), { img: foto });
  await batch.commit();
  return ref.id;
}

export function escutarCheckins(uid, desde, callback, onError) {
  const q = query(collection(db, 'users', uid, 'checkins'), where('data', '>=', desde));
  return onSnapshot(q, snap => {
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));
    callback(lista);
  }, onError);
}

export async function lerFoto(uid, id) {
  const snap = await getDoc(doc(db, 'users', uid, 'fotos', id));
  return snap.exists() ? snap.data().img : null;
}

export async function apagarCheckin(uid, id) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'checkins', id));
  batch.delete(doc(db, 'users', uid, 'fotos', id));
  await batch.commit();
}

// Cada pessoa tem no máximo uma reação por check-in; tocar na mesma de novo tira
export const reagir = (donoUid, checkinId, meuUid, emoji) =>
  updateDoc(doc(db, 'users', donoUid, 'checkins', checkinId), { [`reacoes.${meuUid}`]: emoji || deleteField() });

// ---------- Peso ----------

export function escutarPesos(uid, callback, onError) {
  return onSnapshot(collection(db, 'users', uid, 'pesos'), snap => {
    callback(snap.docs.map(d => ({ data: d.id, kg: d.data().kg })).sort((a, b) => a.data.localeCompare(b.data)));
  }, onError);
}

// Um registro por dia: registrar de novo no mesmo dia substitui
export const salvarPeso = (uid, data, kg) =>
  setDoc(doc(db, 'users', uid, 'pesos', data), { kg: Math.round(kg * 10) / 10, criadoEm: serverTimestamp() });
export const apagarPeso = (uid, data) => deleteDoc(doc(db, 'users', uid, 'pesos', data));

// ---------- Medidas do corpo ----------

export function escutarMedidas(uid, callback, onError) {
  return onSnapshot(collection(db, 'users', uid, 'medidas'), snap => {
    callback(snap.docs.map(d => ({ data: d.id, ...d.data() })).sort((a, b) => a.data.localeCompare(b.data)));
  }, onError);
}

export function salvarMedida(uid, data, medidas) {
  const limpo = {};
  for (const k of ['cintura', 'quadril', 'braco']) {
    if (Number.isFinite(medidas[k])) limpo[k] = Math.round(medidas[k] * 10) / 10;
  }
  return setDoc(doc(db, 'users', uid, 'medidas', data), { ...limpo, criadoEm: serverTimestamp() });
}
export const apagarMedida = (uid, data) => deleteDoc(doc(db, 'users', uid, 'medidas', data));

// ---------- Conquistas e meta do casal ----------

// Guarda o dia em que cada conquista foi desbloqueada: users/{uid}.conquistas.{id} = 'AAAA-MM-DD'
export function registrarConquistas(uid, ids, data) {
  const campos = {};
  ids.forEach(id => { campos[`conquistas.${id}`] = data; });
  return updateDoc(doc(db, 'users', uid), campos);
}

// meta = { mes: 'AAAA-MM', treinos, recompensa, batida }
export const salvarMetaCasal = (conexaoId, meta) => updateDoc(doc(db, 'conexoes', conexaoId), { meta });

// A altura vai também nas conexões em que eu treino, para quem acompanha calcular o IMC
// (o perfil em si é privado). Só a altura: o resto do perfil continua só meu.
export async function copiarAlturaParaConexoes(ids, alturaCm) {
  await Promise.all(ids.map(id => updateDoc(doc(db, 'conexoes', id), { alturaCm })));
}

// ---------- Baixar meus dados (portabilidade, LGPD) ----------
// Junta tudo da pessoa num objeto só. As fotos ficam de fora (pesariam demais).
export async function exportarDados(uid) {
  const lerTudo = async caminho => (await getDocs(collection(db, ...caminho))).docs.map(d => ({ id: d.id, ...limpar(d.data()) }));
  const perfil = (await getDoc(doc(db, 'users', uid))).data() || {};
  const conexoes = [
    ...(await getDocs(query(collection(db, 'conexoes'), where('atleta', '==', uid)))).docs,
    ...(await getDocs(query(collection(db, 'conexoes'), where('viewer', '==', uid)))).docs,
  ].map(d => {
    const c = d.data();
    return { comQuem: c.atleta === uid ? c.viewerNome : c.atletaNome, papel: c.atleta === uid ? 'essa pessoa me acompanha' : 'eu acompanho essa pessoa',
      situacao: c.status, permissoes: c.perm, metaDoMes: c.meta || null };
  });
  const checkins = (await lerTudo(['users', uid, 'checkins'])).map(c => ({ ...c, foto: c.temFoto ? '(foto não incluída)' : null }));
  return {
    app: 'Treino Junto', geradoEm: new Date().toISOString(), versao: VERSAO,
    aviso: 'Seus dados no Treino Junto. Fotos de check-in e de antes e depois não estão incluídas.',
    perfil: limpar(perfil),
    planoDaSemana: await lerTudo(['users', uid, 'plano']),
    treinosFeitos: await lerTudo(['users', uid, 'registros']),
    checkins,
    pesos: await lerTudo(['users', uid, 'pesos']),
    medidas: await lerTudo(['users', uid, 'medidas']),
    conexoes,
  };
}
// Datas do Firestore viram texto legível no arquivo
function limpar(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => (v && typeof v === 'object' && 'seconds' in v && 'nanoseconds' in v
    ? new Date(v.seconds * 1000).toISOString() : v)));
}

// ---------- Registro de erros ----------
// Quando algo dá errado no aparelho de alguém, guarda o erro para quem mantém o app ver
// (Console do Firebase › coleção "erros", ou a aba Erros do backup). Não guarda dados de treino.
export async function registrarErro({ mensagem, detalhe, tela }) {
  if (!auth?.currentUser) return; // sem login não grava (evita abuso)
  await addDoc(collection(db, 'erros'), {
    uid: auth.currentUser.uid,
    mensagem: String(mensagem || '').slice(0, 300),
    detalhe: String(detalhe || '').slice(0, 1500),
    tela: String(tela || '').slice(0, 40),
    versao: VERSAO,
    aparelho: String(navigator.userAgent || '').slice(0, 200),
    criadoEm: serverTimestamp(),
  });
}

// ---------- Sugestões ----------
export const enviarSugestao = (uid, nome, email, tipo, texto) =>
  addDoc(collection(db, 'sugestoes'), {
    uid, nome: String(nome || '').slice(0, 40), email: String(email || '').slice(0, 100),
    tipo, texto: String(texto).slice(0, 1000), versao: VERSAO, criadoEm: serverTimestamp(),
  });

// ---------- Apagar minha conta e meus dados (LGPD) ----------

// O Firebase só deixa apagar a conta com login recente: confirma a senha (ou o Google) de novo
export async function confirmarIdentidade(senha) {
  const u = auth.currentUser;
  if (provedorAtual() === 'google.com') return reauthenticateWithPopup(u, new GoogleAuthProvider());
  return reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, senha));
}

async function apagarColecao(caminho) {
  const snap = await getDocs(collection(db, ...caminho));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

// Apaga tudo da pessoa e, por último, o login. progresso(texto) mostra em que passo está.
export async function apagarTudo(uid, codigo, progresso = () => {}) {
  progresso('Apagando conexões…');
  const conexoes = [
    ...(await getDocs(query(collection(db, 'conexoes'), where('atleta', '==', uid)))).docs,
    ...(await getDocs(query(collection(db, 'conexoes'), where('viewer', '==', uid)))).docs,
  ];
  for (const c of conexoes) {
    if (c.data().status === 'aceita') await apagarColecao(['conexoes', c.id, 'mensagens']);
    await deleteDoc(c.ref);
  }
  progresso('Apagando treinos, check-ins e fotos…');
  for (const sub of ['plano', 'registros', 'checkins', 'fotos', 'pesos', 'medidas', 'fotosProgresso']) {
    await apagarColecao(['users', uid, sub]);
  }
  progresso('Desligando os avisos…');
  const aparelhos = await getDocs(query(collection(db, 'dispositivos'), where('uid', '==', uid)));
  await Promise.all(aparelhos.docs.map(d => deleteDoc(d.ref)));
  progresso('Apagando o perfil…');
  if (codigo) await deleteDoc(doc(db, 'codigos', codigo)).catch(() => {});
  await deleteDoc(doc(db, 'users', uid));
  progresso('Apagando o login…');
  await deleteUser(auth.currentUser);
}

// ---------- Avisos no celular ----------
// O app registra o aparelho no Firestore e, quando algo acontece (check-in, reação, conquista),
// pede ao script de avisos (Google Apps Script) para notificar. O script confere quem pediu
// e decide sozinho quem recebe, lendo as conexões no banco.

export const suportaNotificacoes = () => isSupported().catch(() => false);

async function tokenDoAparelho() {
  if (!avisosConfigurados || !(await suportaNotificacoes())) return null;
  const registro = await navigator.serviceWorker.ready;
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registro });
}

// Chamar depois que a pessoa permitiu as notificações (e a cada login, para manter atualizado)
export async function registrarAparelho(uid) {
  const token = await tokenDoAparelho();
  if (!token) return false;
  await setDoc(doc(db, 'dispositivos', token), { uid, atualizadoEm: serverTimestamp() });
  return true;
}

// Ao sair da conta, este aparelho para de receber os avisos dela
export async function esquecerAparelho() {
  if (globalThis.Notification?.permission !== 'granted') return;
  try {
    const token = await tokenDoAparelho();
    if (token) await deleteDoc(doc(db, 'dispositivos', token));
    await deleteToken(getMessaging(app));
  } catch (err) { console.warn('Não deu para desligar os avisos deste aparelho', err); }
}

export const salvarAvisos = (uid, avisos) => updateDoc(doc(db, 'users', uid), { avisos });

// Pede ao script para avisar sobre um acontecimento. Nunca trava o app se falhar.
export async function avisar(evento) {
  if (!preenchido(AVISOS_URL) || !auth.currentUser) return;
  try {
    const idToken = await auth.currentUser.getIdToken();
    const resposta = await fetch(AVISOS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita o bloqueio de CORS do Google
      body: JSON.stringify({ idToken, ...evento }),
    });
    const r = await resposta.json();
    if (!r.ok) console.warn('Aviso não enviado:', r.erro);
  } catch (err) { console.warn('Aviso não enviado', err); }
}

// Carga usada num exercício naquele dia (anotar a carga já conta o exercício como feito)
export const anotarCarga = (uid, data, exId, nome, kg) =>
  setDoc(doc(db, 'users', uid, 'registros', data), {
    cargas: { [exId]: kg === null ? deleteField() : { kg: Math.round(kg * 10) / 10, nome: String(nome).slice(0, 60) } },
    ...(kg === null ? {} : { feitos: arrayUnion(exId) }),
    atualizadoEm: serverTimestamp(),
  }, { merge: true });

// ---------- Fotos de antes e depois (privadas) ----------
// users/{uid}/fotosProgresso/{data} → { img }. Carregadas só quando a pessoa abre a seção.
export async function lerFotosProgresso(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'fotosProgresso'));
  return snap.docs.map(d => ({ data: d.id, img: d.data().img })).sort((a, b) => a.data.localeCompare(b.data));
}
export const salvarFotoProgresso = (uid, data, img) => setDoc(doc(db, 'users', uid, 'fotosProgresso', data), { img });
export const apagarFotoProgresso = (uid, data) => deleteDoc(doc(db, 'users', uid, 'fotosProgresso', data));

export const marcarExercicio = (uid, data, exId, feito) =>
  setDoc(doc(db, 'users', uid, 'registros', data), {
    feitos: feito ? arrayUnion(exId) : arrayRemove(exId),
    atualizadoEm: serverTimestamp(),
  }, { merge: true });
