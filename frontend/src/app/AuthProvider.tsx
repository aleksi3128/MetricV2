import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, ApiError, onSessionExpired, tokenStore, type SessionResponse } from '@/lib/api';
import { AuthContext, type AuthState } from '@/lib/auth';
import { useToast } from '@/lib/toast';

/**
 * Détenteur de la session (`AUTH-03`, `AUTH-06`, `AUTH-07`).
 *
 * Au montage, un jeton présent n'est pas cru sur parole : il est confronté au serveur.
 * Sans cela, un jeton expiré pendant que l'app était fermée afficherait l'application
 * puis ferait échouer chaque écran l'un après l'autre.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    tokenStore.read() ? { status: 'loading' } : { status: 'anonymous' },
  );
  const { notify } = useToast();
  // Chaque tentative de confronter le jeton au serveur. Au montage, puis à chaque
  // « Réessayer » ou retour du réseau — jamais à chaque changement d'état, qui
  // boucherait le rendu.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!tokenStore.read()) return;

    const controller = new AbortController();
    api
      .me(controller.signal)
      .then(({ username }) => {
        setState({ status: 'authenticated', username });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        // **Seul un refus du serveur déconnecte.** Toute autre panne — réseau coupé au
        // lancement, API qui redémarre — renvoyait à l'écran de connexion, jeton en
        // poche, et l'y laissait une fois le réseau revenu (audit du 17 octobre,
        // fiche 07). Un serveur muet ne dit rien de la session.
        const refused =
          caught instanceof ApiError && (caught.status === 401 || caught.status === 403);
        setState(refused ? { status: 'anonymous' } : { status: 'unreachable' });
      });

    return () => {
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    if (!tokenStore.read()) {
      setState({ status: 'anonymous' });
      return;
    }
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  // Le retour du réseau relance seul la vérification : sans lui, il fallait recharger
  // la page à la main.
  useEffect(() => {
    if (state.status !== 'unreachable') return;
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
    };
  }, [state.status, retry]);

  // Une expiration détectée par n'importe quelle requête ramène l'application à l'écran
  // de connexion, avec le motif renvoyé par le serveur.
  useEffect(
    () =>
      onSessionExpired((reason) => {
        setState({ status: 'anonymous', reason });
        notify(reason, 'load');
      }),
    [notify],
  );

  const login = useCallback(async (username: string, password: string) => {
    const session = await api.login(username, password);
    tokenStore.write(session.access_token);
    setState({ status: 'authenticated', username: session.username });
  }, []);

  const adopt = useCallback((session: SessionResponse) => {
    tokenStore.write(session.access_token);
    setState({ status: 'authenticated', username: session.username });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Le jeton est autoporteur : même si l'appel échoue, l'effacer termine la session
      // côté client, et c'est ce qui compte (`AUTH-07`).
    }
    tokenStore.clear();
    setState({ status: 'anonymous' });
  }, []);

  const value = useMemo(
    () => ({ state, login, adopt, logout, retry }),
    [state, login, adopt, logout, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
