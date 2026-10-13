export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const missing = () => new ApiError(404, 'NOT_FOUND', 'This resource was not found.');
export const stale = () => new ApiError(409, 'STALE_REVISION', 'This trip changed. Reload it before making another change.');
