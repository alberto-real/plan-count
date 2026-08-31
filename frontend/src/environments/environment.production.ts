export const environment = {
  production: true,
  auth: {
    issuer: '',
    clientId: '',
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/app` : '',
  },
};
