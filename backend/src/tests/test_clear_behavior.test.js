// Quick test to verify clearAllMocks behavior
describe('clearAllMocks queue test', () => {
  const fn = jest.fn();

  it('test 1: adds 2 once values', async () => {
    fn.mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    expect(await fn()).toBe('a');
    expect(await fn()).toBe('b');
  });

  it('test 2: after clearAllMocks adds 1 value', async () => {
    jest.clearAllMocks();
    fn.mockResolvedValueOnce('c');
    expect(await fn()).toBe('c');
    // If clearAllMocks cleared the queue: 'd' would be next undefined
    // If clearAllMocks did NOT clear: 'd' would not be in queue
  });
});
