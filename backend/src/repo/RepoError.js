// Errors the repositories raise for situations the business logic needs to react to.
export class RepoError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'RepoError';
    this.code = code;          // 'EMAIL_TAKEN' | 'SLOT_TAKEN' | 'NOT_FOUND'
  }
}
