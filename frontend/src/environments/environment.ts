export const environment = {
  production: false,
  // Local dev has no Keycloak realm configured (issuer/clientId are empty
  // placeholders below) — AuthService skips the OIDC flow entirely and
  // treats every session as authenticated. See auth.service.ts.
  authDisabled: true,
  auth: {
    issuer: '',
    clientId: '',
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/app` : '',
  },
};
