import 'dotenv/config';

export interface AppConfig {
  sttEmail: string;
  sttPassword: string;
  sttClientApi: string;
}

export function loadConfig(): AppConfig {
  return {
    sttEmail: process.env.STT_EMAIL ?? '',
    sttPassword: process.env.STT_PASSWORD ?? '',
    sttClientApi: process.env.STT_CLIENT_API ?? '33',
  };
}
