export const getErrorMessage = (err: unknown, fallback = 'Something went wrong') => {
  if (!err) return fallback;

  if (typeof err === 'string') return err;

  if (err instanceof Error) return err.message || fallback;

  if (typeof err === 'object' && 'message' in (err as any)) {
    const message = (err as any).message;
    if (typeof message === 'string') return message;
  }

  return fallback;
};
