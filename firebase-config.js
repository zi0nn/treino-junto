/* =========================================================
   Configuração: o único arquivo que você edita.
   Passo a passo em COMO-CONFIGURAR.md
   ========================================================= */

// Cole aqui os dados do seu projeto Firebase
// (Console do Firebase > Configurações do projeto > Seus apps > App da Web)
// Essas chaves podem ficar à mostra no GitHub: quem protege os dados são as regras do Firestore.
export const firebaseConfig = {
  apiKey: 'AIzaSyBLQ20gBSI6As5FekEBFdwGJrHBXA2CtjA',
  authDomain: 'treino-junto-4857e.firebaseapp.com',
  projectId: 'treino-junto-4857e',
  storageBucket: 'treino-junto-4857e.firebasestorage.app',
  messagingSenderId: '825594056841',
  appId: '1:825594056841:web:4ad910c27127e51ea6f658',
};

// Avisos no celular (etapa 4). Enquanto estiver "COLE_AQUI", o app funciona normalmente, só não manda avisos.
// Chave PÚBLICA para notificações (pode ficar à mostra, não é segredo):
// Console do Firebase > Configurações do projeto > Cloud Messaging > Certificados push da Web
export const VAPID_KEY = 'BPlLJMcHX9fFPJMaiVrBxHKkdbSUYywWCm-zPOgtEOlo6OmmEGctyKyTn1TBtU-2iauZCmeA7rR9VRRVjM_XDzE';

// Endereço do script de avisos (Google Apps Script publicado como App da Web, termina em /exec)
export const AVISOS_URL = 'https://script.google.com/macros/s/AKfycbyNti1YGwNkW91QAFxkgDh7flbvAJKVJHIhtGt_cWgyWL_Z8G4-ibnueD6lmvK2_jstpw/exec';

// Proteção contra abuso (App Check). Chave PÚBLICA do reCAPTCHA v3 (pode ficar à mostra).
// Enquanto estiver "COLE_AQUI", o app funciona normalmente, só sem essa proteção. Veja COMO-CONFIGURAR.md, seção 8.
export const RECAPTCHA_KEY = 'COLE_AQUI';

// Versão do app (vai junto das sugestões, para saber de qual versão veio o problema)
export const VERSAO = '2026.11.12b';
