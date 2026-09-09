import { Injectable, Provider, APP_INITIALIZER } from '@angular/core';
import { of } from 'rxjs';
import { provideTransloco, Translation, TranslocoLoader, TranslocoService } from '@jsverse/transloco';

// Keep in sync with frontend/public/i18n/*.json
const TRANSLATIONS: Record<string, Translation> = {
  ca: {
    shared: { chooseFile: 'Tria un fitxer', noFileChosen: 'Cap fitxer seleccionat' },
    navbar: { appName: 'PlanCount', login: 'Inicia sessió', logout: 'Tanca sessió' },
    landing: {
      title: 'Compta materials de plànols CAD en segons',
      subtitle: "Puja un fitxer DXF i obtén metres lineals i àrees per material a l'instant.",
      cta: 'Comença',
    },
    login: { title: 'Inicia sessió', button: 'Inicia sessió amb Keycloak' },
    stepper: { legend: 'Llegenda', plan: 'Plànol', summary: 'Resum' },
    legendStep: {
      title: 'Pas 1: llegir la llegenda',
      fileLabel: 'Fitxer DXF de la llegenda',
      reading: 'Llegint la llegenda...',
      dismissError: 'Tanca',
      genericError: "S'ha produït un error inesperat en llegir la llegenda.",
      tableColor: 'Color',
      tableKey: 'Clau',
      tableLabel: 'Etiqueta',
      confirmButton: 'Confirma la llegenda i continua',
    },
    planCalculator: {
      fileLabel: 'Fitxer DXF',
      floorLabel: 'Nom de la planta',
      defaultFloorLabel: 'Planta {{index}}',
      addFloor: 'Afegeix una altra planta',
      removeFloor: 'Elimina',
      heightLabel: 'Alçada (cm)',
      submitButton: 'Analitza',
      uploading: 'Analitzant el fitxer...',
      dismissError: 'Tanca',
      tableKey: 'Clau',
      tableMaterial: 'Material',
      tableLinearMeters: 'Metres lineals',
      tableArea: 'Àrea (m²)',
      undeterminedTitle: 'Geometria no coincident (no a la llegenda)',
      promoteLabelPlaceholder: 'Nom del material',
      addToMaterials: 'Afegeix',
      removeRow: 'Elimina',
      totalTitle: 'Total (totes les plantes)',
      genericError: "S'ha produït un error inesperat.",
    },
  },
  es: {
    shared: { chooseFile: 'Elegir archivo', noFileChosen: 'Ningún archivo seleccionado' },
    navbar: { appName: 'PlanCount', login: 'Iniciar sesión', logout: 'Cerrar sesión' },
    landing: {
      title: 'Cuenta materiales de planos CAD en segundos',
      subtitle: 'Sube un archivo DXF y obtén metros lineales y áreas por material al instante.',
      cta: 'Empezar',
    },
    login: { title: 'Iniciar sesión', button: 'Iniciar sesión con Keycloak' },
    stepper: { legend: 'Leyenda', plan: 'Plano', summary: 'Resumen' },
    legendStep: {
      title: 'Paso 1: leer la leyenda',
      fileLabel: 'Archivo DXF de la leyenda',
      reading: 'Leyendo la leyenda...',
      dismissError: 'Cerrar',
      genericError: 'Se ha producido un error inesperado al leer la leyenda.',
      tableColor: 'Color',
      tableKey: 'Clave',
      tableLabel: 'Etiqueta',
      confirmButton: 'Confirmar leyenda y continuar',
    },
    planCalculator: {
      fileLabel: 'Archivo DXF',
      floorLabel: 'Nombre de la planta',
      defaultFloorLabel: 'Planta {{index}}',
      addFloor: 'Añadir otra planta',
      removeFloor: 'Eliminar',
      heightLabel: 'Altura (cm)',
      submitButton: 'Analizar',
      uploading: 'Analizando el archivo...',
      dismissError: 'Cerrar',
      tableKey: 'Clave',
      tableMaterial: 'Material',
      tableLinearMeters: 'Metros lineales',
      tableArea: 'Área (m²)',
      undeterminedTitle: 'Geometría sin coincidencia (no está en la leyenda)',
      promoteLabelPlaceholder: 'Nombre del material',
      addToMaterials: 'Añadir',
      removeRow: 'Eliminar',
      totalTitle: 'Total (todas las plantas)',
      genericError: 'Se ha producido un error inesperado.',
    },
  },
  en: {
    shared: { chooseFile: 'Choose file', noFileChosen: 'No file chosen' },
    navbar: { appName: 'PlanCount', login: 'Log in', logout: 'Log out' },
    landing: {
      title: 'Count materials from CAD plans in seconds',
      subtitle: 'Upload a DXF file and get linear meters and areas per material instantly.',
      cta: 'Get started',
    },
    login: { title: 'Log in', button: 'Log in with Keycloak' },
    stepper: { legend: 'Legend', plan: 'Plan', summary: 'Summary' },
    legendStep: {
      title: 'Step 1: read the legend',
      fileLabel: 'Legend DXF file',
      reading: 'Reading the legend...',
      dismissError: 'Close',
      genericError: 'An unexpected error occurred while reading the legend.',
      tableColor: 'Color',
      tableKey: 'Key',
      tableLabel: 'Label',
      confirmButton: 'Confirm legend and continue',
    },
    planCalculator: {
      fileLabel: 'DXF file',
      floorLabel: 'Floor name',
      defaultFloorLabel: 'Floor {{index}}',
      addFloor: 'Add another floor',
      removeFloor: 'Remove',
      heightLabel: 'Height (cm)',
      submitButton: 'Analyze',
      uploading: 'Analyzing the file...',
      dismissError: 'Close',
      tableKey: 'Key',
      tableMaterial: 'Material',
      tableLinearMeters: 'Linear meters',
      tableArea: 'Area (m²)',
      undeterminedTitle: 'Unmatched geometry (not in the legend)',
      promoteLabelPlaceholder: 'Material name',
      addToMaterials: 'Add',
      removeRow: 'Remove',
      totalTitle: 'Total (all floors)',
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
