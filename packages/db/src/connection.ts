import postgres from "postgres";

export function createTransactionClient(url: string, max = 5) {
  return postgres(url, { prepare: false, max, connect_timeout: 10 });
}

export function createSessionClient(url: string, max = 1) {
  return postgres(url, { max, connect_timeout: 10 });
}
