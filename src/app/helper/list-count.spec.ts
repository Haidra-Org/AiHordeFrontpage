import { listCount } from './list-count';

describe('listCount', () => {
  it('is exact when the list is shorter than the limit', () => {
    expect(listCount(7, 100)).toEqual({ count: 7, atLeast: false });
  });

  it('is exact for an empty list', () => {
    expect(listCount(0, 100)).toEqual({ count: 0, atLeast: false });
  });

  it('is a floor when the list filled the limit', () => {
    expect(listCount(100, 100)).toEqual({ count: 100, atLeast: true });
  });

  it('never reports more than the limit', () => {
    expect(listCount(120, 100)).toEqual({ count: 100, atLeast: true });
  });
});
