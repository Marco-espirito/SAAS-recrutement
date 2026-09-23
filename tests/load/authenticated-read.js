// k6 run tests/load/authenticated-read.js
// BASE_URL=https://votre-environnement.example \
// LOAD_TEST_EMAIL=compte-de-test@example.com \
// LOAD_TEST_PASSWORD='...' \
// npm run test:load:authenticated
//
// Exige un compte de test que VOUS créez à l'avance dans l'environnement
// ciblé — ce script ne crée jamais de compte lui-même, pour ne jamais
// polluer une base avec des inscriptions en masse. N'exerce que des
// lectures (aucune écriture) une fois connecté.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.LOAD_TEST_EMAIL;
const PASSWORD = __ENV.LOAD_TEST_PASSWORD;

export const options = {
  scenarios: {
    ramping: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 20 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export function setup() {
  if (!EMAIL || !PASSWORD)
    fail(
      'LOAD_TEST_EMAIL et LOAD_TEST_PASSWORD sont requis — créez ce compte vous-même avant de lancer ce scénario.',
    );
}

export default function readAsAuthenticatedUser() {
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'content-type': 'application/json' } },
  );
  check(login, { 'login succeeds': (r) => r.status === 200 });
  const cookies = login.cookies;

  const jar = http.cookieJar();
  for (const name in cookies) {
    jar.set(BASE_URL, name, cookies[name][0].value);
  }

  const endpoints = ['/api/auth/me', '/api/applications', '/api/notifications'];
  for (const endpoint of endpoints) {
    const response = http.get(`${BASE_URL}${endpoint}`);
    check(response, {
      [`${endpoint} responds`]: (r) => r.status === 200,
    });
  }
  sleep(1);
}
