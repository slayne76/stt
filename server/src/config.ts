import 'dotenv/config';

export interface AppConfig {
  port: number;
  sttSessionCookie: string;
  sttClientApi: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? '3001'),
    sttSessionCookie: process.env.STT_SESSION_COOKIE ?? '',
    sttClientApi: process.env.STT_CLIENT_API ?? '33',
  };
}
