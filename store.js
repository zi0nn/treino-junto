/* =========================================================
   Store: camada de dados (Firebase)
   A interface (app.js) só conversa com as funções exportadas aqui.

   Coleções no Firestore:
     users/{uid}                  → { nome, email, codigo, metaPeso, criadoEm }
     users/{uid}/plano/{dia}      → { titulo, exercicios: [{ id, nome, series, reps, carga }] }
                                    dia = 0 (domingo) a 6 (sábado)
     users/{uid}/registros/{data} → { feitos: [ids dos exercícios], atualizadoEm }
                                    data = 'AAAA-MM-DD'
     codigos/{codigo}             → { uid }   código de conexão
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
  collection, doc, query, where, documentId, onSnapshot, getDoc,
  setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const configurado = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('COLE');

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
export const sair = () => signOut(auth);
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

export const aceitarConexao = (id, meuNome) => updateDoc(doc(db, 'conexoes', id), { status: 'aceita', atletaNome: meuNome });
export const salvarPermissoes = (id, perm) => updateDoc(doc(db, 'conexoes', id), { perm });
export const removerConexao = id => deleteDoc(doc(db, 'conexoes', id));

export const marcarExercicio = (uid, data, exId, feito) =>
  setDoc(doc(db, 'users', uid, 'registros', data), {
    feitos: feito ? arrayUnion(exId) : arrayRemove(exId),
    atualizadoEm: serverTimestamp(),
  }, { merge: true });
