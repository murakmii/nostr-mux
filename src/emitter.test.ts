import { SimpleEmitter } from './emitter';

test('SimpleEmitter', () => {
  const sut = new SimpleEmitter<string>();

  sut.emit('foo'); // no error

  const captured: string[] = [];
  const l1 = (arg: string) => captured.push(`l1: ${arg}`);
  const l2 = (arg: string) => captured.push(`l2: ${arg}`);

  sut.listen(l1);
  sut.listen(l2);
  sut.emit('bar');

  expect(captured).toEqual(['l1: bar', 'l2: bar']);

  sut.stop(l2);
  sut.emit('baz');

  expect(captured).toEqual(['l1: bar', 'l2: bar', 'l1: baz']);
});
