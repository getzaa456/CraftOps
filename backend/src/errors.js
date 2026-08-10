export class NoPortsAvailableError extends Error {
  constructor() {
    super('No ports available in pool');
    this.status = 409;
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super('Server quota exceeded for this account');
    this.status = 403;
  }
}

export class NotFoundError extends Error {
  constructor(what = 'Resource') {
    super(`${what} not found`);
    this.status = 404;
  }
}
