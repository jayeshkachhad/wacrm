import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  orFilters: [] as string[],
  queried: false,
  dispatchedAutomations: [] as Record<string, unknown>[],
  createdOutcome: true,
}));

function fakeSupabase() {
  const builder: Record<string, unknown> = {
    select: () => {
      mocks.queried = true;
      return builder;
    },
    eq: () => builder,
    or: (filter: string) => {
      mocks.orFilters.push(filter);
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  };
  return { from: () => builder };
}

vi.mock('@/lib/auth/api-context', () => ({
  requireApiKey: vi.fn(async () => ({
    supabase: fakeSupabase(),
    accountId: 'account-1',
  })),
}));

vi.mock('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: vi.fn(async (args: Record<string, unknown>) => {
    mocks.dispatchedAutomations.push(args);
  }),
}));

vi.mock('@/lib/api/v1/contacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/v1/contacts')>();
  return {
    ...actual,
    resolveAuditUserId: vi.fn(async () => 'user-1'),
    findOrCreateContact: vi.fn(async () => ({
      id: 'contact-uuid-1',
      created: mocks.createdOutcome,
    })),
    getContactById: vi.fn(async () => ({
      id: 'contact-uuid-1',
      phone: '+14155551234',
      name: 'Test',
    })),
  };
});

import { GET, POST } from './route';

beforeEach(() => {
  mocks.orFilters = [];
  mocks.queried = false;
  mocks.dispatchedAutomations = [];
  mocks.createdOutcome = true;
});

describe('GET /api/v1/contacts', () => {
  it('rejects a non-UUID tag filter with 400 bad_request without querying', async () => {
    const res = await GET(
      new Request('https://x.test/api/v1/contacts?tag=vip')
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('bad_request');
    expect(mocks.queried).toBe(false);
  });

  it('searches phones by digits so a +E.164 search can match stored numbers', async () => {
    const res = await GET(
      new Request(
        `https://x.test/api/v1/contacts?search=${encodeURIComponent('+14155551234')}`
      )
    );
    expect(res.status).toBe(200);
    expect(mocks.orFilters).toContain(
      'name.ilike.*+14155551234*,phone.ilike.*14155551234*'
    );
  });
});

describe('POST /api/v1/contacts', () => {
  it('triggers new_contact_created automation when a contact is newly created', async () => {
    mocks.createdOutcome = true;
    const res = await POST(
      new Request('https://x.test/api/v1/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+14155551234', name: 'Test' }),
      })
    );
    expect(res.status).toBe(201);
    expect(mocks.dispatchedAutomations).toHaveLength(1);
    expect(mocks.dispatchedAutomations[0]).toEqual({
      accountId: 'account-1',
      triggerType: 'new_contact_created',
      contactId: 'contact-uuid-1',
      context: {},
    });
  });

  it('does NOT trigger new_contact_created automation when contact already exists', async () => {
    mocks.createdOutcome = false;
    const res = await POST(
      new Request('https://x.test/api/v1/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+14155551234', name: 'Test' }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.dispatchedAutomations).toHaveLength(0);
  });
});
