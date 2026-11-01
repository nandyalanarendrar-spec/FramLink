import { z } from 'zod';

// Indian number plate, spaces/hyphens ignored: AP02AB1234, AP 39 TX 1234, TS-09-EA-1234
export const vehicleNumberSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/, 'Enter a valid number plate, e.g. AP02AB1234'));

// Generic ID / licence number: 6-20 letters, digits, '-' or '/'
export const idNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9\-/]{6,20}$/, 'Enter a valid ID number (6-20 letters or digits)');
