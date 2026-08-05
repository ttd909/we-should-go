import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { proposedEditSchema, type ProposedEdit } from './schemas'
import { ITINERARY_SYSTEM_PROMPT } from './prompt'

export interface ModelProposalResult {
  proposal: ProposedEdit
  model: string
  inputTokens: number
  outputTokens: number
}

export async function proposeItineraryEdit(context: unknown): Promise<ModelProposalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('The itinerary assistant is not configured yet.')
  const model = process.env.ITINERARY_MODEL ?? 'claude-sonnet-4-6'
  const timeout = Number(process.env.ITINERARY_TIMEOUT_MS ?? 30_000)
  const maxTokens = Number(process.env.ITINERARY_MAX_OUTPUT_TOKENS ?? 4096)
  const client = new Anthropic({ apiKey, timeout, maxRetries: 1 })
  const message = await client.messages.parse({
    model,
    max_tokens: maxTokens,
    temperature: 0,
    system: ITINERARY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(context) }],
    output_config: { format: zodOutputFormat(proposedEditSchema) },
  })
  const parsed = proposedEditSchema.safeParse(message.parsed_output)
  if (!parsed.success) throw new Error('The assistant returned an invalid itinerary proposal.')
  return {
    proposal: parsed.data,
    model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
}

export async function proposeItineraryPhoto(
  context: unknown,
  bytes: Uint8Array,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<ModelProposalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('The itinerary assistant is not configured yet.')
  const model = process.env.ITINERARY_MODEL ?? 'claude-sonnet-4-6'
  const client = new Anthropic({
    apiKey,
    timeout: Number(process.env.ITINERARY_TIMEOUT_MS ?? 30_000),
    maxRetries: 1,
  })
  const message = await client.messages.parse({
    model,
    max_tokens: Number(process.env.ITINERARY_MAX_OUTPUT_TOKENS ?? 4096),
    temperature: 0,
    system: `${ITINERARY_SYSTEM_PROMPT}\nThis request includes a private travel or booking image. Extract only itinerary-relevant facts. Booking times are pinned. Flights, hotels, events and reservations should be locked when the image clearly confirms them. Lower confidence when text is unclear. The application will always require review before applying photo proposals.`,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: Buffer.from(bytes).toString('base64') } },
        { type: 'text', text: JSON.stringify(context) },
      ],
    }],
    output_config: { format: zodOutputFormat(proposedEditSchema) },
  })
  const parsed = proposedEditSchema.safeParse(message.parsed_output)
  if (!parsed.success) throw new Error('The assistant returned an invalid photo proposal.')
  return {
    proposal: parsed.data,
    model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
}
