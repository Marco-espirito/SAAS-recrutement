// k6 run tests/load/health-check.js
// BASE_URL=https://votre-environnement.example npm run test:load
//
// Scénario le plus sûr : ne touche que GET /api/health (lecture seule,
// idempotent). Sert de ligne de base — si l'infrastructure ne tient pas
// cette charge légère, inutile d'aller plus loin.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    ramping: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function checkHealth() {
  const response = http.get(`${BASE_URL}/api/health`);
  check(response, {
    'status is 200 or 503': (r) => r.status === 200 || r.status === 503,
  });
  sleep(1);
}
