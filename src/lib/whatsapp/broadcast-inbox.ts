import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageTemplate } from '@/types';
import {
  templateContentText,
  templateHeaderMediaUrl,
  templateBodyParams,
  renderTemplateBody,
} from '@/lib/whatsapp/template-body';

export interface RecordBroadcastMessageParams {
  accountId: string;
  userId: string;
  contactId: string;
  templateName: string;
  templateRow: MessageTemplate | null;
  params?: string[];
  messageParams?: unknown;
  whatsappMessageId: string;
  sentAt?: string;
}

/**
 * Record a successfully sent broadcast template message into `conversations`
 * and `messages` so it appears in the Inbox thread and conversation list.
 *
 * Idempotent: if a message with `message_id === whatsappMessageId` already
 * exists, it safely returns without re-inserting.
 */
export async function recordBroadcastMessageToInbox(
  db: SupabaseClient,
  params: RecordBroadcastMessageParams
): Promise<string | null> {
  const {
    accountId,
    userId,
    contactId,
    templateName,
    templateRow,
    whatsappMessageId,
    sentAt = new Date().toISOString(),
  } = params;

  if (!accountId || !contactId || !whatsappMessageId) return null;

  // 1. Idempotency check: avoid double-inserting if already recorded
  const { data: existingMsg } = await db
    .from('messages')
    .select('id')
    .eq('message_id', whatsappMessageId)
    .maybeSingle();

  if (existingMsg?.id) {
    return existingMsg.id;
  }

  // 2. Render template body text and resolve media URL
  const bodyParams = templateBodyParams(params.params, params.messageParams);
  const persistedText =
    templateContentText(templateRow, bodyParams, null) ??
    (templateRow?.body_text
      ? renderTemplateBody(templateRow.body_text, bodyParams)
      : `[Template: ${templateName}]`);

  const mediaUrl =
    (params.messageParams as { headerMediaUrl?: string })?.headerMediaUrl ||
    templateHeaderMediaUrl(templateRow, params.messageParams);

  // 3. Find or create conversation for this contact
  const { data: existingConv } = await db
    .from('conversations')
    .select('id, last_message_at')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .maybeSingle();

  let conversationId = existingConv?.id;

  if (!conversationId) {
    const { data: created, error } = await db
      .from('conversations')
      .insert({
        account_id: accountId,
        user_id: userId,
        contact_id: contactId,
        status: 'open',
        last_message_text: persistedText,
        last_message_at: sentAt,
        unread_count: 0,
      })
      .select('id')
      .maybeSingle();

    if (error || !created) {
      // In case of concurrent insert / constraint race, retry select
      const { data: retry } = await db
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .maybeSingle();
      conversationId = retry?.id;
    } else {
      conversationId = created.id;
    }
  } else {
    // Only update last_message if this template is newer than current last_message_at
    const currentLastAt = existingConv?.last_message_at
      ? new Date(existingConv.last_message_at).getTime()
      : 0;
    const thisSentAt = new Date(sentAt).getTime();

    if (thisSentAt >= currentLastAt) {
      await db
        .from('conversations')
        .update({
          last_message_text: persistedText,
          last_message_at: sentAt,
          updated_at: sentAt,
        })
        .eq('id', conversationId);
    }
  }

  if (!conversationId) return null;

  // 4. Insert template message row
  const { data: insertedMsg, error: msgErr } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      sender_id: userId,
      content_type: 'template',
      content_text: persistedText,
      media_url: mediaUrl,
      template_name: templateName,
      message_id: whatsappMessageId,
      status: 'sent',
      created_at: sentAt,
    })
    .select('id')
    .maybeSingle();

  if (msgErr) {
    console.error('[broadcast-inbox] Failed to insert message:', msgErr.message);
    return null;
  }

  return insertedMsg?.id ?? null;
}
