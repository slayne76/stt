import 'dotenv/config';

export interface AppConfig {
  sttSessionCookie: string;
  sttClientApi: string;
}

export function loadConfig(): AppConfig {
  return {
    sttSessionCookie: process.env.STT_SESSION_COOKIE ?? '',
    sttClientApi: process.env.STT_CLIENT_API ?? '33',
  };
}
