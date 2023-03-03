import { Logger, LogLevel, SimpleLogger } from './logger';

class StubLogger implements Logger {
  called: { message: string, data: any[] }[];

  constructor() {
    this.called = [];
  }

  debug(message: string, ...data: any): void {
    this.called.push({ message, data });
  }

  info(message: string, ...data: any): void {
    this.called.push({ message, data });
  }

  warn(message: string, ...data: any): void {
    this.called.push({ message, data });
  }

  error(message: string, ...data: any): void {
    this.called.push({ message, data });
  }
}

test.each([
  {
    level: LogLevel.debug,
    expected: [
      { message: 'debug message', data: [1] },
      { message: 'info message', data: [2] },
      { message: 'warn message', data: [3] },
      { message: 'error message', data: [4] }
    ]
  },
  {
    level: LogLevel.info,
    expected: [
      { message: 'info message', data: [2] },
      { message: 'warn message', data: [3] },
      { message: 'error message', data: [4] }
    ]
  },
  {
    level: LogLevel.warn,
    expected: [
      { message: 'warn message', data: [3] },
      { message: 'error message', data: [4] }
    ]
  },
  {
    level: LogLevel.error,
    expected: [
      { message: 'error message', data: [4] }
    ]
  },
])('LeveledLogger(level: $level)', ({ level, expected }) => {
  const stub = new StubLogger();
  const sut = new SimpleLogger(stub, level);

  sut.debug('debug message', 1);
  sut.info('info message', 2);
  sut.warn('warn message', 3);
  sut.error('error message', 4);

  expect(stub.called).toEqual(expected);
});

test('LeveledLogger with console', () => {
  const sut = new SimpleLogger(console, LogLevel.debug);
  
  sut.debug('debug message', 1);
  sut.info('info message', 2);
  sut.warn('warn message', 3);
  sut.error('error message', 4);
});