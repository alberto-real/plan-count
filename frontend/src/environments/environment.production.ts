export const environment = {
  production: true,
  authDisabled: false,
  auth: {
    issuer: 'https://auth.albertoreal.com/realms/albertoreal',
    clientId: 'plan-count-frontend',
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/app` : '',
  },
};
