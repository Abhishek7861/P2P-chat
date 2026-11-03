const TOKEN_KEY = 'p2p.token';

export const tokenStore = {
get: () => localStorage.getItem(TOKEN_KEY),
set: (t: string) => localStorage.setItem(TOKEN_KEY, t), clear: () => localStorage.removeItem(TOKEN_KEY),
};

export type User = { id: string; username: string; displayName: string };

// Spring sends errors as JSON: validation failures list `errors`, others have a `message`.
async function errorMessage(res: Response): Promise<string> {
    const text = await res.text();
    try {
        const body = JSON.parse(text);
        const invalid = body.errors?.[0];
        if (invalid) return [invalid.field, invalid.defaultMessage].filter(Boolean).join(' ');
        return body.message || res.statusText;
    } catch {
        return text || res.statusText;
    }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers); headers.set('Content-Type', 'application/json');
    const token = tokenStore.get();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    
    const res = await fetch(`/api${path}`, { ...init, headers });
    if (res.status === 401) tokenStore.clear();
    if (!res.ok) throw new Error(await errorMessage(res));
    // Some successful responses have no body (204, or a 201 with nothing to return)
    const body = await res.text();
    return (body ? JSON.parse(body) : undefined) as T;
}