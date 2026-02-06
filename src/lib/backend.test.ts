import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGameState, gameAction, authHeaders } from './backend';

// Mock dependencies
const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
    supabase: {
        functions: {
            invoke: (...args: any[]) => mockInvoke(...args),
        },
    },
}));

vi.mock('./session', () => ({
    getSessionToken: () => 'mock-token',
}));

describe('backend.ts', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
    });

    describe('authHeaders', () => {
        it('returns correct headers with token', () => {
            const headers = authHeaders();
            expect(headers).toEqual({
                'x-app-session': 'mock-token',
            });
        });
    });

    describe('fetchGameState', () => {
        it('returns game state on success', async () => {
            const mockData = {
                state: { oil_balance: 100 },
                machines: [],
                config: {},
            };
            mockInvoke.mockResolvedValue({ data: mockData, error: null });

            const result = await fetchGameState();
            expect(result).toEqual(mockData);
            expect(mockInvoke).toHaveBeenCalledWith('game-state', {
                headers: expect.any(Object),
            });
        });

        it('throws error on failure', async () => {
            mockInvoke.mockResolvedValue({ data: null, error: new Error('Backend error') });
            await expect(fetchGameState()).rejects.toThrow('Backend error');
        });
    });

    describe('gameAction', () => {
        it('sends correct payload and returns updated state', async () => {
            const mockResponse = {
                state: { oil_balance: 50 },
                machines: [{ id: '1' }],
            };
            mockInvoke.mockResolvedValue({ data: mockResponse, error: null });

            const result = await gameAction('buy_machine', { machineType: 'mini' });
            expect(result).toEqual(mockResponse);
            expect(mockInvoke).toHaveBeenCalledWith('game-action', {
                headers: expect.any(Object),
                body: { action: 'buy_machine', payload: { machineType: 'mini' } },
            });
        });

        it('throws error on failure', async () => {
            mockInvoke.mockResolvedValue({ data: null, error: new Error('Action failed') });
            await expect(gameAction('test')).rejects.toThrow('Action failed');
        });
    });
});
