import { logger } from "firebase-functions"

import { telegramConfig, isTelegramConfigured } from "../utils/config"

/**
 * Telegram Bot API — staff critical alerts only.
 * Token never leaves Cloud Functions.
 */
export class TelegramProvider {
  async send(input: {
    chatId: string
    text: string
  }): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!isTelegramConfigured()) {
      return {
        ok: false,
        error:
          "Telegram is not configured. Set TELEGRAM_BOT_TOKEN in Cloud Functions secrets.",
      }
    }
    const chatId = input.chatId.trim()
    if (!chatId) {
      return { ok: false, error: "Missing Telegram chat id." }
    }

    const cfg = telegramConfig()
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: input.text.slice(0, 3900),
          disable_web_page_preview: true,
        }),
      })
      const json = (await res.json()) as {
        ok?: boolean
        result?: { message_id?: number }
        description?: string
      }
      if (!res.ok || !json.ok) {
        const error = json.description || `Telegram HTTP ${res.status}`
        logger.warn("Telegram send failed", { error })
        return { ok: false, error }
      }
      return {
        ok: true,
        messageId: json.result?.message_id
          ? String(json.result.message_id)
          : undefined,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Telegram send failed"
      logger.error("Telegram send exception", err)
      return { ok: false, error }
    }
  }
}

export const telegramProvider = new TelegramProvider()
