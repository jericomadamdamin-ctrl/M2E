export function getErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error occurred';
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String((error as { message: unknown }).message);
    }
    return 'An unexpected error occurred';
}
