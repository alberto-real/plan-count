import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { LegendEntry, MatchedEntry, StyleGroup, Unit, UNIT_TO_METERS, UploadResponse } from './models';
import { UploadService } from './upload.service';
import { LegendStep } from './legend-step/legend-step';

type Status = 'idle' | 'uploading' | 'error' | 'success';

export interface PlanRow {
  key: string;
  label: string;
  colorHex: string;
  linearMeters: number;
  areaM2: number;
}

@Component({
  selector: 'app-plan-calculator',
  imports: [DecimalPipe, TranslocoModule, LegendStep],
  templateUrl: './plan-calculator.html',
})
export class PlanCalculator {
  private readonly uploadService = inject(UploadService);
  private readonly translocoService = inject(TranslocoService);

  readonly legend = signal<LegendEntry[] | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly status = signal<Status>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly result = signal<UploadResponse | null>(null);
  readonly heightCm = signal<number>(250);
  readonly unit = signal<Unit>('m');

  readonly matchedRows = computed<PlanRow[]>(() => {
    const current = this.result();
    if (!current) {
      return [];
    }
    const heightMeters = this.heightCm() / 100;
    const unitFactor = UNIT_TO_METERS[this.unit()];
    return current.matched.map((entry: MatchedEntry) => {
      const linearMeters = entry.linearMeters * unitFactor;
      return {
        key: entry.key,
        label: entry.label,
        colorHex: entry.colorHex,
        linearMeters,
        areaM2: linearMeters * heightMeters,
      };
    });
  });

  readonly undeterminedGroups = computed<StyleGroup[]>(() => {
    const undetermined = this.result()?.undetermined ?? [];
    const unitFactor = UNIT_TO_METERS[this.unit()];
    return undetermined.map((group) => ({ ...group, linearMeters: group.linearMeters * unitFactor }));
  });

  onLegendConfirmed(legend: LegendEntry[]): void {
    this.legend.set(legend);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  onHeightChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    this.heightCm.set(Number.isFinite(value) ? value : 0);
  }

  onUnitChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.unit.set(select.value as Unit);
  }

  onSubmit(): void {
    const file = this.selectedFile();
    const legend = this.legend();
    if (!file || !legend) {
      return;
    }

    this.status.set('uploading');
    this.errorMessage.set(null);

    this.uploadService.upload(file, legend).subscribe({
      next: (response) => {
        this.result.set(response);
        this.unit.set(response.detectedUnit);
        this.status.set('success');
      },
      error: (err: unknown) => {
        this.status.set('error');
        this.errorMessage.set(this.extractErrorMessage(err));
      },
    });
  }

  dismissError(): void {
    this.status.set('idle');
    this.errorMessage.set(null);
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
    return this.translocoService.translate('planCalculator.genericError');
  }
}
