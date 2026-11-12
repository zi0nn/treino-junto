/* =========================================================
   Store: camada de dados (Firebase)
   A interface (app.js) só conversa com as funções exportadas aqui.

   Coleções no Firestore:
     users/{uid}                  → { nome, email, codigo, metaPeso, criadoEm }
     users/{uid}/plano/{dia}      → { titulo, exercicios: [{ id, nome, series, reps, carga }] }
                                    dia = 0 (domingo) a 6 (sábado)
     users/{uid}/registros/{data} → { feitos: [ids dos exercícios], atualizadoEm }
                                    data = 'AAAA-MM-DD'
     users/{uid}/checkins/{id}    → { data, hora, legenda, temFoto, criadoEm, reacoes: { uidDeQuemReagiu: emoji } }
     users/{uid}/fotos/{id}       → { img }   foto do check-in (JPEG reduzido, em texto). Fica separada
                                    para a lista de check-ins carregar rápido e a foto só quando aparece.
     conexoes/{id}/mensagens/{id} → { de, texto, criadoEm }   recados entre as duas pessoas conectadas
     users/{uid}/pesos/{data}     → { kg, criadoEm }   um registro de peso por dia
     users/{uid}/medidas/{data}   → { cintura, quadril, braco, criadoEm }   em cm (privado, só a dona vê)
     users/{uid}.alturaCm         → altura para o IMC (também copiada nas conexões em que ela é atleta)
     users/{uid}.horaLembrete     → hora do lembrete diário (6 a 22; sem valor = 19)
     codigos/{codigo}             → { uid }   código de conexão
     dispositivos/{token}         → { uid, atualizadoEm }   aparelhos que recebem avisos
     users/{uid}.avisos           → { checkin, lembrete, meuLembrete, recados, reacoes } (false = desligado)
     conexoes/{atleta}_{viewer}   → { atleta, viewer, codigo, atletaNome, viewerNome, status, perm, criadoEm }
                                    atleta = quem treina; viewer = quem acompanha
                                    status = 'pendente' | 'aceita'
                                    perm = { treinos, checkins, peso } (o que o viewer pode ver)
   ========================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, query, where, documentId, onSnapshot, getDoc, orderBy, limit,
  setDoc, updateDoc, deleteDoc, addDoc, writeBatch, deleteField,
  runTransaction, serverTimestamp, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getMessaging, getToken, deleteToken, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { firebaseConfig, VAPID_KEY, AVISOS_URL } from './firebase-config.js';

const preenchido = v => !!v && !v.startsWith('COLE');
export const configurado = preenchido(firebaseConfig.apiKey);
export const avisosConfigurados = preenchido(VAPID_KEY) && preenchido(AVISOS_URL);

const app = configurado ? initializeApp(firebaseConfig) : null;
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
  return onAuthStateChanged(auth, user => callback(user ? { uid: user.uid, email: user.email, nome: user.displayName } : null));
}

export const entrar = (email, senha) => signInWithEmailAndPassword(auth, normalizarEmail(email), senha);
export const sair = async () => { await esquecerAparelho(); await signOut(auth); };
export const esqueciSenha = email => sendPasswordResetEmail(auth, normalizarEmail(email));

export async function criarConta(nome, email, senha) {
  const { user } = await createUserWithEmailAndPassword(auth, normalizarEmail(email), senha);
  await updateProfile(user, { displayName: nome });
  await criarPerfil(user.uid, nome, user.email);
  return user;
}

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

export const salvarDia = (uid, dia, dados) =>
  setDoc(doc(db, 'users', uid, 'plano', String(dia)), {
    titulo: String(dados.titulo || '').slice(0, 60),
    exercicios: dados.exercicios || [],
  });

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

// ---------- Recados ----------

export function escutarMensagens(conexaoId, callback, onError) {
  const q = query(collection(db, 'conexoes', conexaoId, 'mensagens'), orderBy('criadoEm', 'desc'), limit(30));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).reverse());
  }, onError);
}

export const enviarMensagem = (conexaoId, meuUid, texto) =>
  addDoc(collection(db, 'conexoes', conexaoId, 'mensagens'), { de: meuUid, texto: String(texto).slice(0, 300), criadoEm: serverTimestamp() });

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

// A altura vai também nas conexões em que eu treino, para quem acompanha calcular o IMC
// (o perfil em si é privado). Só a altura: o resto do perfil continua só meu.
export async function copiarAlturaParaConexoes(ids, alturaCm) {
  await Promise.all(ids.map(id => updateDoc(doc(db, 'conexoes', id), { alturaCm })));
}

// ---------- Avisos no celular ----------
// O app registra o aparelho no Firestore e, quando algo acontece (check-in, reação, recado),
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

export const marcarExercicio = (uid, data, exId, feito) =>
  setDoc(doc(db, 'users', uid, 'registros', data), {
    feitos: feito ? arrayUnion(exId) : arrayRemove(exId),
    atualizadoEm: serverTimestamp(),
  }, { merge: true });
