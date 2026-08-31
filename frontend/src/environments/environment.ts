export const environment = {
  production: false,
  auth: {
    issuer: '',
    clientId: '',
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/app` : '',
  },
};
