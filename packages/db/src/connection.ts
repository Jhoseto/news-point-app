import postgres from "postgres";

const poolerOptions = {
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 20,
  max_lifetime: 60,
} as const;

export function createTransactionClient(url: string, max = 15) {
  return postgres(url, { ...poolerOptions, max });
}

export function createSessionClient(url: string, max = 1) {
  return postgres(url, { ...poolerOptions, max });
}
