import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function maxBytes(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }
    const size = new TextEncoder().encode(value).length;
    return size > max ? { maxBytes: { max, actual: size } } : null;
  };
}
