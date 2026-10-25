export interface HealthResponse {
  status: 'ok' | 'error';
  service: 'shipwright-api';
  database: 'connected' | 'disconnected';
}
