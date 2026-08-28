import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UploadResponse } from './models';
import { UploadService } from './upload.service';

type Status = 'idle' | 'uploading' | 'error' | 'success';

export interface PlanRow {
  rawLayerName: string;
  linearMeters: number;
  effectiveMaterial: string;
  isUndetermined: boolean;
  areaM2: number;
}

@Component({
  selector: 'app-plan-calculator',
  imports: [DecimalPipe],
  templateUrl: './plan-calculator.html',
})
export class PlanCalculator {
  private readonly uploadService = inject(UploadService);

  readonly NEW_MATERIAL_OPTION = '__new__';

  readonly selectedFile = signal<File | null>(null);
  readonly status = signal<Status>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly result = signal<UploadResponse | null>(null);
  readonly heightCm = signal<number>(250);
  readonly materialOverrides = signal<Record<string, string>>({});
  readonly newMaterialRowKey = signal<string | null>(null);

  readonly rows = computed<PlanRow[]>(() => {
    const current = this.result();
    if (!current) {
      return [];
    }
    const overrides = this.materialOverrides();
    const heightMeters = this.heightCm() / 100;
    return current.layers.map((layer) => ({
      rawLayerName: layer.rawLayerName,
      linearMeters: layer.linearMeters,
      effectiveMaterial: overrides[layer.rawLayerName] ?? layer.materialName,
      isUndetermined: current.undeterminedLayers.includes(layer.rawLayerName),
      areaM2: layer.linearMeters * heightMeters,
    }));
  });

  readonly knownMaterials = computed<string[]>(() => {
    const names = this.rows().map((row) => row.effectiveMaterial);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  onHeightChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    this.heightCm.set(Number.isFinite(value) ? value : 0);
  }

  onAssignMaterial(rawLayerName: string, materialName: string): void {
    const trimmed = materialName.trim();
    if (!trimmed) {
      return;
    }
    this.materialOverrides.update((current) => ({ ...current, [rawLayerName]: trimmed }));
  }

  onMaterialSelectChange(rawLayerName: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === this.NEW_MATERIAL_OPTION) {
      this.newMaterialRowKey.set(rawLayerName);
      return;
    }
    this.newMaterialRowKey.set(null);
    this.onAssignMaterial(rawLayerName, value);
  }

  onNewMaterialConfirmed(rawLayerName: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.onAssignMaterial(rawLayerName, value);
    this.newMaterialRowKey.set(null);
  }

  onSubmit(): void {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    this.status.set('uploading');
    this.errorMessage.set(null);

    this.uploadService.upload(file).subscribe({
      next: (response) => {
        this.result.set(response);
        this.materialOverrides.set({});
        this.newMaterialRowKey.set(null);
        this.status.set('success');
      },
      error: (err: unknown) => {
        this.status.set('error');
        this.errorMessage.set(this.extractErrorMessage(err));
      },
    });
  }

  private extractErrorMessage(err: unknown): string {
    if (
      err &&
      typeof err === 'object' &&
      'error' in err &&
      err.error &&
      typeof err.error === 'object' &&
      'detail' in err.error &&
      typeof (err.error as { detail: unknown }).detail === 'string'
    ) {
      return (err.error as { detail: string }).detail;
    }
    return "S'ha produït un error inesperat.";
  }
}
