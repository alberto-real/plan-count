import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

/** A visually styled, translatable "choose file" control.
 *
 * The native `<input type="file">` renders its own untranslatable, unstyled
 * browser button, so this component hides the real input and drives it from
 * a regular `btn-primary` button instead. */
@Component({
  selector: 'app-file-picker-button',
  imports: [TranslocoModule],
  templateUrl: './file-picker-button.html',
})
export class FilePickerButton {
  readonly accept = input<string>('');
  readonly fileName = input<string | null>(null);
  readonly inputId = input<string>('file-picker');

  readonly fileSelected = output<File | null>();

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  openPicker(): void {
    this.fileInput().nativeElement.click();
  }

  onChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fileSelected.emit(input.files?.[0] ?? null);
  }
}
