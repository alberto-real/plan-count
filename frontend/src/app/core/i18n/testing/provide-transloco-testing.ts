import { Injectable, Provider, APP_INITIALIZER } from '@angular/core';
import { of } from 'rxjs';
import { provideTransloco, Translation, TranslocoLoader, TranslocoService } from '@jsverse/transloco';

// Keep in sync with frontend/public/i18n/*.json
const TRANSLATIONS: Record<string, Translation> = {
  ca: {
    navbar: { appName: 'PlanCount', login: 'Inicia sessió', logout: 'Tanca sessió' },
    landing: {
      title: 'Compta materials de plànols CAD en segons',
      subtitle: "Puja un fitxer DXF i obtén metres lineals i àrees per material a l'instant.",
      cta: 'Comença',
    },
    login: { title: 'Inicia sessió', button: 'Inicia sessió amb Keycloak' },
    planCalculator: {
      fileLabel: 'Fitxer DXF',
      heightLabel: 'Alçada (cm)',
      submitButton: 'Analitza',
      uploading: 'Analitzant el fitxer...',
      dismissError: 'Tanca',
      tableLayer: 'Capa',
      tableMaterial: 'Material',
      tableLinearMeters: 'Metres lineals',
      tableArea: 'Àrea (m²)',
      newMaterialPlaceholder: 'Nom del material nou',
      newMaterialOption: '+ Nou material',
      genericError: "S'ha produït un error inesperat.",
    },
  },
  es: {
    navbar: { appName: 'PlanCount', login: 'Iniciar sesión', logout: 'Cerrar sesión' },
    landing: {
      title: 'Cuenta materiales de planos CAD en segundos',
      subtitle: 'Sube un archivo DXF y obtén metros lineales y áreas por material al instante.',
      cta: 'Empezar',
    },
    login: { title: 'Iniciar sesión', button: 'Iniciar sesión con Keycloak' },
    planCalculator: {
      fileLabel: 'Archivo DXF',
      heightLabel: 'Altura (cm)',
      submitButton: 'Analizar',
      uploading: 'Analizando el archivo...',
      dismissError: 'Cerrar',
      tableLayer: 'Capa',
      tableMaterial: 'Material',
      tableLinearMeters: 'Metros lineales',
      tableArea: 'Área (m²)',
      newMaterialPlaceholder: 'Nombre del material nuevo',
      newMaterialOption: '+ Nuevo material',
      genericError: 'Se ha producido un error inesperado.',
    },
  },
  en: {
    navbar: { appName: 'PlanCount', login: 'Log in', logout: 'Log out' },
    landing: {
      title: 'Count materials from CAD plans in seconds',
      subtitle: 'Upload a DXF file and get linear meters and areas per material instantly.',
      cta: 'Get started',
    },
    login: { title: 'Log in', button: 'Log in with Keycloak' },
    planCalculator: {
      fileLabel: 'DXF file',
      heightLabel: 'Height (cm)',
      submitButton: 'Analyze',
      uploading: 'Analyzing the file...',
      dismissError: 'Close',
      tableLayer: 'Layer',
      tableMaterial: 'Material',
      tableLinearMeters: 'Linear meters',
      tableArea: 'Area (m²)',
      newMaterialPlaceholder: 'New material name',
      newMaterialOption: '+ New material',
      genericError: 'An unexpected error occurred.',
    },
  },
};

@Injectable()
class FakeTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    return of(TRANSLATIONS[lang] ?? {});
  }
}

function initTranslocoTesting(translocoService: TranslocoService) {
  return () => {
    translocoService.setActiveLang('en');
    return translocoService.load('en').toPromise();
  };
}

export function provideTranslocoTesting(): Provider {
  return [
    provideTransloco({
      config: {
        availableLangs: ['ca', 'es', 'en'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: true,
      },
      loader: FakeTranslocoLoader,
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: initTranslocoTesting,
      deps: [TranslocoService],
      multi: true,
    },
  ];
}
