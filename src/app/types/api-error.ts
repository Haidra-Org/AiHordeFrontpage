export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rc?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
