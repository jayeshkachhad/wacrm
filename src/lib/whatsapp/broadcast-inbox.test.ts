import { describe, it, expect, vi } from 'vitest';
import { recordBroadcastMessageToInbox } from './broadcast-inbox';
import type { MessageTemplate } from '@/types';

const SAMPLE_TEMPLATE: MessageTemplate = {
  id: 'tmpl-1',
  user_id: 'user-1',
  account_id: 'acct-1',
  name: 'welcome_deal',
  category: 'Marketing',
  language: 'en',
  header_type: 'image',
  header_media_url: 'https://example.com/banner.jpg',
  body_text: 'Hello {{1}}, welcome to our shop! Use code {{2}} for 20% off.',
  buttons: [{ type: 'QUICK_REPLY', text: 'Book Demo' }],
  status: 'APPROVED',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  meta_template_id: 'meta-tmpl-1',
} as unknown as MessageTemplate;

describe('recordBroadcastMessageToInbox', () => {
  it('returns null if required fields are missing', async () => {
    const fakeDb = {} as any;
    const res = await recordBroadcastMessageToInbox(fakeDb, {
      accountId: '',
      userId: 'user-1',
      contactId: 'contact-1',
      templateName: 'test',
      templateRow: null,
      whatsappMessageId: 'wamid-1',
    });
    expect(res).toBeNull();
  });

  it('skips insert if message already exists with matching whatsappMessageId', async () => {
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'existing-msg-id' },
          error: null,
        }),
      }),
    });

    const fakeDb = {
      from: vi.fn((table: string) => {
        if (table === 'messages') {
          return { select: selectMock };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    const res = await recordBroadcastMessageToInbox(fakeDb, {
      accountId: 'acct-1',
      userId: 'user-1',
      contactId: 'contact-1',
      templateName: 'welcome_deal',
      templateRow: SAMPLE_TEMPLATE,
      whatsappMessageId: 'wamid-123',
    });

    expect(res).toBe('existing-msg-id');
  });

  it('creates a new conversation and message when none exists', async () => {
    const insertedMessages: any[] = [];
    const insertedConversations: any[] = [];

    const fakeDb = {
      from: vi.fn((table: string) => {
        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
            insert: vi.fn((msg) => {
              insertedMessages.push(msg);
              return {
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'new-msg-1' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
            insert: vi.fn((conv) => {
              insertedConversations.push(conv);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'conv-new-1' },
                    error: null,
                  }),
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'conv-new-1' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as any;

    const res = await recordBroadcastMessageToInbox(fakeDb, {
      accountId: 'acct-1',
      userId: 'user-1',
      contactId: 'contact-1',
      templateName: 'welcome_deal',
      templateRow: SAMPLE_TEMPLATE,
      params: ['Alice', 'SAVE20'],
      whatsappMessageId: 'wamid-abc',
      sentAt: '2026-10-25T10:00:00Z',
    });

    expect(res).toBe('new-msg-1');
    expect(insertedConversations).toHaveLength(1);
    expect(insertedConversations[0].contact_id).toBe('contact-1');
    expect(insertedConversations[0].status).toBe('open');
    expect(insertedConversations[0].last_message_text).toBe(
      'Hello Alice, welcome to our shop! Use code SAVE20 for 20% off.'
    );

    expect(insertedMessages).toHaveLength(1);
    expect(insertedMessages[0].conversation_id).toBe('conv-new-1');
    expect(insertedMessages[0].content_type).toBe('template');
    expect(insertedMessages[0].content_text).toBe(
      'Hello Alice, welcome to our shop! Use code SAVE20 for 20% off.'
    );
    expect(insertedMessages[0].media_url).toBe('https://example.com/banner.jpg');
    expect(insertedMessages[0].message_id).toBe('wamid-abc');
  });
});
