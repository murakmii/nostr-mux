/**
 * Compatible with console
 */
export interface Logger {
  debug(message: string, ...data: any): void
  info(message: string, ...data: any): void
  warn(message: string, ...data: any): void
  error(message: string, ...data: any): void
}

export const LogLevel = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  supress: 100
} as const;

export class LeveledLogger implements Logger {
  private logger: Logger;
  private level: number;

  constructor(logger: Logger, level: number) {
    this.logger = logger;
    this.level = level;
  }

  debug(message: string, ...data: any): void {
    if (this.level <= LogLevel.debug) {
      this.logger.debug(message, ...data);
    }
  }

  info(message: string, ...data: any): void {
    if (this.level <= LogLevel.info) {
      this.logger.info(message, ...data);
    }
  }

  warn(message: string, ...data: any): void {
    if (this.level <= LogLevel.warn) {
      this.logger.warn(message, ...data);
    }
  }

  error(message: string, ...data: any): void {
    if (this.level <= LogLevel.error) {
      this.logger.error(message, ...data);
    }
  }
}
