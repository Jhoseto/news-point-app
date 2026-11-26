export function compareRequest(request: Request, query: (sql: string, values: string[]) => Promise<unknown[]>, expectedOrigin?: string): Promise<Response>;
