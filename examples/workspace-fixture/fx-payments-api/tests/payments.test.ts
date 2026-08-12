import { refund } from '../src/payments.ts';

test('refund works', () => {
  if (!refund()) throw new Error('expected refund() to return true');
});
